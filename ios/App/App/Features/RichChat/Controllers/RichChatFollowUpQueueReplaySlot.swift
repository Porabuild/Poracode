import Foundation

/// B6: bounded recovery state for the mid-history `thread-follow-up-queue`
/// broadcast stream.
///
/// `thread-follow-up-queue` is an authoritative replace-on-event broadcast: one
/// envelope carries the entire queue, and the host tags every emission with the
/// connection sequence it rode. A delayed history read therefore only needs the
/// newest sequence-tagged replacement state — retaining every broadcast would
/// grow with queue churn (each queue, edit, reorder, steer, pause and resume
/// emits one) and keep only superseded copies alive.
///
/// This slot retains at most one state regardless of churn, which is lossless
/// for the queue: only the newest state can win a replay, and a dropped state
/// was already superseded by a newer complete replacement — unlike runtime
/// event batches, no authoritative refresh is required after a supersede.
///
/// The state is tagged with the target (host lease generation + thread) that
/// produced it, so `replay(over:snapshotSequence:target:)` refuses a state
/// recorded for another host generation or thread even if a caller failed to
/// reset the slot at a session boundary.
struct RichChatFollowUpQueueReplaySlot: Sendable, Equatable {
  private struct State: Sendable, Equatable {
    let sequence: Int
    let envelope: RichFollowUpQueueEnvelope
    let target: RichChatThreadTarget
  }

  private var state: State?

  /// Number of retained replacement states (0 or 1). The B6 bound: constant
  /// under any number of queue changes during a history read.
  var retainedCount: Int { state == nil ? 0 : 1 }

  /// Records one broadcast. The newest sequence wins; an equal sequence keeps
  /// the later arrival, which is what the previous append-and-replay order
  /// produced for duplicate or retransmitted frames. A broadcast for a
  /// different target starts a fresh slot.
  mutating func record(
    _ envelope: RichFollowUpQueueEnvelope,
    sequence: Int,
    target: RichChatThreadTarget
  ) {
    guard let state, state.target == target else {
      self.state = State(sequence: sequence, envelope: envelope, target: target)
      return
    }
    guard sequence >= state.sequence else { return }
    self.state = State(sequence: sequence, envelope: envelope, target: target)
  }

  /// Applies the retained replacement state over a freshly installed base when
  /// it belongs to the same target and is newer than the snapshot; otherwise
  /// returns the base untouched. Same baseline rule as the event batches.
  func replay(
    over base: RichFollowUpQueue?,
    snapshotSequence: Int,
    target: RichChatThreadTarget
  ) -> RichFollowUpQueue? {
    guard let state, state.target == target, state.sequence > snapshotSequence else {
      return base
    }
    return state.envelope.queue
  }

  mutating func reset() {
    state = nil
  }
}
