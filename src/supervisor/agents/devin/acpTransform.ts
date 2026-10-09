import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  createAcpSubagentCoordinator,
  normalizeAcpSubagentToolCall,
  withAcpSubagentParent,
  withAcpTopLevelToolCall,
} from "../acp/subagentCoordinator";
import {
  PORACODE_ACP_SUBAGENT_STATUS_META_KEY,
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
} from "../acp/canonicalMapping/subagents";
import { PORACODE_ACP_USAGE_BREAKDOWN_META_KEY } from "../acp/canonicalMapping/usageMeta";
import {
  annotateCloudTextStreamChunk,
  convertCloudBookkeepingToolCall,
} from "./cloudTextSnapshots";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
/** Nonnegative safe integer, or undefined. Strict: no coercion, no truncation. */
const usageToken = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

/** Cognition annotates the standard `usage_update` with its input/output split. */
const COGNITION_INPUT_TOKENS_META_KEY = "cognition.ai/inputTokens";
const COGNITION_OUTPUT_TOKENS_META_KEY = "cognition.ai/outputTokens";

/**
 * Re-express Cognition's `usage_update` token split as the neutral breakdown
 * annotation consumed by the shared mapper. The vendor counts are copied only
 * when both are nonnegative safe integers summing exactly to the authoritative
 * `used` (zero included); a mismatch drops the annotation rather than
 * fabricating a breakdown, and the vendor keys stay on `_meta` untouched.
 */
function withAcpUsageBreakdown(
  notification: SessionNotification,
  meta: Record<string, unknown>,
): SessionNotification {
  const update = notification.update as Record<string, unknown>;
  const used = usageToken(update.used);
  const inputTokens = usageToken(meta[COGNITION_INPUT_TOKENS_META_KEY]);
  const outputTokens = usageToken(meta[COGNITION_OUTPUT_TOKENS_META_KEY]);
  if (
    used === undefined ||
    inputTokens === undefined ||
    outputTokens === undefined ||
    inputTokens + outputTokens !== used
  ) {
    return notification;
  }
  return {
    ...notification,
    update: {
      ...notification.update,
      _meta: {
        ...meta,
        [PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]: { inputTokens, outputTokens },
      },
    } as SessionNotification["update"],
  };
}

/**
 * Bound on the transform's correlation state (pending launches, native→call
 * bindings, completed calls). Long-lived GUI sessions would otherwise grow
 * these maps for their whole lifetime; the oldest entries are evicted
 * by recency. A cache miss never asserts a new message boundary; completed
 * calls also require a live coordinator descriptor before another completion.
 */
const MAX_TRACKED_SUBAGENT_CALLS = 256;

