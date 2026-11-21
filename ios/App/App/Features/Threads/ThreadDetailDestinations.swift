import SwiftUI

enum ThreadDetailDestination: Hashable, Identifiable {
  case notes
  case files
  case git
  case terminal
  case browser
  case advanced

  var id: Self { self }
}

struct ThreadDetailDestinationView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  let thread: RemoteThread
  let project: RemoteProject
  let workspaceLocation: ProjectLocation
  let destination: ThreadDetailDestination

  var body: some View {
    contents
      .modifier(PoracodeRetainNavigationWhilePresented())
      .nativeCommands(identity: "thread-tool:\(thread.id):\(destination)", blocksParentActions: true,
        context: ["hasProject": .bool(true)], actions: closeActions)
  }

  private var closeActions: [String: NativeCommandRegistry.Action] {
    let close = NativeCommandRegistry.Action { _ in dismiss() }
    let command: String
    switch destination {
    case .files, .git, .notes, .advanced: return [:]
    case .terminal: command = "terminal.toggle"
    case .browser: command = "browser.toggle"
    }
    return [command: close]
  }

  @ViewBuilder private var contents: some View {
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
    case .browser:
      BrowserMirrorSessionView(session: session, embeddedInNavigationStack: true, showsHostSelection: false)
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
        entryPoint: .workspace(mode),
        closeFromKeyboard: { dismiss() }
      )
    } else {
      ProjectWorkspaceAccessView(state: .unavailable)
    }
  }
}
