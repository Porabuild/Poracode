import Foundation

/// Client-side applied-seq cursor for the remote event stream.
///
/// Rules (must match desktop remote socket semantics + stricter contiguity):
/// - Always has a baseline (`appliedSeq`); use `0` when no snapshot exists so the
///   server replays. Omitting `lastSeenSeq` on the wire means "no replay".
/// - `ready(seq)` never advances the applied cursor.
/// - Events apply only when strictly contiguous (`applied + 1`).
/// - Stale/duplicate seq (`<= applied`) are ignored.
/// - Gaps (`> applied + 1`) request one resync; while `resyncPending`, live frames
///   are ignored so stale state is never advanced.
/// - `resync-required` **replaces** the cursor exactly (may lower after server restart).
/// - Authoritative snapshots/history advance with `max`.
/// - A successful authoritative resync **replaces** the cursor exactly
///   (`replaceAfterResync`): the server may have restarted with a rolled-back sequence,
///   so a `max` merge could strand the client past the end of the new stream.
/// - The resync gate is cleared only after a successful authoritative refresh —
///   never on HTTP failure.
struct EventStreamCursor: Sendable, Equatable {
    enum EventDisposition: Sendable, Equatable {
        /// Contiguous next event — apply, then mark applied.
        case apply
        /// seq <= applied, already seen, or resync is pending — drop silently.
        case ignore
        /// seq gap — request one resync; do not apply.
        case gap
    }

    /// Last successfully applied event seq, or last authoritative snapshot/history seq.
    /// Always defined: `0` means "replay from start" (never omit on the wire).
    private(set) var appliedSeq: Int

    /// True after a gap or `resync-required` until a successful authoritative refresh clears it.
    private(set) var resyncPending: Bool = false

    init(appliedSeq: Int = 0) {
        self.appliedSeq = max(0, appliedSeq)
    }

    /// `ready` only confirms the handshake; it must not move the applied cursor.
    mutating func noteReady(seq _: Int) {
        // Intentionally no-op on appliedSeq.
    }

    func disposition(forEventSeq seq: Int) -> EventDisposition {
        // While a resync is outstanding, do not apply later frames onto stale state.
        if resyncPending { return .ignore }
        if seq <= appliedSeq { return .ignore }
        if seq == appliedSeq + 1 { return .apply }
        return .gap
    }

    /// Call only after the delegate successfully handled a decoded event.
    mutating func markEventApplied(_ seq: Int) {
        appliedSeq = seq
    }

    /// Authoritative HTTP snapshot / thread history — never regresses an already-applied live cursor.
    mutating func noteAuthoritativeSnapshot(_ seq: Int) {
        appliedSeq = max(appliedSeq, seq)
    }

    /// Server `resync-required`: replace exactly (may lower after process restart).
    mutating func replaceFromResyncRequired(_ seq: Int) {
        appliedSeq = max(0, seq)
        resyncPending = true
    }

    /// Successful authoritative resync: replace exactly (may lower after a server
    /// restart) and clear the resync gate. Not `max` — a rolled-back server
    /// sequence must move the client back with it.
    mutating func replaceAfterResync(_ seq: Int) {
        appliedSeq = max(0, seq)
        resyncPending = false
    }

    /// Mark that a gap was observed and a resync was requested.
    mutating func markResyncRequested() {
        resyncPending = true
    }

    /// Clear the in-flight resync gate only after a successful authoritative refresh.
    mutating func clearResyncPending() {
        resyncPending = false
    }

    /// Whether a new resync callback should fire.
    var shouldRequestResync: Bool { !resyncPending }
}
