import Foundation

/// Pure coordination for authoritative resync after a gap or `resync-required`.
///
/// Keeps the resync gate closed across HTTP failures, single-flights the refresh,
/// and only clears + reconnects after a successful authoritative apply.
struct ResyncCoordinator: Sendable, Equatable {
    enum Action: Sendable, Equatable {
        /// Start shell + open-thread authoritative refresh (and suspend live generation).
        case beginRefresh
        /// A refresh is already running — ignore duplicate triggers.
        case alreadyInFlight
        /// Refresh succeeded — clear gate and reconnect from `seq`.
        case reconnect(fromSeq: Int)
        /// Refresh failed — keep pending and retry with backoff.
        case retryAfterFailure
        /// Live events must not be applied (pending or in-flight).
        case dropLiveEvent
        /// No resync work outstanding.
        case idle
    }

    private(set) var pending: Bool = false
    private(set) var inFlight: Bool = false
    private(set) var failureCount: Int = 0

    /// Whether live event frames may still be applied.
    var allowsLiveEvents: Bool { !pending }

    /// Gap or server `resync-required` observed.
    mutating func noteNeedsResync() -> Action {
        pending = true
        if inFlight { return .alreadyInFlight }
        inFlight = true
        return .beginRefresh
    }

    /// Authoritative shell (+ optional open-thread) refresh succeeded at `seq`.
    mutating func noteSuccess(appliedSeq seq: Int) -> Action {
        inFlight = false
        pending = false
        failureCount = 0
        return .reconnect(fromSeq: max(0, seq))
    }

    /// HTTP (or other) failure while refreshing. Gate stays pending.
    mutating func noteFailure() -> Action {
        inFlight = false
        // pending remains true — never clear the gate on failure.
        failureCount += 1
        return .retryAfterFailure
    }

    /// Caller is about to retry after backoff.
    mutating func noteRetryStarting() -> Action {
        guard pending else { return .idle }
        if inFlight { return .alreadyInFlight }
        inFlight = true
        return .beginRefresh
    }

    /// Reset all resync state — pairing/re-pair, unpair, or stale-session cancel.
    /// A failed/pending/inFlight resync from host A must never block host B frames.
    mutating func reset() {
        pending = false
        inFlight = false
        failureCount = 0
    }

    /// Clear only the in-flight bit (canceled attempt). Keep `pending` so live frames stay gated
    /// and foreground can perform an authoritative refresh.
    mutating func resetInFlightOnly() {
        inFlight = false
    }

    /// Concurrent live event while the gate is set must never touch state.
    func actionForLiveEvent() -> Action? {
        pending ? .dropLiveEvent : nil
    }

    /// Bounded full-jitter exponential retry delay (1–20 s), based on `failureCount`.
    /// Pure decision for scheduling — callers must not retry while backgrounded.
    func nextRetryDelayMs(
        baseMs: Double = RemoteSocketPolicy.reconnectBaseMs,
        maxMs: Double = RemoteSocketPolicy.reconnectMaxMs,
        random: (ClosedRange<Double>) -> Double = { Double.random(in: $0) }
    ) -> Double {
        let attempt = max(0, failureCount - 1)
        let ceiling = min(maxMs, baseMs * pow(2.0, Double(attempt)))
        let half = ceiling / 2
        let jitter = random(0 ... max(half, 0.000_001))
        return min(maxMs, max(baseMs, half + jitter))
    }
}

/// Pure generation gate so cancelled receive/health callbacks cannot schedule work.
struct SocketGenerationGate: Sendable, Equatable {
    private(set) var generation: Int = 0

    /// Invalidate the current generation (force-reconnect, tear-down, stop, suspend).
    @discardableResult
    mutating func invalidate() -> Int {
        generation += 1
        return generation
    }

    func isCurrent(_ gen: Int) -> Bool {
        gen == generation
    }

    enum CallbackKind: Sendable, Equatable {
        case receiveFailure
        case healthTimeout
        case connectTimeout
        case scheduleReconnectFire
    }

    enum Decision: Sendable, Equatable {
        /// Callback generation is stale — ignore completely.
        case ignoreStale
        /// Still current — proceed with reconnect / handling.
        case proceed
    }

    /// Deterministic decision for a callback that may have been cancelled by a later tear-down.
    func decision(callbackGeneration: Int, kind _: CallbackKind) -> Decision {
        isCurrent(callbackGeneration) ? .proceed : .ignoreStale
    }

    /// `forceReconnect` / tear-down must bump generation so concurrent callbacks go stale.
    mutating func beginForceReconnect() -> (newGeneration: Int, decision: Decision) {
        let next = invalidate()
        return (next, .proceed)
    }
}
