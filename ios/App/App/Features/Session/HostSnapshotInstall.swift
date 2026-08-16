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
  }

  private(set) var isActive = false
  private(set) var installGeneration: UInt64 = 0
  private(set) var buffered: [Envelope] = []

  mutating func begin(installGeneration: UInt64) {
    self.isActive = true
    self.installGeneration = installGeneration
    self.buffered = []
  }

  mutating func discard() {
    isActive = false
    installGeneration = 0
    buffered = []
  }

  /// Returns true when the caller must not apply the event yet.
  mutating func bufferIfInstalling(
    installGeneration: UInt64,
    seq: Int,
    event: SequencedReplayEvent
  ) -> Bool {
    guard isActive, self.installGeneration == installGeneration else { return false }
    buffered.append(Envelope(seq: seq, event: event))
    return true
  }

  /// Ends buffering for the matching owner and returns its envelopes exactly
  /// once. `nil` when a newer install already owns the buffer.
  mutating func take(installGeneration: UInt64) -> [Envelope]? {
    guard isActive, self.installGeneration == installGeneration else { return nil }
    let envelopes = buffered
    isActive = false
    buffered = []
    return envelopes
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
