import Foundation

/// Identity captured when an authoritative install begins. Re-read and compared
/// immediately before the commit so a snapshot fetched for host/socket/thread A
/// can never be written into B.
struct ReplayInstallIdentity: Sendable, Equatable {
  var workGeneration: Int
  var apiEndpoint: String?
  var socketObjectID: ObjectIdentifier?
  var openThreadId: String?
  var openThreadEpoch: Int
  var installGeneration: UInt64
}

enum ReplayInstallDecision: Sendable, Equatable {
  case commit
  /// A newer generation / different host / different socket owns the session now.
  case abortStale
  /// Explicit cancellation. Not a network error: never schedules a retry.
  case abortCancelled
  /// Backgrounded mid-install. The install is abandoned; foreground recovers once.
  case abortBackground
}

enum ReplayInstallPolicy {
  static func decision(
    captured: ReplayInstallIdentity,
    current: ReplayInstallIdentity,
    isCancelled: Bool,
    isInBackground: Bool
  ) -> ReplayInstallDecision {
    if isCancelled { return .abortCancelled }
    if isInBackground { return .abortBackground }
    guard captured.installGeneration == current.installGeneration else { return .abortStale }
    guard captured.workGeneration == current.workGeneration else { return .abortStale }
    guard captured.apiEndpoint == current.apiEndpoint else { return .abortStale }
    guard captured.socketObjectID == current.socketObjectID else { return .abortStale }
    guard captured.openThreadId == current.openThreadId,
      captured.openThreadEpoch == current.openThreadEpoch
    else { return .abortStale }
    return .commit
  }
}

@MainActor
extension AppSession {
  /// Opens the boundary buffer for one authoritative install and captures the
  /// identity the commit must still match.
  func beginReplayInstall(apiEndpoint: String?) -> ReplayInstallIdentity {
    state.replayInstallGeneration &+= 1
    let generation = state.replayInstallGeneration
    state.replayInstallBuffer.begin(installGeneration: generation)
    return replayInstallIdentity(apiEndpoint: apiEndpoint, installGeneration: generation)
  }

  func replayInstallIdentity(
    apiEndpoint: String?,
    installGeneration: UInt64
  ) -> ReplayInstallIdentity {
    ReplayInstallIdentity(
      workGeneration: state.workGeneration,
      apiEndpoint: apiEndpoint,
      socketObjectID: state.webSocket.map { ObjectIdentifier($0 as AnyObject) },
      openThreadId: state.openThreadId,
      openThreadEpoch: state.openThreadEpoch,
      installGeneration: installGeneration
    )
  }

  /// Abandons an install without exposing partial state or advancing the cursor.
  func abortReplayInstall(_ captured: ReplayInstallIdentity) {
    guard state.replayInstallGeneration == captured.installGeneration else { return }
    // Frames whose cursor already advanced were only held in the buffer; dropping
    // them requires one authoritative recovery rather than silent state loss.
    if !state.replayInstallBuffer.buffered.isEmpty {
      state.needsAuthoritativeRefresh = true
    }
    state.replayInstallBuffer.discard()
  }

  /// Commits a prepared install as one state replacement.
  ///
  /// Returns the commit result when it happened, or `nil` when the install was
  /// aborted. On abort nothing is mutated: no snapshot, no replay state, no cursor.
  @discardableResult
  func commitReplayInstall(
    _ prepared: PreparedReplayInstall,
    shell: RemoteShellSnapshot,
    captured: ReplayInstallIdentity,
    currentAPIEndpoint: String?,
    advanceCursor: Bool,
    isCancelled: Bool,
    generation minting: ReplayEventApplier.GenerationMinting = ReplayEventApplier.liveGeneration
  ) -> HostSnapshotInstall.Commit? {
    let decision = ReplayInstallPolicy.decision(
      captured: captured,
      current: replayInstallIdentity(
        apiEndpoint: currentAPIEndpoint,
        installGeneration: state.replayInstallGeneration
      ),
      isCancelled: isCancelled,
      isInBackground: state.liveLifecycle.isInBackground
    )
    guard decision == .commit else {
      abortReplayInstall(captured)
      return nil
    }
    guard let boundary = state.replayInstallBuffer.take(
      installGeneration: captured.installGeneration
    ) else {
      return nil
    }
    let commit = HostSnapshotInstall.commit(prepared, boundary: boundary, generation: minting)
    // Single transactional replacement.
    state.snapshot = shell
    state.replay = commit.replay
    if advanceCursor {
      state.lastSeenSeq = max(state.lastSeenSeq, commit.cursor)
    }
    if shell.projects.isEmpty && shell.threads.isEmpty {
      state.projectsLoadState = .empty
    } else {
      state.projectsLoadState = .loaded
    }
    return commit
  }

  /// Buffers a decoded replay event while an install is in flight.
  /// Returns true when the caller must not apply it yet.
  func bufferReplayEventDuringInstall(seq: Int, event: SequencedReplayEvent) -> Bool {
    state.replayInstallBuffer.bufferIfInstalling(
      installGeneration: state.replayInstallGeneration,
      seq: seq,
      event: event
    )
  }

  /// Cached authoritative Git summary for a thread on the selected host.
  func gitSummary(forThread threadId: String) -> GitThreadSummary? {
    guard state.canRead, state.phase == .ready else { return nil }
    return state.replay.summary(forThread: threadId)
  }

  /// Installed agent statuses for the selected host, in first-seen identity order.
  var mergedAgentStatuses: [AgentStatusRecord] {
    state.replay.agentStatuses.ordered
  }
}
