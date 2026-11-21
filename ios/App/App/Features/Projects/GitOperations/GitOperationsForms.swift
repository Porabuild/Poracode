import SwiftUI

enum GitOperationsForm: Sendable {
  case remote
  case worktree
}

@MainActor
@Observable
final class GitOperationsFormDraft: Identifiable {
  let form: GitOperationsForm
  let lease: ProjectWorkspaceLease
  var name = ""
  var value = ""
  var branch = ""
  var createBranch = true

  init(form: GitOperationsForm, lease: ProjectWorkspaceLease) {
    self.form = form
    self.lease = lease
  }
}

struct GitOperationsFormView: View {
  @Bindable var draft: GitOperationsFormDraft
  let canSubmit: Bool
  let submit: (GitOperationRequest) -> Void

  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Form {
        switch draft.form {
        case .remote:
          TextField(GitOperationsStrings.remoteName, text: $draft.name)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .accessibilityIdentifier("native-e2e.git.remote.name")
          TextField(GitOperationsStrings.remoteURL, text: $draft.value)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)
            .accessibilityIdentifier("native-e2e.git.remote.url")
        case .worktree:
          TextField(GitOperationsStrings.branchName, text: $draft.branch)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          TextField(GitOperationsStrings.worktreePath, text: $draft.value)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          Toggle(GitOperationsStrings.createBranch, isOn: $draft.createBranch)
          .poracodeSwitchStyle()
        }
      }
      .navigationTitle(title)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(GitOperationsStrings.cancel, systemImage: "xmark") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(GitOperationsStrings.add, systemImage: "plus") {
            submit(request)
            dismiss()
          }
          .disabled(!canSubmit || !isValid)
          .accessibilityIdentifier("native-e2e.git.form.submit")
        }
      }
    }
  }

  private var title: String {
    switch draft.form {
    case .remote: GitOperationsStrings.action(.gitAddRemote)
    case .worktree: GitOperationsStrings.action(.gitAddWorktree)
    }
  }

  private var isValid: Bool {
    switch draft.form {
    case .remote:
      !draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && !draft.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    case .worktree:
      !draft.branch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && !draft.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
  }

  private var request: GitOperationRequest {
    switch draft.form {
    case .remote:
      .gitAddRemote(
        .init(projectLocation: draft.lease.location, remote: draft.name, url: draft.value)
      )
    case .worktree:
      .gitAddWorktree(
        .init(
          projectLocation: draft.lease.location,
          branch: draft.branch,
          createBranch: draft.createBranch,
          path: draft.value
        )
      )
    }
  }
}
