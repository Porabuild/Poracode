import SwiftUI

/// Top-level Notes destination from the More sheet. Like the mobile web page,
/// it starts from the current/synced project and keeps a native project picker
/// available without leaving the editor.
struct ProjectNotesPageView: View {
  @Bindable var session: AppSession
  let initialProjectID: String?
  @State private var controller: ProjectControllerNotesController
  @State private var selectedProjectID: String?

  init(session: AppSession, projectID: String? = nil) {
    self.session = session
    initialProjectID = projectID
    _controller = State(
      initialValue: ProjectControllerNotesController(gateway: session.makeProjectSessionGateway())
    )
    _selectedProjectID = State(initialValue: projectID)
  }

  private var projects: [RemoteProject] {
    session.projects
      .filter { project in
        guard project.disabled != true, project.id != RemoteProject.homeScopeID else {
          return false
        }
        if project.id == initialProjectID { return true }
        guard initialProjectID == nil, let connectionID = session.selectedConnectionId else {
          return false
        }
        return session.projectSyncPreferences.isSynced(
          connectionID: connectionID,
          projectID: project.id
        )
      }
      .sorted {
        $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
      }
  }

  private var project: RemoteProject? {
    if let selectedProjectID,
      let selected = projects.first(where: { $0.id == selectedProjectID })
    {
      return selected
    }
    return projects.first
  }

  var body: some View {
    Group {
      if let project, let connectionId = session.selectedConnectionId {
        ProjectNotesView(
          session: session,
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
    .toolbar {
      if initialProjectID == nil {
        ToolbarItem(placement: .topBarTrailing) {
          HostSelectionMenu(session: session)
        }
      }
      if projects.count > 1, let project {
        ToolbarItem(placement: .topBarTrailing) {
          Menu {
            ForEach(projects) { option in
              Button {
                selectedProjectID = option.id
              } label: {
                if option.id == project.id {
                  Label(option.name, systemImage: "checkmark")
                } else {
                  Text(option.name)
                }
              }
            }
          } label: {
            Label(project.name, systemImage: "folder")
              .labelStyle(.titleAndIcon)
          }
          .accessibilityLabel(HomeStrings.project)
        }
      }
    }
    .task(id: session.currentProjectControllerLease) {
      if let controllerSession = session.currentProjectControllerSession {
        controller.activate(controllerSession)
      } else {
        controller.deactivate()
      }
    }
    .onChange(of: projects.map(\.id), initial: true) {
      if let selectedProjectID, projects.contains(where: { $0.id == selectedProjectID }) {
        return
      }
      selectedProjectID = projects.first?.id
    }
  }
}
