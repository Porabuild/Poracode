/**
 * Sub-agent nesting inference and progress surfacing for the ACP mapper.
 *
 * ACP does not expose an explicit `parentItemId` for sub-agent children, so we
 * conservatively infer nesting from active sub-agent tool-call lifetimes and
 * surface streamed sub-agent output as nested assistant messages.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import { firstNonEmptyLine, normalizeToolText, readStringField } from "./contentExtraction";
import type { ActiveAcpSubAgent, AcpMapperState, AcpToolCallItemState } from "./state";
import { newItemId } from "./state";

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

export function getActiveSubAgent(state: AcpMapperState): ActiveAcpSubAgent | undefined {
  return state.activeSubAgents.at(-1);
}

export function removeActiveSubAgent(state: AcpMapperState, toolCallId: string): void {
  for (let index = state.activeSubAgents.length - 1; index >= 0; index -= 1) {
    if (state.activeSubAgents[index]?.toolCallId !== toolCallId) continue;
    state.activeSubAgents.splice(index, 1);
    break;
  }
}

export function tagSubAgentChildStarts(
  events: RuntimeEvent[],
  parent: ActiveAcpSubAgent,
  state: AcpMapperState,
): void {
  let taggedStarts = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.type !== "item.started") continue;
    if ("parentItemId" in event && typeof event.parentItemId === "string") continue;
    events[index] = { ...event, parentItemId: parent.itemId };
    taggedStarts += 1;
  }
  if (taggedStarts === 0) return;
  const parentTool = state.toolCallItems.get(parent.toolCallId);
  if (!parentTool) return;
  parentTool.payload = withBumpedSubAgentStepCount(parentTool.payload, taggedStarts);
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: parent.itemId,
    payload: parentTool.payload,
  });
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
