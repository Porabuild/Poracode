/**
 * Marker for a runtime-item payload field the host refused to put on the
 * WebSocket because the event was too large to deliver.
 *
 * Why this exists: `RemoteAccessServer.sendRaw` terminates a socket whenever
 * `bufferedAmount + messageBytes` exceeds the outbound budget (4 MB by
 * default). A single oversized event — in practice an `image_view` /
 * `mcp_tool_call` payload carrying a multi-megabyte inline base64 image —
 * therefore disconnects *every* connected client, and because the same event
 * stays in the replay buffer, the reconnecting client is dropped again on
 * replay. That loop only ends when the replay window rolls over. Capping the
 * event at the publish boundary keeps the live stream deliverable.
 *
 * The omitted bytes are never lost: the full payload is persisted to SQLite
 * before the cap is applied, so the authoritative copy arrives over HTTP the
 * next time the client fetches that thread's history.
 *
 * The value is REPLACED rather than deleted on purpose. `item.updated` payloads
 * are shallow-merged into the previous payload client-side (see
 * `runtimeEventReducer.mergePayload`), so deleting the key would silently leave
 * the previous — possibly stale — value in place instead of recording that
 * something was withheld.
 */

export const REMOTE_OMITTED_FIELD_KEY = "__poracodeOmitted";

export interface RemoteOmittedField {
  readonly [REMOTE_OMITTED_FIELD_KEY]: {
    /** Serialized size of the withheld value, for diagnostics/UI. */
    readonly bytes: number;
  };
}

export function remoteOmittedField(bytes: number): RemoteOmittedField {
  return { [REMOTE_OMITTED_FIELD_KEY]: { bytes } };
}

export function isRemoteOmittedField(value: unknown): value is RemoteOmittedField {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = (value as Record<string, unknown>)[REMOTE_OMITTED_FIELD_KEY];
  if (!marker || typeof marker !== "object") return false;
  return typeof (marker as { bytes?: unknown }).bytes === "number";
}

/** True when any top-level field of `payload` was withheld by the size cap. */
export function payloadHasOmittedField(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return isRemoteOmittedField(payload);
  }
  return Object.values(payload as Record<string, unknown>).some(isRemoteOmittedField);
}
