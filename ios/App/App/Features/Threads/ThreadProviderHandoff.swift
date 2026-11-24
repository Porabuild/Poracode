import SwiftUI

private struct RichChatProviderLabelsKey: EnvironmentKey {
  static let defaultValue: [String: String] = [:]
}

private struct RichChatModelLabelsKey: EnvironmentKey {
  static let defaultValue: [String: String] = [:]
}

extension EnvironmentValues {
  var richChatProviderLabels: [String: String] {
    get { self[RichChatProviderLabelsKey.self] }
    set { self[RichChatProviderLabelsKey.self] = newValue }
  }
  var richChatModelLabels: [String: String] {
    get { self[RichChatModelLabelsKey.self] }
    set { self[RichChatModelLabelsKey.self] = newValue }
  }
}

/// Model id → display label across every provider's GUI model catalog, so a
/// model-switch divider reads with picker names instead of raw ids.
func richChatModelLabels(from providers: [AgentStatusRecord]) -> [String: String] {
  var labels: [String: String] = [:]
  for provider in providers {
    let capabilities = provider.capabilities
    var catalogs = [capabilities["models"]]
    if let gui = capabilities["presentationCapabilities"]?.objectValue?["gui"]?.objectValue {
      catalogs.append(gui["models"])
    }
    for catalog in catalogs {
      for entry in catalog?.arrayValue ?? [] {
        guard let object = entry.objectValue,
          let id = object["id"]?.stringValue,
          let label = object["label"]?.stringValue
        else { continue }
        if labels[id] == nil { labels[id] = label }
      }
    }
  }
  return labels
}

struct RichChatProviderHandoffRow: View {
  let item: RichRuntimeItem
  @Environment(\.richChatProviderLabels) private var providerLabels

  var body: some View {
    if let payload = item.payload?.objectValue,
      let from = RichDecoding.requiredString(payload, "fromAgentKind", allowEmpty: false),
      let to = RichDecoding.requiredString(payload, "toAgentKind", allowEmpty: false) {
      let title = RichChatStrings.providerSwitched(from: providerLabels[from] ?? from, to: providerLabels[to] ?? to)
      Label(title, systemImage: "arrow.left.arrow.right")
        .poracodeChatText(.metadata)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 12)
        .accessibilityLabel(title)
        .accessibilityIdentifier("native-e2e.transcript.provider-handoff")
    }
  }
}

struct RichChatModelSwitchRow: View {
  let item: RichRuntimeItem
  @Environment(\.richChatModelLabels) private var modelLabels

  var body: some View {
    if let payload = item.payload?.objectValue,
      let from = RichDecoding.requiredString(payload, "fromModel", allowEmpty: false),
      let to = RichDecoding.requiredString(payload, "toModel", allowEmpty: false) {
      let title = RichChatStrings.modelSwitched(from: modelLabels[from] ?? from, to: modelLabels[to] ?? to)
      Label(title, systemImage: "arrow.left.arrow.right")
        .poracodeChatText(.metadata)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 12)
        .accessibilityLabel(title)
        .accessibilityIdentifier("native-e2e.transcript.model-switch")
    }
  }
}

/// A window-owned shortcut into the existing handoff flow. Both the host
/// lease and provider session must still be the ones the roster displayed.
struct ThreadProviderHandoffRequest: Equatable {
  let id = UUID()
  let target: ThreadLifecycleTarget
  let owner: RichChatSessionActionOwner
}

enum ThreadProviderHandoffMode: String, Identifiable {
  case fork
  case move

  var id: String { rawValue }
}

struct ThreadProviderHandoffIntent: Identifiable {
  let mode: ThreadProviderHandoffMode
  let source: ThreadLifecycleTarget
  let groupID: String?
  let groupName: String?

  var id: String { mode.rawValue }

  func owns(_ target: ThreadLifecycleTarget?) -> Bool { target == source }
}

struct ThreadProviderHandoffTarget: Equatable {
  let agentKind: String
  let modelID: String
  let presentationMode: ThreadPresentationMode
}

enum ThreadProviderHandoffPresentation {
  static let maximumContextCharacters = 50_000

  static func initialTarget(
    agents: [AgentStatusRecord],
    sourceAgentKind: String,
    sourceMode: ThreadPresentationMode
  ) -> ThreadProviderHandoffTarget? {
    let candidates = agents.filter { $0.installed && $0.kind != sourceAgentKind }
    for mode in [sourceMode, .gui, .terminal] {
      for agent in candidates {
        guard HomeComposerCatalog.supportsPresentation(agent, mode: mode) else { continue }
        if let model = HomeComposerCatalog.models(for: agent, presentationMode: mode).first {
          return ThreadProviderHandoffTarget(
            agentKind: agent.kind,
            modelID: model.modelID,
            presentationMode: mode
          )
        }
      }
    }
    return nil
  }

