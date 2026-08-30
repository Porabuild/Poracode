import SwiftUI

struct ThreadWorktreeComposeIntent: Identifiable {
  let projectID: String
  let worktreePath: String
  let worktreeBranch: String

  var id: String { "\(projectID):\(worktreePath)" }
}

struct ThreadWorktreeComposeSheet: View {
  @Environment(\.dismiss) private var dismiss

  @Bindable var session: AppSession
  let projectID: String
  let worktreePath: String
  let worktreeBranch: String
  let onStarted: (String) -> Void

  @State private var isExpanded = true

  var body: some View {
    NavigationStack {
      VStack {
        Spacer(minLength: 16)
        HomeQuickComposeView(
          session: session,
          isExpanded: $isExpanded,
          initialProjectID: projectID,
          initialWorktree: HomeComposerBranchSelection(
            branch: worktreeBranch,
            worktreePath: worktreePath
          )
        ) { threadID in
          onStarted(threadID)
          dismiss()
        }
        .padding()
      }
      .background(Color(uiColor: .systemGroupedBackground))
      .navigationTitle(ThreadLifecycleStrings.newInWorktree)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(ThreadLifecycleStrings.cancel) { dismiss() }
        }
      }
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
  }
}
