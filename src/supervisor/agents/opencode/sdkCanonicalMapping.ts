/**
 * OpenCode SDK → canonical RuntimeEvent mapper.
 *
 * Translates events emitted by `client.event.subscribe` (`@opencode-ai/sdk/v2`)
 * into Poracode's canonical chat events. Mirrors the role of
 * `acp/canonicalMapping.ts` for the ACP protocol.
 *
 * Reconciliation note: OpenCode interleaves `message.part.delta` (incremental)
 * with `message.part.updated` (full part snapshot). To avoid double-emit we
 * track the text we have already streamed per part-id and use
 * `suffixPrefixOverlap` to detect what's new in a snapshot.
 */

import type {
  EventSubscribeResponse,
  Part,
  PermissionRequest,
  QuestionRequest,
  ToolState,
} from "@opencode-ai/sdk/v2";
import type {
  CanonicalItemType,
  CanonicalRequestType,
  PermissionRequestDetails,
  RuntimeEvent,
  UserInputOption,
} from "@/shared/contracts";
import { readDiffSummary, readFileChangePath } from "../fileChangeSummary";
import {
  createContextUsageEvent,
  newItemId,
  readNonNegativeInteger,
  usageFromTokenCounts,
} from "../contextUsage";

import { normalizeOpenCodeFileChangeMetadata } from "./sdkCanonicalFileChangeMetadata";
import {
  createOpenCodeMapperState,
  isOpenCodeChildSession,
  setOpenCodeMainSessionId,
  type OpenCodeMapperState,
  type OpenCodeSubAgentSessionState,
} from "./sdkCanonicalMappingState";

export {
  createOpenCodeMapperState,
  isOpenCodeChildSession,
  setOpenCodeMainSessionId,
  type OpenCodeMapperState,
  type OpenCodeSubAgentSessionState,
};

/** Longest suffix of `emitted` that is a prefix of `full`. */
function suffixPrefixOverlap(emitted: string, full: string): number {
  const max = Math.min(emitted.length, full.length);
  for (let i = max; i > 0; i -= 1) {
    if (emitted.endsWith(full.slice(0, i))) return i;
  }
  return 0;
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase();
}

function classifyToolItemType(toolName: string): CanonicalItemType {
  const n = normalizeToolName(toolName);
  // OpenCode's todo tool is named `todowrite` (the legacy `todoread` may also
  // surface). Route both into the canonical `plan` item so the renderer picks
  // it up via `ThreadTodoDock` instead of a generic tool accordion.
  if (n === "todowrite" || n === "todoread") return "plan";
  if (/(^|[_-])bash($|[_-])|(^|[_-])shell($|[_-])|(^|[_-])command($|[_-])/.test(n)) {
    return "command_execution";
  }
  if (/(^|[_-])(create|edit|write|patch|multiedit)($|[_-])/.test(n)) {
    return "file_change";
  }
  if (/(^|[_-])(webfetch|websearch)($|[_-])/.test(n)) {
    return "web_search";
  }
  return "tool_call";
}

function readStringField(
  input: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!input) return undefined;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function readOpenCodePath(input: Record<string, unknown> | undefined): string | undefined {
  return readStringField(
    input,
    "filePath",
    "file_path",
    "path",
    "relativePath",
    "relative_path",
    "notebookPath",
    "notebook_path",
  );
}

function inferFileChangeKind(
  toolName: string,
  ...sources: unknown[]
): "create" | "edit" | "delete" {
  const n = normalizeToolName(toolName);
  if (/create|write/.test(n)) return "create";
  if (/delete|rm/.test(n)) return "delete";
  for (const source of sources) {
    const kind = inferFileChangeKindFromSource(source);
    if (kind) return kind;
  }
  return "edit";
}

