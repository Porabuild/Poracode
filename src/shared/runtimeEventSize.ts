import type { RuntimeEvent } from "./contracts";

/**
 * One conservative byte estimate for a canonical runtime event, computed once
 * and carried with the event. Used by both sides of the supervisor↔host
 * boundary so admission bounds describe the same payload. The envelope margin
 * covers the IPC/JSON wrapper fields.
 */
export function estimateRuntimeEventBytes(event: RuntimeEvent): number {
  try {
    return Buffer.byteLength(JSON.stringify(event), "utf8") + 96;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
