import type { RuntimeEvent } from "./contracts";
import { runtimePayloadOriginEventBytes } from "./runtimePayloadOriginProtocol";

/**
 * Default per-event budget of the remote live stream: half of the host's
 * default 4 MiB outbound socket budget (`maxBroadcastEventBytes`). An event
 * above it cannot stream live and forces paired clients to resync, so
 * producers keep splittable events below it.
 */
export const REMOTE_LIVE_EVENT_DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * One conservative byte estimate for a canonical runtime event, computed once
 * and carried with the event. Used by both sides of the supervisor↔host
 * boundary so admission bounds describe the same payload. The envelope margin
 * covers the IPC/JSON wrapper fields.
 */
export function estimateRuntimeEventBytes(event: RuntimeEvent): number {
  try {
    return (
      Buffer.byteLength(JSON.stringify(event), "utf8") + 96 + runtimePayloadOriginEventBytes(event)
    );
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
