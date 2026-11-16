import SwiftUI

/// Phone-width counterpart to the compact PWA's action docks and info chips.
/// Actionable requests stay visible; secondary state opens in native sheets so
/// the transcript remains the primary scrolling surface.
struct RichChatCompactControlDock: View {
  @Bindable var session: AppSession
  let suite: RichChatControllerSuite
  let turnClock: RichChatLiveTurnClock
  @Binding var destination: RichChatCompactControlDestination?
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
  var galleryImages: [RichImagePresentation] = []
  var galleryVideos: [RichVideoPresentation] = []
  var galleryIdentity = ""
  var openWideGit: (() -> Void)? = nil

  @Environment(\.richChatInspectorVisible) private var showsWideInspector
  @Environment(\.workflowViewerPresentation) private var workflowPresenter
  @Namespace private var glassNamespace

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

      if let followUpQueue, !followUpQueue.items.isEmpty || followUpQueue.paused {
        RichFollowUpQueueStrip(
          queue: followUpQueue,
          canOperate: canOperate,
          open: { destination = .followUpQueue }
        )
      }

      if !infoControls.isEmpty || liveStartedAt != nil {
        ViewThatFits(in: .horizontal) {
          RichChatWideInfoControls(
            controls: infoControls,
            thread: thread,
            liveStartedAt: liveStartedAt, isPaused: !requests.isEmpty, turnClock: turnClock,
            glassNamespace: glassNamespace,
            select: selectControl
          )
          RichChatCompactInfoControls(
            controls: infoControls,
            liveStartedAt: liveStartedAt, isPaused: !requests.isEmpty, turnClock: turnClock,
            glassNamespace: glassNamespace,
            select: selectControl
          )
        }
      }
    }
    .padding(.top, showsAnyContent ? 2 : 0)
    .sheet(item: $destination, onDismiss: { workflowPresenter?.presentPending() }) { destination in
      destinationSheet(destination)
        .poracodeZoomTransition(sourceID: destination.id, in: glassNamespace)
    }
  }

  private var transcript: RichTranscriptState? {
    suite.transcript.state.transcript
  }

  private var liveStartedAt: Int64? {
    RichChatTurnTiming.liveStart(thread: thread, foregroundIsOpen: transcript?.openTurn,
      // A provider's lingering task roster alone does not mean it is live.
      // Workflow launch rows also need manifest liveness before extending an
      // idle thread; only the still-running delegated calls prove it here.
      hasBackgroundWork: delegatedAgents.contains { $0.kind != .workflow } || session.workflowActivity.isLive(for: suite.transcript.state.target))
  }

  private var requests: [RichOpenRequest] {
    Array((transcript?.openRequests ?? []).prefix(1))
  }

  private var pendingSteer: RichPendingSteer? {
    suite.transcript.state.pendingSteer
  }

  private var followUpQueue: RichFollowUpQueue? {
    suite.transcript.state.followUpQueue
  }

  private var delegatedAgents: [RichDelegatedAgentPresentation] {
    let delegated = transcript.map { RichChatPresentation.activeDelegatedAgents(in: $0.itemsInOrder) } ?? []
    // A detached workflow's launch tool may remain marked running after its
    // manifest ends. Only the session tracker proves background liveness.
    return delegated.filter { $0.kind != .workflow }
      + session.workflowActivity.delegatedPresentations(for: suite.transcript.state.target)
  }

  private var backgroundTasks: [RichBackgroundTaskPresentation] {
    (suite.transcript.state.backgroundTasks ?? []).map(RichBackgroundTaskPresentation.init)
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
    !requests.isEmpty || pendingSteer != nil
      || (followUpQueue.map { !$0.items.isEmpty || $0.paused } == true)
      || !infoControls.isEmpty || liveStartedAt != nil
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
    if !backgroundTasks.isEmpty {
      controls.append(
        RichChatCompactInfoControl(
          destination: .backgroundTasks,
          systemImage: "gearshape.2",
          accessibilityLabel: RichChatStrings.backgroundTasks,
          badge: backgroundTasks.count.formatted(),
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
          accessibilityLabel: RichChatStrings.goal,
          goal: goal
        )
      )
    }
    if !galleryImages.isEmpty || !galleryVideos.isEmpty {
      controls.append(
        RichChatCompactInfoControl(
          destination: .media,
          systemImage: "photo.on.rectangle",
          accessibilityLabel: RichChatStrings.media,
          badge: (galleryImages.count + galleryVideos.count).formatted()
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
            deletions: gitSummary.totalDeletions,
            pullRequestNumber: gitSummary.pullRequest.flatMap { $0.state == .closed ? nil : $0.number },
            branch: gitSummary.branch
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

  private func selectControl(_ selected: RichChatCompactControlDestination) {
    if showsWideInspector, case .git = selected, let openWideGit {
      openWideGit()
    } else {
      destination = selected
    }
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
      .poracodeSurfaceButtonStyle()
      .controlSize(.small)
      .accessibilityLabel(RichChatStrings.editSteer)
      Button(role: .destructive) {
        Task { await suite.conversation.clearPendingSteer() }
      } label: {
        Image(systemName: "xmark")
      }
      .poracodeSurfaceButtonStyle(tint: .red)
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
        RichChatDelegatedAgentsView(agents: delegatedAgents.filter { $0.kind == kind }, defersWorkflowPresentation: true)
      }
    case .backgroundTasks:
      RichChatBackgroundTasksSheet(suite: suite, canOperate: canOperate)
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
    case .media:
      RichChatInfoSheet(title: RichChatStrings.media) {
        RichChatMediaGallery(images: galleryImages, videos: galleryVideos, controller: suite.media, projectLocation: projectLocation)
          .id(galleryIdentity)
      }
    case .followUpQueue:
      if let followUpQueue {
        RichFollowUpQueueSheet(
          queue: followUpQueue,
          conversation: suite.conversation,
          canOperate: canOperate
        )
      }
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
