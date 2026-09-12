import SwiftUI

/// Phone-width counterpart to the compact PWA's action docks and info chips.
/// Actionable requests stay visible; secondary state opens in native sheets so
/// the transcript remains the primary scrolling surface.
struct RichChatCompactControlDock: View {
  @Bindable var session: AppSession
  let suite: RichChatControllerSuite
  let thread: RemoteThread?
  let project: RemoteProject?
  let projectLocation: ProjectLocation?
  let gitSummary: GitThreadSummary?
  let agentStatus: AgentStatusRecord?
  let config: [String: RichJSON]
  let canOperate: Bool
  let canResolveRequests: Bool
  let refreshAuthentication: @MainActor () async -> Void
  let providerUsage: RichChatProviderUsagePresentation
  let providerUsageState: SettingsLoadState
  let refreshProviderUsage: @MainActor () async -> Void

  @State private var destination: RichChatCompactControlDestination?

  var body: some View {
    VStack(spacing: 7) {
      if !requests.isEmpty {
        RichChatRequestsView(
          requests: requests,
          controller: suite.requests,
          canResolve: canResolveRequests
        )
        .padding(.horizontal, 12)
      }

      if let pendingSteer { pendingSteerStrip(pendingSteer) }

      if !infoControls.isEmpty {
        RichChatCompactInfoControls(controls: infoControls) { selected in
          destination = selected
        }
      }
    }
    .padding(.top, showsAnyContent ? 7 : 0)
    .sheet(item: $destination) { destination in
      destinationSheet(destination)
    }
  }

  private var transcript: RichTranscriptState? {
    suite.transcript.state.transcript
  }

  private var requests: [RichOpenRequest] {
    Array((transcript?.openRequests ?? []).prefix(1))
  }

  private var pendingSteer: RichPendingSteer? {
    suite.transcript.state.pendingSteer
  }

  private var contextSummary: RichContextUsagePresentation? {
    RichChatPresentation.contextUsage(suite.transcript.state.contextUsage)
  }

  private var delegatedAgents: [RichDelegatedAgentPresentation] {
    transcript.map { RichChatPresentation.activeDelegatedAgents(in: $0.itemsInOrder) } ?? []
  }

  private var goal: RichGoalPresentation? {
    transcript.flatMap { RichChatPresentation.latestGoal(in: $0.itemsInOrder) }
  }

  private var plan: RichPlanPresentation? {
    transcript.flatMap { RichChatPresentation.latestActivePlan(in: $0.itemsInOrder) }
  }

  private var errors: [RichRuntimeErrorPresentation] {
    let recent = transcript.map { RichChatPresentation.recentErrors(in: $0.itemsInOrder) } ?? []
    return RichChatPresentation.visibleRecentErrors(recent, agentStatus: agentStatus)
  }

  private var authenticationRequired: Bool {
    let recent = transcript.map { RichChatPresentation.recentErrors(in: $0.itemsInOrder) } ?? []
    return RichChatPresentation.authenticationRequired(
      agentStatus: agentStatus,
      recentErrors: recent
    )
  }

  private var showsAnyContent: Bool {
    !requests.isEmpty || pendingSteer != nil || !infoControls.isEmpty
  }

  private var infoControls: [RichChatCompactInfoControl] {
    var controls: [RichChatCompactInfoControl] = []
    for kind in RichDelegatedAgentKind.allCases {
      let count = delegatedAgents.count { $0.kind == kind }
      guard count > 0 else { continue }
      controls.append(
        RichChatCompactInfoControl(
          destination: .delegatedAgents(kind),
          systemImage: delegatedAgentIcon(kind),
          accessibilityLabel: delegatedAgentLabel(kind),
          badge: count.formatted(),
          isActive: true
        )
      )
    }
    if authenticationRequired {
      controls.append(
        RichChatCompactInfoControl(
          destination: .authentication,
          systemImage: "key.fill",
          accessibilityLabel: SettingsUIStrings.authenticationMissing,
          tone: .warning
        )
      )
    }
    if let contextSummary {
      controls.append(
        RichChatCompactInfoControl(
          destination: .context,
          systemImage: "circle.dashed.inset.filled",
          accessibilityLabel: contextLabel(contextSummary),
          progressPercent: contextSummary.percent.map(Double.init)
        )
      )
    }
    controls.append(
      RichChatCompactInfoControl(
        destination: .usage,
        systemImage: "gauge.with.dots.needle.67percent",
        accessibilityLabel: "\(providerUsage.label) \(SettingsUIStrings.usageTitle)",
        usageRings: providerUsage.rings
      )
    )
    if let plan {
      controls.append(
        RichChatCompactInfoControl(
          destination: .plan,
          systemImage: "list.bullet.clipboard",
          accessibilityLabel: RichChatStrings.plan,
          badge: "\(plan.completedCount)/\(plan.steps.count)",
          isActive: plan.isActive
        )
      )
    }
    if goal != nil {
      controls.append(
        RichChatCompactInfoControl(
          destination: .goal,
          systemImage: "scope",
          accessibilityLabel: RichChatStrings.goal
        )
      )
    }
    if let projectLocation, let gitSummary, showsGitControl(gitSummary) {
      controls.append(
        RichChatCompactInfoControl(
          destination: .git(projectLocation),
          systemImage:
            thread?.worktreePath?.isEmpty == false
            ? "point.3.connected.trianglepath.dotted" : "arrow.triangle.branch",
          accessibilityLabel: ProjectWorkspaceStrings.git,
          gitChanges: RichChatGitChanges(
            insertions: gitSummary.totalInsertions,
            deletions: gitSummary.totalDeletions
          )
        )
      )
    }
    if !errors.isEmpty {
      controls.append(
        RichChatCompactInfoControl(
          destination: .errors,
          systemImage: "exclamationmark.triangle.fill",
          accessibilityLabel: RichChatStrings.errors,
          badge: errors.count > 1 ? errors.count.formatted() : nil,
          tone: .danger
        )
      )
    }
    return controls
  }

