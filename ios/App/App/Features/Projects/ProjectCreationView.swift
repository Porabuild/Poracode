import Observation
import SwiftUI

@Observable
final class ProjectCreationTarget: Identifiable {
  let lease: ProjectControllerHostLease
  var draft = ProjectCreationDraft()
  var id: ProjectControllerHostLease { lease }

  init(lease: ProjectControllerHostLease) {
    self.lease = lease
  }
}

struct ProjectCreationView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var controller: ProjectControllerCommandController
  @Bindable var directoryController: ProjectControllerDirectoryController
  @Bindable var target: ProjectCreationTarget

  @State private var draftError: ProjectDraftError?
  @State private var showingBrowser = false
  private var draft: ProjectCreationDraft { target.draft }

  var body: some View {
    NavigationStack {
      Form {
        Picker("", selection: $target.draft.kind) {
          Text(ProjectManagementStrings.addExisting).tag(ProjectCreationKind.addExisting)
          Text(ProjectManagementStrings.create).tag(ProjectCreationKind.create)
          Text(ProjectManagementStrings.clone).tag(ProjectCreationKind.clone)
        }
        .pickerStyle(.segmented)
        .labelsHidden()

        Section {
          TextField(pathLabel, text: $target.draft.path)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .accessibilityIdentifier("native-e2e.projects.creation.path")
          Button(ProjectManagementStrings.browse, systemImage: "folder") {
            showingBrowser = true
          }
          .disabled(directoryController.state.lease != target.lease)
        }

        if draft.kind == .create {
          Section {
            TextField(ProjectManagementStrings.name, text: $target.draft.name)
              .textInputAutocapitalization(.words)
          }
        }

        if draft.kind == .clone {
          Section {
            TextField(ProjectManagementStrings.repositoryURL, text: $target.draft.cloneURL)
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
          Button(ProjectManagementStrings.cancel, systemImage: "xmark") { dismiss() }
            .accessibilityIdentifier("native-e2e.projects.creation.cancel")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(submitLabel, systemImage: "checkmark") {
            submit()
          }
          .disabled(controller.state.isExecuting || !canSubmit)
          .accessibilityIdentifier("native-e2e.projects.creation.submit")
        }
      }
      .interactiveDismissDisabled(controller.state.isExecuting)
      .sheet(isPresented: $showingBrowser) {
        ProjectDirectoryBrowser(controller: directoryController, initialPath: draft.path) { path in
          target.draft.path = path
        }
        .poracodeFormSheetSizing()
      }
      .onChange(of: controller.state.isExecuting) { wasExecuting, isExecuting in
        if wasExecuting, !isExecuting, controller.state.failure == nil {
          dismiss()
        }
      }
      .onChange(of: controller.state.session?.lease) { _, current in
        if current != target.lease { dismiss() }
      }
    }
  }

  private var canSubmit: Bool {
    guard let session = controller.state.session, session.lease == target.lease,
      session.gate(.projectsManage) == nil else { return false }
    return (try? draft.command()) != nil
  }

  private var pathLabel: String {
    draft.kind == .addExisting ? ProjectManagementStrings.folder : ProjectManagementStrings.parent
  }

  private var submitLabel: String {
    switch draft.kind {
    case .addExisting: ProjectManagementStrings.add
    case .create: ProjectManagementStrings.create
    case .clone: ProjectManagementStrings.clone
    }
  }

  private func submit() {
    do {
      let command = try draft.command()
      draftError = nil
      Task { await controller.perform(command, expectedLease: target.lease) }
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
