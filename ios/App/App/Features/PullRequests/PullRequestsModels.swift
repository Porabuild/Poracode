import Foundation

/// One pull-request row on the top-level Pull requests page, combining the
/// wire summary with the project it came from.
struct PullRequestsEntry: Identifiable, Equatable, Sendable {
  let project: RemoteProject
  let summary: GitHubPullRequestSummary
  let viewerLogin: String?

  var id: String { "\(repository)#\(summary.number)" }
  var projectName: String { project.name }
  var repository: String { summary.repository ?? project.name }
  var updatedAt: Date? {
    summary.updatedAt.flatMap { PullRequestsEntry.parseDate($0) }
  }

  private static func parseDate(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }
}

struct PullRequestReviewRoute: Hashable, Sendable {
  let number: Int64
  let title: String
  let url: String?
  let headBranch: String?
  let state: String
  let isDraft: Bool
  let location: GitHubProjectLocation

  init(entry: PullRequestsEntry) {
    number = entry.summary.number
    title = entry.summary.title
    url = entry.summary.url
    headBranch = entry.summary.headBranch
    state = entry.summary.state
    isDraft = entry.summary.isDraft
    location = GitHubProjectLocation(entry.project.location)
  }
}

enum PullRequestsCategory: String, CaseIterable, Identifiable, Sendable {
  case all
  case reviewing
  case authored

  var id: Self { self }

  var title: String {
    switch self {
    case .all: PullRequestsStrings.all
    case .reviewing: PullRequestsStrings.reviewing
    case .authored: PullRequestsStrings.authored
    }
  }
}

/// Display grouping mirroring the mobile web list: All mode groups rows under
/// Reviewing / Authored / Other headers; a specific filter shows a flat list.
enum PullRequestsGroup: String, CaseIterable, Identifiable, Sendable {
  case reviewing
  case authored
  case other

  var id: Self { self }

  var title: String {
    switch self {
    case .reviewing: PullRequestsStrings.reviewing
    case .authored: PullRequestsStrings.authored
    case .other: PullRequestsStrings.other
    }
  }
}

enum PullRequestsPresentation {
  static func group(for entry: PullRequestsEntry) -> PullRequestsGroup {
    if entry.summary.reviewRequested == true {
      return .reviewing
    }
    if entry.summary.viewerDidAuthor == true {
      return .authored
    }
    return .other
  }

  static func matches(_ entry: PullRequestsEntry, category: PullRequestsCategory) -> Bool {
    switch category {
    case .all: true
    case .reviewing: entry.summary.reviewRequested == true
    case .authored: entry.summary.viewerDidAuthor == true
    }
  }

  static func matches(_ entry: PullRequestsEntry, query: String) -> Bool {
    let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return true }
    return [
      entry.summary.title,
      entry.repository,
      entry.summary.headBranch ?? "",
      entry.summary.authorLogin ?? "",
      entry.project.name,
      String(entry.summary.number),
    ].contains { $0.localizedCaseInsensitiveContains(value) }
  }

  /// Sorted by most recent update, then repository and number for stability.
  static func sorted(_ entries: [PullRequestsEntry]) -> [PullRequestsEntry] {
    entries.sorted { lhs, rhs in
      let lhsDate = lhs.updatedAt ?? .distantPast
      let rhsDate = rhs.updatedAt ?? .distantPast
      if lhsDate != rhsDate { return lhsDate > rhsDate }
      if lhs.repository != rhs.repository {
        return lhs.repository.localizedCaseInsensitiveCompare(rhs.repository) == .orderedAscending
      }
      return lhs.summary.number < rhs.summary.number
    }
  }

  /// Two checkouts of the same repository return identical PR rows; keep one.
  static func deduplicated(_ entries: [PullRequestsEntry]) -> [PullRequestsEntry] {
    var seen = Set<String>()
    return entries.filter { seen.insert($0.id).inserted }
  }
}