function inferFileChangeKindFromSource(source: unknown): "create" | "delete" | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  const direct = readStringField(record, "changeKind", "change_kind", "type")?.toLowerCase();
  if (direct === "create" || direct === "add") return "create";
  if (direct === "delete" || direct === "remove") return "delete";
  const patchText = readStringField(record, "patchText", "patch_text", "patch");
  const patchKind = inferPatchTextKind(patchText);
  if (patchKind) return patchKind;
  const changesKind = inferChangesKind(record.changes);
  if (changesKind) return changesKind;
  return inferFileChangeKindFromSource(record.args) ?? inferFileChangeKindFromSource(record.input);
}

function inferPatchTextKind(patchText: string | undefined): "create" | "delete" | undefined {
  if (!patchText) return undefined;
  const operations = [...patchText.matchAll(/^\*\*\*\s+(Add|Update|Delete)\s+File:/gm)].map(
    (match) => match[1],
  );
  if (operations.length === 0) return undefined;
  if (operations.every((operation) => operation === "Add")) return "create";
  if (operations.every((operation) => operation === "Delete")) return "delete";
  return undefined;
}

function inferChangesKind(changes: unknown): "create" | "delete" | undefined {
  if (!Array.isArray(changes) || changes.length === 0) return undefined;
  const kinds = changes.flatMap((change) => {
    if (!change || typeof change !== "object") return [];
    const kind = (change as Record<string, unknown>).kind;
    if (!kind || typeof kind !== "object") return [];
    const type = readStringField(kind as Record<string, unknown>, "type")?.toLowerCase();
    return type ? [type] : [];
  });
  if (kinds.length === 0) return undefined;
  if (kinds.every((kind) => kind === "add" || kind === "create")) return "create";
  if (kinds.every((kind) => kind === "delete" || kind === "remove")) return "delete";
  return undefined;
}

function openCodeToolKind(
  toolName: string,
): "read" | "search" | "fetch" | "execute" | "other" | undefined {
  switch (normalizeToolName(toolName)) {
    case "read":
    case "view":
      return "read";
    case "glob":
    case "grep":
    case "search":
      return "search";
    case "webfetch":
      return "fetch";
    case "bash":
      return "execute";
    case "question":
    case "invalid":
      return "other";
    default:
      return undefined;
  }
}

function openCodeToolTitle(
  toolName: string,
  input: Record<string, unknown> | undefined,
  stateTitle: string | undefined,
): string {
  const title = stateTitle?.trim();
  if (title) return title;

  switch (normalizeToolName(toolName)) {
    case "read":
    case "view":
      return readOpenCodePath(input) ?? "Read";
    case "glob":
      return readStringField(input, "pattern", "glob") ?? "Glob";
    case "search":
    case "grep": {
      const pattern = readStringField(input, "pattern", "query", "needle");
      const scope = readStringField(input, "path", "glob", "include");
      if (pattern && scope) return `"${pattern}" in ${scope}`;
      return pattern ?? (normalizeToolName(toolName) === "search" ? "Search" : "Grep");
    }
    case "webfetch":
      return readStringField(input, "url") ?? "Fetch";
    case "skill":
      return readStringField(input, "skill", "name") ?? "Skill";
    case "task":
      return readStringField(input, "description", "prompt") ?? "Agent";
    default:
      return toolName;
  }
}

function openCodeToolLocations(
  toolName: string,
  input: Record<string, unknown> | undefined,
): Array<{ path: string }> | undefined {
  const n = normalizeToolName(toolName);
  if (n === "read" || n === "view") {
    const path = readOpenCodePath(input);
    return path ? [{ path }] : undefined;
  }
  if (n === "grep" || n === "search") {
    const path = readStringField(input, "path");
    return path ? [{ path }] : undefined;
  }
  return undefined;
}

/**
 * Extract canonical plan steps from a `todowrite` tool's input. OpenCode's
 * tool input mirrors Claude's: `{ todos: [{ content, status, priority }] }`.
 * Anything we can't recognise is dropped — empty `steps` results in an empty
 * dock entry, which the renderer treats as "no plan yet".
 */
