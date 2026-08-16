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
  static var openExternally: String {
    localized("pullRequests.action.openExternally", "Open in Safari")
  }
  static var unavailable: String {
    localized("pullRequests.state.unavailable", "Pair a desktop to see pull requests.")
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
