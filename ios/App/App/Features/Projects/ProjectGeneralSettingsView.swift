import SwiftUI

struct ProjectGeneralSettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  let project: RemoteProject
  @Bindable var commandController: ProjectControllerCommandController
  @Bindable var directoryController: ProjectControllerDirectoryController

  @State private var draft: ProjectEditDraft
  @State private var draftError: ProjectDraftError?
  @State private var showingBrowser = false
  @State private var confirmingRemoval = false

  init(
    session: AppSession,
    project: RemoteProject,
    commandController: ProjectControllerCommandController,
    directoryController: ProjectControllerDirectoryController
  ) {
    self.session = session
    self.project = project
    self.commandController = commandController
    self.directoryController = directoryController
    _draft = State(initialValue: ProjectEditDraft(project: project))
  }

  var body: some View {
    Form {
      Section {
        TextField(ProjectManagementStrings.name, text: $draft.name)
      } footer: {
        Text(ProjectSettingsStrings.projectNameDescription)
      }

      Section {
        TextField(ProjectManagementStrings.folder, text: $draft.path)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        Button(ProjectManagementStrings.browse, systemImage: "folder") {
          showingBrowser = true
        }
      } footer: {
        Text(ProjectSettingsStrings.projectFolderDescription)
      }

      Section {
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

      if let draftError {
        Section {
          Label(message(for: draftError), systemImage: "exclamationmark.triangle")
            .foregroundStyle(.red)
        }
      }

      Section {
        Button(ProjectManagementStrings.remove, systemImage: "trash", role: .destructive) {
          confirmingRemoval = true
        }
      }
    }
    .navigationTitle(ProjectSettingsStrings.general)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(ProjectManagementStrings.save) { save() }
          .disabled(commandController.state.isExecuting || !hasValidChanges)
      }
    }
    .sheet(isPresented: $showingBrowser) {
      ProjectDirectoryBrowser(controller: directoryController, initialPath: draft.path) { path in
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
    guard let connectionID = commandController.state.session?.lease.connectionId else { return nil }
    return ProjectIdentity(connectionId: connectionID, projectId: project.id)
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