function boundedInsert<V>(map: Map<string, V>, key: string, value: V) {
  // Map.set alone preserves insertion order even when an owner stays active.
  if (map.has(key)) map.delete(key);
  if (!map.has(key) && map.size >= MAX_TRACKED_SUBAGENT_CALLS) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

function boundedAdd(set: Set<string>, key: string) {
  if (!set.has(key) && set.size >= MAX_TRACKED_SUBAGENT_CALLS) {
    const oldest = set.values().next().value;
    if (oldest !== undefined) set.delete(oldest);
  }
  set.add(key);
}

/**
 * Pick the terminal completion notification from a coordinator completion
 * batch. `complete()` can emit child-output/parent-reply message chunks
 * before the terminal `tool_call_update`; the transform seam returns exactly
 * one notification, and the one that must never be lost is the terminal
 * update — losing it would strand the subagent row open forever.
 */
export function pickDevinSubagentCompletion(
  notifications: readonly SessionNotification[],
  fallback: SessionNotification,
): SessionNotification {
  for (let index = notifications.length - 1; index >= 0; index--) {
    const update = notifications[index]!.update as Record<string, unknown>;
    if (record(update._meta)[PORACODE_ACP_SUBAGENT_STATUS_META_KEY]) return notifications[index]!;
  }
  return fallback;
}

/** Translate Cognition's separate call IDs and agent IDs at the provider boundary. */
export function createDevinAcpTransform() {
  const subagents = createAcpSubagentCoordinator();
  const pending = new Map<
    string,
    { title?: string; task?: string; profile?: string; background: boolean }
  >();
  const callsByAgent = new Map<string, string>();
  const completed = new Set<string>();
  const contentMessageIds = new Map<string, string>();
  return (notification: SessionNotification): SessionNotification => {
    const update = notification.update as Record<string, unknown>;
    const meta = record(update._meta);
    if (update.sessionUpdate === "usage_update") {
      return withAcpUsageBreakdown(notification, meta);
    }
    if (update.sessionUpdate === "tool_call") {
      const bookkeeping = convertCloudBookkeepingToolCall(notification, meta);
      if (bookkeeping !== notification) return bookkeeping;
    }
    const id = text(update.toolCallId);
    const started = record(meta["cognition.ai/subagent_started"]);
    const finished = record(meta["cognition.ai/subagent_completed"]);
    const context = record(meta["cognition.ai/subagent_context"]);
    const parent = text(context.parentAgentId);
    const messageId = text(meta["cognition.ai/streamingMessageId"]);
    // Cloud text streams carry the neutral snapshot annotation; the shared
    // mapper owns their correlation, so the legacy boundary below must stay
    // silent for an annotated chunk. The identity map still records the id so
    // a later unannotated chunk compares against the full legacy history.
    const annotated = annotateCloudTextStreamChunk(notification, meta);
    const annotatedStream = annotated !== notification;
    if (annotatedStream) notification = annotated;
    if (
      (update.sessionUpdate === "agent_message_chunk" ||
        update.sessionUpdate === "agent_thought_chunk") &&
      messageId &&
      messageId.length <= 200 &&
      (!parent || (parent.length <= 200 && callsByAgent.has(parent)))
    ) {
      const owner = JSON.stringify([notification.sessionId, parent ?? null, update.sessionUpdate]);
      const previous = contentMessageIds.get(owner);
      boundedInsert(contentMessageIds, owner, messageId);
      if (!annotatedStream && previous !== undefined && previous !== messageId) {
        // The native id defines a message boundary, never a canonical item id.
        // Scope the boundary to this owner so sibling/parent streams stay open.
        notification = {
          ...notification,
          update: {
            ...notification.update,
            _meta: { ...meta, [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: "owner" },
          } as SessionNotification["update"],
        };
      }
    }
    if (id && typeof started.agentId === "string") {
      const matches = [...pending].filter(
        ([, call]) =>
          call.title === started.title &&
          call.task === started.task &&
          call.background === (started.isBackground === true) &&
          call.profile?.replace(/^subagent_/i, "").toLowerCase() ===
            text(started.profile)?.toLowerCase(),
      );
      // Ambiguous native IDs must never attribute one agent's result to another.
      if (matches.length !== 1) return notification;
      const [callId] = matches[0]!;
      pending.delete(callId);
      boundedInsert(callsByAgent, started.agentId, callId);
      const descriptor = subagents.updateCall(callId, {
        ...(text(started.profile) ? { subagentType: text(started.profile)! } : {}),
        ...(text(started.model) ? { model: text(started.model)! } : {}),
      });
      return normalizeAcpSubagentToolCall(
        {
          ...notification,
          update: { ...notification.update, toolCallId: callId } as SessionNotification["update"],
        },
        {
          rawInput: subagents.canonicalInput(callId),
          detached: descriptor.background,
        },
      );
    }
    if (id && typeof finished.agentId === "string") {
      const callId = callsByAgent.get(finished.agentId);
      // A repeated completion for an already-finished agent is a duplicate
      // replay, not a second result: pass it through untouched.
      if (!callId || completed.has(callId) || !subagents.getCall(callId)) return notification;
      boundedAdd(completed, callId);
      return pickDevinSubagentCompletion(
        subagents.complete({
          sessionId: notification.sessionId,
          toolCallId: callId,
          status: finished.success === false ? "failed" : "completed",
          ...(text(finished.summary) ? { result: text(finished.summary)! } : {}),
          synthesizeResultProgress: true,
        }),
        notification,
      );
    }
    if (id && meta["cognition.ai/inferenceToolName"] === "run_subagent" && !completed.has(id)) {
      const raw = record(update.rawInput);
      const descriptor = subagents.updateCall(id, {
        rawInput: raw,
        ...(text(raw.profile) ? { subagentType: text(raw.profile)! } : {}),
        ...(text(raw.title) ? { description: text(raw.title)! } : {}),
        ...(text(raw.task) ? { prompt: text(raw.task)! } : {}),
        ...(raw.is_background === true ? { background: true } : {}),
      });
      if (update.sessionUpdate === "tool_call")
        boundedInsert(pending, id, {
          ...(text(raw.title) ? { title: text(raw.title)! } : {}),
          ...(text(raw.task) ? { task: text(raw.task)! } : {}),
          ...(text(raw.profile) ? { profile: text(raw.profile)! } : {}),
          background: raw.is_background === true,
        });
      const isLaunchAcknowledgement =
        descriptor.background &&
        update.status === "completed" &&
        [...callsByAgent.values()].includes(id);
      // Without a unique native binding, keep the ordinary completion instead
      // of retaining an unresolvable detached task that would strand the turn.
      const normalized = normalizeAcpSubagentToolCall(notification, {
        rawInput: subagents.canonicalInput(id),
        detached: descriptor.background,
        keepOpen: isLaunchAcknowledgement,
        omitContent: isLaunchAcknowledgement,
      });
      const parentCall = parent ? callsByAgent.get(parent) : undefined;
      return parentCall
        ? withAcpSubagentParent(normalized, parentCall)
        : withAcpTopLevelToolCall(normalized);
    }
    const parentCall = parent ? callsByAgent.get(parent) : undefined;
    if (parentCall) return withAcpSubagentParent(notification, parentCall);
    // Native root content and foreground read/wait tools have no child context.
    // Do not let generic lifetime inference assign them to a foreground child.
    return update.sessionUpdate === "tool_call" ||
      (!parent &&
        (update.sessionUpdate === "agent_message_chunk" ||
          update.sessionUpdate === "agent_thought_chunk"))
      ? withAcpTopLevelToolCall(notification)
      : notification;
  };
}
