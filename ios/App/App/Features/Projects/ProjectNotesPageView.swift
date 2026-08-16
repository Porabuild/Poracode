import SwiftUI

/// Top-level Notes destination from the More sheet. Like the mobile web notes
/// page, it edits the first synced project of the selected connection instead
/// of asking the user to pick one.
struct ProjectNotesPageView: View {
  @Bindable var session: AppSession
  @State private var controller: ProjectControllerNotesController

  init(session: AppSession) {
    self.session = session
    _controller = State(
      initialValue: ProjectControllerNotesController(gateway: session.makeProjectSessionGateway())
    )
  }

  private var project: RemoteProject? {
    session.projects.min { lhs, rhs in
      lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
    }
  }

  var body: some View {
    Group {
      if let project, let connectionId = session.selectedConnectionId {
        ProjectNotesView(
          identity: project.identity(on: connectionId),
          controller: controller
        )
      } else {
        ContentUnavailableView(
          ProjectManagementStrings.noProjects,
          systemImage: "note.text",
          description: Text(ProjectManagementStrings.notesEmptyProject)
        )
      }
    }
    .navigationTitle(ProjectManagementStrings.notes)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: session.currentProjectControllerLease) {
      if let controllerSession = session.currentProjectControllerSession {
        controller.activate(controllerSession)
      }
    }
  }
}
