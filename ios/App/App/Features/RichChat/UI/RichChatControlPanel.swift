import SwiftUI

struct RichChatControlPanel: View {
  let suite: RichChatControllerSuite
  var thread: RemoteThread? = nil
  var project: RemoteProject? = nil
  let projectLocation: ProjectLocation?
  var gitSummary: GitThreadSummary? = nil
  let agentStatus: AgentStatusRecord?
  let config: [String: RichJSON]
  let canOperate: Bool
  let canResolveRequests: Bool
  let refreshAuthentication: @MainActor () async -> Void
  var providerUsage: RichChatProviderUsagePresentation? = nil
  var providerUsageState: SettingsLoadState = .idle
  var refreshProviderUsage: (@MainActor () async -> Void)? = nil
  var galleryImages: [RichImagePresentation] = []
  var galleryVideos: [RichVideoPresentation] = []
  var galleryIdentity: String = ""
  var crewStatuses: [AgentStatusRecord] = []
  var savedCrews: [SavedCrew] = []
  var openCrew: (() -> Void)?

  @AppStorage("ios.layout.inspectorCards.v1") private var storedPreferences = ""
  @State private var isRefreshingAuthentication = false

  private var items: [RichRuntimeItem] { suite.transcript.state.transcript?.itemsInOrder ?? [] }
  private var goal: RichGoalPresentation? { RichChatPresentation.latestGoal(in: items) }
  private var plan: RichPlanPresentation? { RichChatPresentation.latestActivePlan(in: items) }
  private var agents: [RichDelegatedAgentPresentation] { RichChatPresentation.activeDelegatedAgents(in: items) }
  private var crew: ThreadCrewBinding? { ThreadCrewBinding(wire: config["crew"]?.jsonValue) }
  private var tasks: [RichBackgroundTaskPresentation] {
    (suite.transcript.state.backgroundTasks ?? []).map(RichBackgroundTaskPresentation.init)
  }
  private var preferences: Binding<RichChatInspectorPreferences> {
    Binding(get: { RichChatInspectorPreferences(stored: storedPreferences) }, set: { storedPreferences = $0.encoded })
  }

