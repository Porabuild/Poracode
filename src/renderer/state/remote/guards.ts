export function shouldReplaceRuntimeItemsFromSnapshot(input: {
  readonly existingCount: number;
  readonly existingHasObservedLiveItems: boolean;
  readonly snapshotItemCount: number;
  readonly threadActive: boolean;
  /**
   * True when the snapshot came straight from the server (a fresh history
   * fetch); false for the conservative cached-preload path. A fresh server
   * snapshot is authoritative for an inactive thread, so it must be accepted
   * even when it has FEWER items than the current store (the transcript was
   * legitimately cleared/reset/reverted on the desktop while we were away).
   */
  readonly fromServer: boolean;
}): boolean {
  if (input.existingCount === 0) return true;
  if (input.snapshotItemCount > input.existingCount) return true;
  // An empty server history is not enough evidence to erase transcript items
  // that already streamed into this client. Mobile/headless histories can
  // briefly be empty while durable runtime persistence catches up; explicit
  // resets clear live items through the `thread-reset` event path instead.
  if (input.snapshotItemCount === 0 && input.existingHasObservedLiveItems) return false;
  // A live turn's WebSocket deltas are fresher than any debounced snapshot, so
  // never let a same/shorter snapshot clobber them.
  if (input.threadActive) return false;
  // Inactive thread: a fresh server snapshot is authoritative even if shorter
  // (thread clear / checkpoint revert). A cached preload stays conservative and
  // only replaces when it's at least as complete as what's already shown.
  if (input.fromServer) return true;
  return input.snapshotItemCount >= input.existingCount;
}
