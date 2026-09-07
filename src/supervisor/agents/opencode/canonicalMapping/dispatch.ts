/**
 * OpenCode SDK event dispatch → canonical RuntimeEvent[].
 *
 * Translates events emitted by the legacy client's `event.subscribe`
 * into Poracode's canonical chat events.
 *
 * Reconciliation note: OpenCode interleaves `message.part.delta` (incremental)
 * with `message.part.updated` (full part snapshot). To avoid double-emit we
 * track the text we have already streamed per part-id and use
 * `suffixPrefixOverlap` to detect what's new in a snapshot.
 */

import type { EventSubscribeResponse, Part } from "../legacySdk";
import type { RuntimeEvent } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { newItemId } from "../../contextUsage";
import {
  markOpenCodeUsageScopeSampled,
  openCodeUsageScopeForSession,
  type OpenCodeMapperState,
} from "../sdkCanonicalMappingState";
import { normalizeToolName } from "./readers";
import {
  classifyPermissionActionType,
  classifyPermissionRequestType,
  permissionRequestId,
  permissionRequestPayload,
  permissionV2RequestId,
  permissionV2RequestPayload,
  type PermissionV2RequestShape,
} from "./permissions";
import {
  questionRequestId,
  questionRequestPayload,
  questionV2RequestId,
  type OpenCodeQuestionShape,
} from "./questions";
import {
  applyChildSessionProgress,
  tagChildEventsWithParent,
  tryLinkTaskToolToChildSession,
} from "./subAgents";
import {
  appendDelta,
  completeReasoningItem,
  emitTextDelta,
  ensureAssistantItemForMessage,
  ensureReasoningItemForPart,
} from "./textItems";
import { classifyToolItemType, extractOpenCodePlanSteps } from "./toolClassification";
import { toolPayload } from "./toolPayload";
import { createOpenCodeContextUsageEvent, createOpenCodeUsageSpentEvent } from "./usage";
import {
  readOpenCodeImageDataUrl,
  resolveOpenCodeAttachments,
  toOpenCodeFileRef,
} from "./fileParts";

/** True for user-initiated abort errors (Stop), which settle without an error row. */
export function isOpenCodeAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "MessageAbortedError"
  );
}

/** Extract a human message from an OpenCode native error union member. */
function readNativeErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "OpenCode session error";
  const record = error as { name?: unknown; data?: unknown };
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as { message?: unknown })
      : undefined;
  if (data && typeof data.message === "string" && data.message.length > 0) return data.message;
  if (typeof record.name === "string" && record.name.length > 0) return record.name;
  return "OpenCode session error";
}

interface OpenCodeRetryStatus {
  attempt?: number;
  message?: string;
  action?: { message?: string };
}

/**
 * Resolve the display text for a retry `session.status`: trimmed provider
 * message first, then the trimmed retry-action message, then the localized
 * fallback. Trim-first so a whitespace-only provider message falls through
 * instead of shadowing the valid action text.
 */
function resolveRetryStatusMessage(status: OpenCodeRetryStatus): string {
  return status.message?.trim() || status.action?.message?.trim() || msg("opencode.retryFallback");
}

