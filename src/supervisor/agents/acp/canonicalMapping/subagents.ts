/**
 * Sub-agent nesting inference and progress surfacing for the ACP mapper.
 *
 * ACP does not expose an explicit `parentItemId` for sub-agent children, so we
 * conservatively infer nesting from active sub-agent tool-call lifetimes and
 * surface streamed sub-agent output as nested assistant messages.
 */

import {
  subAgentStatusSchema,
  toolCallProgressSchema,
  type RuntimeEvent,
  type SubAgentStatus,
  type ToolCallProgress,
} from "@/shared/contracts";
import { readStringField } from "../../fileChangeSummary";
import { firstNonEmptyLine, normalizeToolText } from "./contentExtraction";
import type { ActiveAcpSubAgent, AcpMapperState, AcpToolCallItemState } from "./state";
import { newItemId } from "./state";

export const PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY = "poracodeParentToolCallId";
/**
 * Provider-boundary assertion that this tool call belongs to the foreground
 * agent. Without it, the generic ACP fallback may infer that a newly-started
 * subagent is nested under the most recently active subagent.
 */
export const PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY = "poracodeTopLevelToolCall";
export const PORACODE_ACP_DETACHED_SUBAGENT_META_KEY = "poracodeDetachedSubAgent";
export const PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY = "poracodeDetachedSubAgentActivity";
export const PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY = "poracodeNewAssistantItem";
export const PORACODE_ACP_SYNTHESIZE_SUBAGENT_RESULT_META_KEY = "poracodeSynthesizeSubAgentResult";
export const PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY = "poracodeSubAgentProgress";
export const PORACODE_ACP_SUBAGENT_STATUS_META_KEY = "poracodeSubAgentStatus";

export function readAcpSubAgentProgressMeta(meta: unknown): ToolCallProgress | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const progress = (meta as Record<string, unknown>)[PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY];
  const parsed = toolCallProgressSchema.safeParse(progress);
  return parsed.success ? parsed.data : undefined;
}

export function readAcpSubAgentStatusMeta(meta: unknown): SubAgentStatus | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const status = (meta as Record<string, unknown>)[PORACODE_ACP_SUBAGENT_STATUS_META_KEY];
  const parsed = subAgentStatusSchema.safeParse(status);
  return parsed.success ? parsed.data : undefined;
}

export function buildSubAgentProgress(
  toolCall: {
    title?: string | null;
    kind?: string | null;
    rawOutput?: unknown;
    content?: unknown;
  },
  payload: Record<string, unknown>,
  status: "running" | "success" | "error",
): { label: string | undefined; text: string | undefined; summary: string | undefined } {
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const result = payload.result;
  const outputText = readSubAgentText(result) ?? readSubAgentText(toolCall.rawOutput);
  const outputSummary = outputText ? firstNonEmptyLine(outputText) : undefined;
  const label = status === "running" ? (title ?? kind ?? outputSummary) : undefined;
  const text = outputText ?? label;
  const summary = outputSummary ?? label;
  return { label, text, summary };
}

export function buildSubAgentProgressEvents(
  state: AcpMapperState,
  item: AcpToolCallItemState,
  text: string,
  isTerminal: boolean,
): RuntimeEvent[] {
  const normalized = text.trim();
  if (!normalized || normalized === item.subAgentProgressText) return [];
  const events: RuntimeEvent[] = [];
  if (!item.subAgentProgressItemId) {
    item.subAgentProgressItemId = newItemId("subagent");
    item.subAgentProgressText = "";
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId: item.subAgentProgressItemId,
      itemType: "assistant_message",
      parentItemId: item.itemId,
    });
  }
  const previous = item.subAgentProgressText ?? "";
  const delta = normalized.startsWith(previous)
    ? normalized.slice(previous.length)
    : `${previous ? "\n\n" : ""}${normalized}`;
  item.subAgentProgressText = previous + delta;
  if (delta.length > 0) {
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId: item.subAgentProgressItemId,
      stream: "assistant_text",
      delta,
    });
  }
  if (isTerminal) {
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId: item.subAgentProgressItemId,
    });
  }
  return events;
}

function readSubAgentText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim().length > 0 ? value : undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["text", "markdown", "message", "summary", "content", "detailedContent"]) {
    const text = record[key];
    if (typeof text === "string" && text.trim().length > 0) return text;
  }
  const contents = record.contents;
  if (Array.isArray(contents)) {
    const parts = contents
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const text = (entry as Record<string, unknown>).text;
        return typeof text === "string" ? text : "";
      })
      .filter((text) => text.trim().length > 0);
    if (parts.length > 0) return parts.join("\n\n");
  }
  return undefined;
}

