import Foundation
import Observation
import SwiftUI

struct RichChatSelectedMCP: Identifiable, Equatable, Sendable {
  let id: String
  let name: String

  var segment: RichPromptSegment { .mcp(id: id, name: name) }
}

enum RichChatMCPConfigKey: Sendable {
  case browser
  case crossagents
  case chrome
  case computerUse
}

struct RichChatMCPMentionOption: Identifiable, Equatable, Sendable {
  let id: String
  let name: String
  let systemImage: String
  let configKey: RichChatMCPConfigKey?

  var selection: RichChatSelectedMCP {
    RichChatSelectedMCP(id: id, name: name)
  }
}

enum RichChatMCPMentionCatalog {
  static var options: [RichChatMCPMentionOption] {
    [
      RichChatMCPMentionOption(
        id: "app-controls",
        name: TerminalStrings.title,
        systemImage: "terminal",
        configKey: nil
      ),
      RichChatMCPMentionOption(
        id: "browser",
        name: HomeStrings.browser,
        systemImage: "globe",
        configKey: .browser
      ),
      RichChatMCPMentionOption(
        id: "crossagents",
        name: HomeStrings.crossagents,
        systemImage: "person.2",
        configKey: .crossagents
      ),
      RichChatMCPMentionOption(
        id: "chrome",
        name: HomeStrings.chrome,
        systemImage: "rectangle",
        configKey: .chrome
      ),
      RichChatMCPMentionOption(
        id: "computer-use",
        name: HomeStrings.computerUse,
        systemImage: "desktopcomputer",
        configKey: .computerUse
      ),
    ]
  }

  static func suggestions(for draft: String) -> [RichChatMCPMentionOption] {
    guard let trigger = RichChatMentionTrigger.trailing(in: draft) else { return [] }
    return suggestions(query: trigger.query)
  }

  static func suggestions(query: String) -> [RichChatMCPMentionOption] {
    let query = query.lowercased()
    return options.filter {
      $0.id.lowercased().hasPrefix(query) || $0.name.lowercased().hasPrefix(query)
    }
  }

  static func enable(_ key: RichChatMCPConfigKey?, in configuration: inout ThreadConfig) {
    switch key {
    case .browser: configuration.browserMcp = true
    case .crossagents: configuration.crossagentMcp = true
    case .chrome: configuration.chromeMcp = true
    case .computerUse: configuration.computerUse = true
    case nil: break
    }
  }

  static func disable(_ id: String, in configuration: inout ThreadConfig) {
    switch id {
    case "browser": configuration.browserMcp = false
    case "crossagents": configuration.crossagentMcp = false
    case "chrome": configuration.chromeMcp = false
    case "computer-use": configuration.computerUse = false
    default: break
    }
  }
}

struct RichChatMentionTrigger: Equatable, Sendable {
  let query: String
  let tokenRange: Range<String.Index>

  static func trailing(in draft: String) -> RichChatMentionTrigger? {
    let tokenStart =
      draft.lastIndex(where: { $0.isWhitespace }).map({
        draft.index(after: $0)
      }) ?? draft.startIndex
    guard
      tokenStart < draft.endIndex,
      draft[tokenStart] == "@"
    else { return nil }

    let queryStart = draft.index(after: tokenStart)
    let query = String(draft[queryStart...])
    guard !query.contains(where: { $0.isWhitespace || $0 == "@" }) else { return nil }
    return RichChatMentionTrigger(query: query, tokenRange: tokenStart..<draft.endIndex)
  }

  func removingToken(from draft: String) -> String {
    guard tokenRange.lowerBound >= draft.startIndex, tokenRange.upperBound <= draft.endIndex else {
      return draft
    }
    var next = draft
    next.removeSubrange(tokenRange)
    return next
  }
}

@MainActor
@Observable
final class RichChatFileMentionController {
  private(set) var suggestions: [ProjectWorkspaceEntry] = []
  private(set) var isLoading = false

  @ObservationIgnored private weak var session: AppSession?
  @ObservationIgnored private let threadID: String?
  @ObservationIgnored private var projectID: String?
  @ObservationIgnored private var projectLocation: ProjectLocation?
  @ObservationIgnored private let settingsDocument: SettingsDocumentController
  @ObservationIgnored private var source: ProjectWorkspaceSelectionSource?
  @ObservationIgnored private var fileController: ProjectFileWorkspaceController?
  @ObservationIgnored private var activeTrigger: RichChatMentionTrigger?
  @ObservationIgnored private var searchTask: Task<Void, Never>?

  init(session: AppSession, threadID: String) {
    self.session = session
    self.threadID = threadID
    settingsDocument = SettingsDocumentController(gateway: session.makeSettingsSessionGateway())
  }

  init(session: AppSession) {
    self.session = session
    threadID = nil
    settingsDocument = SettingsDocumentController(gateway: session.makeSettingsSessionGateway())
  }

  func selectProject(_ project: RemoteProject?) {
    let nextProject = project?.id == RemoteProject.homeScopeID ? nil : project
    guard projectID != nextProject?.id || projectLocation != nextProject?.location else { return }
    projectID = nextProject?.id
    projectLocation = nextProject?.location
    activeTrigger = nil
    searchTask?.cancel()
    suggestions = []
    isLoading = false
  }

