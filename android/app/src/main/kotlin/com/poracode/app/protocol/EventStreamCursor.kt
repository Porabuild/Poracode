package com.poracode.app.protocol

/**
 * Client-side applied-seq cursor for the remote event stream.
 *
 * Rules (must match desktop remote socket semantics + stricter contiguity):
 * - `ready(seq)` never advances the applied cursor; ready is sent before replay.
 * - Events apply only when strictly contiguous (`applied + 1`).
 * - Stale/duplicate seq (`<= applied`) are ignored.
 * - Gaps (`> applied + 1`) request one resync.
 * - While `resyncPending`, **no** sequenced Event is applied — even if contiguous —
 *   so stale state never advances during HTTP resync.
 * - `resync-required` **replaces** the cursor exactly (may lower after server restart).
 * - Authoritative snapshots/history advance with `max` (or set if unset).
 * - Advance only after synchronous successful reducer delivery.
 * - `eventEpoch=v1`: [epoch] names the server instance [appliedSeq] belongs to.
 *   A new epoch binds only when `resync-required` replaces the cursor, so a lost
 *   resync frame keeps the old binding and the reconnect is refused again.
 */
class EventStreamCursor(
    appliedSeq: Int? = null,
) {
    enum class EventDisposition {
        /** Contiguous next event — apply, then mark applied. */
        Apply,

        /** seq <= applied, already seen, or resync is pending — drop silently. */
        Ignore,

        /** seq gap — request one resync; do not apply. */
        Gap,
    }

    /** Last successfully applied event seq, or last authoritative snapshot/history seq. */
    @Volatile
    var appliedSeq: Int? = appliedSeq
        private set

    /** True after a gap or `resync-required` until cleared after authoritative refresh. */
    @Volatile
    var resyncPending: Boolean = false
        private set

    /** Server event-stream epoch [appliedSeq] is bound to; null while unbound. */
    @Volatile
    var epoch: String? = null
        private set

    /** Epoch the current connection's `ready` reported (null from hosts without one). */
    private var connectionEpoch: String? = null

    /** A new connection is starting: forget the previous connection's epoch. */
    fun beginConnection() {
        connectionEpoch = null
    }

    /**
     * `ready` only confirms the handshake; it must not move the applied cursor.
     * It names the epoch of every later frame on this connection, which binds
     * only when the server's `resync-required` replaces the cursor (an unbound
     * cursor stays unbound until then). Returns true when a host stopped
     * reporting an epoch under a bound cursor (an older build that cannot
     * verify it), which the caller answers with one resync; the binding is then
     * cleared.
     */
    fun noteReady(seq: Int, epoch: String? = null): Boolean {
        @Suppress("UNUSED_PARAMETER")
        val ignored = seq
        connectionEpoch = epoch
        return epoch == null && this.epoch != null
    }

    /** Restores a pooled cursor together with the epoch it was bound to. */
    fun restore(seq: Int, epoch: String?) {
        appliedSeq = seq
        this.epoch = epoch
    }

    fun disposition(forEventSeq: Int): EventDisposition {
        // While a resync is outstanding, do not apply later frames onto stale state —
        // even when the seq is contiguous.
        if (resyncPending) return EventDisposition.Ignore
        val applied = appliedSeq
            ?: // No baseline yet: accept the first live event to establish the cursor.
            return EventDisposition.Apply
        if (forEventSeq <= applied) return EventDisposition.Ignore
        if (forEventSeq == applied + 1) return EventDisposition.Apply
        return EventDisposition.Gap
    }

    /** Call only after the delegate successfully handled a decoded event. */
    fun markEventApplied(seq: Int) {
        appliedSeq = seq
    }

    /**
     * Authoritative HTTP snapshot / thread history — never regresses an already-applied live cursor.
     * Does **not** clear [resyncPending]; only a completed resync transaction does.
     */
    fun noteAuthoritativeSnapshot(seq: Int) {
        val current = appliedSeq
        appliedSeq = if (current == null) seq else maxOf(current, seq)
    }

    /**
     * Server `resync-required`: replace exactly (may lower after process restart)
     * and bind the epoch this connection's `ready` reported.
     */
    fun replaceFromResyncRequired(seq: Int) {
        appliedSeq = seq
        epoch = connectionEpoch
        resyncPending = true
    }

    /**
     * Successful authoritative resync: REPLACE the cursor (may regress after
     * server restart) and clear the pending gate.
     */
    fun replaceFromAuthoritativeResync(seq: Int) {
        appliedSeq = seq
        resyncPending = false
    }

    /** Mark that a gap was observed and a resync was requested. */
    fun markResyncRequested() {
        resyncPending = true
    }

    /**
     * Clear the in-flight resync gate only after an authoritative refresh succeeds
     * (snapshot and optional open-thread history), or after failure recovery forces
     * a generation reconnect from 0.
     */
    fun clearResyncPending() {
        resyncPending = false
    }

    /** Whether a new resync callback should fire. */
    val shouldRequestResync: Boolean
        get() = !resyncPending

    fun reset() {
        appliedSeq = null
        epoch = null
        connectionEpoch = null
        resyncPending = false
    }
}
