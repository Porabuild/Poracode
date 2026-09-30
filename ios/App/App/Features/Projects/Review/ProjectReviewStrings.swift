import Foundation

enum ProjectReviewStrings {
  static let title = localized("workspace.review.title", "Review")
  static let open = localized("workspace.review.open", "Open Review")
  static let empty = localized("workspace.review.empty", "No pull request yet")
  static let emptyDescription = localized(
    "workspace.review.empty.description",
    "This project has no pull request the desktop can review yet."
  )
  static let unavailable = localized(
    "workspace.review.unavailable",
    "Reconnect to load review details."
  )
  static let state = localized("workspace.review.state", "State")
  static let draft = localized("workspace.review.draft", "Draft")
  static let baseBranch = localized("workspace.review.baseBranch", "Base branch")
  static let sourceBranch = localized("workspace.review.sourceBranch", "Source branch")
  static let bundleLoading = localized(
    "workspace.review.bundle.loading",
    "Loading review details…"
  )

  static func pullRequest(_ number: Int) -> String {
    format("workspace.review.pullRequest", "Pull request #%lld", number)
  }

  static func changedFiles(_ count: Int) -> String {
    format("workspace.review.files", "Changed files: %lld", count)
  }

  static func reviewThreads(_ count: Int) -> String {
    format("workspace.review.threads", "Review threads: %lld", count)
  }

  static func unresolved(_ count: Int) -> String {
    format("workspace.review.unresolved", "Unresolved: %lld", count)
  }

  static func openPullRequests(_ count: Int) -> String {
    format("workspace.review.openPullRequests", "Open pull requests: %lld", count)
  }

  private static func localized(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(
      key,
      tableName: "ProjectWorkspace",
      bundle: .main,
      value: fallback,
      comment: ""
    )
  }

  private static func format(
    _ key: String,
    _ fallback: String,
    _ arguments: CVarArg...
  ) -> String {
    String(
      format: localized(key, fallback),
      locale: .autoupdatingCurrent,
      arguments: arguments
    )
  }
}
