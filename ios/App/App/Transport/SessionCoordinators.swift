import Foundation

// MARK: - Global cursor ownership

/// Global applied-seq cursor rules for shell vs per-thread history.
enum GlobalCursorOwnership {
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

// MARK: - Native thread presentation filter

/// Authoritative default for missing `presentationMode` is **terminal**.
/// Native lists expose the two presentation surfaces iOS implements and hide
/// unknown future modes until a matching destination exists.
enum ThreadPresentationFilter {
    static let guiPresentationMode = "gui"
    static let terminalPresentationMode = "terminal"

    static func isVisibleInNativeList(_ thread: RemoteThread) -> Bool {
        isNativePresentation(thread.presentationMode)
    }

    static func isGUIPresentation(_ presentationMode: String?) -> Bool {
        resolvedPresentationMode(presentationMode) == guiPresentationMode
    }

    static func isTerminalPresentation(_ presentationMode: String?) -> Bool {
        resolvedPresentationMode(presentationMode) == terminalPresentationMode
    }

    static func isNativePresentation(_ presentationMode: String?) -> Bool {
        isGUIPresentation(presentationMode) || isTerminalPresentation(presentationMode)
    }

    static func matches(_ presentationMode: String?, mode: String) -> Bool {
        resolvedPresentationMode(presentationMode) == mode.lowercased()
    }

    static func visibleThreads(
        from threads: [RemoteThread],
        projectId: String
    ) -> [RemoteThread] {
        threads.filter {
            $0.projectId == projectId
                && !$0.isArchived
                && isVisibleInNativeList($0)
        }
    }

    private static func resolvedPresentationMode(_ presentationMode: String?) -> String {
        presentationMode?.lowercased() ?? terminalPresentationMode
    }
}