export function getActiveSubAgentForNotification(
  state: AcpMapperState,
  update: { _meta?: unknown; toolCallId?: unknown },
): ActiveAcpSubAgent | undefined {
  const meta =
    update._meta && typeof update._meta === "object" && !Array.isArray(update._meta)
      ? (update._meta as Record<string, unknown>)
      : undefined;
  if (meta?.[PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY] === true) return undefined;
  const explicitToolCallId = meta?.[PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY];
  if (typeof explicitToolCallId === "string") {
    return state.activeSubAgents.find((active) => active.toolCallId === explicitToolCallId);
  }
  // The parent tool's own later updates may create a progress assistant item.
  // Allow that item to nest even when the parent is detached.
  if (typeof update.toolCallId === "string") {
    const matchingTool = state.activeSubAgents.find(
      (active) => active.toolCallId === update.toolCallId,
    );
    if (matchingTool) return matchingTool;
  }
  // Detached parents persist beyond the foreground turn that launched them.
  // They may only claim explicitly-parented notifications; otherwise a later
  // user turn would be nested under the most recent background agent.
  return state.activeSubAgents.findLast(
    (active) => state.toolCallItems.get(active.toolCallId)?.detached !== true,
  );
}

export function getDetachedSubAgentToolCallIdForNotification(
  state: AcpMapperState,
  update: { _meta?: unknown },
): string | undefined {
  const meta =
    update._meta && typeof update._meta === "object" && !Array.isArray(update._meta)
      ? (update._meta as Record<string, unknown>)
      : undefined;
  const activityToolCallId = meta?.[PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY];
  if (
    typeof activityToolCallId === "string" &&
    state.toolCallItems.get(activityToolCallId)?.detached === true
  ) {
    return activityToolCallId;
  }
  const active = getActiveSubAgentForNotification(state, update);
  return active && state.toolCallItems.get(active.toolCallId)?.detached === true
    ? active.toolCallId
    : undefined;
}

/**
 * When sibling ACP subagents run concurrently, a child tool call can arrive
 * while both lifetimes are active. ACP has no parent id, but providers usually
 * repeat the relevant file, command, or subject from the launch prompt in the
 * child tool input. Prefer the one sibling with uniquely matching terms;
 * retain stack order when the payload carries no useful identity.
 */
export function selectActiveSubAgentForToolCall(
  state: AcpMapperState,
  toolCall: {
    title?: string | null;
    rawInput?: unknown;
    _meta?: unknown;
    locations?: Array<{ path?: string | null }> | null;
  },
): ActiveAcpSubAgent | undefined {
  const fallback = getActiveSubAgentForNotification(state, toolCall);
  if (!fallback) return undefined;
  const meta =
    toolCall._meta && typeof toolCall._meta === "object" && !Array.isArray(toolCall._meta)
      ? (toolCall._meta as Record<string, unknown>)
      : undefined;
  if (typeof meta?.[PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY] === "string") return fallback;
  const candidates = state.activeSubAgents.filter(
    (active) => state.toolCallItems.get(active.toolCallId)?.detached !== true,
  );
  if (candidates.length < 2) return fallback;
  const childTerms = extractIdentityTerms({
    title: toolCall.title,
    rawInput: toolCall.rawInput,
    locations: toolCall.locations,
  });
  if (childTerms.size === 0) return fallback;

  const rankedCandidates = candidates.map((active) => ({
    active,
    terms: extractIdentityTerms(state.toolCallItems.get(active.toolCallId)?.payload.args),
    score: 0,
  }));
  for (const term of childTerms) {
    const matches = rankedCandidates.filter((candidate) => candidate.terms.has(term));
    if (matches.length === 1) matches[0]!.score += 1;
  }
  const ranked = rankedCandidates.toSorted((left, right) => right.score - left.score);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best || best.score === 0 || best.score === runnerUp?.score) return fallback;
  return best.active;
}

export function removeActiveSubAgent(state: AcpMapperState, toolCallId: string): void {
  for (let index = state.activeSubAgents.length - 1; index >= 0; index -= 1) {
    if (state.activeSubAgents[index]?.toolCallId !== toolCallId) continue;
    state.activeSubAgents.splice(index, 1);
    break;
  }
  state.subAgentContentItems.delete(toolCallId);
}

