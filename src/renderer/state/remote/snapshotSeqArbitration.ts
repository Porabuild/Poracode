/**
 * Single arbitration rule for every stale-snapshot gate (remote sync and the
 * desktop-as-client refresh path): a snapshot is stale for a thread when this
 * client already applied a live event from that server whose seq is newer
 * than the snapshot's. The sequence spaces match — the server stamps each
 * snapshot with the seq of the last event it had applied when it built it —
 * so a plain comparison is exact.
 *
 * `appliedEventSeq` must be the PER-THREAD applied seq (see
 * `remoteThreadAppliedSeq` in remoteServersStore), not the per-server resume
 * watermark: arbitrating one thread against another thread's events would
 * suppress its legitimate metadata until the unrelated thread went quiet.
 */
export function snapshotOlderThanAppliedSeq(
  snapshotSeq: number,
  appliedEventSeq: number | undefined,
): boolean {
  return appliedEventSeq !== undefined && snapshotSeq < appliedEventSeq;
}
