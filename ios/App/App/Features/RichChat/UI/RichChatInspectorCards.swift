import SwiftUI

struct RichChatThreadInfoCard: View {
  let thread: RemoteThread?
  let project: RemoteProject?
  let projectLocation: ProjectLocation?
  let gitSummary: GitThreadSummary?
  var embedded = false

  @State private var isExpanded = true

  private var resolvedPath: String? {
    if let path = project?.location.displayPath, !path.isEmpty { return path }
    if let path = projectLocation?.displayPath, !path.isEmpty { return path }
    return nil
  }

  private var resolvedBranch: String? {
    if let branch = gitSummary?.branch, !branch.isEmpty { return branch }
    if let branch = thread?.worktreeBranch, !branch.isEmpty { return branch }
    return nil
  }

  private var rows: [(label: String, value: String)] {
    var entries: [(String, String)] = []
    if let name = project?.name, !name.isEmpty {
      entries.append((HomeStrings.threadInfoWorkspace, name))
    }
    if let resolvedPath {
      entries.append((HomeStrings.threadInfoPath, resolvedPath))
    }
    if let worktree = thread?.worktreePath, !worktree.isEmpty {
      entries.append((HomeStrings.worktree, worktree))
    }
    if let resolvedBranch {
      entries.append((HomeStrings.branch, resolvedBranch))
    }
    if let sessionID = thread?.sessionRef?.providerSessionID, !sessionID.isEmpty {
      entries.append((HomeStrings.threadInfoSessionID, sessionID))
    }
    return entries
  }

  private var collapsedSummary: String? {
    resolvedBranch ?? project?.name
  }

