import Foundation

/// Fully decoded replay/Git state for one authoritative shell snapshot, ready to
/// be committed as a single state replacement.
///
/// Nothing here touches session state: decoding happens first, so a malformed
/// additive field aborts the install before any partial value or advanced cursor
/// becomes observable.
struct PreparedReplayInstall: Sendable, Equatable {
  var replay: HostReplayState
  var snapshotSeq: Int
}

/// Buffers sequenced replay events that arrive while an authoritative snapshot
/// (initial connect or resync) is being fetched and committed.
///
/// Without this, a frame delivered between "snapshot fetched" and "snapshot
/// committed" would either be applied to state that is about to be replaced or
/// be dropped entirely, silently losing a transition.
struct ReplayInstallBuffer: Sendable, Equatable {
  struct Envelope: Sendable, Equatable {
    let seq: Int
    let event: SequencedReplayEvent
    let byteCount: Int
    /// Monotonic arrival; shares its base with `RecoveryClock`.
    let receivedAtMilliseconds: Int64
  }

  /// Outcome of consuming the boundary for one matching install generation.
  /// `coverageLost` covers every eviction, including frames dropped for expiry
  /// at take.
  struct Take: Sendable, Equatable {
    let envelopes: [Envelope]
    let coverageLost: Bool
  }

  private(set) var isActive = false
  private(set) var installGeneration: UInt64 = 0
  private(set) var buffered: [Envelope] = []
  private var ledger: RecoveryBufferLedger

  init(budget: RecoveryBufferBudget = .replayInstallEnvelopes) {
    ledger = RecoveryBufferLedger(budget: budget)
  }

  /// An eviction dropped replay coverage; the boundary replay is incomplete
  /// and the commit must demand a resync (WS7 P1-14).
  var overflowed: Bool { ledger.overflowed }

  /// Retained estimated payload bytes (accounting; exposed for tests).
  var retainedBytes: Int { ledger.retainedBytes }

  mutating func begin(installGeneration: UInt64) {
    self.isActive = true
    self.installGeneration = installGeneration
    self.buffered = []
    ledger.reset()
  }

  mutating func discard() {
    isActive = false
    installGeneration = 0
    buffered = []
    ledger.reset()
  }

  /// Returns true when the caller must not apply the event yet.
  ///
  /// `estimatedByteCount` is the raw wire frame's conservative encoded-size
  /// estimate, computed once by the caller from the payload it already holds;
  /// the buffer never re-serializes for accounting. `receivedAtMilliseconds`
  /// is the monotonic arrival and doubles as the append-time age clock.
  mutating func bufferIfInstalling(
    installGeneration: UInt64,
    seq: Int,
    event: SequencedReplayEvent,
    estimatedByteCount: Int,
    receivedAtMilliseconds: Int64 = RecoveryClock.nowMilliseconds()
  ) -> Bool {
    guard isActive, self.installGeneration == installGeneration else { return false }
    let envelope = Envelope(
      seq: seq,
      event: event,
      byteCount: max(0, estimatedByteCount),
      receivedAtMilliseconds: receivedAtMilliseconds
    )
    buffered.append(envelope)
    ledger.recordRetained(bytes: envelope.byteCount)
    evictOverflowingHead(nowMilliseconds: receivedAtMilliseconds)
    return true
  }

  /// Oldest-first eviction once any budget bound is exceeded. Every dropped
  /// envelope (including a single oversized newest one) loses coverage.
  private mutating func evictOverflowingHead(nowMilliseconds: Int64) {
    while let head = buffered.first,
          ledger.mustEvictHead(
            retainedCount: buffered.count,
            oldestArrivalMilliseconds: head.receivedAtMilliseconds,
            nowMilliseconds: nowMilliseconds
          ) {
      buffered.removeFirst()
      ledger.recordDropped(bytes: head.byteCount)
    }
  }

