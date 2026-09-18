import SwiftUI

enum PullRequestReviewSheet: String, Identifiable {
  case review
  case comment
  case merge

  var id: Self { self }

  var title: String {
    switch self {
    case .review: GitHubOperationsStrings.action(.ghSubmitPrReview)
    case .comment: GitHubOperationsStrings.action(.ghPostPrComment)
    case .merge: GitHubOperationsStrings.action(.ghMergePr)
    }
  }
}

struct PullRequestReviewActionSheet: View {
  @Environment(\.dismiss) private var dismiss

  let sheet: PullRequestReviewSheet
  let location: GitHubProjectLocation?
  let pullRequestNumber: Int64
  let submit: @MainActor (GitHubOperationRequest) async -> Void

  @State private var decision = GitHubReviewDecision.comment
  @State private var bodyText = ""
  @State private var mergeMethod = GitHubMergeMethod.merge
  @State private var admin = false
  @State private var isSubmitting = false

  var body: some View {
    NavigationStack {
      Form {
        switch sheet {
        case .review:
          Picker(GitHubOperationsStrings.reviewDecision, selection: $decision) {
            Text(GitHubOperationsStrings.approve).tag(GitHubReviewDecision.approve)
            Text(GitHubOperationsStrings.requestChanges)
              .tag(GitHubReviewDecision.requestChanges)
            Text(GitHubOperationsStrings.commentDecision).tag(GitHubReviewDecision.comment)
          }
          bodyEditor
        case .comment:
          bodyEditor
        case .merge:
          Picker(GitHubOperationsStrings.mergeMethod, selection: $mergeMethod) {
            Text(GitHubOperationsStrings.merge).tag(GitHubMergeMethod.merge)
            Text(GitHubOperationsStrings.squash).tag(GitHubMergeMethod.squash)
            Text(GitHubOperationsStrings.rebase).tag(GitHubMergeMethod.rebase)
          }
          Toggle(GitHubOperationsStrings.admin, isOn: $admin)
        }
      }
      .navigationTitle(sheet.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(GitHubOperationsStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(GitHubOperationsStrings.run) {
            guard let request else { return }
            isSubmitting = true
            Task {
              await submit(request)
              isSubmitting = false
              dismiss()
            }
          }
          .disabled(request == nil || isSubmitting)
        }
      }
    }
  }

  private var bodyEditor: some View {
    Section(GitHubOperationsStrings.body) {
      TextEditor(text: $bodyText)
        .frame(minHeight: 140)
        .accessibilityLabel(GitHubOperationsStrings.body)
    }
  }

  private var normalizedBody: String? {
    let value = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }

  private var request: GitHubOperationRequest? {
    guard let location else { return nil }
    switch sheet {
    case .review:
      if decision != .approve, normalizedBody == nil { return nil }
      return .ghSubmitPrReview(
        .init(
          projectLocation: location,
          prNumber: pullRequestNumber,
          decision: decision,
          body: normalizedBody
        )
      )
    case .comment:
      guard let body = normalizedBody else { return nil }
      return .ghPostPrComment(
        .init(projectLocation: location, prNumber: pullRequestNumber, body: body)
      )
    case .merge:
      return .ghMergePr(
        .init(
          projectLocation: location,
          prNumber: pullRequestNumber,
          method: mergeMethod,
          admin: admin
        )
      )
    }
  }
}
