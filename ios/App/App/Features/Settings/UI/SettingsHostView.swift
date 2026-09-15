import SwiftUI

struct SettingsHostView: View {
  @Bindable var session: AppSession
  let selection: SettingsHostSelection?

  @State private var composition: SettingsComposition
  @State private var route: SettingsScreenRoute? = .agents
  @State private var query = SettingsProfileQuery()
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
      routeSections(stackNavigation: false)
    }
    .navigationTitle(SettingsUIStrings.desktopSettingsTitle)
    .listStyle(.sidebar)
  }

  private var stackList: some View {
    List {
      routeSections(stackNavigation: true)
    }
    .navigationTitle(SettingsUIStrings.desktopSettingsTitle)
    .listStyle(.insetGrouped)
  }

  @ViewBuilder
  private func routeSections(stackNavigation: Bool) -> some View {
    hostHeader
    Section(SettingsUIStrings.selectSection) {
      routeLink(.profile, systemImage: "person.crop.circle", stackNavigation: stackNavigation)
      routeLink(
        .usage,
        systemImage: "gauge.with.dots.needle.67percent",
        stackNavigation: stackNavigation
      )
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
      routeLink(.generation, systemImage: "sparkles", stackNavigation: stackNavigation)
      routeLink(.agents, systemImage: "cpu", stackNavigation: stackNavigation)
    }
    Section(SettingsUIStrings.configurationSection) {
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
      routeLink(.devices, systemImage: "desktopcomputer", stackNavigation: stackNavigation)
      routeLink(.activity, systemImage: "chart.bar.xaxis", stackNavigation: stackNavigation)
      routeLink(.tokens, systemImage: "number.circle", stackNavigation: stackNavigation)
      routeLink(.workspace, systemImage: "folder.badge.gearshape", stackNavigation: stackNavigation)
      NavigationLink {
        GlobalMCPSettingsView(session: session)
      } label: {
        Label(ProjectSettingsStrings.mcpServers, systemImage: "server.rack")
      }
      NavigationLink {
        SettingsIntegrationsSessionView(session: session)
      } label: {
        Label(SettingsIntegrationsStrings.title, systemImage: "puzzlepiece.extension")
      }
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
    systemImage: String,
    stackNavigation: Bool
  ) -> some View {
    if stackNavigation {
      NavigationLink {
        routeView(value)
      } label: {
        routeLabel(value, systemImage: systemImage)
      }
      .accessibilityHint(SettingsUIStrings.routeDescription(value))
    } else {
      NavigationLink(value: value) {
        routeLabel(value, systemImage: systemImage)
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
  }

  private var activationIdentity: SettingsRefreshIdentity {
    SettingsRefreshIdentity(
      selection: activeSelection,
      route: route ?? .agents,
      query: query
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
  @Binding var query: SettingsProfileQuery

  var body: some View {
    Group {
      if let failure = composition.gate(route.requiredCapability) {
        SettingsUnavailableView(failure: failure)
      } else {
        content
      }
    }
    .navigationTitle(SettingsUIStrings.routeTitle(route))
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
    .task(id: refreshIdentity) {
      composition.activate(selection)
      await composition.refresh(route: route, query: query)
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
      SettingsUsageView(
        controller: composition.hostInformation,
        composition: composition,
        refresh: refresh
      )
    case .devices:
      SettingsDevicesView(controller: composition.hostInformation, refresh: refresh)
    case .activity:
      SettingsActivityView(controller: composition.profile, query: $query, refresh: refresh)
    case .tokens:
      SettingsTokensView(controller: composition.profile, query: $query, refresh: refresh)
    case .profile:
      SettingsProfileView(composition: composition, query: $query, refresh: refresh)
    case .generation:
      SettingsGenerationView(
        composition: composition,
        agentStatuses: composition.hostInformation.agentStatuses,
        refresh: refresh
      )
    case .workspace:
      SettingsWorkspaceView(composition: composition, refresh: refresh)
    }
  }

  private var refreshIdentity: SettingsRefreshIdentity {
    SettingsRefreshIdentity(selection: selection, route: route, query: query)
  }

  private func refresh() {
    Task { await composition.refresh(route: route, query: query) }
  }
}