  private func pendingSteerStrip(_ pending: RichPendingSteer) -> some View {
    HStack(alignment: .center, spacing: 9) {
      Image(systemName: "arrow.triangle.branch")
        .foregroundStyle(.secondary)
      VStack(alignment: .leading, spacing: 2) {
        Text(RichChatStrings.pendingSteer)
          .font(.caption.weight(.semibold))
        Text(pending.prompt)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      Spacer(minLength: 4)
      Button {
        destination = .goal
      } label: {
        Image(systemName: "pencil")
      }
      .buttonStyle(.bordered)
      .controlSize(.small)
      .accessibilityLabel(RichChatStrings.editSteer)
      Button(role: .destructive) {
        Task { await suite.conversation.clearPendingSteer() }
      } label: {
        Image(systemName: "xmark")
      }
      .buttonStyle(.bordered)
      .controlSize(.small)
      .disabled(!canOperate)
      .accessibilityLabel(RichChatStrings.clearSteer)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .padding(.horizontal, 12)
  }

  @ViewBuilder
  private func destinationSheet(_ destination: RichChatCompactControlDestination) -> some View {
    switch destination {
    case .authentication:
      if let agentStatus {
        RichChatAuthenticationSheet(
          agentStatus: agentStatus,
          refresh: refreshAuthentication
        )
      }
    case .delegatedAgents(let kind):
      RichChatInfoSheet(title: delegatedAgentLabel(kind)) {
        RichChatDelegatedAgentsView(agents: delegatedAgents.filter { $0.kind == kind })
      }
    case .context:
      RichChatContextControlSheet(usage: suite.transcript.state.contextUsage)
    case .usage:
      RichChatProviderUsageSheet(
        session: session,
        presentation: providerUsage,
        state: providerUsageState,
        refresh: refreshProviderUsage
      )
    case .plan:
      RichChatInfoSheet(title: RichChatStrings.plan) {
        if let plan { RichChatPlanView(plan: plan) }
      }
    case .errors:
      RichChatInfoSheet(title: RichChatStrings.errors) {
        RichChatErrorsView(errors: errors)
      }
    case .goal:
      RichChatGoalControlSheet(
        transcript: transcript,
        pendingSteer: pendingSteer,
        config: config,
        conversation: suite.conversation,
        canOperate: canOperate
      )
    case .git(let location):
      if let thread, let project {
        ThreadDetailDestinationView(
          session: session,
          thread: thread,
          project: project,
          workspaceLocation: location,
          destination: .git
        )
      }
    case .checkpoints(let location):
      RichChatCheckpointSheet(
        projectLocation: location,
        config: config,
        controller: suite.checkpoints,
        conversation: suite.conversation,
        canOperate: canOperate
      )
    }
  }

  private func showsGitControl(_ summary: GitThreadSummary) -> Bool {
    guard summary.isRepo else { return false }
    let hasVisiblePullRequest = summary.pullRequest.map { $0.state != .closed } ?? false
    return summary.hasLocalChanges || thread?.worktreePath != nil || hasVisiblePullRequest
  }

  private func contextLabel(_ summary: RichContextUsagePresentation) -> String {
    guard let percent = summary.percent else { return RichChatStrings.contextWindow }
    return RichChatStrings.contextPercent(percent)
  }

  private func delegatedAgentLabel(_ kind: RichDelegatedAgentKind) -> String {
    switch kind {
    case .subagent: SettingsUIStrings.subagents
    case .crossagent: HomeStrings.crossagents
    case .workflow: SettingsUIStrings.workflows
    }
  }

  private func delegatedAgentIcon(_ kind: RichDelegatedAgentKind) -> String {
    switch kind {
    case .subagent: "cpu"
    case .crossagent: "person.2"
    case .workflow: "point.3.connected.trianglepath.dotted"
    }
  }
}
