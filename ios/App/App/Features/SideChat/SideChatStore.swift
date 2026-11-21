import Foundation
import Observation

struct SideChatSourceKey: Hashable {
  let connectionID: ClientConnectionID
  let threadID: String
}

@MainActor @Observable final class SideChatLaunchState {
  var contextFailure: SideChatContextFailure?
  var prepared: (request: ThreadRelaunchRequest, commandID: String)?
}

@MainActor @Observable final class SideChatEntry: Identifiable {
  let id = UUID()
  let sessionOwner = UUID()
  let key: SideChatSourceKey
  let source: RemoteThread
  let draft: HomeQuickComposeState
  let launchThreadID: String
  let contextGateway: any SideChatContextCapturing
  let suite: RichChatControllerSuite
  let launchState: SideChatLaunchState
  let voice: ComposerVoiceState
  var threadID: String?
  var composing = true
  var isPresented = false { didSet { voice.refreshOwnership() } }
  var retrying = false
  var revoked = false { didSet { voice.refreshOwnership() } }

  init(session: AppSession, source: RemoteThread, connectionID: ClientConnectionID, question: String,
    contextGateway: any SideChatContextCapturing) {
    key = .init(connectionID: connectionID, threadID: source.id)
    self.source = source
    self.contextGateway = contextGateway
    suite = session.makeRichChatControllerSuite()
    voice = ComposerVoiceState(session: session)
    let launchState = SideChatLaunchState()
    self.launchState = launchState
    var configuration = source.config
    let status = ComposerProviderCatalog.inEnvironment(session.state.replay.agentStatuses.ordered,
      location: session.richChatProjectLocation(threadID: source.id)).first { $0.kind == source.agentKind }
    let catalog = RichChatComposerControlCatalog(agentStatus: status, presentationMode: .gui,
      configuration: configuration, agentInstanceID: source.agentInstanceId)
    if configuration.mode == "plan" {
      configuration.mode = RichChatComposerControlCatalog.nonPlanMode(in: catalog.modeOptions(for: configuration.model))
    }
    let seed = HomeThreadLaunchSeed(fixedProjectID: source.projectId,
      worktreePath: source.worktreePath, worktreeBranch: source.worktreeBranch,
      initialAgentKind: source.agentKind, initialModelID: source.config.model,
      initialPrompt: question, promptPlaceholder: SideChatStrings.questionPrompt, presentationMode: .gui, title: "\(SideChatStrings.title): \(source.title)",
      initialConfiguration: .init(configuration), initialAgentInstanceID: source.agentInstanceId,
      parentThreadID: source.id, locksPresentationMode: true, autoStart: !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      failureMessage: { failure in
        launchState.contextFailure.map(SideChatStrings.contextFailure) ?? ThreadLifecycleStrings.failureMessage(failure)
      })
    draft = .init(session: session, launchSeed: seed)
    launchThreadID = draft.threadID
    voice.ownerIsPresented = { [weak self] in self?.isPresented == true && self?.revoked == false }
  }

  var uncertain: Bool {
    guard threadID == nil, launchState.prepared != nil else { return false }
    guard case .failed(_, let failure)? = draft.lifecycle.lastOutcome else { return false }
    return switch failure {
    case .invalidRequest, .authenticationExpired, .authorizationMissingScope, .authorizationDenied, .rejected: false
    default: true
    }
  }

  func started(_ id: String) {
    threadID = id
    launchState.prepared = nil
    launchState.contextFailure = nil
    draft.clearSubmittedContent()
  }
}

/// Window-owned auxiliary custody, separate from the host's thread authority.
/// Hiding retains the conversation; explicit closing revokes its send owner
/// immediately and schedules deletion of only that owned auxiliary record.
@MainActor @Observable final class SideChatStore {
  @ObservationIgnored private let contextGateway: @MainActor (AppSession) -> any SideChatContextCapturing
  private(set) var entries: [SideChatSourceKey: SideChatEntry] = [:]
  private var retired: Set<SideChatSourceKey> = []
  private var pendingDisposals: [SideChatSourceKey: SideChatEntry] = [:]
  private var disposing: Set<SideChatSourceKey> = []
  private var attemptedDisposalLease: [SideChatSourceKey: ThreadHostLease] = [:]
  private var retryingDisposals = false
  private var reconcilingParents = false

  init(contextGateway: @escaping @MainActor (AppSession) -> any SideChatContextCapturing = { $0.makeSideChatContextGateway() }) {
    self.contextGateway = contextGateway
  }

  func entry(parentID: String, connectionID: ClientConnectionID?) -> SideChatEntry? {
    connectionID.flatMap { entries[.init(connectionID: $0, threadID: parentID)] }
  }

  func started(_ entry: SideChatEntry, threadID: String, session: AppSession) {
    guard entries[entry.key] === entry, !entry.revoked else { return }
    entry.started(threadID)
    synchronizeOwners(session: session)
  }

