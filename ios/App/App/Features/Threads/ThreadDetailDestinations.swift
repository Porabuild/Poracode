import SwiftUI

enum ThreadDetailDestination: Hashable, Identifiable {
  case notes
  case files
  case git
  case terminal
  case advanced

  var id: Self { self }
}

struct ThreadDetailDestinationView: View {
  @Bindable var session: AppSession
  let thread: RemoteThread
  let project: RemoteProject
  let workspaceLocation: ProjectLocation
  let destination: ThreadDetailDestination

  var body: some View {
    switch destination {
    case .notes:
      ProjectNotesPageView(session: session, projectID: project.id)
    case .files:
      workspace(.files)
    case .git:
      workspace(.git)
    case .terminal:
      ProjectShellTerminalView(
        session: session,
        projectLocation: project.location,
        worktreePath: thread.worktreePath
      )
    case .advanced:
      AdvancedOperationsSessionView(session: session, surface: .thread(threadID: thread.id))
    }
  }

  @ViewBuilder
  private func workspace(_ mode: ProjectWorkspaceMode) -> some View {
    if let connectionID = session.selectedConnectionId {
      ProjectWorkspaceSessionView(
        session: session,
        identity: project.identity(on: connectionID),
        location: project.location,
        workspaceLocation: workspaceLocation,
        originThreadID: thread.id,
        entryPoint: .workspace(mode)
      )
    } else {
      ProjectWorkspaceAccessView(state: .unavailable)
    }
  }
}
