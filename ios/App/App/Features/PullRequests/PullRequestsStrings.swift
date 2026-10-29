import Foundation

enum PullRequestsStrings {
  static var title: String { localized("pullRequests.title", "Pull requests") }
  static var all: String { localized("pullRequests.filter.all", "All") }
  static var reviewing: String { localized("pullRequests.filter.reviewing", "Reviewing") }
  static var authored: String { localized("pullRequests.filter.authored", "Authored") }
  static var other: String { localized("pullRequests.section.other", "Other") }
  static var loading: String { localized("pullRequests.state.loading", "Loading pull requests") }
  static var emptyNoProjects: String {
    localized("pullRequests.state.noProjects", "Add a project to see pull requests.")
  }
  static var empty: String {
    localized("pullRequests.state.empty", "No pull requests found.")
  }
  static var emptyFiltered: String {
    localized("pullRequests.state.emptyFiltered", "No matching pull requests.")
  }
  static var refresh: String { localized("pullRequests.action.refresh", "Refresh") }
  static var search: String {
    localized("pullRequests.action.search", "Search pull requests")
  }
  static var filter: String {
    localized("pullRequests.action.filter", "Filter pull requests")
  }
  static var projects: String { localized("pullRequests.filter.projects", "Projects") }
  static var accounts: String { localized("pullRequests.filter.accounts", "Accounts") }
  static var showAll: String { localized("pullRequests.filter.showAll", "Show all") }
  static var openExternally: String {
    localized("pullRequests.action.openExternally", "Open in Safari")
  }
  static var actions: String { localized("pullRequests.review.actions", "Actions") }
  static var checks: String { localized("pullRequests.review.checks", "Checks") }
  static var conversation: String {
    localized("pullRequests.review.conversation", "Conversation")
  }
  static var description: String {
    localized("pullRequests.review.description", "Description")
  }
  static var commits: String { localized("pullRequests.review.commits", "Commits") }
  static var unavailable: String {
    localized("pullRequests.state.unavailable", "Pair a desktop to see pull requests.")
  }

  static var labels: String { localized("pullRequests.metadata.labels", "Labels") }
  static var editLabels: String { localized("pullRequests.metadata.editLabels", "Edit labels") }
  static var requestReview: String {
    localized("pullRequests.metadata.requestReview", "Request review")
  }
  static var convertToDraft: String {
    localized("pullRequests.metadata.convertToDraft", "Convert to draft")
  }
  static var requestedReviewers: String {
    localized("pullRequests.metadata.requestedReviewers", "Requested reviewers")
  }
  static var suggestedReviewers: String {
    localized("pullRequests.metadata.suggestedReviewers", "Suggested reviewers")
  }
  static var team: String { localized("pullRequests.metadata.team", "Team") }
  static var apply: String { localized("pullRequests.metadata.apply", "Apply") }
  static var searchReviewers: String {
    localized("pullRequests.metadata.searchReviewers", "Search people and teams")
  }
  static var noLabels: String {
    localized("pullRequests.metadata.noLabels", "No labels available.")
  }
  static var noReviewers: String {
    localized("pullRequests.metadata.noReviewers", "No matching reviewers.")
  }
  static var labelsTruncated: String {
    localized("pullRequests.metadata.labelsTruncated", "Only the first labels are listed.")
  }
  static var reviewersTruncated: String {
    localized(
      "pullRequests.metadata.reviewersTruncated",
      "Only the first matches are listed. Refine the search to find others."
    )
  }
  static var timeline: String { localized("pullRequests.timeline.title", "Timeline") }

  static func addReviewer(_ name: String) -> String {
    String(format: localized("pullRequests.metadata.addReviewer", "Add %@"), name)
  }

  static func removeReviewer(_ name: String) -> String {
    String(format: localized("pullRequests.metadata.removeReviewer", "Remove %@"), name)
  }

