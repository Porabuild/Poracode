import SwiftUI

struct ProjectEditView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  let project: RemoteProject
  @Bindable var commandController: ProjectControllerCommandController
  @Bindable var settingsController: ProjectControllerSettingsController
  @Bindable var directoryController: ProjectControllerDirectoryController
  @Bindable var notesController: ProjectControllerNotesController

  @State private var draft: ProjectEditDraft
  @State private var draftError: ProjectDraftError?
  @State private var showingBrowser = false
  @State private var confirmingRemoval = false

  init(
    session: AppSession,
    project: RemoteProject,
    commandController: ProjectControllerCommandController,
    settingsController: ProjectControllerSettingsController,
    directoryController: ProjectControllerDirectoryController,
    notesController: ProjectControllerNotesController
  ) {
    self.session = session
    self.project = project
    self.commandController = commandController
    self.settingsController = settingsController
    self.directoryController = directoryController
    self.notesController = notesController
    _draft = State(initialValue: ProjectEditDraft(project: project))
  }

  var body: some View {
    Form {
      Section {
        TextField(ProjectManagementStrings.name, text: $draft.name)
        TextField(ProjectManagementStrings.folder, text: $draft.path)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        Button(ProjectManagementStrings.browse, systemImage: "folder") {
          showingBrowser = true
        }
        if let identity {
          Toggle(
            ProjectManagementStrings.syncOnThisDevice,
            isOn: Binding(
              get: {
                session.projectSyncPreferences.isSynced(
                  connectionID: identity.connectionId,
                  projectID: identity.projectId
                )
              },
              set: {
                session.projectSyncPreferences.setSynced(
                  $0,
                  connectionID: identity.connectionId,
                  projectID: identity.projectId
                )
              }
            )
          )
        }
        Toggle(ProjectManagementStrings.disabled, isOn: $draft.disabled)
      }

      Section {
        if let identity {
          NavigationLink {
            ProjectNotesView(identity: identity, controller: notesController)
          } label: {
            Label(ProjectManagementStrings.notes, systemImage: "checklist")
          }
          NavigationLink {
            ProjectIntegrationsView(
              project: project,
              identity: identity,
              settingsController: settingsController,
              commandController: commandController
            )
          } label: {
            Label(
              ProjectManagementStrings.integrations,
              systemImage: "point.3.connected.trianglepath.dotted"
            )
          }
          NavigationLink {
            ProjectWorkspaceSessionView(
              session: session,
              identity: identity,
              location: project.location
            )
          } label: {
            Label(ProjectWorkspaceStrings.title, systemImage: "doc.text.magnifyingglass")
          }
          NavigationLink {
            ProjectShellTerminalView(session: session, projectLocation: project.location)
          } label: {
            Label(TerminalStrings.shellOpen, systemImage: "terminal")
          }
          NavigationLink {
            AdvancedOperationsSessionView(
              session: session,
              surface: .project(identity, expectedLocation: project.location)
            )
          } label: {
            Label(AdvancedOperationsStrings.openFromProject, systemImage: "slider.horizontal.3")
          }
        }
      }

      if let draftError {
        Section {
          Label(message(for: draftError), systemImage: "exclamationmark.triangle")
            .foregroundStyle(.red)
        }
      }
      if let failure = commandController.state.failure {
        Section { ProjectFailureBanner(failure: failure) }
      }

      Section {
        Button(ProjectManagementStrings.remove, systemImage: "trash", role: .destructive) {
          confirmingRemoval = true
        }
      }
    }
    .navigationTitle(ProjectManagementStrings.edit)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(ProjectManagementStrings.save) { save() }
          .disabled(commandController.state.isExecuting || !hasValidChanges)
      }
    }
    .sheet(isPresented: $showingBrowser) {
      ProjectDirectoryBrowser(controller: directoryController) { path in
        draft.path = path
      }
    }
    .confirmationDialog(
      ProjectManagementStrings.remove,
      isPresented: $confirmingRemoval,
      titleVisibility: .visible
    ) {
      Button(ProjectManagementStrings.remove, role: .destructive) {
        Task {
          await commandController.perform(.remove(projectId: project.id), detectSetup: false)
          if commandController.state.failure == nil { dismiss() }
        }
      }
      Button(ProjectManagementStrings.cancel, role: .cancel) {}
    } message: {
      Text(ProjectManagementStrings.removeConfirmation)
    }
  }

  private var identity: ProjectIdentity? {
    guard let connectionId = commandController.state.session?.lease.connectionId else { return nil }
    return ProjectIdentity(connectionId: connectionId, projectId: project.id)
  }

  private var hasValidChanges: Bool {
    guard let commands = try? draft.commands() else { return false }
    return !commands.isEmpty
  }

  private func save() {
    do {
      let commands = try draft.commands()
      draftError = nil
      Task {
        for command in commands {
          await commandController.perform(command, detectSetup: false)
          if commandController.state.failure != nil { return }
        }
        dismiss()
      }
    } catch let error as ProjectDraftError {
      draftError = error
    } catch {
      draftError = .noChanges
    }
  }

  private func message(for error: ProjectDraftError) -> String {
    switch error {
    case .pathRequired: ProjectManagementStrings.pathRequired
    case .invalidName: ProjectManagementStrings.invalidName
    case .invalidCloneURL: ProjectManagementStrings.invalidCloneURL
    case .noChanges: ProjectManagementStrings.noChanges
    }
  }
}
