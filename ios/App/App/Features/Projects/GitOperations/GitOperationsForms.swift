import SwiftUI

enum GitOperationsForm: String, Identifiable, Sendable {
  case remote
  case worktree

  var id: String { rawValue }
}

struct GitOperationsFormView: View {
  let form: GitOperationsForm
  let location: ProjectLocation
  let submit: (GitOperationRequest) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var value = ""
  @State private var branch = ""
  @State private var createBranch = true

  var body: some View {
    NavigationStack {
      Form {
        switch form {
        case .remote:
          TextField(GitOperationsStrings.remoteName, text: $name)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          TextField(GitOperationsStrings.remoteURL, text: $value)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)
        case .worktree:
          TextField(GitOperationsStrings.branchName, text: $branch)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          TextField(GitOperationsStrings.worktreePath, text: $value)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          Toggle(GitOperationsStrings.createBranch, isOn: $createBranch)
        }
      }
      .navigationTitle(title)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(GitOperationsStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(GitOperationsStrings.add) {
            submit(request)
            dismiss()
          }
          .disabled(!isValid)
        }
      }
    }
  }

  private var title: String {
    switch form {
    case .remote: GitOperationsStrings.action(.gitAddRemote)
    case .worktree: GitOperationsStrings.action(.gitAddWorktree)
    }
  }

  private var isValid: Bool {
    switch form {
    case .remote:
      !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    case .worktree:
      !branch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
  }

  private var request: GitOperationRequest {
    switch form {
    case .remote:
      .gitAddRemote(
        .init(projectLocation: location, remote: name, url: value)
      )
    case .worktree:
      .gitAddWorktree(
        .init(
          projectLocation: location,
          branch: branch,
          createBranch: createBranch,
          path: value
        )
      )
    }
  }
}
