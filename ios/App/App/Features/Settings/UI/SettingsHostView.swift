import SwiftUI

struct SettingsHostView: View {
  @Bindable var session: AppSession
  let selection: SettingsHostSelection?

  @State private var composition: SettingsComposition
  @State private var route: SettingsScreenRoute? = .agents
  @State private var query = SettingsProfileQuerySelection()
  @State private var settingsQuery = ""
  private let gateway: any SettingsSessionGateway
  private let usesStackNavigation: Bool

  init(
    session: AppSession,
    selection: SettingsHostSelection?,
    gateway: any SettingsSessionGateway,
    initialRoute: SettingsScreenRoute? = nil,
    usesStackNavigation: Bool = false
  ) {
    self.session = session
    self.selection = selection
    self.gateway = gateway
    self.usesStackNavigation = usesStackNavigation
    _composition = State(initialValue: SettingsComposition(gateway: gateway))
    _route = State(initialValue: initialRoute ?? .agents)
  }

  @ViewBuilder
  var body: some View {
    Group {
      if usesStackNavigation {
        stackList
      } else {
        NavigationSplitView {
          splitList
        } detail: {
          if let route {
            routeView(route)
          } else {
            ContentUnavailableView(SettingsUIStrings.title, systemImage: "gearshape")
          }
        }
        .navigationSplitViewStyle(.balanced)
      }
    }
    .task(id: activationIdentity) {
      composition.activate(activeSelection)
    }
    .overlay(alignment: .bottom) {
      SettingsMutationBanner(
        notice: composition.mutationNotice,
        failure: composition.mutationFailure,
        dismiss: composition.clearMutationFeedback
      )
      .padding()
    }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        HostSelectionMenu(session: session)
      }
    }
  }

  private var splitList: some View {
    List(selection: $route) {
      indexRows(stackNavigation: false)
    }
    .navigationTitle(SettingsUIStrings.desktopSettingsTitle)
    .listStyle(.sidebar)
    .searchable(text: $settingsQuery, placement: .navigationBarDrawer(displayMode: .always), prompt: SettingsUIStrings.search)
  }

  private var stackList: some View {
    List {
      indexRows(stackNavigation: true)
    }
    .navigationTitle(SettingsUIStrings.desktopSettingsTitle)
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .searchable(text: $settingsQuery, placement: .navigationBarDrawer(displayMode: .always), prompt: SettingsUIStrings.search)
  }

  @ViewBuilder private func indexRows(stackNavigation: Bool) -> some View {
    if NativeSettingsSearch.isActive(settingsQuery) {
      SettingsSearchResults(session: session, selection: activeSelection, gateway: gateway, query: settingsQuery,
        desktopOnly: true) { EmptyView() }
    } else {
      routeSections(stackNavigation: stackNavigation)
    }
  }

  @ViewBuilder
  private func routeSections(stackNavigation: Bool) -> some View {
    hostHeader
    Section(SettingsUIStrings.selectSection) {
      routeLink(.profile, stackNavigation: stackNavigation)
      routeLink(.usage, stackNavigation: stackNavigation)
      NavigationLink {
        RemoteIntegrationsSessionView(
          session: session,
          initialRoute: .schedules,
          embeddedInNavigationStack: true
        )
      } label: {
        VStack(alignment: .leading, spacing: 2) {
          Label(RemoteIntegrationsStrings.schedules, systemImage: "calendar.badge.clock")
          Text(RemoteIntegrationsStrings.schedulesDescription)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
      }
      NavigationLink {
        RemoteIntegrationsSessionView(
          session: session,
          initialRoute: .prWatches,
          embeddedInNavigationStack: true
        )
      } label: {
        Label(RemoteIntegrationsStrings.prWatches, systemImage: "arrow.triangle.branch")
      }
      .accessibilityIdentifier("native-e2e.settings.pr-watches")
      NavigationLink {
        RemoteIntegrationsSessionView(
          session: session,
          initialRoute: .update,
          embeddedInNavigationStack: true
        )
      } label: {
        Label(RemoteIntegrationsStrings.update, systemImage: "arrow.down.circle")
      }
      .accessibilityIdentifier("native-e2e.settings.host-update")
      routeLink(.generation, stackNavigation: stackNavigation)
      routeLink(.agents, stackNavigation: stackNavigation)
      NavigationLink { CrewsSettingsView(session: session) } label: {
        Label(CrewStrings.title, systemImage: "person.2")
      }
      DeviceSettingsDestinationLink(session: session, destination: .sessionImport)
    }
    Section(SettingsUIStrings.configurationSection) {
      DeviceSettingsDestinationLink(session: session, destination: .git)
      NavigationLink {
        ArchivedThreadsView(session: session)
      } label: {
        VStack(alignment: .leading, spacing: 2) {
          Label(ArchivedThreadsStrings.title, systemImage: "archivebox")
          Text(ArchivedThreadsStrings.description)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
        .padding(.vertical, 2)
      }
      .accessibilityIdentifier("native-e2e.settings.archived")
      routeLink(.devices, stackNavigation: stackNavigation)
      if let connectionId = session.selectedConnectionId,
        session.hosts.first(where: { $0.connectionId == connectionId })?
          .hostCapabilities?.offersHostOwnedEnvironments == true
      {
        NavigationLink {
          EnvironmentsView(session: session, boundConnectionId: connectionId)
            .id(connectionId)
        } label: {
          VStack(alignment: .leading, spacing: 2) {
            Label(EnvironmentStrings.title, systemImage: "server.rack")
            Text(EnvironmentStrings.subtitle)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(2)
          }
          .padding(.vertical, 2)
        }
        .accessibilityLabel(EnvironmentStrings.title)
      }
      routeLink(.activity, stackNavigation: stackNavigation)
      routeLink(.tokens, stackNavigation: stackNavigation)
      routeLink(.workspace, stackNavigation: stackNavigation)
      NavigationLink {
        GlobalMCPSettingsView(session: session)
      } label: {
        Label(ProjectSettingsStrings.mcpServers, systemImage: "server.rack")
      }
      .accessibilityIdentifier("native-e2e.settings.global-mcp")
      NavigationLink {
        SettingsIntegrationsSessionView(
          session: session,
          embeddedInNavigationStack: true,
          allowsRouteSelection: true
        )
      } label: {
        Label(SettingsIntegrationsStrings.title, systemImage: "puzzlepiece.extension")
      }
      .accessibilityIdentifier("native-e2e.settings.integrations")
      .accessibilityLabel(SettingsIntegrationsStrings.title)
    }
  }

  @ViewBuilder
  private var hostHeader: some View {
    Section(SettingsUIStrings.selectedHost) {
      if let selection = activeSelection {
        Label(selection.name, systemImage: "desktopcomputer")
          .font(.body.weight(.medium))
        if selection.gate(.sessionOperate) != nil {
          Label(SettingsUIStrings.readOnly, systemImage: "lock")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      } else {
        Label(
          SettingsUIStrings.unavailable,
          systemImage: "desktopcomputer.trianglebadge.exclamationmark"
        )
        .foregroundStyle(.secondary)
      }
    }
  }

  @ViewBuilder
  private func routeLink(
    _ value: SettingsScreenRoute,
    stackNavigation: Bool
  ) -> some View {
    if stackNavigation {
      NavigationLink {
        routeView(value)
      } label: {
        routeLabel(value, systemImage: value.searchSymbol)
      }
      .accessibilityHint(SettingsUIStrings.routeDescription(value))
    } else {
      NavigationLink(value: value) {
        routeLabel(value, systemImage: value.searchSymbol)
      }
      .accessibilityHint(SettingsUIStrings.routeDescription(value))
    }
  }

  private func routeLabel(_ value: SettingsScreenRoute, systemImage: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Label(SettingsUIStrings.routeTitle(value), systemImage: systemImage)
      Text(SettingsUIStrings.routeDescription(value))
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(2)
    }
    .padding(.vertical, 2)
  }

  private func routeView(_ value: SettingsScreenRoute) -> some View {
    SettingsRouteView(
      session: session,
      route: value,
      selection: activeSelection,
      composition: composition,
      query: $query
    )
    .toolbar {
      if usesStackNavigation && (value == .activity || value == .tokens) {
        ToolbarItem(placement: .topBarTrailing) {
          HostSelectionMenu(session: session)
        }
      }
    }
  }

  private var activationIdentity: SettingsRefreshIdentity {
    SettingsRefreshIdentity(
      selection: activeSelection,
      route: route ?? .agents,
      query: query[activeSelection?.lease.connectionID]
    )
  }

  private var activeSelection: SettingsHostSelection? {
    guard session.selectedConnectionId != nil else { return selection }
    return session.currentSettingsHostSelection
  }
}

struct SettingsRouteView: View {
  @Bindable var session: AppSession
  let route: SettingsScreenRoute
  let selection: SettingsHostSelection?
  let composition: SettingsComposition
  @Binding var query: SettingsProfileQuerySelection
  var title: String? = nil

  var body: some View {
    Group {
      if (route == .generation || route == .workspace), composition.selection != selection {
        SettingsLoadingView()
      } else if route != .usage, !usesProfile, let failure = composition.gate(route.requiredCapability) {
        SettingsUnavailableView(failure: failure)
      } else {
        content
      }
    }
    .navigationTitle(title ?? SettingsUIStrings.routeTitle(route))
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
    .task(id: refreshIdentity) {
      guard !Task.isCancelled else { return }
      composition.activate(selection)
      await composition.refresh(route: route, query: profileQuery.wrappedValue)
    }
  }

  @ViewBuilder
  private var content: some View {
    switch route {
    case .agents:
      SettingsAgentsView(
        session: session,
        connectionID: selection?.lease.connectionID,
        controller: composition.hostInformation,
        composition: composition,
        refresh: refresh
      )
    case .usage:
      SettingsUsageView(selection: selection, composition: composition, refresh: refresh)
    case .devices:
      SettingsDevicesView(controller: composition.hostInformation, refresh: refresh)
    case .activity:
      SettingsActivityView(controller: composition.profile, selection: selection, query: profileQuery, refresh: refresh)
    case .tokens:
      SettingsTokensView(controller: composition.profile, selection: selection, query: profileQuery, refresh: refresh)
    case .profile:
      SettingsProfileView(
        session: session, selection: selection, composition: composition,
        query: profileQuery, refresh: refresh
      )
    case .generation:
      SettingsGenerationView(
        composition: composition,
        agentStatuses: composition.hostInformation.agentStatuses,
        refresh: refresh
      )
    case .workspace:
      SettingsWorkspaceView(composition: composition, refresh: refresh,
        showsWSL: session.profile?.platform.map { ["windows", "win32"].contains($0.lowercased()) } ?? true)
    }
  }

  private var refreshIdentity: SettingsRefreshIdentity {
    SettingsRefreshIdentity(selection: selection, route: route, query: profileQuery.wrappedValue)
  }

  private var usesProfile: Bool {
    switch route {
    case .activity, .tokens, .profile: true
    default: false
    }
  }

  private var profileQuery: Binding<SettingsProfileQuery> {
    let owner = selection?.lease.connectionID
    return Binding(get: { query[owner] }, set: { query[owner] = $0 })
  }

  private func refresh() {
    let query = profileQuery.wrappedValue
    Task {
      guard composition.selection?.lease == selection?.lease else { return }
      await composition.refresh(route: route, query: query)
    }
  }
}
