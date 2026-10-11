/**
 * Provider-neutral text-stream snapshots for the ACP mapper.
 *
 * ACP `agent_message_chunk` / `agent_thought_chunk` streams are append-only:
 * a provider that revises text it already streamed — a corrected answer, a
 * shorter re-render, a cleared placeholder — has no protocol way to say "this
 * chunk replaces what came before". A provider boundary transform may annotate
 * such a text chunk with the neutral meta key below to opt it into snapshot
 * semantics. The annotation names a native stream id plus an explicit mode;
 * the mapper correlates chunks sharing the id (per native session, per parent
 * owner, per stream kind) into one canonical item and emits `content.delta`
 * with `replace: true` when, and only when, the chunk declares
 * `mode: "replace"`.
 *
 * An annotated chunk is plain assistant/reasoning text by declaration: it
 * bypasses embedded-tag parsing and the ordinary streaming filters. A newly
 * allocated snapshot item closes only its owner's open content, becomes the
 * owner's open item, and so takes part in the owning transcript's ordinary
 * item lifecycle. Later chunks with the same id append to — or replace within
 * — the correlated item without closing or reopening any sibling, including
 * when that item has already been completed. Unannotated chunks map exactly
 * as before, and an invalid annotation is treated as no annotation.
 *
 * A chunk may also declare, through the neutral parent meta key, the subagent
 * tool call whose transcript owns it. While that parent is active the mapper
 * resolves it before this helper runs. Once the parent's tool call has
 * completed, a later chunk naming that owner recovers the correlation it
 * already created and lands on the original child item. A declared owner this
 * mapper has never correlated — unknown, malformed, or evicted — never claims
 * a root or sibling stream that merely shares the native id: the chunk falls
 * back to the ordinary mapper path instead of asserting a false snapshot
 * identity. The neutral top-level assertion outranks a declared parent, the
 * same precedence the active-parent resolution applies.
 *
 * Correlation state is a bounded LRU held in this module's private
 * `extensionStore` slot; shared mapper state carries no snapshot-shaped
 * fields. Nothing here is persisted and no wire field is introduced — the
 * emitted events reuse the already-deployed `content.delta` `replace` flag.
 */

import type { ContentBlock, SessionNotification, SessionUpdate } from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import { getExtensionStore } from "./textStreamExtension";
import {
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "./subagents";
import type { AcpContentItemState, AcpMapperState } from "./state";
import { closeOpenContentItems, getContentItemState, newItemId } from "./state";

/**
 * `_meta` key a provider boundary transform sets on a text chunk to route it
 * through snapshot semantics. The value must be
 * `{ id: string; mode: "append" | "replace" }` — a non-empty native stream id
 * of at most 200 characters, and an explicit mode. Any other shape leaves the
 * chunk on the ordinary streaming path.
 */
export const PORACODE_ACP_TEXT_STREAM_META_KEY = "poracodeTextStream";

/** Longest native stream id accepted from an annotation. */
const MAX_STREAM_ID_LENGTH = 200;

/** Correlation entries retained per mapper state before the oldest is evicted. */
const MAX_TRACKED_STREAMS = 256;

/** Extension-store slot id; the shape stays private to this module. */
const TEXT_STREAM_SNAPSHOT_STORE_ID = "acp.textStreamSnapshots";

interface TextStreamSnapshotEntry {
  itemId: string;
}

type TextStreamSnapshotStore = Map<string, TextStreamSnapshotEntry>;

type TextStreamKind = "assistant" | "reasoning";

const KIND_ITEM_TYPE = {
  assistant: "assistant_message",
  reasoning: "reasoning",
} as const satisfies Record<TextStreamKind, string>;

const KIND_STREAM = {
  assistant: "assistant_text",
  reasoning: "reasoning_text",
} as const satisfies Record<TextStreamKind, string>;

const KIND_ID_PREFIX = {
  assistant: "asst",
  reasoning: "reason",
} as const satisfies Record<TextStreamKind, string>;

const KIND_OPEN_ID_KEY = {
  assistant: "openAssistantItemId",
  reasoning: "openReasoningItemId",
} as const satisfies Record<TextStreamKind, keyof AcpContentItemState>;

function streamKindForUpdate(update: SessionUpdate): TextStreamKind | undefined {
  if (update.sessionUpdate === "agent_message_chunk") return "assistant";
  if (update.sessionUpdate === "agent_thought_chunk") return "reasoning";
  return undefined;
}

function readAnnotation(meta: unknown): { id: string; mode: "append" | "replace" } | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const annotation = (meta as Record<string, unknown>)[PORACODE_ACP_TEXT_STREAM_META_KEY];
  if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) return undefined;
  const { id, mode } = annotation as Record<string, unknown>;
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_STREAM_ID_LENGTH) {
    return undefined;
  }
  if (mode !== "append" && mode !== "replace") return undefined;
  return { id, mode };
}

/** Stable, collision-free correlation key across all four owner dimensions. */
function correlationKey(
  sessionId: string,
  parentToolCallId: string | undefined,
  kind: TextStreamKind,
  nativeId: string,
): string {
  return JSON.stringify([sessionId, parentToolCallId ?? null, kind, nativeId]);
}

