import Foundation

/// Thread shape the passive target policy consumes.
struct GitInterestThread: Sendable, Equatable {
  var id: String
  var projectId: String
  var worktreePath: String?
  var status: String
  var archived: Bool
  var updatedAt: String
}

/// Bounded passive Git-target interest policy.
///
/// Port of `buildRemoteGitTargetInterests` (`src/shared/gitStateInterestPolicy.ts`).
/// The resulting order is meaningful — selection first, then live turns by
/// recency — so callers must never re-sort it.
enum GitStateInterestPolicy {
  static let maxRemoteGitTargetInterests = 4

  /// `isThreadTurnActive` (`src/shared/contracts/common.ts`).
  static let activeTurnStatuses: Set<String> = [
    "launching", "working", "needs_approval", "needs_reply",
  ]

  static func isTurnActive(_ status: String) -> Bool {
    activeTurnStatuses.contains(status)
  }

  static func targetInterests(
    threads: [GitInterestThread],
    selectedThreadId: String? = nil,
    includeRecentFallback: Bool = false,
    limit: Int? = nil
  ) -> [GitStateInterest] {
    let bound = max(0, limit ?? maxRemoteGitTargetInterests)
    guard bound > 0 else { return [] }

    // Stable descending sort on `updatedAt`, matching the authority's stable
    // `Array.prototype.sort` so equal timestamps keep host list order.
    let available = threads
      .filter { !$0.archived }
      .enumerated()
      .sorted { left, right in
        if left.element.updatedAt == right.element.updatedAt {
          return left.offset < right.offset
        }
        return left.element.updatedAt > right.element.updatedAt
      }
      .map(\.element)

    let selected = selectedThreadId.flatMap { id in available.first { $0.id == id } }
    let active = available.filter { $0.id != selected?.id && isTurnActive($0.status) }
    let recent =
      includeRecentFallback
      ? available.filter { thread in
        thread.id != selected?.id && !active.contains { $0.id == thread.id }
      }
      : []
    let candidates = (selected.map { [$0] } ?? []) + active + recent

    var interests: [GitStateInterest] = []
    var seen: Set<String> = []
    for thread in candidates {
      let key = GitStateKeys.interestTarget(
        projectId: thread.projectId, worktreePath: thread.worktreePath
      )
      if seen.contains(key) { continue }
      seen.insert(key)
      interests.append(
        .target(
          projectId: thread.projectId,
          // Empty worktree paths collapse to "primary worktree" (absent).
          worktreePath: (thread.worktreePath?.isEmpty ?? true) ? nil : thread.worktreePath,
          includePrDetails: true
        )
      )
      if interests.count >= bound { break }
    }
    return interests
  }

  /// Composes the full interest set: the bounded passive targets followed by the
  /// explicit UI interests. Heavy review bundles stay explicit — a passive target
  /// sweep never requests one.
  static func compose(
    passiveTargets: [GitStateInterest],
    explicit: [GitStateInterest]
  ) -> [GitStateInterest] {
    var result = passiveTargets.filter { !$0.requestsReviewBundle }
    for interest in explicit where !result.contains(interest) {
      result.append(interest)
    }
    return result
  }
}
