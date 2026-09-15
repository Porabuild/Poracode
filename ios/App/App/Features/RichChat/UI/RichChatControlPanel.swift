import SwiftUI

struct RichChatControlPanel: View {
  let suite: RichChatControllerSuite
  let projectLocation: ProjectLocation?
  let agentStatus: AgentStatusRecord?
  let config: [String: RichJSON]
  let canOperate: Bool
  let canResolveRequests: Bool
  let refreshAuthentication: @MainActor () async -> Void

  @State private var isRefreshingAuthentication = false

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      RichChatContextIndicator(usage: suite.transcript.state.contextUsage)
      if let transcript = suite.transcript.state.transcript {
        let delegatedAgents = RichChatPresentation.activeDelegatedAgents(
          in: transcript.itemsInOrder
        )
        if !delegatedAgents.isEmpty {
          RichChatDelegatedAgentsView(agents: delegatedAgents)
        }
        let recentErrors = RichChatPresentation.recentErrors(in: transcript.itemsInOrder)
        if RichChatPresentation.authenticationRequired(
          agentStatus: agentStatus,
          recentErrors: recentErrors
        ), let agentStatus {
          RichChatAuthenticationRequiredView(
            agentStatus: agentStatus,
            isRefreshing: isRefreshingAuthentication,
            refresh: refreshAuthenticationStatus
          )
        }
        RichChatRequestsView(
          requests: transcript.openRequests,
          controller: suite.requests,
          canResolve: canResolveRequests
        )
        if let plan = RichChatPresentation.latestActivePlan(in: transcript.itemsInOrder) {
          RichChatPlanView(plan: plan)
        }
        let errors = RichChatPresentation.visibleRecentErrors(
          recentErrors,
          agentStatus: agentStatus
        )
        if !errors.isEmpty { RichChatErrorsView(errors: errors) }
        RichChatGoalSteerView(
          items: transcript.itemsInOrder,
          pendingSteer: suite.transcript.state.pendingSteer,
          config: config,
          controller: suite.conversation,
          canOperate: canOperate
        )
      }
      if let projectLocation {
        RichChatCheckpointView(
          projectLocation: projectLocation,
          config: config,
          controller: suite.checkpoints,
          conversation: suite.conversation,
          canOperate: canOperate
        )
      }
    }
  }

  private func refreshAuthenticationStatus() {
    guard !isRefreshingAuthentication else { return }
    isRefreshingAuthentication = true
    Task {
      await refreshAuthentication()
      isRefreshingAuthentication = false
    }
  }
}

struct RichChatDelegatedAgentsView: View {
  let agents: [RichDelegatedAgentPresentation]

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(agents) { agent in
        HStack(spacing: 9) {
          Image(systemName: icon(agent.kind))
            .foregroundStyle(.tint)
            .symbolEffect(.pulse)
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
          ProgressView().controlSize(.small)
        }
      }
    }
    .padding(12)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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
      .buttonStyle(.bordered)
      .disabled(isRefreshing)
      .accessibilityLabel(SettingsUIStrings.refresh)
    }
    .padding(12)
    .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(.orange.opacity(0.22), lineWidth: 1)
    }
  }
}

struct RichChatPlanView: View {
  let plan: RichPlanPresentation

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Label(RichChatStrings.plan, systemImage: "list.bullet.clipboard")
        .poracodeChatText(.body, weight: .semibold)
      ForEach(plan.steps) { step in
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Image(systemName: icon(step.status))
            .font(.caption.weight(.semibold))
            .foregroundStyle(step.status == .inProgress ? Color.accentColor : .secondary)
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
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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

  var body: some View {
    if let summary = RichChatPresentation.contextUsage(usage) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 8) {
          Text(RichChatStrings.contextWindow).font(.footnote)
          Spacer(minLength: 0)
          Text(headline(summary))
            .font(.footnote.monospacedDigit())
            .foregroundStyle(.secondary)
        }
        if let percent = summary.percent {
          ProgressView(value: Double(percent), total: 100)
            .progressViewStyle(.linear)
        }
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(RichChatStrings.contextWindow)
      .accessibilityValue(accessibilityValue(summary))
    }
  }

  private func headline(_ summary: RichContextUsagePresentation) -> String {
    guard let percent = summary.percent else { return RichChatStrings.contextUsageUnknown }
    return RichChatStrings.contextPercent(percent)
  }

  private func accessibilityValue(_ summary: RichContextUsagePresentation) -> String {
    guard let percent = summary.percent, let used = summary.usedTokens else {
      return RichChatStrings.contextUsageUnknown
    }
    let tokens = RichChatStrings.contextTokens(used: used, maxTokens: summary.maxTokens)
    return "\(RichChatStrings.contextPercent(percent)), \(tokens)"
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
          .buttonStyle(.bordered)
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