/**
 * Classify the neutral parent-owner declaration a chunk's `_meta` may carry
 * next to its stream annotation. `"unparented"` covers both no declaration
 * and the neutral top-level assertion — which outranks a declared parent,
 * matching the active-parent resolution — so both resolve on the root
 * transcript exactly as before. `"declared"` names the subagent tool call
 * whose transcript owns the chunk; `"malformed"` is a present-but-unusable
 * declaration.
 */
type DeclaredParentOwner =
  | { kind: "declared"; toolCallId: string }
  | { kind: "malformed" }
  | { kind: "unparented" };

function declaredParentOwner(meta: unknown): DeclaredParentOwner {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return { kind: "unparented" };
  const record = meta as Record<string, unknown>;
  if (!(PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY in record)) return { kind: "unparented" };
  if (record[PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY] === true) return { kind: "unparented" };
  const toolCallId = record[PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY];
  return typeof toolCallId === "string" ? { kind: "declared", toolCallId } : { kind: "malformed" };
}

function snapshotStore(state: AcpMapperState): TextStreamSnapshotStore {
  return getExtensionStore<TextStreamSnapshotStore>(
    state,
    TEXT_STREAM_SNAPSHOT_STORE_ID,
    () => new Map(),
  );
}

/** Insert a correlation entry, evicting the least recently used beyond the bound. */
function trackStream(store: TextStreamSnapshotStore, key: string, entry: TextStreamSnapshotEntry) {
  store.set(key, entry);
  while (store.size > MAX_TRACKED_STREAMS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

function deltaEvent(
  threadId: string,
  itemId: string,
  kind: TextStreamKind,
  delta: string,
  replace: boolean,
): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId,
    stream: KIND_STREAM[kind],
    delta,
    ...(replace ? { replace: true } : {}),
  };
}

/**
 * Map a provider-annotated text-stream snapshot to zero-or-more canonical
 * events. Returns `undefined` when the notification is not an annotated text
 * `agent_message_chunk` / `agent_thought_chunk` — unannotated, invalid, or
 * non-text — or when it names a declared owner no known correlation covers,
 * so the caller falls through to the ordinary mapper path.
 * A suppressed annotation is handled: an empty event list and, deliberately,
 * no state update of any kind.
 */
export function mapAcpTextStreamSnapshot(
  notification: SessionNotification,
  state: AcpMapperState,
  parentToolCallId: string | undefined,
  suppressOutput: boolean,
): RuntimeEvent[] | undefined {
  const kind = streamKindForUpdate(notification.update);
  if (!kind) return undefined;
  const content = (notification.update as { content?: ContentBlock }).content;
  if (content?.type !== "text") return undefined;
  const meta = (notification.update as { _meta?: unknown })._meta;
  const annotation = readAnnotation(meta);
  if (!annotation) return undefined;
  if (suppressOutput) return [];

  const events: RuntimeEvent[] = [];
  const { threadId } = state;
  const store = snapshotStore(state);
  let key = correlationKey(notification.sessionId, parentToolCallId, kind, annotation.id);
  let existing = store.get(key);
  if (parentToolCallId === undefined) {
    // No active parent resolved this chunk. A completed owner's boundary
    // transform keeps annotating its child stream with the neutral parent
    // id; recover the correlation that owner already created so a late
    // snapshot lands on the original child item instead of minting an
    // unparented root item under the same native id.
    const owner = declaredParentOwner(meta);
    if (owner.kind === "declared") {
      key = correlationKey(notification.sessionId, owner.toolCallId, kind, annotation.id);
      existing = store.get(key);
      if (!existing) {
        // Unknown, malformed, or evicted owner: never claim a root or
        // sibling stream that merely shares the native id — the chunk falls
        // back to the ordinary mapper path rather than assert a false
        // snapshot identity.
        return undefined;
      }
    } else if (owner.kind === "malformed") {
      return undefined;
    }
  }
  if (existing) {
    // Refresh LRU recency; the entry itself never changes.
    store.delete(key);
    store.set(key, existing);
  }

  if (content.text.length === 0) {
    // Only an explicit replace can act on an empty snapshot — clearing the
    // correlated item. An empty append carries nothing and never creates.
    if (annotation.mode === "replace" && existing) {
      events.push(deltaEvent(threadId, existing.itemId, kind, "", true));
    }
    return events;
  }

  if (existing) {
    // Never close or reopen a sibling/newer item for an existing correlation:
    // the delta lands on the correlated item even if it was already completed.
    events.push(
      deltaEvent(threadId, existing.itemId, kind, content.text, annotation.mode === "replace"),
    );
    return events;
  }

  // First nonempty annotated text on this stream: start a dedicated canonical
  // item on the owning transcript.
  const contentState = getContentItemState(state, parentToolCallId);
  events.push(...closeOpenContentItems(state, parentToolCallId));
  const itemId = newItemId(KIND_ID_PREFIX[kind]);
  contentState[KIND_OPEN_ID_KEY[kind]] = itemId;
  trackStream(store, key, { itemId });
  events.push({
    type: "item.started",
    threadId,
    itemId,
    itemType: KIND_ITEM_TYPE[kind],
  });
  events.push(deltaEvent(threadId, itemId, kind, content.text, annotation.mode === "replace"));
  return events;
}