function extractOpenCodePlanSteps(
  input: Record<string, unknown> | undefined,
): Array<{ step: string; status: "pending" | "in_progress" | "completed" }> {
  const todos = input?.todos;
  if (!Array.isArray(todos)) return [];
  return todos.flatMap((todo) => {
    if (!todo || typeof todo !== "object") return [];
    const obj = todo as Record<string, unknown>;
    const step =
      typeof obj.content === "string" && obj.content.trim().length > 0
        ? obj.content.trim()
        : "Task";
    const status =
      obj.status === "completed"
        ? "completed"
        : obj.status === "in_progress"
          ? "in_progress"
          : "pending";
    return [{ step, status }];
  });
}

function toolStateStatus(state: ToolState): "running" | "success" | "error" {
  if (state.status === "completed") return "success";
  if (state.status === "error") return "error";
  return "running";
}

function createOpenCodeContextUsageEvent(
  threadId: string,
  info: unknown,
): RuntimeEvent | undefined {
  if (!info || typeof info !== "object") return undefined;
  const tokens = (info as { tokens?: unknown }).tokens;
  if (!tokens || typeof tokens !== "object") return undefined;
  const obj = tokens as Record<string, unknown>;
  const cache =
    obj.cache && typeof obj.cache === "object" ? (obj.cache as Record<string, unknown>) : {};
  return createContextUsageEvent(
    threadId,
    usageFromTokenCounts({
      inputTokens: readNonNegativeInteger(obj.input),
      outputTokens: readNonNegativeInteger(obj.output),
      thoughtTokens: readNonNegativeInteger(obj.reasoning),
      cachedReadTokens: readNonNegativeInteger(cache.read),
      cachedWriteTokens: readNonNegativeInteger(cache.write),
    }),
  );
}

/**
 * Build the canonical payload for a tool item based on its current state.
 *
 * Mirrors `buildAcpToolCallPayload`: every payload carries `name`/`args`/
 * `status` (and `result` when complete) so the unified accordion body can
 * surface the full request/response, with the canonical type-specific fields
 * (`command`, `path`, `query`, etc.) layered on top for renderers that key off
 * of them.
 */