  var body: some View {
    if !rows.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        if !embedded {
        Button {
          withAnimation(.snappy(duration: 0.2)) {
            isExpanded.toggle()
          }
        } label: {
          HStack(spacing: 8) {
            Image(systemName: "folder")
              .font(.caption)
              .foregroundStyle(.secondary)
              .accessibilityHidden(true)
            Text(HomeStrings.threadInfo)
              .poracodeChatText(.metadata, weight: .semibold)
              .foregroundStyle(.primary)
              .lineLimit(1)
            Spacer(minLength: 6)
            if !isExpanded, let collapsedSummary, !collapsedSummary.isEmpty {
              Text(collapsedSummary)
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
            }
            Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
              .font(.caption2.weight(.semibold))
              .foregroundStyle(.tertiary)
              .accessibilityHidden(true)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        }

        if embedded || isExpanded {
          VStack(alignment: .leading, spacing: 8) {
            ForEach(rows, id: \.label) { entry in
              VStack(alignment: .leading, spacing: 2) {
                Text(entry.label)
                  .font(.caption2)
                  .foregroundStyle(.secondary)
                Text(entry.value)
                  .poracodeChatText(.metadata, weight: .medium)
                  .foregroundStyle(.primary)
                  .textSelection(.enabled)
                  .fixedSize(horizontal: false, vertical: true)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
      }
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .poracodeContentCardBackground(enabled: !embedded)
    }
  }
}

struct RichChatDelegatedAgentsView: View {
  let agents: [RichDelegatedAgentPresentation]
  var embedded = false
  var defersWorkflowPresentation = false
  var watchController: RichChatDelegatedWatchController? = nil
  /// Compact rosters are sheets: starting a watch dismisses it so the chat is
  /// immediately visible. The expanded inspector stays open.
  var dismissOnWatch = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.workflowViewerContext) private var workflowContext
  @Environment(\.workflowViewerPresentation) private var workflowPresenter
  @Environment(\.toolPresentationCatalog) private var toolCatalog
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(agents) { agent in
        if agent.kind == .workflow, let context = workflowContext, let presenter = workflowPresenter,
          let input = context.input(itemID: agent.id, catalog: toolCatalog) {
          Button {
            if defersWorkflowPresentation {
              presenter.queue(context: context, input: input, catalog: toolCatalog)
              dismiss()
            } else { presenter.present(context: context, input: input, catalog: toolCatalog) }
          } label: {
            agentRow(agent).frame(minHeight: 44).contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("native-e2e.workflow-roster-open.\(agent.id)")
        } else { agentRow(agent) }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeContentCardBackground(enabled: !embedded)
  }

  private func agentRow(_ agent: RichDelegatedAgentPresentation) -> some View {
        HStack(spacing: 9) {
          Image(systemName: icon(agent.kind))
            .foregroundStyle(.tint)
            .symbolEffect(.pulse, options: .repeating, isActive: !reduceMotion)
            .frame(width: 18)
          VStack(alignment: .leading, spacing: 2) {
            Text(agent.title)
              .poracodeChatText(.metadata, weight: .semibold)
              .lineLimit(2)
            if agent.stepCount > 0 {
              Text(RichChatStrings.activityCount(agent.stepCount))
                .poracodeChatText(.metadata)
                .foregroundStyle(.secondary)
            }
          }
          Spacer(minLength: 4)
          if agent.kind != .workflow, let watchController {
            watchButton(agent, controller: watchController)
          }
          ProgressView().controlSize(.small)
        }
  }

  private func watchButton(
    _ agent: RichDelegatedAgentPresentation,
    controller: RichChatDelegatedWatchController
  ) -> some View {
    let watching = controller.isWatching(agent.id)
    return Button {
      controller.toggle(parentItemID: agent.id)
      if !watching, dismissOnWatch { dismiss() }
    } label: {
      Text(watching ? RichChatStrings.stopWatching : RichChatStrings.watchLive)
        .poracodeChatText(.metadata, weight: .semibold)
    }
    .poracodeSurfaceButtonStyle()
    .controlSize(.small)
    // Stop stays available while a subscribe/renew is pending or retrying.
    .disabled(!watching && (controller.isBusy(agent.id) || !controller.canStart))
    .accessibilityLabel(watching ? RichChatStrings.stopWatching : RichChatStrings.watchLive)
    .accessibilityIdentifier("native-e2e.delegated-watch.\(agent.id)")
  }

  private func icon(_ kind: RichDelegatedAgentKind) -> String {
    switch kind {
    case .subagent: "cpu"
    case .crossagent: "person.2"
    case .workflow: "point.3.connected.trianglepath.dotted"
    }
  }
}

struct RichChatAuthenticationRequiredView: View {
  let agentStatus: AgentStatusRecord
  let isRefreshing: Bool
  let refresh: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: "key.fill")
        .foregroundStyle(.orange)
        .font(.title3)
      VStack(alignment: .leading, spacing: 3) {
        Text(SettingsUIStrings.authenticationMissing)
          .poracodeChatText(.body, weight: .semibold)
        Text(agentStatus.label)
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
      }
      Spacer(minLength: 4)
      Button(action: refresh) {
        if isRefreshing {
          ProgressView().controlSize(.small)
        } else {
          Label(SettingsUIStrings.refresh, systemImage: "arrow.clockwise")
            .labelStyle(.iconOnly)
        }
      }
      .poracodeGlassButtonStyle()
      .disabled(isRefreshing)
      .accessibilityLabel(SettingsUIStrings.refresh)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(.orange.opacity(0.22), lineWidth: 1)
    }
  }
}

struct RichChatPlanView: View {
  let plan: RichPlanPresentation
  var embedded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if !embedded {
        Label(RichChatStrings.plan, systemImage: "list.bullet.clipboard")
          .poracodeChatText(.body, weight: .semibold)
      }
      ForEach(plan.steps) { step in
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Image(systemName: icon(step.status))
            .font(.caption.weight(.semibold))
            .foregroundStyle(step.status == .inProgress ? Color.primary : .secondary)
            .symbolEffect(.pulse, isActive: step.status == .inProgress)
            .frame(width: 16)
          Text(step.text)
            .poracodeChatText(.metadata)
            .foregroundStyle(step.status == .completed ? .secondary : .primary)
            .strikethrough(step.status == .completed)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeContentCardBackground(enabled: !embedded)
  }

  private func icon(_ status: RichPlanStepStatus) -> String {
    switch status {
    case .pending: "circle"
    case .inProgress: "circle.dotted"
    case .completed: "checkmark.circle.fill"
    }
  }
}

struct RichChatErrorsView: View {
  let errors: [RichRuntimeErrorPresentation]

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Label(RichChatStrings.errors, systemImage: "exclamationmark.triangle.fill")
        .poracodeChatText(.body, weight: .semibold)
        .foregroundStyle(.red)
      ForEach(errors) { error in
        Text(error.message)
          .poracodeChatText(.metadata)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(.red.opacity(0.22), lineWidth: 1)
    }
  }
}

