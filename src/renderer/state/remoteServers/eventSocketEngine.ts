import type { ClientEngineLane } from "@/renderer/state/remote/engine";

/**
 * A3: overflow notification is LANE-keyed. Each paired-host session binds its
 * own lane's overflow sink, so host A reaching its count/byte budget can no
 * longer reset the shared engine or notify host B's session (the pre-A3
 * process-wide single-sink slot was a cross-host cascade at lane granularity).
 *
 * The sink is one of two delivery paths for the same event: every pending
 * decode of the overflowing lane already rejects with
 * `ClientEngineLaneOverflowError`, and the sink additionally covers a lane
 * whose queued frames expired without a new decode attempt.
 */
export function bindRemoteEngineLaneOverflow(lane: ClientEngineLane, sink: () => void): () => void {
  return lane.addOverflowListener(sink);
}