  func update(draft: String) {
    let trigger = RichChatMentionTrigger.trailing(in: draft)
    guard trigger != activeTrigger else { return }
    activeTrigger = trigger
    searchTask?.cancel()
    suggestions = []
    isLoading = trigger != nil
    guard let trigger else {
      isLoading = false
      return
    }

    searchTask = Task { [weak self] in
      if !trigger.query.isEmpty {
        try? await Task.sleep(for: .milliseconds(150))
      }
      guard !Task.isCancelled else { return }
      await self?.search(trigger: trigger)
    }
  }

  func consumeTrigger(from draft: String) -> String {
    guard let trigger = RichChatMentionTrigger.trailing(in: draft), trigger == activeTrigger else {
      return draft
    }
    activeTrigger = nil
    searchTask?.cancel()
    suggestions = []
    isLoading = false
    return trigger.removingToken(from: draft)
  }

  private func search(trigger: RichChatMentionTrigger) async {
    guard let composition = synchronizeComposition() else {
      finish(trigger: trigger, entries: [])
      return
    }

    settingsDocument.activate(session?.currentSettingsHostSelection?.lease)
    if settingsDocument.document == nil { await settingsDocument.load() }
    guard !Task.isCancelled, activeTrigger == trigger else { return }

    composition.controller.activate(composition.context)
    await composition.controller.searchFiles(
      query: trigger.query,
      limit: 20,
      searchConfig: resolvedSearchConfig(project: composition.project)
    )
    guard !Task.isCancelled, activeTrigger == trigger else { return }
    finish(trigger: trigger, entries: composition.controller.fileSearch.value?.entries ?? [])
  }

  private func synchronizeComposition() -> (
    controller: ProjectFileWorkspaceController,
    context: ProjectWorkspaceContext,
    project: RemoteProject
  )? {
    guard let session, let connectionID = session.selectedConnectionId else { return nil }
    let selection: (project: RemoteProject, location: ProjectLocation)?
    if let threadID,
      let thread = session.richChatThread(id: threadID),
      let project = session.projects.first(where: { $0.id == thread.projectId }),
      let location = session.richChatProjectLocation(threadID: threadID)
    {
      selection = (project, location)
    } else if let projectID, let projectLocation,
      let project = session.projects.first(where: { $0.id == projectID })
    {
      selection = (project, projectLocation)
    } else {
      selection = nil
    }
    guard let selection else { return nil }
    let project = selection.project
    let location = selection.location

    let identity = project.identity(on: connectionID)
    if let source {
      source.synchronize(
        identity: identity,
        location: project.location,
        workspaceLocation: location
      )
    } else {
      let source = ProjectWorkspaceSelectionSource(
        session: session,
        identity: identity,
        location: project.location,
        workspaceLocation: location
      )
      let gateway = SelectedProjectWorkspaceGateway { @MainActor [weak source] in
        source?.selection
      }
      self.source = source
      fileController = ProjectFileWorkspaceController(gateway: gateway)
    }

    guard let controller = fileController, let context = self.source?.context else { return nil }
    return (controller, context, project)
  }

  private func resolvedSearchConfig(project: RemoteProject) -> ProjectWorkspaceSearchConfig {
    let document = settingsDocument.document
    var patterns = ProjectSearchSettingsPresentation.defaultExclude
    for (pattern, enabled) in document?.searchExclude ?? [:] { patterns[pattern] = enabled }
    for (pattern, enabled) in project.searchSettings?.exclude ?? [:] { patterns[pattern] = enabled }
    patterns[ProjectSearchSettingsPresentation.lockedPattern] = true
    return ProjectWorkspaceSearchConfig(
      useIgnoreFiles: project.searchSettings?.useIgnoreFiles
        ?? document?.searchUseIgnoreFiles
        ?? true,
      excludePatterns: patterns.compactMap { $0.value ? $0.key : nil }.sorted()
    )
  }

  private func finish(trigger: RichChatMentionTrigger, entries: [ProjectWorkspaceEntry]) {
    guard activeTrigger == trigger else { return }
    suggestions = entries
    isLoading = false
  }
}

struct RichChatMentionSuggestionsView: View {
  let mcps: [RichChatMCPMentionOption]
  let files: [ProjectWorkspaceEntry]
  let selectMCP: (RichChatMCPMentionOption) -> Void
  let selectFile: (ProjectWorkspaceEntry) -> Void

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {
        ForEach(Array(mcps.enumerated()), id: \.element.id) { index, option in
          Button {
            selectMCP(option)
          } label: {
            row(
              systemImage: option.systemImage,
              title: "@\(option.name)",
              detail: nil
            )
          }
          .buttonStyle(.plain)
          .accessibilityLabel("@\(option.name)")
          if index < mcps.count - 1 || !files.isEmpty { Divider() }
        }
        ForEach(Array(files.enumerated()), id: \.element.id) { index, entry in
          Button {
            selectFile(entry)
          } label: {
            row(
              systemImage: entry.type == .directory ? "folder" : "doc",
              title: entry.name,
              detail: entry.path == entry.name ? nil : entry.path
            )
          }
          .buttonStyle(.plain)
          .accessibilityLabel("@\(entry.path)")
          if index < files.count - 1 { Divider() }
        }
      }
    }
    .frame(maxHeight: 264)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  private func row(systemImage: String, title: String, detail: String?) -> some View {
    HStack(spacing: 10) {
      Image(systemName: systemImage)
        .frame(width: 20)
        .foregroundStyle(.secondary)
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(.callout).foregroundStyle(.primary)
        if let detail {
          Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
    .padding(.horizontal, 10)
  }
}