  static func keepReviewer(_ name: String) -> String {
    String(format: localized("pullRequests.metadata.keepReviewer", "Keep %@"), name)
  }

  static func moreLabels(_ count: Int64) -> String {
    String(format: localized("pullRequests.metadata.moreLabels", "+%lld"), count)
  }

  /// The row text for one timeline event, or nil when the host omitted what the kind needs.
  static func timelineText(_ event: PullRequestTimelineEvent) -> String? {
    switch event.kind {
    case .opened: return localized("pullRequests.timeline.opened", "Opened")
    case .closed: return localized("pullRequests.timeline.closed", "Closed")
    case .reopened: return localized("pullRequests.timeline.reopened", "Reopened")
    case .merged: return localized("pullRequests.timeline.merged", "Merged")
    case .ready: return localized("pullRequests.timeline.ready", "Marked ready for review")
    case .draft: return localized("pullRequests.timeline.draft", "Converted to draft")
    case .forcePushed: return localized("pullRequests.timeline.forcePushed", "Force-pushed")
    case .labeled:
      guard let label = event.label else { return nil }
      return String(format: localized("pullRequests.timeline.labeled", "Added label %@"), label.name)
    case .unlabeled:
      guard let label = event.label else { return nil }
      return String(
        format: localized("pullRequests.timeline.unlabeled", "Removed label %@"), label.name)
    case .reviewRequested:
      guard let reviewer = event.reviewer else { return nil }
      return String(
        format: localized("pullRequests.timeline.reviewRequested", "Requested review from %@"),
        reviewer.displayName
      )
    case .reviewRequestRemoved:
      guard let reviewer = event.reviewer else { return nil }
      return String(
        format: localized(
          "pullRequests.timeline.reviewRequestRemoved", "Removed the review request for %@"),
        reviewer.displayName
      )
    case .baseChanged:
      guard let from = event.fromRef, let to = event.toRef else {
        return localized("pullRequests.timeline.baseChangedPlain", "Changed the base branch")
      }
      return String(
        format: localized("pullRequests.timeline.baseChanged", "Changed base from %1$@ to %2$@"),
        from, to
      )
    case .renamed:
      guard let from = event.fromRef, let to = event.toRef else {
        return localized("pullRequests.timeline.renamedPlain", "Renamed the pull request")
      }
      return String(
        format: localized("pullRequests.timeline.renamed", "Renamed from %1$@ to %2$@"),
        from, to
      )
    case .system: return event.text
    }
  }

  static func projectFailure(_ project: String) -> String {
    String(
      format: localized("pullRequests.projectFailure", "Could not load pull requests for %@."),
      project
    )
  }

  static func additions(_ value: Int64) -> String {
    String(format: localized("pullRequests.additions", "+%lld"), value)
  }

  static func deletions(_ value: Int64) -> String {
    String(format: localized("pullRequests.deletions", "−%lld"), value)
  }

  static func draft(_ title: String) -> String {
    String(format: localized("pullRequests.status.draft", "Draft: %@"), title)
  }

  static func merged(_ title: String) -> String {
    String(format: localized("pullRequests.status.merged", "Merged: %@"), title)
  }

  static func closed(_ title: String) -> String {
    String(format: localized("pullRequests.status.closed", "Closed: %@"), title)
  }

  static func open(_ title: String) -> String {
    String(format: localized("pullRequests.status.open", "Open: %@"), title)
  }

  static func reviewSection(_ section: PullRequestReviewSection) -> String {
    switch section {
    case .overview: GitHubOperationsStrings.summary
    case .files: ProjectWorkspaceStrings.files
    case .checks: checks
    case .conversation: conversation
    case .guide: guideText("Guide")
    }
  }

  static func guideText(_ value: String) -> String {
    localized("pullRequests.parity." + value, value)
  }

  private static func localized(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(
      key,
      tableName: "PullRequests",
      bundle: .main,
      value: fallback,
      comment: ""
    )
  }
}
