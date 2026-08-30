import SwiftUI

/// Native project-settings index mirroring the compact PWA hierarchy. Each
/// destination owns one coherent patch surface; project utilities remain
/// available below the settings rows without being mixed into General.
struct ProjectEditView: View {
  @Bindable var session: AppSession
  let project: RemoteProject
  @Bindable var commandController: ProjectControllerCommandController
  @Bindable var settingsController: ProjectControllerSettingsController
  @Bindable var directoryController: ProjectControllerDirectoryController
  @Bindable var notesController: ProjectControllerNotesController

  var body: some View {
    List {
      Section {
        NavigationLink {
          ProjectGeneralSettingsView(
            session: session,
            project: currentProject,
            commandController: commandController,
            directoryController: directoryController
          )
        } label: {
          Label(ProjectSettingsStrings.general, systemImage: "gearshape")
        }

        NavigationLink {
          ProjectWorktreeSettingsView(
            session: session,
            project: currentProject,
            commandController: commandController
          )
        } label: {
          Label(ProjectSettingsStrings.worktrees, systemImage: "arrow.triangle.branch")
        }

        NavigationLink {
          ProjectActionsSettingsView(
            project: currentProject,
            commandController: commandController
          )
        } label: {
          Label(ProjectSettingsStrings.actions, systemImage: "play")
        }

        if let identity {
          NavigationLink {
            SettingsIntegrationsSessionView(
              session: session,
              initialProjectIdentity: identity,
              initialRoute: .skills,
              embeddedInNavigationStack: true
            )
          } label: {
            Label(ProjectSettingsStrings.skills, systemImage: "shippingbox")
          }

          NavigationLink {
            ProjectMCPSettingsView(
              session: session,
              project: currentProject,
              identity: identity,
              settingsController: settingsController,
              commandController: commandController
            )
          } label: {
            Label(ProjectSettingsStrings.mcpServers, systemImage: "server.rack")
          }
        }

        NavigationLink {
          ProjectSearchSettingsView(
            session: session,
            project: currentProject,
            commandController: commandController
          )
        } label: {
          Label(ProjectSettingsStrings.search, systemImage: "magnifyingglass")
        }
      }

      if let identity {
        Section {
          NavigationLink {
            ProjectNotesView(session: session, identity: identity, controller: notesController)
          } label: {
            Label(ProjectManagementStrings.notes, systemImage: "checklist")
          }
          NavigationLink {
            ProjectWorkspaceSessionView(
              session: session,
              identity: identity,
              location: currentProject.location
            )
          } label: {
            Label(ProjectWorkspaceStrings.title, systemImage: "doc.text.magnifyingglass")
          }
          NavigationLink {
            ProjectShellTerminalView(
              session: session,
              projectLocation: currentProject.location
            )
          } label: {
            Label(TerminalStrings.shellOpen, systemImage: "terminal")
          }
          NavigationLink {
            AdvancedOperationsSessionView(
              session: session,
              surface: .project(identity, expectedLocation: currentProject.location)
            )
          } label: {
            Label(AdvancedOperationsStrings.openFromProject, systemImage: "slider.horizontal.3")
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(ProjectManagementStrings.edit)
    .navigationBarTitleDisplayMode(.inline)
    .overlay(alignment: .bottom) {
      if let failure = commandController.state.failure {
        ProjectFailureBanner(failure: failure)
          .padding()
      }
    }
  }

  private var currentProject: RemoteProject {
    commandController.state.projects.first(where: { $0.id == project.id }) ?? project
  }

  private var identity: ProjectIdentity? {
    guard let connectionID = commandController.state.session?.lease.connectionId else { return nil }
    return ProjectIdentity(connectionId: connectionID, projectId: project.id)
  }
}