  /// Drops every retained envelope that outlived the age budget. A hung or
  /// quiet snapshot fetch lands here at take and loses coverage rather than
  /// replaying an arbitrarily stale frame.
  private mutating func dropExpired(nowMilliseconds: Int64) {
    while let head = buffered.first,
          ledger.isExpired(
            arrivalMilliseconds: head.receivedAtMilliseconds,
            nowMilliseconds: nowMilliseconds
          ) {
      buffered.removeFirst()
      ledger.recordDropped(bytes: head.byteCount)
    }
  }

  /// Ends buffering for the matching owner and returns its envelopes exactly
  /// once. Expired envelopes are dropped first and reported through
  /// `coverageLost`. `nil` when a newer install already owns the buffer.
  mutating func take(
    installGeneration: UInt64,
    nowMilliseconds: Int64 = RecoveryClock.nowMilliseconds()
  ) -> Take? {
    guard isActive, self.installGeneration == installGeneration else { return nil }
    dropExpired(nowMilliseconds: nowMilliseconds)
    let take = Take(envelopes: buffered, coverageLost: ledger.overflowed)
    isActive = false
    buffered = []
    ledger.reset()
    return take
  }
}

enum HostSnapshotInstall {
  /// Result of committing a prepared install plus its boundary replay buffer.
  struct Commit: Sendable, Equatable {
    var replay: HostReplayState
    /// Applied cursor after the contiguous boundary replay.
    var cursor: Int
    /// A buffered frame was non-contiguous; the caller must request one resync.
    var requiresResync: Bool
    var appliedBoundaryEvents: Int
  }

  /// Decodes the additive shell-snapshot Git fields over the existing per-host
  /// cache. Throws `RemoteClientError.invalidResponse` on a malformed field.
  static func prepare(
    shell: RemoteShellSnapshot,
    existing: HostReplayState
  ) throws -> PreparedReplayInstall {
    var replay = existing
    replay.installSnapshotGitState(
      summaries: try shell.decodedGitSummaries(),
      gitState: try shell.decodedGitState()
    )
    return PreparedReplayInstall(replay: replay, snapshotSeq: shell.snapshotSeq)
  }

  /// B4 bounded shell page 1. The page's `gitSummariesByThread` is sliced to
  /// the page, so it is merged into the cache (page entries win) instead of
  /// replacing it; an absent field still leaves the cache alone and the full
  /// `gitState` (when present) installs unchanged.
  static func prepareMergingGitSummaries(
    shell: RemoteShellSnapshot,
    existing: HostReplayState
  ) throws -> PreparedReplayInstall {
    var replay = existing
    var merged = replay.gitSummariesByThread
    if let page = try shell.decodedGitSummaries() {
      for (threadId, summary) in page { merged[threadId] = summary }
    }
    replay.installSnapshotGitState(
      summaries: merged,
      gitState: try shell.decodedGitState()
    )
    return PreparedReplayInstall(replay: replay, snapshotSeq: shell.snapshotSeq)
  }

  /// Applies the boundary buffer onto a prepared install.
  ///
  /// Contiguity rules match the live cursor exactly: duplicates at or below the
  /// snapshot seq are dropped, contiguous frames apply and advance the cursor,
  /// and the first gap stops the replay and demands a resync — the cursor never
  /// advances past a gap.
  static func commit(
    _ prepared: PreparedReplayInstall,
    boundary: [ReplayInstallBuffer.Envelope],
    generation: ReplayEventApplier.GenerationMinting = ReplayEventApplier.liveGeneration
  ) -> Commit {
    var replay = prepared.replay
    var cursor = prepared.snapshotSeq
    var applied = 0
    var requiresResync = false
    for envelope in boundary.sorted(by: { $0.seq < $1.seq }) {
      if envelope.seq <= cursor { continue }
      guard envelope.seq == cursor + 1 else {
        requiresResync = true
        break
      }
      ReplayEventApplier.apply(envelope.event, to: &replay, generation: generation)
      cursor = envelope.seq
      applied += 1
    }
    return Commit(
      replay: replay,
      cursor: cursor,
      requiresResync: requiresResync,
      appliedBoundaryEvents: applied
    )
  }
}