function toolPayload(
  itemType: CanonicalItemType,
  toolName: string,
  state: ToolState,
  partMetadata?: Record<string, unknown>,
): Record<string, unknown> {
  const status = toolStateStatus(state);
  const input = state.input as Record<string, unknown> | undefined;
  const title = openCodeToolTitle(
    toolName,
    input,
    "title" in state && typeof state.title === "string" ? state.title : undefined,
  );
  const result =
    state.status === "completed"
      ? state.output
      : state.status === "error"
        ? state.error
        : undefined;
  const metadata =
    "metadata" in state && state.metadata && typeof state.metadata === "object"
      ? (state.metadata as Record<string, unknown>)
      : partMetadata;
  const errorMessage = state.status === "error" ? state.error : undefined;
  const kind = openCodeToolKind(toolName);
  const locations = openCodeToolLocations(toolName, input);
  const base: Record<string, unknown> = {
    name: normalizeToolName(toolName) === "skill" ? "Skill" : title,
    args: input,
    status,
    ...(title !== toolName ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations ? { locations } : {}),
    ...(result !== undefined ? { result } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(metadata ? { metadata } : {}),
  };

  if (itemType === "command_execution") {
    const command = readStringField(input, "command", "cmd") ?? "";
    const cwd = readStringField(input, "cwd");
    const md =
      (state.status === "completed" || state.status === "error"
        ? (state.metadata as Record<string, unknown> | undefined)
        : undefined) ?? undefined;
    const durationMs =
      (state.status === "completed" || state.status === "error") && state.time?.end !== undefined
        ? state.time.end - state.time.start
        : undefined;
    const exitCode =
      md && typeof md.exit === "number"
        ? (md.exit as number)
        : md && typeof md.exitCode === "number"
          ? (md.exitCode as number)
          : undefined;
    return {
      ...base,
      command,
      ...(cwd ? { cwd } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };
  }
  if (itemType === "file_change") {
    const fileChangeMetadata = normalizeOpenCodeFileChangeMetadata(metadata);
    const path =
      readFileChangePath(fileChangeMetadata, input, result, metadata, partMetadata, title) ?? "";
    const diffSummary = readDiffSummary(fileChangeMetadata, input, result, metadata, partMetadata);
    return {
      ...base,
      ...(fileChangeMetadata ? { metadata: fileChangeMetadata } : {}),
      // OpenCode's edit/write tools overwrite `state.title` on completion
      // with the human-readable result message ("Success. Updated the
      // following files: M src/foo.ts"). The path is extracted separately
      // and rendered as the row title, so anchor `name` to the tool name
      // instead of the polluted title.
      name: toolName,
      path,
      changeKind: inferFileChangeKind(
        toolName,
        input,
        result,
        fileChangeMetadata,
        metadata,
        partMetadata,
      ),
      ...(diffSummary ? { diffSummary } : {}),
    };
  }
  if (itemType === "web_search") {
    const query =
      readStringField(input, "query", "q", "url") ??
      (normalizeToolName(toolName) === "webfetch" ? title : "");
    return { ...base, query };
  }
  if (itemType === "plan") {
    // PlanItemPayload is strictly `{ steps }` — surfacing `name`/`args` here
    // would fail schema validation, so the plan branch returns the canonical
    // shape directly. The dock reads `steps`, the runtime ignores the rest.
    return { steps: extractOpenCodePlanSteps(state.input as Record<string, unknown> | undefined) };
  }
  if (normalizeToolName(toolName) === "task") {
    return { ...base, name: "Agent", isSubAgent: true };
  }
  return base;
}

function ensureAssistantItemForMessage(
  state: OpenCodeMapperState,
  messageID: string,
  events: RuntimeEvent[],
): string {
  const existing = state.assistantItems.get(messageID);
  if (existing) return existing;
  const itemId = newItemId("asst");
  state.assistantItems.set(messageID, itemId);
  events.push({
    type: "item.started",
    threadId: state.threadId,
    itemId,
    itemType: "assistant_message",
  });
  return itemId;
}

function ensureReasoningItemForPart(
  state: OpenCodeMapperState,
  partID: string,
  messageID: string,
  events: RuntimeEvent[],
): string {
  const existing = state.reasoningItems.get(partID);
  if (existing) return existing.itemId;
  const itemId = newItemId("reason");
  state.reasoningItems.set(partID, { itemId, messageID });
  events.push({
    type: "item.started",
    threadId: state.threadId,
    itemId,
    itemType: "reasoning",
  });
  return itemId;
}

function completeReasoningItem(
  state: OpenCodeMapperState,
  partID: string,
  events: RuntimeEvent[],
): void {
  const entry = state.reasoningItems.get(partID);
  if (!entry) return;
  events.push({ type: "item.completed", threadId: state.threadId, itemId: entry.itemId });
  state.reasoningItems.delete(partID);
}

function emitTextDelta(
  state: OpenCodeMapperState,
  partID: string,
  itemId: string,
  full: string,
  stream: "assistant_text" | "reasoning_text",
  events: RuntimeEvent[],
): void {
  const emitted = state.emittedText.get(partID) ?? "";
  if (emitted === full) return;
  if (full.startsWith(emitted)) {
    const tail = full.slice(emitted.length);
    if (tail.length === 0) return;
    state.emittedText.set(partID, full);
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId,
      stream,
      delta: tail,
    });
    return;
  }
  // Snapshot diverged — use overlap to find the new tail.
  const overlap = suffixPrefixOverlap(emitted, full);
  const tail = full.slice(overlap);
  state.emittedText.set(partID, emitted + tail);
  if (tail.length > 0) {
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId,
      stream,
      delta: tail,
    });
  }
}

function appendDelta(
  state: OpenCodeMapperState,
  partID: string,
  itemId: string,
  delta: string,
  stream: "assistant_text" | "reasoning_text",
  events: RuntimeEvent[],
): void {
  if (delta.length === 0) return;
  const emitted = state.emittedText.get(partID) ?? "";
  state.emittedText.set(partID, emitted + delta);
  events.push({
    type: "content.delta",
    threadId: state.threadId,
    itemId,
    stream,
    delta,
  });
}

