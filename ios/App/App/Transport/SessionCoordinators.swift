import CryptoKit
import Foundation

// MARK: - Thread history / live hydration

/// Per-thread, per-workGeneration buffer for runtime envelopes that arrive while
/// HTTP history is in flight. Prevents `loadThreadHistory` from replacing
/// `threadItems` and permanently dropping seq > history.snapshotSeq live events.
struct ThreadHistoryHydrationBuffer: Sendable, Equatable {
    struct Envelope: Sendable, Equatable {
        let seq: Int
        let event: JSONValue
    }

    private(set) var threadId: String?
    private(set) var workGeneration: Int = 0
    private(set) var isAwaitingHistory: Bool = false
    private(set) var buffered: [Envelope] = []

    var isActive: Bool { isAwaitingHistory && threadId != nil }

    /// Begin buffering for a newly opened thread. Discards any prior buffer.
    mutating func begin(threadId: String, workGeneration: Int) {
        self.threadId = threadId
        self.workGeneration = workGeneration
        self.isAwaitingHistory = true
        self.buffered = []
    }

    /// Discard buffer (thread switch, cancel, new pairing, close).
    mutating func discard() {
        threadId = nil
        workGeneration = 0
        isAwaitingHistory = false
        buffered = []
    }

    /// Drop a failed/cancelled open's buffer only when this load still owns it.
    mutating func discardIfMatching(threadId: String, workGeneration: Int) {
        guard isAwaitingHistory,
              self.threadId == threadId,
              self.workGeneration == workGeneration
        else { return }
        discard()
    }

    /// Buffer a seq-tagged runtime envelope while history is in flight.
    /// Returns `true` when the caller must **not** apply the event yet.
    mutating func bufferIfHydrating(
        threadId: String,
        workGeneration: Int,
        seq: Int,
        event: JSONValue
    ) -> Bool {
        guard isAwaitingHistory,
              self.threadId == threadId,
              self.workGeneration == workGeneration
        else { return false }
        buffered.append(Envelope(seq: seq, event: event))
        return true
    }

    /// Atomically end hydration for the matching owner and return envelopes to
    /// replay (seq > snapshotSeq), sorted ascending, exactly once.
    /// Returns `nil` when the buffer owner no longer matches (stale).
    mutating func commitHistory(
        threadId: String,
        workGeneration: Int,
        snapshotSeq: Int
    ) -> [Envelope]? {
        guard isAwaitingHistory,
              self.threadId == threadId,
              self.workGeneration == workGeneration
        else {
            return nil
        }
        let replay = buffered
            .filter { $0.seq > snapshotSeq }
            .sorted { $0.seq < $1.seq }
        isAwaitingHistory = false
        buffered = []
        return replay
    }
}

/// Pure install: HTTP history items + ordered replay of buffered live envelopes.
enum ThreadHistoryHydration {
    static func install(
        historyItems: [PersistedRuntimeItem],
        threadId: String,
        snapshotSeq: Int,
        buffered: [ThreadHistoryHydrationBuffer.Envelope]
    ) -> [PersistedRuntimeItem] {
        var items = historyItems
        let replay = buffered
            .filter { $0.seq > snapshotSeq }
            .sorted { $0.seq < $1.seq }
        for envelope in replay {
            let batches = RuntimeEventReducer.collectRuntimeEvents(from: envelope.event)
            for batch in batches where batch.threadId == threadId {
                RuntimeEventReducer.apply(events: batch.events, to: &items)
            }
        }
        return items
    }
}

// MARK: - Global cursor ownership

/// Global applied-seq cursor rules for shell vs per-thread history.
enum GlobalCursorOwnership {
    /// Ordinary per-thread history must never advance the global cursor.
    static func shouldAdvanceGlobalCursorFromThreadHistory() -> Bool { false }

    /// Resync reconnect baseline is the shell snapshot only (not history.snapshotSeq).
    static func resyncReconnectSeq(shellSnapshotSeq: Int) -> Int {
        max(0, shellSnapshotSeq)
    }
}

// MARK: - Live session / background ownership

/// Pure lifecycle decisions for deferring socket start and rescheduling recovery
/// when scene phase transitions interrupt work.
struct LiveSessionLifecycle: Sendable, Equatable {
    private(set) var isInBackground: Bool = false
    private(set) var pendingLiveStart: Bool = false
    private(set) var pendingUnauthorizedRetry: Bool = false
    private(set) var pendingResyncRetry: Bool = false

    enum SocketStartDecision: Sendable, Equatable {
        /// Create/connect the socket now.
        case startNow
        /// Preserve HTTP state; defer socket until `.active`.
        case deferUntilForeground
    }

    struct ForegroundActions: Sendable, Equatable {
        var startLiveSession: Bool = false
        var rescheduleUnauthorizedRetry: Bool = false
        var rescheduleResync: Bool = false
    }

    mutating func noteEnteredBackground(
        sessionExpired: Bool,
        resyncPending: Bool
    ) {
        isInBackground = true
        if sessionExpired {
            pendingUnauthorizedRetry = true
        }
        if resyncPending {
            pendingResyncRetry = true
        }
    }

