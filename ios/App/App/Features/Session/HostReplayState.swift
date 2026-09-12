import Foundation

/// Per-thread state the lifecycle replay events mutate.
///
/// `thread-reset` clears the transcript and the pending steer id but *keeps* the
/// terminal watch intent, rebaselining it against a fresh PTY generation.
/// `thread-exited` keeps the transcript and the watch intent (with its existing
/// baseline) and only clears the pending steer id.
struct ReplayThreadState: Sendable, Equatable {
  var transcript: String = ""
  var pendingSteerId: String?
  var terminalWatchIntent: Bool = false
  var terminalBaselineGeneration: String = ""
  var terminalOutputLength: Int = 0
}

/// Insertion-ordered agent-status map keyed by `kind|envKind|envDistro`.
///
/// The desktop slice stores these in a `Map`, so identity order is observable
/// (first-seen wins) and re-detecting an identity replaces the value in place.
struct OrderedAgentStatusMap: Sendable, Equatable {
  private(set) var identities: [String] = []
  private(set) var records: [String: AgentStatusRecord] = [:]

  var isEmpty: Bool { identities.isEmpty }
  var ordered: [AgentStatusRecord] { identities.compactMap { records[$0] } }

  subscript(identity: String) -> AgentStatusRecord? { records[identity] }

  mutating func upsert(_ record: AgentStatusRecord) {
    let identity = record.identity
    if records.updateValue(record, forKey: identity) == nil {
      identities.append(identity)
    }
  }

  mutating func removeAll() {
    identities = []
    records = [:]
  }
}

/// All replayable state cached for one exact host/connection identity.
///
/// Never shared across `ClientConnectionID`s: the pool stores one value per
/// slot, so a thread id that collides between two hosts cannot leak.
struct HostReplayState: Sendable, Equatable {
  var agentStatuses = OrderedAgentStatusMap()
  var windowsAgentStatuses: [AgentStatusRecord] = []
  var wslAgentStatuses: [AgentStatusRecord] = []
  /// Explicit-empty lists are meaningful, so "loaded" is tracked separately.
  var windowsStatusesLoaded = false
  var wslStatusesLoaded = false
  /// Reducer-owned ordering metadata lets consumers ignore an incremental patch
  /// that predates a newer full environment replacement.
  var agentStatusRevision: UInt64 = 0
  var agentStatusRevisionByIdentity: [String: UInt64] = [:]
  var windowsStatusesRevision: UInt64 = 0
  var wslStatusesRevision: UInt64 = 0
  /// Full replacement per `remote-git-summaries` event.
  var gitSummariesByThread: [String: GitThreadSummary] = [:]
  var gitState: GitStateSnapshot = .empty
  var threads: [String: ReplayThreadState] = [:]

  var isEmpty: Bool { self == HostReplayState() }

  func summary(forThread threadId: String) -> GitThreadSummary? {
    gitSummariesByThread[threadId]
  }

  /// Cached target state for a thread's worktree, when the host published one.
  func targetState(hostId: String, projectId: String, worktreePath: String?) -> GitTargetState? {
    gitState.targets[
      GitStateKeys.target(
        GitTargetRef(hostId: hostId, projectId: projectId, worktreePath: worktreePath)
      )
    ]
  }

  func pullRequestState(hostId: String, projectId: String, prNumber: Int) -> PullRequestState? {
    gitState.pullRequests[
      GitStateKeys.pullRequest(
        PullRequestRef(hostId: hostId, projectId: projectId, prNumber: prNumber)
      )
    ]
  }

  /// Installs the additive shell-snapshot Git fields. Absent fields leave the
  /// corresponding cache alone so older hosts do not clear live state.
  mutating func installSnapshotGitState(
    summaries: [String: GitThreadSummary]?,
    gitState newState: GitStateSnapshot?
  ) {
    if let summaries { gitSummariesByThread = summaries }
    if let newState { gitState = newState }
  }
}

/// Applies the seven sequenced replay events to a `HostReplayState`.
///
/// Every transition mutates a working copy; the caller commits it only after the
/// mutation succeeds and *then* advances the event cursor.
enum ReplayEventApplier {
  /// Mints the PTY baseline generation a `thread-reset` rebaselines against.
  /// Production passes a fresh UUID; tests inject a deterministic value.
  typealias GenerationMinting = @Sendable (String) -> String

  static func liveGeneration(_ threadId: String) -> String {
    "\(threadId)#\(UUID().uuidString)"
  }

  static func apply(
    _ event: SequencedReplayEvent,
    to state: inout HostReplayState,
    generation: GenerationMinting = liveGeneration
  ) {
    switch event {
    case .threadReset(let threadId):
      var thread = state.threads[threadId] ?? ReplayThreadState()
      thread.transcript = ""
      thread.pendingSteerId = nil
      // Watch intent survives a restart; the baseline must not.
      thread.terminalBaselineGeneration = generation(threadId)
      thread.terminalOutputLength = 0
      state.threads[threadId] = thread

    case .threadExited(let threadId, _):
      guard var thread = state.threads[threadId] else {
        state.threads[threadId] = ReplayThreadState()
        return
      }
      thread.pendingSteerId = nil
      state.threads[threadId] = thread

    case .agentStatusUpdated(let record):
      state.agentStatusRevision &+= 1
      state.agentStatuses.upsert(record)
      state.agentStatusRevisionByIdentity[record.identity] = state.agentStatusRevision

    case .windowsAgentStatuses(let statuses):
      state.agentStatusRevision &+= 1
      state.windowsAgentStatuses = statuses
      state.windowsStatusesLoaded = true
      state.windowsStatusesRevision = state.agentStatusRevision

    case .wslAgentStatuses(let statuses):
      state.agentStatusRevision &+= 1
      state.wslAgentStatuses = statuses
      state.wslStatusesLoaded = true
      state.wslStatusesRevision = state.agentStatusRevision

    case .remoteGitSummaries(let summaries):
      // Full replacement — previously present thread keys disappear.
      state.gitSummariesByThread = summaries

    case .remoteGitState(let patch):
      state.gitState = state.gitState.applying(patch)
    }
  }
}
