import SwiftUI

struct RemoteIntegrationsScreen: View {
  @Environment(\.scenePhase) private var scenePhase

  @Bindable var session: AppSession
  let selection: RemoteIntegrationsHostSelection?
  let projects: [RemoteIntegrationsProjectOption]
  let scheduleAgents: [AgentStatusRecord]
  let onCreateScheduleWithAgent: (() -> Void)?

  @State private var composition: RemoteIntegrationsComposition
  @State private var route: RemoteIntegrationsRoute? = .update
  private let singleRoute: RemoteIntegrationsRoute?

  init(
    session: AppSession,
    selection: RemoteIntegrationsHostSelection?,
    projects: [RemoteIntegrationsProjectOption] = [],
    scheduleAgents: [AgentStatusRecord] = [],
    gateway: any RemoteIntegrationsGateway,
    singleRoute: RemoteIntegrationsRoute? = nil,
    onCreateScheduleWithAgent: (() -> Void)? = nil
  ) {
    self.session = session
    self.selection = selection
    self.projects = projects
    self.scheduleAgents = scheduleAgents
    self.onCreateScheduleWithAgent = onCreateScheduleWithAgent
    self.singleRoute = singleRoute
    _composition = State(initialValue: RemoteIntegrationsComposition(gateway: gateway))
    _route = State(initialValue: singleRoute ?? .update)
  }

  @ViewBuilder
  var body: some View {
    Group {
      if let singleRoute {
        routeView(singleRoute)
      } else {
        NavigationSplitView {
          List(selection: $route) {
            hostHeader
            Section {
              routeLink(.update, systemImage: "arrow.down.circle")
              routeLink(.schedules, systemImage: "calendar.badge.clock")
              routeLink(.prWatches, systemImage: "arrow.triangle.branch")
            }
          }
          .navigationTitle(RemoteIntegrationsStrings.title)
          .listStyle(.sidebar)
        } detail: {
          if let route {
            routeView(route)
          } else {
            ContentUnavailableView(
              RemoteIntegrationsStrings.title,
              systemImage: "desktopcomputer"
            )
          }
        }
        .navigationSplitViewStyle(.balanced)
      }
    }
    .task(id: lifecycleIdentity) {
      if scenePhase == .active {
        composition.activate(selection)
      } else {
        composition.deactivateTransientWork()
      }
    }
    .onDisappear {
      composition.deactivateTransientWork()
    }
  }

  @ViewBuilder
  private var hostHeader: some View {
    Section(RemoteIntegrationsStrings.selectedHost) {
      if let selection {
        Label(selection.name, systemImage: "desktopcomputer")
          .font(.body.weight(.medium))
        if selection.access.gate(.sessionOperate) != nil
          || selection.access.gate(.projectsManage) != nil
        {
          RemoteIntegrationsReadOnlyNotice()
        }
      } else {
        Label(
          RemoteIntegrationsStrings.unavailable,
          systemImage: "desktopcomputer.trianglebadge.exclamationmark"
        )
        .foregroundStyle(.secondary)
      }
    }
  }

  private func routeLink(_ value: RemoteIntegrationsRoute, systemImage: String) -> some View {
    NavigationLink(value: value) {
      VStack(alignment: .leading, spacing: 2) {
        Label(title(value), systemImage: systemImage)
        Text(description(value))
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      .padding(.vertical, 2)
    }
    .accessibilityHint(description(value))
  }

  @ViewBuilder
  private func routeView(_ route: RemoteIntegrationsRoute) -> some View {
    switch route {
    case .update:
      RemoteIntegrationsUpdateView(
        selection: selection,
        composition: composition,
        isPresentationActive: scenePhase == .active
      )
    case .schedules:
      RemoteIntegrationsSchedulesView(
        session: session,
        selection: selection,
        projects: projects,
        agents: scheduleAgents,
        composition: composition,
        isPresentationActive: scenePhase == .active,
        createWithAgent: onCreateScheduleWithAgent
      )
    case .prWatches:
      RemoteIntegrationsPRWatchesView(
        selection: selection,
        projects: projects,
        agents: scheduleAgents,
        composition: composition,
        isPresentationActive: scenePhase == .active
      )
    }
  }

  private func title(_ route: RemoteIntegrationsRoute) -> String {
    switch route {
    case .update: RemoteIntegrationsStrings.update
    case .schedules: RemoteIntegrationsStrings.schedules
    case .prWatches: RemoteIntegrationsStrings.prWatches
    }
  }

  private func description(_ route: RemoteIntegrationsRoute) -> String {
    switch route {
    case .update: RemoteIntegrationsStrings.updateDescription
    case .schedules: RemoteIntegrationsStrings.schedulesDescription
    case .prWatches: RemoteIntegrationsStrings.prWatchesDescription
    }
  }

  private var activationIdentity: RemoteIntegrationsActivationIdentity {
    RemoteIntegrationsActivationIdentity(selection: selection)
  }

  private var lifecycleIdentity: RemoteIntegrationsLifecycleIdentity {
    RemoteIntegrationsLifecycleIdentity(
      activation: activationIdentity,
      isPresentationActive: scenePhase == .active
    )
  }
}

private struct RemoteIntegrationsLifecycleIdentity: Hashable {
  let activation: RemoteIntegrationsActivationIdentity
  let isPresentationActive: Bool
}

private struct RemoteIntegrationsActivationIdentity: Hashable {
  let connectionID: ClientConnectionID?
  let generation: UInt64?
  let protocolVersion: Int?
  let isOnline: Bool
  let isReady: Bool
  let capabilities: Set<RemoteIntegrationsCapability>

  init(selection: RemoteIntegrationsHostSelection?) {
    connectionID = selection?.lease.connectionID
    generation = selection?.lease.generation
    protocolVersion = selection?.access.protocolVersion
    isOnline = selection?.access.isOnline ?? false
    isReady = selection?.access.isReady ?? false
    capabilities = selection?.access.capabilities ?? []
  }
}