  private var visibleOrder: [RichChatInspectorSectionID] {
    preferences.wrappedValue.order.filter { id in
      switch id {
      case .goal: goal != nil
      case .steer: suite.transcript.state.pendingSteer != nil
      case .plan: plan != nil
      case .crew: crew != nil
      case .agents: !agents.isEmpty
      case .backgroundTasks: !tasks.isEmpty
      case .info: thread != nil || project != nil
      case .context: suite.transcript.state.contextUsage != nil
      case .usage: providerUsage != nil
      case .media: !galleryImages.isEmpty || !galleryVideos.isEmpty
      case .checkpoints: projectLocation != nil
      }
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if let transcript = suite.transcript.state.transcript {
        let recentErrors = RichChatPresentation.recentErrors(in: transcript.itemsInOrder)
        if RichChatPresentation.authenticationRequired(agentStatus: agentStatus, recentErrors: recentErrors),
          let agentStatus {
          RichChatAuthenticationRequiredView(
            agentStatus: agentStatus, isRefreshing: isRefreshingAuthentication,
            refresh: refreshAuthenticationStatus
          )
        }
        RichChatRequestsView(requests: transcript.openRequests, controller: suite.requests, canResolve: canResolveRequests)
        let errors = RichChatPresentation.visibleRecentErrors(recentErrors, agentStatus: agentStatus)
        if !errors.isEmpty { RichChatErrorsView(errors: errors) }
      }
      ForEach(visibleOrder) { id in
        RichChatInspectorSection(
          id: id, title: title(for: id), summary: summary(for: id),
          preferences: preferences, visibleOrder: visibleOrder
        ) {
          if id == .goal, let goal { RichChatGoalStatusIcon(status: goal.status) }
          else { Image(systemName: icon(for: id)).font(.caption).foregroundStyle(.secondary) }
        } content: {
          sectionContent(id)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func sectionContent(_ id: RichChatInspectorSectionID) -> some View {
    switch id {
    case .goal, .steer:
      RichChatGoalSteerView(
        items: id == .goal ? items : [],
        pendingSteer: id == .steer ? suite.transcript.state.pendingSteer : nil,
        config: config, controller: suite.conversation, canOperate: canOperate, embedded: true
      )
    case .plan:
      if let plan { RichChatPlanView(plan: plan, embedded: true) }
    case .crew:
      if let crew {
        CrewInspectorCard(binding: crew,
          lead: .init(agentKind: thread?.agentKind ?? agentStatus?.kind ?? "", model: config["model"]?.stringValue ?? "",
            effort: config["effort"]?.stringValue, fast: config["fast"]?.boolValue, contextSize: config["contextSize"]?.stringValue),
          statuses: crewStatuses.isEmpty ? [agentStatus].compactMap { $0 } : crewStatuses,
          saved: savedCrews.first { $0.id == crew.crewID }, items: items, openCrew: openCrew)
      }
    case .agents:
      RichChatDelegatedAgentsView(agents: agents, embedded: true)
    case .backgroundTasks:
      RichChatBackgroundTasksPanel(suite: suite, tasks: tasks, canOperate: canOperate, embedded: true)
    case .info:
      RichChatThreadInfoCard(
        thread: thread, project: project, projectLocation: projectLocation, gitSummary: gitSummary, embedded: true
      )
    case .context:
      RichChatContextIndicator(usage: suite.transcript.state.contextUsage, showsHeader: false).padding(12)
    case .usage:
      if let providerUsage {
        RichChatProviderUsageCard(presentation: providerUsage, state: providerUsageState, refresh: refreshProviderUsage)
      }
    case .media:
      RichChatMediaGallery(
        images: galleryImages, videos: galleryVideos, controller: suite.media,
        projectLocation: projectLocation, embedded: true
      ).id(galleryIdentity)
    case .checkpoints:
      if let projectLocation {
        RichChatCheckpointView(
          projectLocation: projectLocation, config: config, controller: suite.checkpoints,
          conversation: suite.conversation, canOperate: canOperate, embedded: true
        ).padding(8)
      }
    }
  }

  private func title(for id: RichChatInspectorSectionID) -> String {
    switch id {
    case .goal: RichChatStrings.goal
    case .steer: RichChatStrings.pendingSteer
    case .plan: RichChatStrings.plan
    case .crew: crew?.name ?? RichChatStrings.crew
    case .agents: RichChatStrings.delegatedAgents
    case .backgroundTasks: RichChatStrings.backgroundTasks
    case .info: HomeStrings.threadInfo
    case .context: RichChatStrings.contextWindow
    case .usage: SettingsUIStrings.usageTitle
    case .media: RichChatStrings.media
    case .checkpoints: RichChatStrings.checkpoints
    }
  }

  private func icon(for id: RichChatInspectorSectionID) -> String {
    switch id {
    case .goal: "scope"
    case .steer: "arrow.triangle.branch"
    case .plan: "list.bullet.clipboard"
    case .crew: "person.2"
    case .agents: "person.2"
    case .backgroundTasks: "gearshape.2"
    case .info: "folder"
    case .context: "gauge.with.dots.needle.50percent"
    case .usage: "chart.bar"
    case .media: "photo.on.rectangle"
    case .checkpoints: "clock.arrow.circlepath"
    }
  }

  private func summary(for id: RichChatInspectorSectionID) -> String? {
    switch id {
    case .goal: goal.map { RichChatStrings.goalStatus($0.status) }
    case .plan: plan.map { "\($0.completedCount)/\($0.steps.count)" }
    case .crew: crewRunsSummary
    case .agents: agents.count.formatted()
    case .backgroundTasks: tasks.count.formatted()
    case .info: gitSummary?.branch ?? project?.name
    case .context: RichChatPresentation.contextUsage(suite.transcript.state.contextUsage)?.percent.map { (Double($0) / 100).formatted(.percent.precision(.fractionLength(0))) }
    case .usage: providerUsage?.label
    case .media: (galleryImages.count + galleryVideos.count).formatted()
    case .steer, .checkpoints: nil
    }
  }

  private var crewRunsSummary: String? {
    let runs = CrewRunPresentation.project(items)
    return runs.isEmpty ? nil : "\(runs.count { !$0.isRunning })/\(runs.count)"
  }

  private func refreshAuthenticationStatus() {
    guard !isRefreshingAuthentication else { return }
    isRefreshingAuthentication = true
    Task { await refreshAuthentication(); isRefreshingAuthentication = false }
  }

}
