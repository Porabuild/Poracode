import type { SessionNotification } from "@agentclientprotocol/sdk";
import { PORACODE_ACP_TEXT_STREAM_META_KEY } from "../acp/canonicalMapping/textStreamSnapshots";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : undefined);

/** Cognition marks its streamed text chunks and snapshot replacements on `_meta`. */
const COGNITION_STREAMING_MESSAGE_ID_META_KEY = "cognition.ai/streamingMessageId";
const COGNITION_STREAMING_META_KEY = "cognition.ai/streaming";
const COGNITION_OVERWRITE_META_KEY = "cognition.ai/overwrite";
const COGNITION_EVENT_TYPE_META_KEY = "cognition.ai/eventType";

/**
 * Native stream identities longer than this are treated as absent: they cannot
 * be correlated safely and must keep the legacy behavior instead.
 */
const MAX_NATIVE_STREAM_ID_LENGTH = 200;

/**
 * Cognition replays two completed `kind:"other"` tool calls that carry no
 * action — they only publish session bookkeeping (ACU consumption at the last
 * user interaction and context-window growth). They arrive with the full
 * synthetic tool shape, so without this seam they would render as tool rows.
 * Anything that does not match the exact native shape — a different kind or
 * status, an unknown event type, or the same title without the native event
 * type — stays an ordinary tool row.
 */
const COGNITION_BOOKKEEPING_EVENT_TYPES: ReadonlySet<string> = new Set([
  "acu_consumption_at_last_user_interaction",
  "context_growth_update",
]);

/**
 * Re-express Cognition's cloud text streaming on the neutral text-stream
 * snapshot annotation. Native cloud sessions send one text stream per message
 * or thought under a single `streamingMessageId`: `streaming:true` deltas
 * first, then a `streaming:false` + `overwrite:true` full snapshot of the
 * finished item (the final thought snapshot can arrive after the assistant
 * message has already started). The annotation carries the native id and the
 * append/replace mode; the shared mapper owns the exact correlation — item
 * identity per session/owner/stream, late replacement of already-closed items
 * through the existing `content.delta` replace — so this seam must not also
 * assert the legacy new-assistant boundary for an annotated chunk.
 *
 * Strictness: only chunks with a valid nonempty native id (≤200 chars) and an
 * explicitly boolean `streaming` flag (or an explicit `overwrite: true`) are
 * annotated. Truthy impostors (`"true"`, `1`), missing identities, and
 * non-text chunks keep the current legacy behavior untouched. All native
 * `_meta` keys are preserved verbatim; the annotation is additive.
 */
export function annotateCloudTextStreamChunk(
  notification: SessionNotification,
  meta: Record<string, unknown>,
): SessionNotification {
  const update = notification.update as Record<string, unknown>;
  if (
    update.sessionUpdate !== "agent_message_chunk" &&
    update.sessionUpdate !== "agent_thought_chunk"
  ) {
    return notification;
  }
  if (record(update.content).type !== "text") return notification;
  const id = text(meta[COGNITION_STREAMING_MESSAGE_ID_META_KEY]);
  if (!id || id.length > MAX_NATIVE_STREAM_ID_LENGTH) return notification;
  const streaming = meta[COGNITION_STREAMING_META_KEY];
  const overwrite = meta[COGNITION_OVERWRITE_META_KEY];
  if (typeof streaming !== "boolean" && overwrite !== true) return notification;
  return {
    ...notification,
    update: {
      ...update,
      _meta: {
        ...meta,
        [PORACODE_ACP_TEXT_STREAM_META_KEY]: {
          id,
          mode: overwrite === true ? "replace" : "append",
        },
      },
    } as unknown as SessionNotification["update"],
  };
}

/**
 * Convert Cognition's synthetic bookkeeping tool calls into the no-op
 * `session_info_update` they semantically are, preserving the native `_meta`
 * untouched. Only the exact native shape converts: `tool_call` + `completed`
 * + `kind:"other"` + one of the two known bookkeeping event types. Real tool
 * calls and unrecognized shapes pass through unchanged.
 */
export function convertCloudBookkeepingToolCall(
  notification: SessionNotification,
  meta: Record<string, unknown>,
): SessionNotification {
  const update = notification.update as Record<string, unknown>;
  if (update.sessionUpdate !== "tool_call") return notification;
  if (update.status !== "completed" || update.kind !== "other") return notification;
  const eventType = meta[COGNITION_EVENT_TYPE_META_KEY];
  if (typeof eventType !== "string" || !COGNITION_BOOKKEEPING_EVENT_TYPES.has(eventType)) {
    return notification;
  }
  return {
    ...notification,
    update: {
      sessionUpdate: "session_info_update",
      _meta: meta,
    } as SessionNotification["update"],
  };
}
