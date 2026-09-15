import {
  RELAY_BINARY_FRAME_HEADER_BYTES,
  RELAY_BINARY_FRAME_MAX_CHANNEL_ID_BYTES,
} from "./relayBinaryFrame";

/** Existing ws-close reason used to signal a channel-only 1009 rejection.
 * Older peers close the channel without preserving the specific close code. */
export const RELAY_WS_PAYLOAD_TOO_LARGE_REASON = "payload too large";

/** Conservative binary payload budget after reserving the largest envelope.
 * Text must be checked by its exact JSON-framed size because escaping expands
 * it. This bounds individual messages; aggregate congestion needs flow control. */
export function relayBinaryMessageLimit(controlFrameLimit: number): number {
  return Math.max(
    0,
    controlFrameLimit - (RELAY_BINARY_FRAME_HEADER_BYTES + RELAY_BINARY_FRAME_MAX_CHANNEL_ID_BYTES),
  );
}
