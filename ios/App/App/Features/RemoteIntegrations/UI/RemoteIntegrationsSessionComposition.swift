import SwiftUI

extension AppSession {
  /// Exact selected-host state for Remote Integrations. The registry/profile match
  /// prevents an in-progress host switch from exposing the previous host's access.
  var currentRemoteIntegrationsHostSelection: RemoteIntegrationsHostSelection? {
    guard
      let connectionID = state.selectedConnectionId,
      let record = state.hosts.first(where: { $0.connectionId == connectionID }),
      let profile = state.profile,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion
    else { return nil }

    let profileCapabilities = Set(
      profile.scopes.compactMap(RemoteIntegrationsCapability.init(rawValue:))
    )
    let registryCapabilities = Set(
      record.scopes.compactMap(RemoteIntegrationsCapability.init(rawValue:))
    )
    let isOnline =
      state.api != nil
      && !state.liveLifecycle.isInBackground
      && state.phase != .needsPairing
      && state.phase != .sessionExpired
      && state.phase != .protocolIncompatible
      && state.phase != .localStoreInconsistent

    return RemoteIntegrationsHostSelection(
      name: record.label,
      access: RemoteIntegrationsHostAccess(
        lease: RemoteIntegrationsHostLease(
          connectionID: connectionID,
          generation: UInt64(max(0, state.workGeneration))
        ),
        protocolVersion: profile.protocolVersion,
        isOnline: isOnline,
        isReady: isOnline && state.phase == .ready,
        capabilities: profileCapabilities.intersection(registryCapabilities)
      )
    )
  }

  var currentRemoteIntegrationsProjects: [RemoteIntegrationsProjectOption] {
    guard currentRemoteIntegrationsHostSelection != nil else { return [] }
    let projects = activeWorkspaceProjects
    return
      projects
      .map { RemoteIntegrationsProjectOption(id: $0.id, name: $0.name) }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  var currentRemoteIntegrationsScheduleAgents: [AgentStatusRecord] {
    guard currentRemoteIntegrationsHostSelection != nil else { return [] }
    return HomeComposerCatalog.availableAgents(
      from: state.replay.agentStatuses.ordered,
      presentationMode: .gui
    ).filter { agent in
      agent.authState != .missing
        && HomeComposerCatalog.capabilities(for: agent, presentationMode: .gui)[
          "supportsOneShot"
        ]?.boolValue == true
    }
  }

  func makeRemoteIntegrationsGateway() -> any RemoteIntegrationsGateway {
    let source = RemoteIntegrationsExactHostTransportSource(
      credentials: deps.hostCatalog,
      accessProvider: { @MainActor [weak self] in
        self?.currentRemoteIntegrationsHostSelection?.access
      }
    )
    return SelectedRemoteIntegrationsGateway(source: source)
  }
}

struct RemoteIntegrationsSessionView: View {
  @Environment(\.homeWorkspace) private var workspace
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme

  @Bindable var session: AppSession
  @State private var showsScheduleComposer = false
  @State private var scheduleComposerExpanded = true
  @State private var startedScheduleThreadID: String?
  private let gateway: any RemoteIntegrationsGateway
  private let initialRoute: RemoteIntegrationsRoute?
  private let embeddedInNavigationStack: Bool

  init(
    session: AppSession,
    initialRoute: RemoteIntegrationsRoute? = nil,
    embeddedInNavigationStack: Bool = false
  ) {
    self.session = session
    self.initialRoute = initialRoute
    self.embeddedInNavigationStack = embeddedInNavigationStack
    gateway = session.makeRemoteIntegrationsGateway()
  }

  var body: some View {
    RemoteIntegrationsScreen(
      session: session,
      selection: session.currentRemoteIntegrationsHostSelection,
      projects: workspaceProjects,
      scheduleAgents: session.currentRemoteIntegrationsScheduleAgents,
      gateway: gateway,
      singleRoute: initialRoute,
      onDismiss: embeddedInNavigationStack ? nil : { dismiss() },
      onCreateScheduleWithAgent: scheduleComposerProject == nil
        ? nil
        : {
          scheduleComposerExpanded = true
          showsScheduleComposer = true
        }
    )
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        HostSelectionMenu(session: session)
      }
    }
    .sheet(isPresented: $showsScheduleComposer) {
      if let project = scheduleComposerProject {
        NavigationStack {
          VStack {
            Spacer(minLength: 20)
            HomeQuickComposeSessionView(
              session: session,
              isExpanded: $scheduleComposerExpanded,
              launchSeed: HomeThreadLaunchSeed(
                fixedProjectID: project.id,
                initialPrompt: RemoteIntegrationsStrings.createWithAgentPrompt
              )
            ) { threadID in
              showsScheduleComposer = false
              startedScheduleThreadID = threadID
            }
            .padding()
          }
          .poracodeReadableWidth(680)
          .background(theme.variant(for: colorScheme).background.ignoresSafeArea())
          .navigationTitle(RemoteIntegrationsStrings.createWithAgent)
          .navigationBarTitleDisplayMode(.inline)
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(RemoteIntegrationsStrings.cancel) { showsScheduleComposer = false }
            }
          }
        }
        .poracodeFormSheetSizing()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
      }
    }
    .navigationDestination(
      isPresented: Binding(
        get: { startedScheduleThreadID != nil },
        set: { if !$0 { startedScheduleThreadID = nil } }
      )
    ) {
      if let startedScheduleThreadID {
        RichChatThreadView(
          session: session,
          threadID: startedScheduleThreadID,
          title: HomeStrings.newThread
        )
      }
    }
  }

  private var workspaceProjects: [RemoteIntegrationsProjectOption] {
    session.currentRemoteIntegrationsProjects.filter {
      workspace.includes(projectID: $0.id, connectionID: session.selectedConnectionId)
    }
  }

  private var scheduleComposerProject: RemoteProject? {
    let projectIDs = Set(workspaceProjects.map(\.id))
    return session.activeWorkspaceProjects.first { projectIDs.contains($0.id) }
  }
}