/**
 * Try to link a queued `task` tool part to a queued child session. Pairs
 * the heads of both queues in FIFO order so concurrent task tools (rare
 * but possible) stay matched to the order they fired.
 */
function tryLinkTaskToolToChildSession(state: OpenCodeMapperState): void {
  while (state.taskToolsAwaitingChild.length > 0 && state.unclaimedChildSessions.length > 0) {
    const tool = state.taskToolsAwaitingChild.shift();
    const childId = state.unclaimedChildSessions.shift();
    if (!tool || !childId) continue;
    state.subAgentSessions.set(childId, {
      parentPartID: tool.partID,
      itemId: tool.itemId,
      toolPartIds: new Set(),
    });
  }
}

function emitSubAgentProgressUpdate(
  state: OpenCodeMapperState,
  child: OpenCodeSubAgentSessionState,
  events: RuntimeEvent[],
): void {
  const cached = state.taskToolPayloads.get(child.parentPartID);
  if (!cached) return;
  const stepCount = child.toolPartIds.size;
  const progress: Record<string, unknown> = { stepCount };
  if (child.lastToolName) progress.lastToolName = child.lastToolName;
  if (child.description) progress.description = child.description;
  const payload: Record<string, unknown> = { ...cached, progress };
  state.taskToolPayloads.set(child.parentPartID, payload);
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: child.itemId,
    payload,
  });
}

/**
 * Update progress state and emit an `item.updated` on the parent task tool
 * when something noteworthy happens in a tracked child session.
 */
function applyChildSessionProgress(
  event: EventSubscribeResponse,
  state: OpenCodeMapperState,
  child: OpenCodeSubAgentSessionState,
  events: RuntimeEvent[],
): void {
  switch (event.type) {
    case "message.part.updated": {
      const part = event.properties.part;
      if (part.type === "tool") {
        child.toolPartIds.add(part.id);
        const toolDisplay = normalizeToolName(part.tool) === "task" ? "Agent" : part.tool;
        if (
          part.state.status === "running" ||
          part.state.status === "completed" ||
          part.state.status === "error"
        ) {
          child.lastToolName = toolDisplay;
        }
        // Re-emit on every transition so `lastToolName` updates land even
        // when the partID is the same (running → completed) and stepCount
        // doesn't change.
        emitSubAgentProgressUpdate(state, child, events);
        return;
      }
      if (part.type === "text" && !child.description) {
        // Stash the first text the subagent emits as a short description.
        const trimmed = part.text.trim();
        if (trimmed.length > 0) {
          child.description = trimmed.slice(0, 160);
          emitSubAgentProgressUpdate(state, child, events);
        }
      }
      return;
    }
    case "session.idle":
    case "session.compacted":
    case "session.deleted": {
      // Final progress flush; the parent task tool's own
      // `message.part.updated` (status=completed) will close the item.
      // Note: we intentionally leave the child entry in `subAgentSessions`
      // so any straggling events (e.g. message.part.removed) still route
      // here. It's cleaned up when the parent task tool completes.
      emitSubAgentProgressUpdate(state, child, events);
      return;
    }
    default:
      return;
  }
}

/**
 * Tag `item.started` events with `parentItemId` so child-session items are
 * routed to the sub-agent overlay buffer instead of the main chat timeline.
 * Mirrors Claude's `tagParent` helper.
 */
function tagChildEventsWithParent(events: RuntimeEvent[], parentItemId: string): void {
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i]!;
    if (ev.type !== "item.started") continue;
    if ("parentItemId" in ev && typeof ev.parentItemId === "string") continue;
    events[i] = { ...ev, parentItemId };
  }
}