  /// The conversation owner outlives its pane. Hiding the UI must not cancel
  /// an accepted send or lose the child stream; reconnect rebinds this owner.
  func synchronizeOwners(session: AppSession) {
    guard let access = session.currentRichChatAccess, access.controllerGate(.sessionRead) == nil else { return }
    for entry in entries.values where entry.key.connectionID == access.lease.connectionID && !entry.revoked {
      guard let threadID = entry.threadID else { continue }
      let changed = entry.suite.scope.target != .init(lease: access.lease, threadID: threadID) || entry.suite.scope.isBackgrounded
      entry.suite.select(access: access, threadID: threadID)
      if entry.suite.scope.isBackgrounded { entry.suite.leaveBackground(access: access) }
      session.attachRichChatSuite(entry.suite, auxiliary: true, owner: entry.sessionOwner)
      if changed {
        Task { @MainActor [weak entry] in
          guard let entry, !entry.revoked else { return }
          await entry.suite.refreshAuthoritativeHistory()
        }
      }
    }
  }

  /// A paged catalog or a disconnect is not proof that a parent was deleted.
  /// Only the exact owning host's authoritative membership answer can revoke it.
  func reconcileParents(session: AppSession) async {
    guard !reconcilingParents, let access = session.currentRichChatAccess,
      access.controllerGate(.sessionRead) == nil else { return }
    let owned = entries.values.filter { $0.key.connectionID == access.lease.connectionID && !$0.revoked }
    guard let reader = owned.first?.contextGateway else { return }
    reconcilingParents = true
    defer { reconcilingParents = false }
    let ids = Array(Set(owned.map { $0.source.id })).sorted()
    for start in stride(from: 0, to: ids.count, by: 200) {
      let group = Array(ids[start..<min(start + 200, ids.count)])
      let rows = Dictionary(uniqueKeysWithValues: group.compactMap { id in session.richChatThread(id: id).map { (id, $0) } })
      let sequences = session.state.catalog.threadAppliedSeq
      do {
        guard let existing = try await reader.existingParents(group, lease: access.lease),
          session.currentRichChatAccess?.lease == access.lease else { return }
        for entry in owned where group.contains(entry.source.id) && !existing.contains(entry.source.id) {
          if entries[entry.key] === entry, rows[entry.source.id] == session.richChatThread(id: entry.source.id),
            sequences[entry.source.id] == session.state.catalog.threadAppliedSeq[entry.source.id] {
            retire(entry, session: session)
          }
        }
      } catch { return }
    }
    await retryDisposals(session: session)
  }

  func child(threadID: String, connectionID: ClientConnectionID) -> SideChatEntry? {
    entries.values.first { $0.key.connectionID == connectionID && ($0.launchThreadID == threadID || $0.threadID == threadID) }
  }

  func isHidden(threadID: String, connectionID: ClientConnectionID) -> Bool {
    child(threadID: threadID, connectionID: connectionID) != nil
      || retired.contains(.init(connectionID: connectionID, threadID: threadID))
  }

  func open(session: AppSession, source: RemoteThread, owner: ClientConnectionID, question: String = "", fresh: Bool = false) throws -> SideChatEntry {
    guard let connectionID = session.selectedConnectionId, connectionID == owner, source.presentationMode == "gui",
      session.currentRichChatAccess?.controllerGate(.sessionOperate) == nil,
      !isHidden(threadID: source.id, connectionID: connectionID) else { throw SideChatContextFailure.unavailable }
    guard session.state.conversationSnapshotsSupported else { throw SideChatContextFailure.hostUpdateRequired }
    let key = SideChatSourceKey(connectionID: connectionID, threadID: source.id)
    if !fresh, let entry = entries[key] { return entry }
    if let old = entries[key] { retire(old, session: session) }
    let entry = SideChatEntry(session: session, source: source, connectionID: connectionID, question: question,
      contextGateway: contextGateway(session))
    entries[key] = entry
    return entry
  }

  func capture(for target: RichChatThreadTarget, session: AppSession) async throws -> TurnClientContext? {
    guard let entry = child(threadID: target.threadID, connectionID: target.lease.connectionID) else {
      if retired.contains(.init(connectionID: target.lease.connectionID, threadID: target.threadID)) { throw SideChatContextFailure.staleHost }
      return nil
    }
    guard session.currentRichChatAccess?.lease == target.lease, !entry.revoked else { throw SideChatContextFailure.staleHost }
    entry.launchState.contextFailure = nil
    do {
      let size = session.richChatThread(id: entry.source.id)?.config.contextSize ?? entry.source.config.contextSize
      let context = try await entry.contextGateway.capture(parent: .init(lease: target.lease, threadID: entry.source.id),
        maximumUTF16Count: SideChatContextBudget.limit(size))
      guard entries[entry.key] === entry, !entry.revoked,
        session.currentRichChatAccess?.lease == target.lease else { throw SideChatContextFailure.staleHost }
      return context
    } catch {
      entry.launchState.contextFailure = error as? SideChatContextFailure ?? .unavailable
      throw error
    }
  }

