import SwiftUI

struct ProjectCreationView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var controller: ProjectControllerCommandController
  @Bindable var directoryController: ProjectControllerDirectoryController

  @State private var draft = ProjectCreationDraft()
  @State private var draftError: ProjectDraftError?
  @State private var showingBrowser = false

  var body: some View {
    NavigationStack {
      Form {
        Picker("", selection: $draft.kind) {
          Text(ProjectManagementStrings.addExisting).tag(ProjectCreationKind.addExisting)
          Text(ProjectManagementStrings.create).tag(ProjectCreationKind.create)
          Text(ProjectManagementStrings.clone).tag(ProjectCreationKind.clone)
        }
        .pickerStyle(.segmented)
        .labelsHidden()

        Section {
          TextField(ProjectManagementStrings.folder, text: $draft.path)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          Button(ProjectManagementStrings.browse, systemImage: "folder") {
            showingBrowser = true
          }
        }

        Section {
          TextField(ProjectManagementStrings.name, text: $draft.name)
            .textInputAutocapitalization(.words)
          if draft.kind == .clone {
            TextField(ProjectManagementStrings.repositoryURL, text: $draft.cloneURL)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .keyboardType(.URL)
          }
        }

        if let draftError {
          Section {
            Label(message(for: draftError), systemImage: "exclamationmark.triangle")
              .foregroundStyle(.red)
          }
        }
        if let failure = controller.state.failure {
          Section { ProjectFailureBanner(failure: failure) }
        }
      }
      .navigationTitle(ProjectManagementStrings.add)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(ProjectManagementStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(ProjectManagementStrings.add) {
            submit()
          }
          .disabled(controller.state.isExecuting || !canSubmit)
        }
      }
      .interactiveDismissDisabled(controller.state.isExecuting)
      .sheet(isPresented: $showingBrowser) {
        ProjectDirectoryBrowser(controller: directoryController) { path in
          draft.path = path
        }
      }
      .onChange(of: controller.state.isExecuting) { wasExecuting, isExecuting in
        if wasExecuting, !isExecuting, controller.state.failure == nil {
          dismiss()
        }
      }
    }
  }

  private var canSubmit: Bool {
    (try? draft.command()) != nil
  }

  private func submit() {
    do {
      let command = try draft.command()
      draftError = nil
      Task { await controller.perform(command) }
    } catch let error as ProjectDraftError {
      draftError = error
    } catch {
      draftError = .pathRequired
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
