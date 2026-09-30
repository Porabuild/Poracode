package com.poracode.app.protocol

/**
 * Pure coordination for authoritative resync after a gap or `resync-required`.
 *
 * Keeps the resync gate closed across HTTP failures, single-flights the refresh,
 * and only clears after a successful authoritative apply (snapshot + optional
 * open-thread history). Failure recovery forces a generation-safe reconnect
 * from seq 0 rather than remaining stuck pending forever.
 */
class ResyncCoordinator {
    enum class Action {
        /** Start shell + open-thread authoritative refresh. */
        BeginRefresh,

        /** A refresh is already running — ignore duplicate triggers. */
        AlreadyInFlight,

        /** Refresh succeeded — clear gate and reconnect from [seq]. */
        Reconnect,

        /** Refresh failed — force cursor 0 + generation reconnect; gate clears. */
        FailureRecover,

        /** Live events must not be applied (pending or in-flight). */
        DropLiveEvent,
    }

    @Volatile
    var pending: Boolean = false
        private set

    @Volatile
    var inFlight: Boolean = false
        private set

    @Volatile
    var failureCount: Int = 0
        private set

    /** Whether live event frames may still be applied. */
    val allowsLiveEvents: Boolean
        get() = !pending

    /** Gap or server `resync-required` observed. */
    fun noteNeedsResync(): Action {
        pending = true
        if (inFlight) return Action.AlreadyInFlight
        inFlight = true
        return Action.BeginRefresh
    }

    /**
     * Authoritative shell (+ optional open-thread) refresh succeeded at [seq].
     * Gate clears; caller must generation-reconnect from this baseline.
     */
    fun noteSuccess(appliedSeq: Int): Action {
        inFlight = false
        pending = false
        failureCount = 0
        lastSuccessSeq = maxOf(0, appliedSeq)
        return Action.Reconnect
    }

    /** Seq to reconnect from after [noteSuccess]. */
    @Volatile
    var lastSuccessSeq: Int = 0
        private set

    /**
     * HTTP (or history) failure while refreshing.
     * Gate is cleared so we do not remain stuck pending forever; caller must
     * force cursor/lastSeenSeq=0 and a fresh generation reconnect.
     */
    fun noteFailure(): Action {
        inFlight = false
        pending = false
        failureCount += 1
        return Action.FailureRecover
    }

    /** Concurrent live event while the gate is set must never touch state. */
    fun actionForLiveEvent(): Action? =
        if (pending) Action.DropLiveEvent else null

    fun reset() {
        pending = false
        inFlight = false
        failureCount = 0
        lastSuccessSeq = 0
    }
}

/**
 * Pure generation gate so cancelled receive/health/timeout callbacks cannot
 * reinstall a dead socket, arm a stale timeout, or schedule reconnect.
 */
class SocketGenerationGate {
    @Volatile
    var generation: Int = 0
        private set

    /** Invalidate the current generation (force-reconnect, tear-down, stop, suspend). */
    fun invalidate(): Int {
        generation += 1
        return generation
    }

    fun isCurrent(gen: Int): Boolean = gen == generation

    enum class CallbackKind {
        ReceiveFailure,
        HealthTimeout,
        ConnectTimeout,
        ScheduleReconnectFire,
        Publish,
    }

    enum class Decision {
        /** Callback generation is stale — ignore completely. */
        IgnoreStale,

        /** Still current — proceed with reconnect / handling. */
        Proceed,
    }

    fun decision(callbackGeneration: Int, kind: CallbackKind = CallbackKind.Publish): Decision {
        @Suppress("UNUSED_VARIABLE")
        val ignored = kind
        return if (isCurrent(callbackGeneration)) Decision.Proceed else Decision.IgnoreStale
    }

    /** `forceReconnect` / tear-down must bump generation so concurrent callbacks go stale. */
    fun beginForceReconnect(): Int = invalidate()
}