function handlePart(state: OpenCodeMapperState, part: Part, events: RuntimeEvent[]): void {
  if (part.type === "text") {
    if (part.synthetic || part.ignored) return;
    // The optimistic user_message painted by the runtime already carries the
    // prompt text. OpenCode echoes the same text back as a TextPart on the
    // user message — emitting it as assistant text would mirror the prompt
    // into a phantom assistant bubble.
    if (state.messageRoles.get(part.messageID) === "user") {
      const itemId = state.userItems.get(part.messageID);
      if (!itemId || !state.nonOptimisticUserMessages.has(part.messageID)) return;
      const textParts = state.userMessageTextParts.get(part.messageID) ?? new Map<string, string>();
      textParts.set(part.id, part.text);
      state.userMessageTextParts.set(part.messageID, textParts);
      events.push({
        type: "item.updated",
        threadId: state.threadId,
        itemId,
        payload: {
          content: [...textParts.values()].map((text) => ({ kind: "text" as const, text })),
        },
      });
      return;
    }
    state.partTypes.set(part.id, "text");
    const itemId = ensureAssistantItemForMessage(state, part.messageID, events);
    emitTextDelta(state, part.id, itemId, part.text, "assistant_text", events);
    return;
  }
  if (part.type === "reasoning") {
    if (state.messageRoles.get(part.messageID) === "user") return;
    state.partTypes.set(part.id, "reasoning");
    const itemId = ensureReasoningItemForPart(state, part.id, part.messageID, events);
    emitTextDelta(state, part.id, itemId, part.text, "reasoning_text", events);
    // OpenCode flags reasoning completion via `time.end`. Without this close
    // the renderer's Reasoning component stays in its "Thinking" state for
    // the rest of the thread (item.state !== "completed").
    if (part.time?.end !== undefined) {
      completeReasoningItem(state, part.id, events);
      state.emittedText.delete(part.id);
    }
    return;
  }
  if (part.type === "tool") {
    // The todowrite tool publishes the authoritative session-level
    // `todo.updated` event. Mapping both would create duplicate plan rows.
    if (normalizeToolName(part.tool) === "todowrite" && part.state.status !== "error") return;
    const existing = state.toolItems.get(part.id);
    const itemType = existing?.itemType ?? classifyToolItemType(part.tool);
    const itemId = existing?.itemId ?? newItemId("tool");
    const isTask = normalizeToolName(part.tool) === "task";
    const basePayload = toolPayload(itemType, part.tool, part.state, part.metadata);
    // Completed tool states may carry `attachments: FilePart[]` (e.g. a
    // screenshot from a browser tool). Image attachments resolve to the
    // canonical `images` channel; other files surface as locations.
    const attachments =
      part.state.status === "completed" &&
      "attachments" in part.state &&
      part.state.attachments !== undefined
        ? resolveOpenCodeAttachments(part.state.attachments, part.messageID, state.location)
        : { images: [], locations: [] };
    const baseLocations = Array.isArray(basePayload.locations) ? basePayload.locations : [];
    const enrichedBase = {
      ...basePayload,
      ...(attachments.images.length > 0 ? { images: attachments.images } : {}),
      ...(attachments.locations.length > 0
        ? { locations: [...baseLocations, ...attachments.locations] }
        : {}),
    };
    // Preserve any progress we've already populated from the child session
    // when re-emitting the tool payload from a parent-side update.
    const cachedProgress = isTask
      ? (state.taskToolPayloads.get(part.id)?.progress as Record<string, unknown> | undefined)
      : undefined;
    const payload: Record<string, unknown> = cachedProgress
      ? { ...enrichedBase, progress: cachedProgress }
      : enrichedBase;
    if (isTask) state.taskToolPayloads.set(part.id, payload);
    if (!existing) {
      state.toolItems.set(part.id, { itemId, itemType });
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId,
        itemType,
        payload,
      });
      // Register the task tool so the first matching `session.created` can
      // link its child session. If a child session was already announced
      // before this part landed, claim it now.
      if (isTask) {
        state.taskToolsAwaitingChild.push({ partID: part.id, itemId });
        tryLinkTaskToolToChildSession(state);
      }
    } else {
      events.push({
        type: "item.updated",
        threadId: state.threadId,
        itemId,
        payload,
      });
    }
    if (part.state.status === "completed" || part.state.status === "error") {
      events.push({
        type: "item.completed",
        threadId: state.threadId,
        itemId,
        payload,
      });
      if (isTask) {
        state.taskToolPayloads.delete(part.id);
        // Drop the pending entry if it was never linked.
        state.taskToolsAwaitingChild = state.taskToolsAwaitingChild.filter(
          (entry) => entry.partID !== part.id,
        );
        for (const [childId, child] of state.subAgentSessions) {
          if (child.parentPartID === part.id) state.subAgentSessions.delete(childId);
        }
      }
    }
    return;
  }
  if (part.type === "file") {
    // The optimistic user bubble already carries prompt attachments, and
    // OpenCode echoes them back as FileParts on the user message — same
    // phantom-row hazard as user text (see above). Only assistant files
    // become rows.
    if (state.messageRoles.get(part.messageID) === "user") return;
    // Produced files (`{ mime, filename, url }`). Images become
    // `image_view` rows with inline bytes when readable; other files become
    // file-reference tool rows. `file://` URLs are never promoted to `<img
    // src>` — only self-contained `data:` URLs render inline.
    const ref = toOpenCodeFileRef(part, part.messageID, state.location);
    if (!ref) return;
    if (ref.isImage) {
      // Re-deliveries (SSE replay, snapshot refinement) update the same row
      // instead of opening a duplicate card.
      const existing = state.fileItems.get(part.id);
      const itemId = existing?.itemId ?? newItemId("img");
      const dataUrl = readOpenCodeImageDataUrl(ref);
      const payload: Record<string, unknown> = {
        name: ref.filename,
        title: ref.filename,
        status: "success",
        ...(ref.path ? { path: ref.path } : {}),
        mime: ref.mime,
        ...(dataUrl ? { images: [dataUrl] } : {}),
      };
      if (!existing) {
        state.fileItems.set(part.id, { itemId, itemType: "image_view", messageID: part.messageID });
        events.push({
          type: "item.started",
          threadId: state.threadId,
          itemId,
          itemType: "image_view",
          payload,
        });
        events.push({
          type: "item.completed",
          threadId: state.threadId,
          itemId,
          payload,
        });
      } else {
        events.push({
          type: "item.updated",
          threadId: state.threadId,
          itemId,
          payload,
        });
      }
      return;
    }
    const existingFile = state.fileItems.get(part.id);
    const fileItemId = existingFile?.itemId ?? newItemId("tool");
    if (!ref.path) return;
    const payload: Record<string, unknown> = {
      name: ref.filename,
      title: ref.filename,
      status: "success",
      args: { path: ref.path, mime: ref.mime },
      locations: [{ path: ref.path }],
    };
    if (!existingFile) {
      state.fileItems.set(part.id, {
        itemId: fileItemId,
        itemType: "tool_call",
        messageID: part.messageID,
      });
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId: fileItemId,
        itemType: "tool_call",
        payload,
      });
      events.push({
        type: "item.completed",
        threadId: state.threadId,
        itemId: fileItemId,
        payload,
      });
    } else {
      events.push({
        type: "item.updated",
        threadId: state.threadId,
        itemId: fileItemId,
        payload,
      });
    }
    return;
  }
  // subtask / step-start / step-finish / patch / agent / compaction / snapshot —
  // transport-level progress markers with no chat-row equivalent. Step cost
  // and tokens are already accounted at the message level (`message.updated`
  // usage events); agent switches have no provider-handoff anchor (no
  // from/to pair is tracked). Retries are surfaced through `session.status`
  // as transient error events so upstream throttling/failures never stall silently.
  // They are intentionally not surfaced as their own canonical items.
}