function handlePart(state: OpenCodeMapperState, part: Part, events: RuntimeEvent[]): void {
  if (part.type === "text") {
    if (part.synthetic || part.ignored) return;
    // The optimistic user_message painted by the runtime already carries the
    // prompt text. OpenCode echoes the same text back as a TextPart on the
    // user message — emitting it as assistant text would mirror the prompt
    // into a phantom assistant bubble.
    if (state.messageRoles.get(part.messageID) === "user") return;
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
    const existing = state.toolItems.get(part.id);
    const itemType = existing?.itemType ?? classifyToolItemType(part.tool);
    const itemId = existing?.itemId ?? newItemId("tool");
    const isTask = normalizeToolName(part.tool) === "task";
    const basePayload = toolPayload(itemType, part.tool, part.state, part.metadata);
    // Preserve any progress we've already populated from the child session
    // when re-emitting the tool payload from a parent-side update.
    const cachedProgress = isTask
      ? (state.taskToolPayloads.get(part.id)?.progress as Record<string, unknown> | undefined)
      : undefined;
    const payload: Record<string, unknown> = cachedProgress
      ? { ...basePayload, progress: cachedProgress }
      : basePayload;
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
  // file / step-start / step-finish / patch / agent / retry / compaction /
  // subtask / snapshot — not surfaced as their own canonical items in this
  // pass. They are observable via message.updated payloads or downstream
  // dedicated UI surfaces.
}

function classifyPermissionRequestType(req: PermissionRequest): CanonicalRequestType {
  switch (req.permission) {
    case "bash":
      return "command_execution_approval";
    case "edit":
      return "file_change_approval";
    case "read":
      return "file_change_approval";
    default:
      return "command_execution_approval";
  }
}

function permissionRequestPayload(req: PermissionRequest): {
  summary: string;
  details: PermissionRequestDetails;
  options: UserInputOption[];
} {
  const target = readPermissionTarget(req);
  const targetKind = classifyPermissionTargetKind(req.permission);
  const options: UserInputOption[] = [
    { optionId: "reject", label: "Deny" },
    { optionId: "once", label: "Allow" },
  ];
  if (Array.isArray(req.always) && req.always.length > 0) {
    options.push({ optionId: "always", label: "Allow always" });
  }
  return {
    summary: "Permission required",
    details: {
      toolName: req.permission,
      displayName: "target",
      decisionReason: permissionDescription(req.permission),
      input: targetKind === "path" ? { path: target } : { command: target },
    },
    options,
  };
}

function readPermissionTarget(req: PermissionRequest): string {
  const metadata = req.metadata && typeof req.metadata === "object" ? req.metadata : undefined;
  const metadataTarget = metadata
    ? (readStringMetadata(metadata, "description") ?? readStringMetadata(metadata, "target"))
    : undefined;
  return metadataTarget ?? req.patterns?.find((pattern) => pattern.length > 0) ?? req.permission;
}

function readStringMetadata(metadata: object, key: string): string | undefined {
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function classifyPermissionTargetKind(permission: string): "command" | "path" {
  return permission === "read" || permission === "edit" ? "path" : "command";
}

function permissionDescription(permission: string): string {
  switch (permission) {
    case "bash":
      return "OpenCode wants to run a command.";
    case "read":
      return "OpenCode wants to read a file.";
    case "edit":
      return "OpenCode wants to edit files.";
    case "task":
      return "OpenCode wants to start a subagent.";
    default:
      return `OpenCode wants to use ${permission}.`;
  }
}

function questionRequestPayload(req: QuestionRequest): {
  summary: string;
  details?: unknown;
  options?: { optionId: string; label: string; description?: string }[];
  multiSelect?: boolean;
} {
  const questions = req.questions ?? [];
  const summary =
    questions.length > 1
      ? (questions[0]?.question ?? questions[0]?.header ?? "Input requested")
      : questions
          .map((q) => q.header ?? q.question ?? "")
          .filter((s) => s.length > 0)
          .join("\n") || "Input requested";
  const formQuestions = [];
  for (let qi = 0; qi < questions.length; qi += 1) {
    const q = questions[qi]!;
    const opts = q.options ?? [];
    const options = [];
    for (let oi = 0; oi < opts.length; oi += 1) {
      const opt = opts[oi]!;
      const id = `q${qi}.${oi}`;
      options.push({
        optionId: id,
        label: opt.label,
        ...(opt.description ? { description: opt.description } : {}),
      });
    }
    formQuestions.push({
      id: `q${qi}`,
      question: q.question,
      header: q.header,
      options,
      ...(q.multiple ? { multiSelect: true } : {}),
    });
  }
  const first = formQuestions[0];
  if (formQuestions.length > 1) {
    return { summary, details: { userInputForm: { questions: formQuestions } } };
  }
  return first
    ? {
        summary,
        details: { userInputForm: { questions: formQuestions } },
        options: first.options,
        ...(first.multiSelect ? { multiSelect: true } : {}),
      }
    : { summary };
}

function permissionRequestId(id: string): string {
  return `opencode-perm-${id}`;
}

function questionRequestId(id: string): string {
  return `opencode-q-${id}`;
}

/**
 * Map a single OpenCode SSE event to canonical RuntimeEvents. Returns an
 * empty array for events that are not surfaced (or are session-status only —
 * those are surfaced through `StructuredSessionListener.onUpdate` separately
 * by the session class).
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

  const canonicalEvents = mapCanonicalEvent(event, state);

  if (child) {
    // Tag any new canonical items as belonging to this sub-agent so they get
    // routed into the overlay buffer rather than the main chat timeline. The
    // child-session message/part IDs are independent UUIDs from OpenCode, so
    // they don't collide with parent items in the mapper's shared state maps.
    tagChildEventsWithParent(canonicalEvents, child.itemId);
    // Suppress context.updated events from child sessions — token accounting
    // on the thread tracks the main session only; child sessions have their
    // own budgets that don't roll up into the parent's display.
    for (const ev of canonicalEvents) {
      if (ev.type === "context.updated") continue;
      events.push(ev);
    }
    return events;
  }

  events.push(...canonicalEvents);
  return events;
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
      const { partID } = event.properties;
      const tool = state.toolItems.get(partID);
      if (tool) {
        events.push({
          type: "item.completed",
          threadId: state.threadId,
          itemId: tool.itemId,
        });
        state.toolItems.delete(partID);
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
      if (info.role === "user" && !state.userItems.has(info.id)) {
        const optimistic = state.pendingUserMessageItemIds.shift();
        const itemId = optimistic ?? newItemId("user");
        state.userItems.set(info.id, itemId);
        // When the runtime already painted an optimistic user_message and
        // handed us its id, the chat pane has the complete bubble — re-emitting
        // item.started would either create a phantom item (different id) or
        // be no-op'd by the per-id dedupe. Skip the emit either way.
        if (!optimistic) {
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
    case "session.error": {
      const err = event.properties.error as
        | { name?: string; data?: { message?: string } }
        | undefined;
      const message = err?.data?.message ?? err?.name ?? "OpenCode session error";
      events.push({ type: "error", threadId: state.threadId, message });
      return events;
    }
    default:
      return events;
  }
}

/** Close any open content items at turn boundaries. */
export function closeOpenItems(state: OpenCodeMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const [, itemId] of state.assistantItems) {
    events.push({ type: "item.completed", threadId: state.threadId, itemId });
  }
  state.assistantItems.clear();
  for (const [, entry] of state.reasoningItems) {
    events.push({ type: "item.completed", threadId: state.threadId, itemId: entry.itemId });
  }
  state.reasoningItems.clear();
  for (const [, value] of state.toolItems) {
    events.push({ type: "item.completed", threadId: state.threadId, itemId: value.itemId });
  }
  state.toolItems.clear();
  for (const [, itemId] of state.userItems) {
    events.push({ type: "item.completed", threadId: state.threadId, itemId });
  }
  state.userItems.clear();
  state.partTypes.clear();
  state.emittedText.clear();
  state.messageRoles.clear();
  state.pendingUserMessageItemIds.length = 0;
  return events;
}
