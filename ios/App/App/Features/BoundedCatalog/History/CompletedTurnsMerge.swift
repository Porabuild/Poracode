import Foundation

/// Completed-turn merge rules shared by the bounded history reads.
///
/// Identity is `(startedAt, endedAt)` — mirroring the host's
/// `dbAppendThreadCompletedTurn` dedupe and deliberately excluding
/// `anchorItemId`, which is renumbered by truncation and snapshot replacement
/// and therefore cannot be an identity. Anchorless turns survive every merge.
enum CompletedTurnsMerge {
  struct Identity: Hashable {
    var startedAtMilliseconds: Int64
    var endedAtMilliseconds: Int64
  }

  static func identity(_ turn: RichCompletedTurn) -> Identity {
    Identity(
      startedAtMilliseconds: turn.startedAtMilliseconds,
      endedAtMilliseconds: turn.endedAtMilliseconds
    )
  }

  /// Decodes one bounded `thread-turns` page into the transcript's turn model.
  /// Unparsable timestamps reject the whole page rather than installing turns
  /// with a fabricated identity.
  static func decode(_ turns: [RemoteBoundedCompletedTurn]) throws -> [RichCompletedTurn] {
    try turns.map { turn in
      guard let started = RichTimeline.epochMilliseconds(turn.startedAt),
        let ended = RichTimeline.epochMilliseconds(turn.endedAt)
      else { throw RichDomainDecodeError.invalidRuntimeItem }
      return RichCompletedTurn(
        startedAtMilliseconds: started,
        endedAtMilliseconds: ended,
        anchorItemID: turn.anchorItemId
      )
    }
  }

  /// An authoritative tail is authoritative inside its own window and keeps
  /// turns strictly older than that window (loaded through `ct1.` pages), by
  /// `(startedAt, endedAt)` identity. A turn that was inside the previous
  /// window but is not in the new tail is dropped — the host removed it. An
  /// empty tail means the host reports no completed turns.
  static func mergeTail(
    existing: [RichCompletedTurn],
    tail: [RichCompletedTurn]
  ) -> [RichCompletedTurn] {
    guard let oldestTail = tail.map(\.startedAtMilliseconds).min() else { return [] }
    var byIdentity: [Identity: RichCompletedTurn] = [:]
    for turn in existing where turn.startedAtMilliseconds < oldestTail {
      byIdentity[identity(turn)] = turn
    }
    for turn in tail { byIdentity[identity(turn)] = turn }
    return byIdentity.values.sorted(by: chronological)
  }

  /// An authoritative COMPLETE tail (`completedTurnsNextCursor == nil`) is the
  /// host's full remaining turn set: it replaces the retained level, so turns
  /// the host removed (reverted/truncated) cannot survive a reload. Only a
  /// partial tail keeps older `ct1.` pages. Mirrors the renderer's
  /// `mergeBoundedTailTurns` rule.
  static func replaceTail(tail: [RichCompletedTurn]) -> [RichCompletedTurn] {
    var byIdentity: [Identity: RichCompletedTurn] = [:]
    for turn in tail { byIdentity[identity(turn)] = turn }
    return byIdentity.values.sorted(by: chronological)
  }

  /// Older pages append only identities not already loaded, so repeated or
  /// overlapping pages are idempotent.
  static func mergeOlder(
    existing: [RichCompletedTurn],
    older: [RichCompletedTurn]
  ) -> [RichCompletedTurn] {
    var byIdentity: [Identity: RichCompletedTurn] = [:]
    for turn in existing { byIdentity[identity(turn)] = turn }
    for turn in older where byIdentity[identity(turn)] == nil {
      byIdentity[identity(turn)] = turn
    }
    return byIdentity.values.sorted(by: chronological)
  }

  private static func chronological(
    _ lhs: RichCompletedTurn,
    _ rhs: RichCompletedTurn
  ) -> Bool {
    if lhs.startedAtMilliseconds != rhs.startedAtMilliseconds {
      return lhs.startedAtMilliseconds < rhs.startedAtMilliseconds
    }
    if lhs.endedAtMilliseconds != rhs.endedAtMilliseconds {
      return lhs.endedAtMilliseconds < rhs.endedAtMilliseconds
    }
    return (lhs.anchorItemID ?? "") < (rhs.anchorItemID ?? "")
  }
}
