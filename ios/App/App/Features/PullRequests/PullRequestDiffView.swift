import SwiftUI

struct PullRequestDiffView: View {
  let path: String
  let diff: String

  var body: some View {
    NativeUnifiedDiffView(diff: diff.isEmpty ? ProjectWorkspaceStrings.noDiff : diff)
      .navigationTitle(path)
      .navigationBarTitleDisplayMode(.inline)
  }
}