export function tagSubAgentChildStarts(
  events: RuntimeEvent[],
  parent: ActiveAcpSubAgent,
  state: AcpMapperState,
): void {
  const childStartsByParent = new Map<string, number>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.type !== "item.started") continue;
    // A newly classified subagent and its first progress item can be emitted
    // by the same ACP update. Never make the parent tool its own child.
    if (event.itemId === parent.itemId) continue;
    const explicitParent = "parentItemId" in event ? event.parentItemId : undefined;
    const parentItemId = typeof explicitParent === "string" ? explicitParent : parent.itemId;
    if (typeof explicitParent !== "string") {
      events[index] = { ...event, parentItemId };
    }
    childStartsByParent.set(parentItemId, (childStartsByParent.get(parentItemId) ?? 0) + 1);
  }
  for (const [parentItemId, taggedStarts] of childStartsByParent) {
    const activeParent = state.activeSubAgents.find(
      (candidate) => candidate.itemId === parentItemId,
    );
    if (!activeParent) continue;
    activeParent.hasChildActivity = true;
    const parentTool = state.toolCallItems.get(activeParent.toolCallId);
    if (!parentTool) continue;
    parentTool.payload = withBumpedSubAgentStepCount(parentTool.payload, taggedStarts);
    events.push({
      type: "item.updated",
      threadId: state.threadId,
      itemId: parentItemId,
      payload: parentTool.payload,
    });
  }
}

function withBumpedSubAgentStepCount(
  payload: Record<string, unknown>,
  stepDelta: number,
): Record<string, unknown> {
  const progress =
    payload.progress && typeof payload.progress === "object" && !Array.isArray(payload.progress)
      ? { ...(payload.progress as Record<string, unknown>) }
      : {};
  const prevCount =
    typeof progress.stepCount === "number" && Number.isFinite(progress.stepCount)
      ? Math.max(0, Math.trunc(progress.stepCount))
      : 0;
  progress.stepCount = prevCount + stepDelta;
  return { ...payload, status: "running", progress };
}

const SUBAGENT_IDENTITY_STOP_WORDS = new Set([
  "agent",
  "current",
  "directory",
  "file",
  "files",
  "inspect",
  "modify",
  "read",
  "return",
  "task",
  "tool",
]);

function extractIdentityTerms(value: unknown): Set<string> {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return new Set();
  }
  return new Set(
    (text.toLowerCase().match(/[a-z0-9][a-z0-9._-]{2,}/gu) ?? []).filter(
      (term) => !SUBAGENT_IDENTITY_STOP_WORDS.has(term),
    ),
  );
}

/**
 * Gemini's `update_topic` tool re-titles the active conversation topic for UI
 * grouping. ACP carries it with `kind: "think"` and `title` set to either the
 * raw tool name (`update_topic`) or the human-readable description Gemini's
 * `getDescription()` returns: `Update topic to: "<title>"` /
 * `Update tactical intent: "<intent>"`. Match on either form so we drop the
 * tool from the chat stream regardless of which Gemini build is in use.
 */
export function isUpdateTopicTool(
  title: string | null | undefined,
  kind: string | null | undefined,
): boolean {
  const t = (title ?? "").toLowerCase().trim();
  const k = (kind ?? "").toLowerCase().trim();
  if (t === "update_topic" || k === "update_topic") return true;
  return t.startsWith("update topic to:") || t.startsWith("update tactical intent:");
}

/**
 * Copilot's ACP server emits an end-of-turn summary as a `tool_call` named
 * `task_complete`. It isn't a tool — it's the agent's wrap-up message — so we
 * detect it here and reroute it to an assistant_message item instead.
 */
export function isTaskCompleteSummary(
  title: string | null | undefined,
  kind: string | null | undefined,
): boolean {
  const t = (title ?? "").toLowerCase().trim();
  const k = (kind ?? "").toLowerCase().trim();
  return t === "task_complete" || k === "task_complete";
}

/** Pull the summary text from a `task_complete` `rawInput`. The shape isn't
 * standardized, so we accept the input as either a string or an object with a
 * recognizable text field, falling back to a JSON dump of the object. */
export function extractTaskCompleteSummary(input: unknown): string | undefined {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (input && typeof input === "object") {
    for (const key of ["summary", "message", "body", "text", "description"]) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim().length > 0) return v;
    }
  }
  return undefined;
}

export function isAcpSubAgentToolCall(toolCall: {
  title?: string | null;
  kind?: string | null;
  rawInput?: unknown;
}): boolean {
  if (readStringField(toolCall.rawInput, "_toolName") === "task") return true;
  if (readStringField(toolCall.rawInput, "agent_type")) return true;
  if (readStringField(toolCall.rawInput, "subagent_type")) return true;
  return (
    readStringField(toolCall.rawInput, "prompt") !== undefined &&
    readStringField(toolCall.rawInput, "name") !== undefined &&
    readStringField(toolCall.rawInput, "description") !== undefined
  );
}
