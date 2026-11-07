import Foundation

/// Lifecycle and metadata changes the host reports. Commits, comments, and reviews keep their own
/// sections, and a kind this client does not know is skipped instead of shown raw.
enum PullRequestTimelineKind: String, CaseIterable, Sendable {
  case opened
  case closed
  case reopened
  case merged
  case ready
  case draft
  case labeled
  case unlabeled
  case reviewRequested = "review-requested"
  case reviewRequestRemoved = "review-request-removed"
  case forcePushed = "force-pushed"
  case baseChanged = "base-changed"
  case renamed
  case system

  var symbol: String {
    switch self {
    case .opened: "arrow.triangle.pull"
    case .closed: "xmark.circle"
    case .reopened: "arrow.uturn.backward.circle"
    case .merged: "arrow.triangle.merge"
    case .ready: "checkmark.seal"
    case .draft: "pencil.circle"
    case .labeled, .unlabeled: "tag"
    case .reviewRequested: "person.crop.circle.badge.plus"
    case .reviewRequestRemoved: "person.crop.circle.badge.minus"
    case .forcePushed: "exclamationmark.arrow.triangle.2.circlepath"
    case .baseChanged: "arrow.triangle.branch"
    case .renamed: "pencil"
    case .system: "info.circle"
    }
  }
}

struct PullRequestTimelineEvent: Identifiable, Equatable, Sendable {
  let id: String
  let kind: PullRequestTimelineKind
  let createdAt: String
  let actor: PullRequestReviewAuthor?
  let label: GitHubReviewLabel?
  let reviewer: GitHubReviewerSummary?
  let fromRef: String?
  let toRef: String?
  let text: String?

  /// False when the host omitted the field the kind needs, so there is nothing to show.
  var isDescribable: Bool {
    switch kind {
    case .labeled, .unlabeled: label != nil
    case .reviewRequested, .reviewRequestRemoved: reviewer != nil
    case .system: text?.isEmpty == false
    default: true
    }
  }
}

enum PullRequestTimelineProjection {
  /// Absent on hosts that predate the timeline. Unknown kinds and rows missing what their kind
  /// needs are dropped; a repeated id keeps its first row.
  static func events(_ value: GitHubJSONValue?) -> [PullRequestTimelineEvent] {
    var seen = Set<String>()
    return (value?.arrayValue ?? []).compactMap { raw in
      guard let object = raw.objectValue,
        let id = object["id"]?.stringValue, !id.isEmpty,
        let rawKind = object["kind"]?.stringValue,
        let kind = PullRequestTimelineKind(rawValue: rawKind),
        let createdAt = object["createdAt"]?.stringValue
      else { return nil }
      let event = PullRequestTimelineEvent(
        id: id,
        kind: kind,
        createdAt: createdAt,
        actor: eventActor(object["actor"]),
        label: object["label"].flatMap { GitHubResultProjection.labels(GitHubJSONValue.array([$0])).first },
        reviewer: object["reviewer"].flatMap {
          GitHubResultProjection.reviewers(GitHubJSONValue.array([$0])).first
        },
        fromRef: object["fromRef"]?.stringValue,
        toRef: object["toRef"]?.stringValue,
        text: object["text"]?.stringValue
      )
      guard event.isDescribable, seen.insert(id).inserted else { return nil }
      return event
    }
  }

  private static func eventActor(_ value: GitHubJSONValue?) -> PullRequestReviewAuthor? {
    guard let object = value?.objectValue, let login = object["login"]?.stringValue, !login.isEmpty
    else { return nil }
    return PullRequestReviewAuthor(login: login, avatarURL: object["avatarUrl"]?.stringValue)
  }
}

enum PullRequestTimelineTime {
  static func parse(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  /// A localized relative time such as "2 hr. ago", or nil when the host sent an unreadable value.
  static func relative(_ value: String, now: Date = Date()) -> String? {
    guard let date = parse(value) else { return nil }
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return formatter.localizedString(for: date, relativeTo: now)
  }
}

enum PullRequestLabelEdit {
  /// The host rejects a change that names more labels than this on either side.
  static let maximumChanges = 50

  /// The add and remove lists that turn the labels now on the review into `selected`.
  static func delta(current: [String], selected: Set<String>) -> (add: [String], remove: [String]) {
    let existing = Set(current)
    return (selected.subtracting(existing).sorted(), existing.subtracting(selected).sorted())
  }
}

/// Review-request changes staged in the reviewer sheet and sent as one add/remove pair.
struct PullRequestReviewerEdit: Equatable, Sendable {
  /// The host rejects a change that names more reviewers than this on either side.
  static let maximumChanges = 25
  static let maximumQueryLength = 200

  private(set) var added: [GitHubReviewerSummary] = []
  private(set) var removed: [GitHubReviewerSummary] = []

  var isEmpty: Bool { added.isEmpty && removed.isEmpty }
  var isWithinLimits: Bool {
    added.count <= Self.maximumChanges && removed.count <= Self.maximumChanges
  }

  func isAdded(_ reviewer: GitHubReviewerSummary) -> Bool {
    added.contains { $0.id == reviewer.id }
  }

  func isRemoved(_ reviewer: GitHubReviewerSummary) -> Bool {
    removed.contains { $0.id == reviewer.id }
  }

  mutating func toggleAdded(_ reviewer: GitHubReviewerSummary) {
    if isAdded(reviewer) {
      added.removeAll { $0.id == reviewer.id }
    } else {
      added.append(reviewer)
    }
  }

  mutating func toggleRemoved(_ reviewer: GitHubReviewerSummary) {
    if isRemoved(reviewer) {
      removed.removeAll { $0.id == reviewer.id }
    } else {
      removed.append(reviewer)
    }
  }

  /// The search text sent to the host: trimmed and cut on a character boundary so it stays within
  /// the wire limit, which counts UTF-16 code units.
  static func boundedQuery(_ value: String) -> String {
    var result = ""
    for character in value.trimmingCharacters(in: .whitespacesAndNewlines) {
      let piece = String(character)
      if result.utf16.count + piece.utf16.count > maximumQueryLength { break }
      result.append(piece)
    }
    return result
  }
}