  static func transcriptSummary(
    items: [RichRuntimeItem],
    terminalScrollback: String?,
    sourceLabel: String
  ) -> String? {
    let transcript =
      items
      .filter { $0.parentItemID == nil }
      .compactMap(contextRow)
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .joined(separator: "\n\n")
    let source: String
    if transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      source = terminalScrollback?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    } else {
      source = transcript
    }
    guard !source.isEmpty else { return nil }
    let clipped: String
    if source.count > maximumContextCharacters {
      clipped =
        String(source.suffix(maximumContextCharacters)) + "\n\n[earlier transcript truncated]"
    } else {
      clipped = source
    }
    return [
      "Context captured from the \(sourceLabel) transcript because provider resume was unavailable.",
      "",
      clipped,
    ].joined(separator: "\n")
  }

  static func promptPrefix(sourceAgentKind: String, summary: String?) -> String? {
    summary.map {
      "[Context from previous \(sourceAgentKind) session]\n\n\($0)\n\n"
    }
  }

  static func contextRow(_ item: RichRuntimeItem) -> String? {
    let payload = item.payload?.objectValue
    switch item.type {
    case RichItemType.userMessage:
      let text = messageText(item)
      return text.isEmpty ? nil : "User:\n\(text)"
    case RichItemType.assistantMessage:
      let text = [RichAssistantDisplayText.text(for: item), messageText(item, includingProse: false)]
        .filter { !$0.isEmpty }.joined(separator: "\n")
      return text.isEmpty ? nil : "Assistant:\n\(text)"
    case RichItemType.plan:
      let steps =
        payload?["steps"]?.arrayValue?.compactMap { value -> String? in
          guard let step = value.objectValue?["step"]?.stringValue, !step.isEmpty else {
            return nil
          }
          let status = value.objectValue?["status"]?.stringValue ?? "pending"
          return "- [\(status)] \(step)"
        }.joined(separator: "\n") ?? ""
      return steps.isEmpty ? nil : "Plan:\n\(steps)"
    case RichItemType.goal:
      guard let objective = payload?["objective"]?.stringValue, !objective.isEmpty else {
        return nil
      }
      let status = payload?["status"]?.stringValue.map { " (\($0))" } ?? ""
      return "Goal\(status):\n\(objective)"
    case "tool_call", "mcp_tool_call", "image_view", "dynamic_tool_call":
      guard let name = payload?["title"]?.stringValue ?? payload?["name"]?.stringValue else {
        return nil
      }
      let status = payload?["status"]?.stringValue ?? item.state.rawValue
      return "Tool \(status): \(name)"
    case "command_execution":
      let command = payload?["command"]?.stringValue ?? ""
      let output = item.streams["command_output"] ?? ""
      guard !command.isEmpty || !output.isEmpty else { return nil }
      return "Command:\n\(command)" + (output.isEmpty ? "" : "\nOutput:\n\(output)")
    case "file_change":
      guard let path = payload?["path"]?.stringValue, !path.isEmpty else { return nil }
      return "File \(payload?["changeKind"]?.stringValue ?? "change"): \(path)"
    case "web_search":
      guard let query = payload?["query"]?.stringValue, !query.isEmpty else { return nil }
      return "Web search: \(query)"
    case RichItemType.error:
      guard let message = payload?["message"]?.stringValue, !message.isEmpty else { return nil }
      return "Error:\n\(message)"
    default:
      return nil
    }
  }

  private static func messageText(_ item: RichRuntimeItem, includingProse: Bool = true) -> String {
    let blocks = RichContentDecoder.decodeMessageContent(item.payload) ?? []
    let text = blocks.compactMap { block -> String? in
      switch block {
      case .text(let value): includingProse ? value : nil
      case .file(let path, _, _, _): "@\(path)"
      case .image(_, _, let path?, _, _): "@\(path)"
      case .image(_, _, nil, let name?, _): "[image: \(name)]"
      case .image: "[image]"
      default: nil
      }
    }.filter { !$0.isEmpty }.joined(separator: "\n")
    if !text.isEmpty { return text }
    return includingProse ? item.streams["assistant_text"] ?? "" : ""
  }
}

struct ThreadProviderHandoffSheet: View {
  @Environment(\.dismiss) private var dismiss

  @Bindable var session: AppSession
  let thread: RemoteThread
  let project: RemoteProject
  let target: ThreadProviderHandoffTarget
  let intent: ThreadProviderHandoffIntent
  let summary: String?
  let onStarted: (String, ThreadProviderHandoffIntent) -> Void

  @State private var isExpanded = true

  var body: some View {
    NavigationStack {
      VStack {
        Spacer(minLength: 0)

        HomeQuickComposeSessionView(
          session: session,
          isExpanded: $isExpanded,
          launchSeed: launchSeed
        ) { threadID in
          onStarted(threadID, intent)
          dismiss()
        }
        .padding()
      }
      .background(Color(uiColor: .systemGroupedBackground))
      .navigationTitle(RichChatStrings.continueInProvider)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
            .accessibilityIdentifier("native-e2e.thread.handoff-cancel")
        }
      }
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
    .modifier(PoracodeRetainNavigationWhilePresented())
  }

  private var launchSeed: HomeThreadLaunchSeed {
    HomeThreadLaunchSeed(
      fixedProjectID: project.id,
      initialWorktree: initialWorktree,
      worktreePath: thread.worktreePath,
      worktreeBranch: thread.worktreeBranch,
      initialAgentKind: target.agentKind,
      initialModelID: target.modelID,
      defaultPrompt:
        "Continue from the transferred context and pick up where the previous provider left off.",
      promptPlaceholder: RichChatStrings.handoffPrompt,
      promptPrefix: ThreadProviderHandoffPresentation.promptPrefix(
        sourceAgentKind: thread.agentKind,
        summary: summary
      ),
      presentationMode: target.presentationMode,
      groupID: intent.groupID,
      groupName: intent.groupName,
      title: thread.title,
      excludedAgentKind: thread.agentKind,
      providerSwitchSource: intent.mode == .move && thread.presentationMode == "gui"
        ? HomeProviderSwitchSource(target: intent.source, agentKind: thread.agentKind)
        : nil
    )
  }

  private var initialWorktree: HomeComposerBranchSelection? {
    guard let path = thread.worktreePath, !path.isEmpty,
      let branch = thread.worktreeBranch, !branch.isEmpty
    else { return nil }
    return HomeComposerBranchSelection(branch: branch, worktreePath: path)
  }
}