  func prepare(_ request: ThreadRelaunchRequest, target: ThreadLifecycleTarget, commandID: String, session: AppSession) async throws -> ThreadRelaunchRequest {
    let owner = target.lease.identity.clientConnectionID
    guard let entry = child(threadID: target.threadID, connectionID: owner) else {
      if retired.contains(.init(connectionID: owner, threadID: target.threadID)) { throw SideChatContextFailure.staleHost }
      return request
    }
    guard let access = session.currentRichChatAccess, access.lease.connectionID == owner,
      access.lease.generation == target.lease.generation else { throw SideChatContextFailure.staleHost }
    // Explicit retry uses the original bytes and command id, including its
    // private context. The fresh read still revalidates this host's support.
    let context = try await capture(for: .init(lease: access.lease, threadID: target.threadID), session: session)
    if let saved = entry.launchState.prepared, saved.commandID == commandID { return saved.request }
    var prepared = request
    prepared.clientContext = context
    prepared.parentThreadID = entry.source.id
    prepared.focus = false
    if entry.threadID == nil {
      prepared.worktreePath = entry.source.worktreePath
      prepared.worktreeBranch = entry.source.worktreeBranch
    }
    if entry.threadID == nil { entry.launchState.prepared = (prepared, commandID) }
    return prepared
  }

  func retryInitial(_ entry: SideChatEntry, session: AppSession) async {
    guard entry.uncertain, !entry.retrying, !entry.revoked,
      session.selectedConnectionId == entry.key.connectionID,
      let saved = entry.launchState.prepared,
      let target = session.threadLifecycleTarget(threadID: entry.launchThreadID) else { return }
    entry.retrying = true
    defer { entry.retrying = false }
    entry.draft.lifecycle.activate(target)
    await entry.draft.lifecycle.relaunch(saved.request, target: target, commandID: saved.commandID)
    if case .succeeded? = entry.draft.lifecycle.lastOutcome {
      await session.refreshSnapshot()
      started(entry, threadID: entry.launchThreadID, session: session)
    }
  }

  func retire(_ entry: SideChatEntry, session: AppSession) {
    guard !entry.revoked else { return }
    entry.revoked = true
    entry.isPresented = false
    session.detachRichChatSuite(entry.suite)
    entry.suite.deselect()
    entries.removeValue(forKey: entry.key)
    let child = SideChatSourceKey(connectionID: entry.key.connectionID, threadID: entry.threadID ?? entry.launchThreadID)
    retired.insert(child)
    if entry.threadID != nil || entry.launchState.prepared != nil { pendingDisposals[child] = entry }
    entry.launchState.prepared = nil
    entry.draft.clearSubmittedContent()
  }

  func retryDisposals(session: AppSession, force: Bool = false) async {
    guard !retryingDisposals, let access = session.currentThreadSessionAccess, access.isOnline, access.isReady,
      access.scopes.contains("session:operate") else { return }
    retryingDisposals = true
    defer { retryingDisposals = false }
    for (key, entry) in Array(pendingDisposals) where key.connectionID == access.lease.identity.clientConnectionID
      && !disposing.contains(key) && (force || attemptedDisposalLease[key] != access.lease
        || session.richChatThread(id: key.threadID) != nil) {
      disposing.insert(key)
      attemptedDisposalLease[key] = access.lease
      // The launch controller owns the serialization tail of its initial
      // Create. Reuse it until adoption, so Delete cannot race ahead of Create.
      let initialUnconfirmed = entry.threadID == nil
      let controller = initialUnconfirmed ? entry.draft.lifecycle : session.makeThreadLifecycleController()
      controller.activate(.init(lease: access.lease, threadID: key.threadID))
      controller.delete()
      await controller.confirmDestructiveIntent()
      let absent: Bool
      if case .failed(_, .rejected(let status, _))? = controller.lastOutcome { absent = status == 404 }
      else { absent = false }
      // A 404 after an unacknowledged Create is inconclusive. Retain custody
      // without retrying Create; a late catalog row enables another Delete.
      if controller.lastOutcome == .succeeded(.delete) || (absent && !initialUnconfirmed) {
        pendingDisposals.removeValue(forKey: key)
        attemptedDisposalLease.removeValue(forKey: key)
      }
      disposing.remove(key)
    }
  }
}

enum SideChatContextBudget {
  static func limit(_ contextSize: String?) -> Int {
    guard let raw = contextSize?.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ""),
      raw.range(of: "^\\d+(?:\\.\\d+)?\\s*[kKmM]?$", options: .regularExpression) != nil else { return 50_000 }
    let suffix = raw.last?.lowercased()
    let amount = Double((suffix == "k" || suffix == "m") ? String(raw.dropLast()).trimmingCharacters(in: .whitespaces) : raw) ?? 0
    let tokens = (amount * (suffix == "m" ? 1_000_000 : suffix == "k" ? 1_000 : 1)).rounded()
    guard (1_000...10_000_000).contains(tokens) else { return 50_000 }
    return min(50_000, Int((tokens * 4 * 0.35).rounded(.down)))
  }
}