function mapCanonicalEvent(
  event: EventSubscribeResponse,
  state: OpenCodeMapperState,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];

  switch (event.type) {
    case "message.part.delta": {
      const { partID, messageID, field, delta } = event.properties;
      if (state.messageRoles.get(messageID) === "user") return events;
      // Route by part type, not field name. OpenCode emits `field: "text"` for
      // both TextPart and ReasoningPart deltas (the field is the property name
      // on the part — both have a `text` property), so the field alone is
      // ambiguous. The part type comes from the preceding `message.part.updated`
      // snapshot. If a delta sneaks in before that snapshot, fall back to the
      // field name (with `field === "reasoning"` honoured forward-compatibly,
      // even though the current emitter only sends "text").
      const knownType = state.partTypes.get(partID);
      const route =
        knownType ?? (field === "reasoning" ? "reasoning" : field === "text" ? "text" : undefined);
      // Non-text fields (tool input streaming, etc.) are intentionally
      // ignored — the tool row's running state already covers liveness, and
      // the `session.next.*` execution stream that mirrors them is skipped
      // below to avoid double-emit.
      if (route === "reasoning") {
        const itemId = ensureReasoningItemForPart(state, partID, messageID, events);
        appendDelta(state, partID, itemId, delta, "reasoning_text", events);
      } else if (route === "text") {
        const itemId = ensureAssistantItemForMessage(state, messageID, events);
        appendDelta(state, partID, itemId, delta, "assistant_text", events);
      }
      return events;
    }
    case "message.part.updated": {
      handlePart(state, event.properties.part, events);
      return events;
    }
    case "message.part.removed": {
      const { messageID, partID } = event.properties;
      const userTextParts = state.userMessageTextParts.get(messageID);
      if (userTextParts?.delete(partID)) {
        if (userTextParts.size === 0) state.userMessageTextParts.delete(messageID);
        const itemId = state.userItems.get(messageID);
        if (itemId && state.nonOptimisticUserMessages.has(messageID)) {
          events.push({
            type: "item.updated",
            threadId: state.threadId,
            itemId,
            payload: {
              content: [...userTextParts.values()].map((text) => ({ kind: "text" as const, text })),
            },
          });
        }
      }
      const tool = state.toolItems.get(partID);
      if (tool) {
        events.push({
          type: "item.completed",
          threadId: state.threadId,
          itemId: tool.itemId,
        });
        state.toolItems.delete(partID);
      }
      const file = state.fileItems.get(partID);
      if (file) {
        events.push({
          type: "item.completed",
          threadId: state.threadId,
          itemId: file.itemId,
        });
        state.fileItems.delete(partID);
      }
      completeReasoningItem(state, partID, events);
      state.emittedText.delete(partID);
      state.partTypes.delete(partID);
      return events;
    }
    case "message.updated": {
      const info = event.properties.info;
      const usageEvent = createOpenCodeContextUsageEvent(state.threadId, info);
      if (usageEvent) events.push(usageEvent);
      state.messageRoles.set(info.id, info.role);
      // Assistant-level failures (auth, output-length, content filter, API
      // errors) arrive on the message, not as `session.error`. Surface them
      // as transient error events (same channel Claude uses) so a failed
      // turn is never a silent stall. Exact-once per message. Aborts are
      // excluded — user-initiated Stops already settle via `turn.completed:
      // interrupted`, and an error row on every Stop would be noise.
      if (
        info.role === "assistant" &&
        "error" in info &&
        info.error !== undefined &&
        !isOpenCodeAbortError(info.error) &&
        !state.errorEmittedMessages.has(info.id)
      ) {
        state.errorEmittedMessages.add(info.id);
        events.push({
          type: "error",
          threadId: state.threadId,
          message: readNativeErrorMessage(info.error),
        });
      }
      if (info.role === "user" && !state.userItems.has(info.id)) {
        const optimistic = state.pendingUserMessageItemIds.shift();
        const itemId = optimistic ?? newItemId("user");
        state.userItems.set(info.id, itemId);
        // When the runtime already painted an optimistic user_message and
        // handed us its id, the chat pane has the complete bubble — re-emitting
        // item.started would either create a phantom item (different id) or
        // be no-op'd by the per-id dedupe. Skip the emit either way.
        if (!optimistic) {
          state.nonOptimisticUserMessages.add(info.id);
          events.push({
            type: "item.started",
            threadId: state.threadId,
            itemId,
            itemType: "user_message",
          });
        }
      }
      // For assistant messages, item.started was emitted from the first part.
      // If `info.time.completed` is present, close the assistant item and any
      // reasoning items belonging to this message — defense-in-depth in case
      // the reasoning Part snapshot didn't carry `time.end` before the message
      // wrapped up.
      if (info.role === "assistant" && info.time?.completed) {
        // Token spend is final only on the completed snapshot (earlier
        // message.updated snapshots still evolve), and emitted exactly once
        // per message id — the ledger dedups per-call samples by sampleId.
        // Child (subagent) sessions scope to their own session id.
        if (!state.usageSpentMessages.has(info.id)) {
          const scope = openCodeUsageScopeForSession(state, info.sessionID);
          const spentEvent = createOpenCodeUsageSpentEvent(state.threadId, info, scope);
          if (spentEvent) {
            state.usageSpentMessages.add(info.id);
            markOpenCodeUsageScopeSampled(state, scope.scopeId);
            events.push(spentEvent);
          }
        }
        const itemId = state.assistantItems.get(info.id);
        if (itemId) {
          events.push({
            type: "item.completed",
            threadId: state.threadId,
            itemId,
          });
          state.assistantItems.delete(info.id);
        }
        for (const [partID, entry] of state.reasoningItems) {
          if (entry.messageID !== info.id) continue;
          events.push({
            type: "item.completed",
            threadId: state.threadId,
            itemId: entry.itemId,
          });
          state.reasoningItems.delete(partID);
          state.emittedText.delete(partID);
        }
      }
      return events;
    }
    case "message.removed": {
      const { messageID } = event.properties;
      const a = state.assistantItems.get(messageID);
      if (a) {
        events.push({ type: "item.completed", threadId: state.threadId, itemId: a });
        state.assistantItems.delete(messageID);
      }
      const u = state.userItems.get(messageID);
      if (u) {
        events.push({ type: "item.completed", threadId: state.threadId, itemId: u });
        state.userItems.delete(messageID);
      }
      for (const [partID, entry] of state.fileItems) {
        if (entry.messageID !== messageID) continue;
        events.push({ type: "item.completed", threadId: state.threadId, itemId: entry.itemId });
        state.fileItems.delete(partID);
      }
      state.nonOptimisticUserMessages.delete(messageID);
      state.userMessageTextParts.delete(messageID);
      return events;
    }
    case "permission.asked": {
      const req = event.properties;
      const requestType = classifyPermissionRequestType(req);
      const { summary, details, options } = permissionRequestPayload(req);
      events.push({
        type: "request.opened",
        threadId: state.threadId,
        requestId: permissionRequestId(req.id),
        requestType,
        payload: { summary, details, options },
      });
      return events;
    }
    case "permission.replied": {
      const { requestID, reply } = event.properties;
      events.push({
        type: "request.resolved",
        threadId: state.threadId,
        requestId: permissionRequestId(requestID),
        outcome: reply === "reject" ? "declined" : "accepted",
      });
      return events;
    }
    case "question.asked": {
      const req = event.properties;
      events.push({
        type: "request.opened",
        threadId: state.threadId,
        requestId: questionRequestId(req.id),
        requestType: "tool_user_input",
        payload: questionRequestPayload(req),
      });
      return events;
    }
    case "question.replied": {
      events.push({
        type: "request.resolved",
        threadId: state.threadId,
        requestId: questionRequestId(event.properties.requestID),
        outcome: "answered",
      });
      return events;
    }
    case "question.rejected": {
      events.push({
        type: "request.resolved",
        threadId: state.threadId,
        requestId: questionRequestId(event.properties.requestID),
        outcome: "declined",
      });
      return events;
    }
    case "todo.updated": {
      // The session-level native todo list. One plan row per session: started
      // on first sight, refreshed after. `cancelled` todos are dropped by the
      // shared extractor (no canonical cancelled state).
      const steps = extractOpenCodePlanSteps({ todos: event.properties.todos });
      const payload = { steps };
      if (!state.nativeTodoItemId) {
        const itemId = newItemId("plan");
        state.nativeTodoItemId = itemId;
        events.push({
          type: "item.started",
          threadId: state.threadId,
          itemId,
          itemType: "plan",
          payload,
        });
      } else {
        events.push({
          type: "item.updated",
          threadId: state.threadId,
          itemId: state.nativeTodoItemId,
          payload,
        });
      }
      return events;
    }
    case "permission.v2.asked": {
      const req = event.properties as PermissionV2RequestShape & { id: string };
      const shape: PermissionV2RequestShape = {
        id: req.id,
        sessionID: req.sessionID,
        action: req.action,
        resources: Array.isArray(req.resources) ? req.resources : [],
        ...(Array.isArray(req.save) ? { save: req.save } : {}),
        ...(req.metadata && typeof req.metadata === "object"
          ? { metadata: req.metadata as Record<string, unknown> }
          : {}),
      };
      const { summary, details, options } = permissionV2RequestPayload(shape);
      events.push({
        type: "request.opened",
        threadId: state.threadId,
        requestId: permissionV2RequestId(req.id),
        requestType: classifyPermissionActionType(req.action),
        payload: { summary, details, options },
      });
      return events;
    }
    case "permission.v2.replied": {
      const { requestID, reply } = event.properties;
      events.push({
        type: "request.resolved",
        threadId: state.threadId,
        requestId: permissionV2RequestId(requestID),
        outcome: reply === "reject" ? "declined" : "accepted",
      });
      return events;
    }
    case "question.v2.asked": {
      const req = event.properties as OpenCodeQuestionShape & { id: string };
      events.push({
        type: "request.opened",
        threadId: state.threadId,
        requestId: questionV2RequestId(req.id),
        requestType: "tool_user_input",
        payload: questionRequestPayload(req),
      });
      return events;
    }
    case "question.v2.replied": {
      events.push({
        type: "request.resolved",
        threadId: state.threadId,
        requestId: questionV2RequestId(event.properties.requestID),
        outcome: "answered",
      });
      return events;
    }
    case "question.v2.rejected": {
      events.push({
        type: "request.resolved",
        threadId: state.threadId,
        requestId: questionV2RequestId(event.properties.requestID),
        outcome: "declined",
      });
      return events;
    }
    case "session.error": {
      const err = event.properties.error as
        | { name?: string; data?: { message?: string } }
        | undefined;
      if (isOpenCodeAbortError(err)) return events;
      events.push({
        type: "error",
        threadId: state.threadId,
        message: readNativeErrorMessage(err),
      });
      return events;
    }
    case "session.status": {
      const status = (
        event.properties as
          | {
              status?: {
                type: string;
                attempt?: number;
                message?: string;
                action?: { message?: string };
              };
            }
          | undefined
      )?.status;
      if (status?.type === "retry") {
        const message = resolveRetryStatusMessage(status);
        const retryKey = `${status.attempt ?? 1}:${message}`;
        if (state.lastEmittedRetryKey !== retryKey) {
          state.lastEmittedRetryKey = retryKey;
          events.push({
            type: "error",
            threadId: state.threadId,
            message,
          });
        }
      } else if (status?.type === "busy" || status?.type === "idle") {
        state.lastEmittedRetryKey = undefined;
      }
      return events;
    }
    // Intentionally not surfaced (no chat-row equivalent; covered elsewhere):
    // - session.created (child linking handled in mapOpenCodeEvent; the main
    //   session id comes from openThread), session.updated/deleted,
    //   session.diff (aggregate of per-tool file changes), session.compacted,
    //   session.idle (thread status via StructuredSessionListener; status
    //   is handled above to surface retries),
    // - command.executed (slash commands already listed via command.list),
    // - file.edited, file.watcher.updated, reference.updated, lsp.updated,
    //   project.*, workspace.*, worktree.*, vcs.*, pty.*, tui.*, mcp.*,
    //   installation.*, plugin.* (provider/environment chrome, not chat),
    // - session.next.* (fine-grained execution stream of the embedded v2
    //   runtime; message.part.* already carries the same content coarsely —
    //   consuming both would double-emit).
    default:
      return events;
  }
}

