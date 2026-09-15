import SwiftUI

enum HostDestinationKind: String, Hashable, Sendable {
  case projects
  case desktopSettings
}

struct HostDestination: Identifiable, Hashable, Sendable {
  let connectionID: ClientConnectionID
  let kind: HostDestinationKind

  var id: String { "\(connectionID.rawValue):\(kind.rawValue)" }
}

/// Resolves a connection-row destination against the exact selected host
/// before constructing any controller or settings gateway for it.
struct HostDestinationView: View {
  @Bindable var session: AppSession
  let destination: HostDestination

  @State private var ready = false

  var body: some View {
    Group {
      if ready {
        destinationContent
      } else {
        LoadingStateView(message: HomeStrings.loadingProjects)
      }
    }
    .task(id: destination.id) {
      if session.selectedConnectionId != destination.connectionID {
        await session.switchHost(destination.connectionID)
      }
      ready = session.selectedConnectionId == destination.connectionID
    }
  }

  @ViewBuilder
  private var destinationContent: some View {
    switch destination.kind {
    case .projects:
      ProjectManagementView(session: session, embeddedInNavigationStack: true)
    case .desktopSettings:
      SettingsHostView(
        session: session,
        selection: session.currentSettingsHostSelection,
        gateway: session.makeSettingsSessionGateway(),
        usesStackNavigation: true
      )
    }
  }
}