    mutating func noteForeground() -> ForegroundActions {
        isInBackground = false
        var actions = ForegroundActions()
        if pendingLiveStart {
            pendingLiveStart = false
            actions.startLiveSession = true
        }
        if pendingUnauthorizedRetry {
            pendingUnauthorizedRetry = false
            actions.rescheduleUnauthorizedRetry = true
        }
        if pendingResyncRetry {
            pendingResyncRetry = false
            actions.rescheduleResync = true
        }
        return actions
    }

    /// `startLiveSession` / `startWebSocket` must consult this before connect.
    mutating func decideSocketStart() -> SocketStartDecision {
        if isInBackground {
            pendingLiveStart = true
            return .deferUntilForeground
        }
        pendingLiveStart = false
        return .startNow
    }

    /// 60s unauthorized floor fired while still backgrounded — park for foreground.
    mutating func noteUnauthorizedRetryFiresWhileBackgrounded() {
        guard isInBackground else { return }
        pendingUnauthorizedRetry = true
    }

    /// Resync schedule attempted while backgrounded — park for foreground.
    mutating func noteResyncRetryBlockedByBackground() {
        guard isInBackground else { return }
        pendingResyncRetry = true
    }

    mutating func clearAllPending() {
        pendingLiveStart = false
        pendingUnauthorizedRetry = false
        pendingResyncRetry = false
    }
}

// MARK: - Stale socket identity

/// Delegate callbacks from a stopped host must not mutate a replacement host.
enum SocketDelegateIdentity {
    enum Decision: Sendable, Equatable {
        case ignoreStaleClient
        /// Active socket matches; use this captured generation (not a later re-read
        /// after a swap).
        case proceed(generation: Int)
    }

    /// Pure identity + generation gate for all `RemoteWebSocketClientDelegate` paths.
    static func decision(
        activeSocketMatches: Bool,
        currentWorkGeneration: Int
    ) -> Decision {
        guard activeSocketMatches else { return .ignoreStaleClient }
        return .proceed(generation: currentWorkGeneration)
    }
}

// MARK: - Pair persistence rollback

/// Transactional pairing write: token then metadata. On metadata failure after
/// token write, roll both stores back (prior pair) or clear partial (no prior).
enum PairPersistenceCoordinator {
    enum RollbackAction: Sendable, Equatable {
        case restorePrior(profile: ConnectionProfile, token: String)
        case clearPartial
    }

    enum WritePhase: Sendable, Equatable {
        case beforeTokenWrite
        case afterTokenWriteBeforeMetadata
        case committed
    }

    static func rollbackAction(
        priorProfile: ConnectionProfile?,
        priorToken: String?
    ) -> RollbackAction {
        if let priorProfile, let priorToken, !priorToken.isEmpty {
            return .restorePrior(profile: priorProfile, token: priorToken)
        }
        return .clearPartial
    }

    /// Whether a failure at `phase` requires store rollback of the new token.
    static func needsStoreRollback(phase: WritePhase) -> Bool {
        phase == .afterTokenWriteBeforeMetadata
    }
}

// MARK: - Deep-link replay / idempotency

/// Process-lifetime fingerprint tracker for one-time pairing candidates.
/// Stores only a non-secret digest — never the token or plain URL.
struct PairingCandidateTracker: Sendable, Equatable {
    private(set) var inFlightDigest: String?
    private(set) var lastSucceededDigest: String?

    enum Decision: Sendable, Equatable {
        case proceed
        case ignoreDuplicate
    }

    /// Non-secret fingerprint of endpoint + credential material.
    static func fingerprint(endpoint: String, credential: String) -> String {
        let material = Data("\(endpoint)\u{1}\(credential)".utf8)
        let digest = SHA256.hash(data: material)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    mutating func decide(digest: String) -> Decision {
        if digest == inFlightDigest { return .ignoreDuplicate }
        if digest == lastSucceededDigest { return .ignoreDuplicate }
        return .proceed
    }

    mutating func markInFlight(_ digest: String) {
        inFlightDigest = digest
    }

    mutating func markSucceeded(_ digest: String) {
        lastSucceededDigest = digest
        if inFlightDigest == digest {
            inFlightDigest = nil
        }
    }

    /// Failure releases in-flight so a network retry of the same candidate can proceed;
    /// does not record success (fresh deliberate token for same host still works).
    mutating func markFailed(_ digest: String) {
        if inFlightDigest == digest {
            inFlightDigest = nil
        }
    }

    mutating func reset() {
        inFlightDigest = nil
        lastSucceededDigest = nil
    }
}

// MARK: - GUI thread list filter

/// Authoritative default for missing `presentationMode` is **terminal**.
/// GUI list/open is an allowlist: only exactly `gui` may use ThreadDetail.
enum ThreadPresentationFilter {
    /// Only this exact (case-insensitive) mode is openable in the GUI shell.
    static let guiPresentationMode = "gui"

    static func isVisibleInGUIList(_ thread: RemoteThread) -> Bool {
        isGUIPresentation(thread.presentationMode)
    }

    /// Programmatic guard for openThread — nil/terminal/other are blocked.
    static func isGUIPresentation(_ presentationMode: String?) -> Bool {
        presentationMode?.lowercased() == guiPresentationMode
    }

    static func visibleThreads(
        from threads: [RemoteThread],
        projectId: String
    ) -> [RemoteThread] {
        threads.filter {
            $0.projectId == projectId
                && !$0.isArchived
                && isVisibleInGUIList($0)
        }
    }
}
