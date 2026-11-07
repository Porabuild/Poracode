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
  var capabilities: [String: GitHubJSONValue]? = nil
  let submit: @MainActor (GitHubOperationRequest) async -> Bool

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
            if permits("reviewDecisions", "approve") { Text(GitHubOperationsStrings.approve).tag(GitHubReviewDecision.approve) }
            if permits("reviewDecisions", "request-changes") { Text(GitHubOperationsStrings.requestChanges)
              .tag(GitHubReviewDecision.requestChanges)
            }
            if permits("reviewDecisions", "comment") { Text(GitHubOperationsStrings.commentDecision).tag(GitHubReviewDecision.comment) }
          }
          bodyEditor
        case .comment:
          bodyEditor
        case .merge:
          Picker(GitHubOperationsStrings.mergeMethod, selection: $mergeMethod) {
            if permits("mergeMethods", "merge") { Text(GitHubOperationsStrings.merge).tag(GitHubMergeMethod.merge) }
            if permits("mergeMethods", "squash") { Text(GitHubOperationsStrings.squash).tag(GitHubMergeMethod.squash) }
            if permits("mergeMethods", "rebase") { Text(GitHubOperationsStrings.rebase).tag(GitHubMergeMethod.rebase) }
          }
          if capabilities == nil || capabilities?["adminMerge"]?.boolValue == true {
            Toggle(GitHubOperationsStrings.admin, isOn: $admin)
          }
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
              let accepted = await submit(request)
              isSubmitting = false
              if accepted { dismiss() }
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
      guard permits("reviewDecisions", decision.rawValue) else { return nil }
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
      guard permits("mergeMethods", mergeMethod.rawValue) else { return nil }
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

  private func permits(_ capability: String, _ value: String) -> Bool {
    capabilities == nil || capabilities?[capability]?.arrayValue?.contains(.string(value)) == true
  }
}