/// Authoritative context-window occupancy for the selected thread. Renders only
/// when the desktop reported a usable window; it never estimates token counts.
struct RichChatContextIndicator: View {
  let usage: RichContextUsage?
  var showsHeader = true

  var body: some View {
    let summary = RichChatPresentation.contextUsage(usage)
    let breakdown = usage?.breakdown ?? []
    if summary != nil || !breakdown.isEmpty {
      VStack(alignment: .leading, spacing: 5) {
        if showsHeader {
        HStack(spacing: 8) {
          Text(RichChatStrings.contextWindow)
            .poracodeChatText(.metadata, weight: .semibold)
          Spacer(minLength: 0)
          if let summary {
            Text(headline(summary))
              .font(.footnote.monospacedDigit())
              .foregroundStyle(.secondary)
          }
        }
        }
        if let percent = summary?.percent {
          ProgressView(value: Double(percent), total: 100)
            .progressViewStyle(.linear)
        }
        if let summary, let used = summary.usedTokens {
          Text(RichChatStrings.contextTokens(used: used, maxTokens: summary.maxTokens))
            .font(.caption2.monospacedDigit())
            .foregroundStyle(.secondary)
        }
        ForEach(Array(breakdown.enumerated()), id: \.offset) { _, entry in
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(entry.label)
              .poracodeChatText(.metadata)
              .frame(maxWidth: .infinity, alignment: .leading)
            Text(entry.tokens.formatted())
              .font(.caption.monospacedDigit())
              .foregroundStyle(.secondary)
          }
          .accessibilityElement(children: .combine)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .contain)
    }
  }

  private func headline(_ summary: RichContextUsagePresentation) -> String {
    guard let percent = summary.percent else { return RichChatStrings.contextUsageUnknown }
    return RichChatStrings.contextPercent(percent)
  }

}

/// Images from the loaded thread history, using the same authenticated image
/// loader as the transcript. Lazy thumbnails avoid fetching off-screen media.
struct RichChatMediaGallery: View {
  let images: [RichImagePresentation]
  var videos: [RichVideoPresentation] = []
  let controller: RichChatMediaController
  var projectLocation: ProjectLocation? = nil
  var embedded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if !embedded {
      HStack {
        Label(RichChatStrings.media, systemImage: "photo.on.rectangle")
          .poracodeChatText(.metadata, weight: .semibold)
        Spacer(minLength: 4)
        Text((images.count + videos.count).formatted())
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
      }
      }
      ScrollView(.horizontal) {
        LazyHGrid(rows: [GridItem(.fixed(96)), GridItem(.fixed(96))], spacing: 8) {
          ForEach(images) { image in
            RichChatImageView(source: image, controller: controller)
              .frame(width: 144, height: 96)
              .clipped()
          }
          ForEach(videos) { video in
            RichChatVideoView(video: video, controller: controller, projectLocation: projectLocation)
              .frame(width: 144, height: 96)
          }
        }
      }
      .scrollIndicators(.hidden)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeContentCardBackground(enabled: !embedded)
  }
}

struct RichChatStatusView: View {
  let suite: RichChatControllerSuite

  var body: some View {
    VStack(spacing: 0) {
      if let failure = displayedFailure {
        Label(RichChatStrings.failure(failure), systemImage: "exclamationmark.triangle")
          .font(.footnote)
          .foregroundStyle(.red)
          .padding(.horizontal, 16)
          .padding(.vertical, 6)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      if needsRefresh {
        HStack {
          Text(RichChatStrings.refreshRequired).font(.footnote)
          Spacer()
          Button(RichChatStrings.retry) {
            Task { await suite.refreshAuthoritativeHistory() }
          }
          .poracodeGlassButtonStyle()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
      }
    }
  }

  private var displayedFailure: RichChatControllerFailure? {
    suite.conversation.state.failure
      ?? suite.requests.state.failure
      ?? suite.media.state.failure
      ?? suite.checkpoints.state.failure
      ?? suite.transcript.state.pageFailure
  }

  private var needsRefresh: Bool {
    suite.requiresAuthoritativeRefresh
  }
}
