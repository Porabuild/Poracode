import Foundation

enum ProjectWorkspaceMode: String, CaseIterable, Hashable, Sendable {
  case files
  case git
}

enum ProjectWorkspaceAccessState: Equatable, Sendable {
  case unavailable
  case inconsistentSelection
  case offline
  case connecting
  case missingReadScope
  case ready(readOnly: Bool)

  static func resolve(
    context: ProjectWorkspaceContext?,
    fileContext: ProjectWorkspaceContext?,
    gitContext: ProjectWorkspaceContext?
  ) -> Self {
    guard let context else { return .unavailable }
    guard context.isConsistent else { return .inconsistentSelection }
    guard fileContext == context, gitContext == context else { return .unavailable }
    guard context.session.isOnline else { return .offline }
    guard context.session.isReady else { return .connecting }
    guard context.session.capabilities.contains(.sessionRead) else {
      return .missingReadScope
    }
    return .ready(
      readOnly: !context.session.capabilities.contains(.sessionOperate)
    )
  }

  var permitsRead: Bool {
    if case .ready = self { return true }
    return false
  }

  var permitsWrite: Bool {
    if case .ready(readOnly: false) = self { return true }
    return false
  }
}

struct ProjectWorkspaceActivationID: Hashable, Sendable {
  let lease: ProjectWorkspaceLease?
  let isConsistent: Bool
  let isOnline: Bool
  let isReady: Bool
  let linkedSocketOnline: Bool?
  let capabilities: [String]

  init(_ context: ProjectWorkspaceContext?, linkedSocketOnline: Bool? = nil) {
    lease = context?.lease
    isConsistent = context?.isConsistent == true
    isOnline = context?.session.isOnline == true
    isReady = context?.session.isReady == true
    self.linkedSocketOnline = linkedSocketOnline
    capabilities = (context?.session.capabilities ?? [])
      .map(\.rawValue)
      .sorted()
  }
}

struct ProjectWorkspaceEditorState: Equatable, Sendable {
  struct Save: Sendable {
    let path: String
    let content: String
    let modifiedAtMs: Double
    fileprivate let readID: UUID
  }

  private(set) var path: String?
  private(set) var originalContent = ""
  var draft = ""
  private(set) var modifiedAtMs: Double?
  var showsMarkdownPreview = false
  private(set) var requiresReload = false
  private var readID: UUID?

  var isDirty: Bool {
    path != nil && draft != originalContent
  }

  var canSave: Bool {
    isDirty && modifiedAtMs != nil && readID != nil
  }

  var saveRequest: Save? {
    guard canSave, !requiresReload, let path, let modifiedAtMs, let readID else { return nil }
    return Save(path: path, content: draft, modifiedAtMs: modifiedAtMs, readID: readID)
  }

  mutating func beginLoading(path: String) {
    self = .init()
    self.path = path
  }

  @discardableResult
  mutating func install(_ result: ProjectFileReadResult) -> Bool {
    guard result.path == path, result.status == .ready, let content = result.content else {
      return false
    }
    originalContent = content
    draft = content
    modifiedAtMs = result.modifiedAtMs
    readID = UUID()
    requiresReload = false
    return true
  }

  /// Reconcile a fresh host read after a connection interruption. Retain the
  /// draft, and only advance its write base when the returned bytes establish
  /// the old base, the current draft, or the exact interrupted save.
  @discardableResult
  mutating func reconcileAfterReconnect(_ result: ProjectFileReadResult, interruptedSave: Save?) -> Bool {
    guard result.path == path, result.status == .ready, let content = result.content else {
      return false
    }
    if !isDirty { return install(result) }
    let wasSent = interruptedSave.map { owns($0) && $0.content == content } ?? false
    readID = UUID()
    if content == originalContent || content == draft || wasSent {
      originalContent = content
      modifiedAtMs = result.modifiedAtMs
      requiresReload = false
    } else {
      requiresReload = true
    }
    return true
  }

  func owns(_ request: Save) -> Bool {
    path == request.path && readID == request.readID && modifiedAtMs == request.modifiedAtMs
  }

  mutating func markSaved(_ request: Save, modifiedAtMs: Double) {
    guard owns(request) else { return }
    originalContent = request.content
    self.modifiedAtMs = modifiedAtMs
  }

  func previewContent(for result: ProjectFileReadResult) -> String {
    path == result.path && readID != nil ? draft : result.content ?? ""
  }

  mutating func discardChanges() {
    draft = originalContent
  }

  mutating func clear() {
    self = .init()
  }
}

enum ProjectWorkspaceSaveRecovery: Equatable, Sendable {
  case none
  case reloadRequired

  static func classify(_ failure: ProjectOperationFailure) -> Self {
    switch failure {
    case .ambiguousOutcome, .invalidResponse:
      .reloadRequired
    case .rejected(let statusCode, let code):
      if statusCode == 409
        || code == "mtime_conflict"
        || code == "file_changed"
        || code == "stale_file"
        || (statusCode == 500 && code == "internal_error")
      {
        .reloadRequired
      } else {
        .none
      }
    case .offline,
      .notReady,
      .busy,
      .capabilityMissing,
      .authenticationExpired,
      .authorizationMissingScope,
      .authorizationDenied,
      .transport:
      .none
    }
  }
}

enum ProjectWorkspaceBounds {
  static let searchLimit = 100
  static let maximumVisibleEntries = 250
  static let maximumVisibleChanges = 300
  static let maximumDiffLines = 10_000

  static func entries(_ entries: [ProjectWorkspaceEntry]) -> ArraySlice<ProjectWorkspaceEntry> {
    entries.prefix(maximumVisibleEntries)
  }

  static func changes(_ changes: [ProjectGitFileChange]) -> ArraySlice<ProjectGitFileChange> {
    changes.prefix(maximumVisibleChanges)
  }

  static func text(_ value: String) -> (value: String, wasTruncated: Bool) {
    let lines = value.split(separator: "\n", omittingEmptySubsequences: false)
    guard lines.count > maximumDiffLines else { return (value, false) }
    return (lines.prefix(maximumDiffLines).joined(separator: "\n"), true)
  }
}

enum ProjectWorkspacePath {
  static func parent(of path: String) -> String? {
    guard !path.isEmpty else { return nil }
    let components = path.split(separator: "/", omittingEmptySubsequences: true)
    guard components.count > 1 else { return "" }
    return components.dropLast().joined(separator: "/")
  }
}

enum ProjectReviewCommentThreadResolver {
  static func resolve(
    threads: [RemoteThread],
    projectID: String,
    worktreePath: String?,
    originThreadID: String?
  ) -> RemoteThread? {
    let candidates = threads.filter {
      $0.projectId == projectID
        && normalized($0.worktreePath) == normalized(worktreePath)
        && !$0.isArchived && !$0.isDone
        && ThreadPresentationFilter.isGUIPresentation($0.presentationMode)
    }
    return candidates.first(where: { $0.id == originThreadID })
      ?? candidates.max(by: { $0.updatedAt < $1.updatedAt })
  }

  private static func normalized(_ value: String?) -> String? {
    guard let value, !value.isEmpty else { return nil }
    return value
  }
}
