import SwiftUI

struct HomeProjectMenuDestinationView: View {
  @Bindable var session: AppSession
  let destination: HomeProjectMenuDestination

  @State private var ready = false

  var body: some View {
    Group {
      if ready {
        destinationView
      } else {
        LoadingStateView(message: HomeStrings.loadingProjects)
      }
    }
    .task(id: destination.id) {
      await switchToDestinationHost()
    }
  }

  @ViewBuilder
  private var destinationView: some View {
    switch destination {
    case .settings(let option):
      ProjectManagementView(
        session: session,
        embeddedInNavigationStack: true,
        initialProjectID: option.project.id
      )
    case .terminal(let option):
      ProjectShellTerminalView(
        session: session,
        projectLocation: currentProject(for: option).location
      )
    case .gitChanges(let option):
      ProjectWorkspaceSessionView(
        session: session,
        identity: ProjectIdentity(
          connectionId: option.connectionID,
          projectId: option.project.id
        ),
        location: currentProject(for: option).location,
        entryPoint: .workspace(.git)
      )
    case .gitHubActions(let option):
      ProjectWorkspaceSessionView(
        session: session,
        identity: ProjectIdentity(
          connectionId: option.connectionID,
          projectId: option.project.id
        ),
        location: currentProject(for: option).location,
        entryPoint: .gitHubActions
      )
    case .projectAction(let option, let action):
      ProjectShellTerminalView(
        session: session,
        projectLocation: currentProject(for: option).location,
        initialCommand: action.command,
        title: action.name
      )
    }
  }

  private func switchToDestinationHost() async {
    ready = false
    let option = destination.option
    if session.selectedConnectionId != option.connectionID {
      await session.switchHost(option.connectionID)
    }
    ready = session.selectedConnectionId == option.connectionID
  }

  private func currentProject(for option: HomeProjectFilterOption) -> RemoteProject {
    HomeProjectSnapshotResolver.project(
      connectionID: option.connectionID,
      projectID: option.project.id,
      selectedConnectionID: session.state.selectedConnectionId,
      selectedSnapshot: session.state.snapshot,
      hostSnapshots: session.state.hostSnapshots,
      fallback: option.project
    )
  }
}