/**
 * Map a single OpenCode SSE event to canonical RuntimeEvents. Returns an
 * empty array for events that are not surfaced (or are session-status only —
 * `session.status` retry rows are emitted as transient `error` events here
 * and the working/idle state is surfaced through
 * `StructuredSessionListener.onUpdate` separately by the session class).
 */
export function mapOpenCodeEvent(
  event: EventSubscribeResponse,
  state: OpenCodeMapperState,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];

  // Detect subagent child-session creation. OpenCode runs `task` tools in a
  // fresh session whose `parentID` points at our main session. Queue it for
  // pairing with a running task-tool part — pair right away if one already
  // awaits a child.
  if (event.type === "session.created") {
    const info = event.properties.info;
    if (
      state.mainSessionId &&
      info.parentID === state.mainSessionId &&
      !state.subAgentSessions.has(info.id)
    ) {
      state.unclaimedChildSessions.push(info.id);
      tryLinkTaskToolToChildSession(state);
    }
    return events;
  }

  const sessionID = (event.properties as { sessionID?: string } | undefined)?.sessionID;
  const child = sessionID ? state.subAgentSessions.get(sessionID) : undefined;

  // For tracked child sessions, first update progress on the parent task tool
  // (this is what powers the "Subagents X/Y" chip's step counter even when the
  // overlay is closed).
  if (child) {
    applyChildSessionProgress(event, state, child, events);
  }

  // Native todo syncs from child sessions are subagent-internal detail — the
  // parent task row already surfaces stepCount progress, and the mapper keeps
  // a single native plan row per thread. Map them only for the main session.
  // Child `session.status` retries are likewise subagent-internal: emitting
  // them would leak a child throttling row into the main timeline and poison
  // the shared retry-dedup key, suppressing an identical parent retry.
  const canonicalEvents =
    child && (event.type === "todo.updated" || event.type === "session.status")
      ? []
      : mapCanonicalEvent(event, state);

  if (child) {
    // Tag any new canonical items as belonging to this sub-agent so they get
    // routed into the overlay buffer rather than the main chat timeline. The
    // child-session message/part IDs are independent UUIDs from OpenCode, so
    // they don't collide with parent items in the mapper's shared state maps.
    tagChildEventsWithParent(canonicalEvents, child.itemId);
    // Suppress context.updated events from child sessions — the context dock
    // tracks the main session only; child sessions have their own budgets
    // that don't roll up into the parent's display. usage.spent still flows
    // through: the ledger keys it by the child's own scope id.
    for (const ev of canonicalEvents) {
      if (ev.type === "context.updated") continue;
      events.push(ev);
    }
    return events;
  }

  events.push(...canonicalEvents);
  return events;
}
