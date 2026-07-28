/**
 * Cursor SDK tool and nested-task lifecycle mapping.
 *
 * Kept separate from text/turn mapping because tool calls have their own
 * reconciliation state: raw callbacks and normalized stream events share a
 * call id, partial arguments update in place, and subagent child items are
 * grouped under the task tool.
 */

import type { RuntimeEvent, ToolCallProgress } from "@/shared/contracts";
import { readStringField } from "../fileChangeSummary";
import { newItemId } from "../contextUsage";
import type { CursorSdkMapperState, CursorSdkToolItem } from "./sdkCanonicalMappingState";
import {
  classifyCursorSdkTool,
  cursorSdkRawToolResultIsError,
  cursorSdkToolKey,
  cursorSdkToolPayload,
  cursorSdkToolProgress,
  descriptorFromNormalizedTool,
  descriptorFromRawTool,
  readCursorSdkShellOutput,
  safeCursorSdkFingerprint,
  unwrapCursorSdkRawToolResult,
  type CursorSdkToolDescriptor,
} from "./sdkCanonicalToolPayload";
import type {
  CursorSdkNestedTaskUpdate,
  CursorSdkRawToolCall,
  CursorSdkToolCallMessage,
} from "./sdkProtocol";

export { classifyCursorSdkTool } from "./sdkCanonicalToolPayload";

/** Overlap search window for command-output snapshot reconciliation (bytes). */
const OVERLAP_WINDOW = 64 * 1024;

export function mapCursorSdkAssistantToolUse(
  state: CursorSdkMapperState,
  callId: string,
  name: string,
  input: unknown,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  ensureToolItem(state, callId, descriptorFromNormalizedTool(name, input), events);
  return events;
}

export function mapCursorSdkNormalizedToolCall(
  message: CursorSdkToolCallMessage,
  state: CursorSdkMapperState,
): RuntimeEvent[] {
  const key = cursorSdkToolKey(message.call_id);
  if (state.completedToolKeys.has(key)) return [];
  const events: RuntimeEvent[] = [];
  const descriptor = descriptorFromNormalizedTool(message.name, message.args);
  const tool = ensureToolItem(state, message.call_id, descriptor, events);
  if (!tool) return events;
  if (message.args !== undefined) tool.args = message.args;
  if (message.status === "running") {
    updateToolItem(state, tool, "running", undefined, events);
  } else {
    const isError = message.status === "error" || cursorSdkRawToolResultIsError(message.result);
    completeToolItem(
      state,
      tool,
      isError ? "error" : "success",
      unwrapCursorSdkRawToolResult(message.result),
      events,
    );
  }
  return events;
}

export function mapCursorSdkRawToolUpdate(
  state: CursorSdkMapperState,
  callId: string,
  rawToolCall: CursorSdkRawToolCall,
  complete: boolean,
  parentCallId?: string,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const key = cursorSdkToolKey(callId, parentCallId);
  if (state.completedToolKeys.has(key)) return events;
  const descriptor = descriptorFromRawTool(rawToolCall);
  const parentItemId = parentCallId
    ? state.toolItems.get(cursorSdkToolKey(parentCallId))?.itemId
    : undefined;
  const tool = ensureToolItem(state, callId, descriptor, events, parentCallId, parentItemId);
  if (!tool) return events;
  if (rawToolCall.args !== undefined) tool.args = rawToolCall.args;
  if (!complete) {
    updateToolItem(state, tool, "running", undefined, events);
    return events;
  }
  const result = unwrapCursorSdkRawToolResult(rawToolCall.result);
  const status = cursorSdkRawToolResultIsError(rawToolCall.result) ? "error" : "success";
  completeToolItem(state, tool, status, result, events);
  return events;
}

export function mapCursorSdkNestedTaskUpdate(
  state: CursorSdkMapperState,
  parentCallId: string,
  update: CursorSdkNestedTaskUpdate,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const parent = ensureParentTaskItem(state, parentCallId, events);
  if (!parent) return events;
  const parentItemId = parent.itemId;

  switch (update.type) {
    case "text-delta":
      appendNestedTextDelta(state, parentCallId, parentItemId, "assistant", update.text, events);
      updateParentProgress(
        state,
        parent,
        {
          description: state.nestedAssistantItems.get(parentCallId)?.text ?? update.text,
        },
        events,
      );
      break;
    case "thinking-delta":
      appendNestedTextDelta(state, parentCallId, parentItemId, "thinking", update.text, events);
      break;
    case "thinking-completed": {
      const thinking = state.nestedThinkingItems.get(parentCallId);
      if (thinking) {
        events.push({
          type: "item.updated",
          threadId: state.threadId,
          itemId: thinking.itemId,
          payload: { summary: thinking.text, durationMs: update.thinkingDurationMs },
        });
      }
      closeNestedTextItem(state, parentCallId, "thinking", events);
      break;
    }
    case "tool-call-started":
    case "partial-tool-call": {
      const childWasKnown = state.toolItems.has(cursorSdkToolKey(update.callId, parentCallId));
      events.push(
        ...mapCursorSdkRawToolUpdate(state, update.callId, update.toolCall, false, parentCallId),
      );
      updateParentProgress(
        state,
        parent,
        {
          lastToolName: update.toolCall.type,
          ...(!childWasKnown ? { stepCount: nextStepCount(parent) } : {}),
        },
        events,
      );
      break;
    }
    case "tool-call-completed":
      events.push(
        ...mapCursorSdkRawToolUpdate(state, update.callId, update.toolCall, true, parentCallId),
      );
      updateParentProgress(state, parent, { lastToolName: update.toolCall.type }, events);
      break;
    case "step-started":
      break;
    case "step-completed":
      closeNestedTextItem(state, parentCallId, "assistant", events);
      closeNestedTextItem(state, parentCallId, "thinking", events);
      updateParentProgress(state, parent, { durationMs: update.stepDurationMs }, events);
      break;
  }
  return events;
}

export function mapCursorSdkShellOutputDelta(
  state: CursorSdkMapperState,
  rawEvent: Record<string, unknown>,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const callId = readStringField(rawEvent, "callId", "call_id", "toolCallId", "tool_call_id");
  // Official 1.0.24 shell-output deltas do not carry a call id. Route those
  // only when one command is open; parallel commands are reconciled from
  // their call-specific completion snapshots instead of guessing and
  // attaching output to the wrong command.
  const key = callId ? cursorSdkToolKey(callId) : soleOpenCommandKey(state);
  const tool = key ? state.toolItems.get(key) : undefined;
  if (!tool || tool.itemType !== "command_execution") return events;
  const output = readCursorSdkShellOutput(rawEvent);
  if (!output) return events;
  appendToolOutputDelta(state, tool, output, events);
  return events;
}

function soleOpenCommandKey(state: CursorSdkMapperState): string | undefined {
  let key: string | undefined;
  for (const tool of state.toolItems.values()) {
    if (tool.itemType !== "command_execution") continue;
    if (key !== undefined) return undefined;
    key = tool.key;
  }
  return key;
}

export function closeCursorSdkToolItems(state: CursorSdkMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const parentCallId of [...state.nestedAssistantItems.keys()]) {
    closeNestedTextItem(state, parentCallId, "assistant", events);
  }
  for (const parentCallId of [...state.nestedThinkingItems.keys()]) {
    closeNestedTextItem(state, parentCallId, "thinking", events);
  }
  const openTools = [...state.toolItems.values()].sort(
    (left, right) => toolKeyDepth(right.key) - toolKeyDepth(left.key),
  );
  for (const tool of openTools) {
    events.push({ type: "item.completed", threadId: state.threadId, itemId: tool.itemId });
    state.completedToolKeys.add(tool.key);
  }
  state.toolItems.clear();
  return events;
}

function ensureToolItem(
  state: CursorSdkMapperState,
  callId: string,
  descriptor: CursorSdkToolDescriptor,
  events: RuntimeEvent[],
  parentCallId?: string,
  parentItemId?: string,
): CursorSdkToolItem | undefined {
  const key = cursorSdkToolKey(callId, parentCallId);
  if (state.completedToolKeys.has(key)) return undefined;
  const existing = state.toolItems.get(key);
  if (existing) {
    if (descriptor.args !== undefined) existing.args = descriptor.args;
    return existing;
  }

  const itemType = classifyCursorSdkTool(descriptor.classificationName);
  const tool: CursorSdkToolItem = {
    key,
    callId,
    itemId: newItemId("cursor-tool"),
    itemType,
    name: descriptor.name,
    classificationName: descriptor.classificationName,
    args: descriptor.args,
    status: "running",
    outputText: "",
  };
  const progress = cursorSdkToolProgress(tool);
  if (progress) tool.progress = progress;
  state.toolItems.set(key, tool);
  events.push({
    type: "item.started",
    threadId: state.threadId,
    itemId: tool.itemId,
    itemType,
    payload: cursorSdkToolPayload(tool),
    ...(parentItemId ? { parentItemId } : {}),
  });
  return tool;
}

function updateToolItem(
  state: CursorSdkMapperState,
  tool: CursorSdkToolItem,
  status: "running" | "success" | "error",
  result: unknown,
  events: RuntimeEvent[],
): Record<string, unknown> {
  tool.status = status;
  if (result !== undefined) tool.result = result;
  const nextProgress = cursorSdkToolProgress(tool);
  if (nextProgress) tool.progress = { ...tool.progress, ...nextProgress };
  const payload = cursorSdkToolPayload(tool);
  const fingerprint = safeCursorSdkFingerprint(payload);
  if (fingerprint === tool.lastPayloadFingerprint) return payload;
  tool.lastPayloadFingerprint = fingerprint;
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload,
  });
  return payload;
}

function completeToolItem(
  state: CursorSdkMapperState,
  tool: CursorSdkToolItem,
  status: "success" | "error",
  result: unknown,
  events: RuntimeEvent[],
): void {
  closeNestedItemsForParent(state, tool.callId, events);
  appendCompletionOutput(state, tool, result, events);
  // `updateToolItem` already built the final payload; the completion event
  // carries the same snapshot, so reuse it instead of re-serializing.
  const payload = updateToolItem(state, tool, status, result, events);
  events.push({
    type: "item.completed",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload,
  });
  state.toolItems.delete(tool.key);
  state.completedToolKeys.add(tool.key);
}

function ensureParentTaskItem(
  state: CursorSdkMapperState,
  parentCallId: string,
  events: RuntimeEvent[],
): CursorSdkToolItem | undefined {
  const existing = state.toolItems.get(cursorSdkToolKey(parentCallId));
  if (existing) return existing;
  return ensureToolItem(
    state,
    parentCallId,
    { name: "Task", classificationName: "task", args: {} },
    events,
  );
}

function appendNestedTextDelta(
  state: CursorSdkMapperState,
  parentCallId: string,
  parentItemId: string,
  kind: "assistant" | "thinking",
  delta: string,
  events: RuntimeEvent[],
): void {
  if (delta.length === 0) return;
  const items = kind === "assistant" ? state.nestedAssistantItems : state.nestedThinkingItems;
  let item = items.get(parentCallId);
  if (!item) {
    item = {
      itemId: newItemId(kind === "assistant" ? "sub-asst" : "sub-reason"),
      text: "",
    };
    items.set(parentCallId, item);
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId: item.itemId,
      itemType: kind === "assistant" ? "assistant_message" : "reasoning",
      parentItemId,
    });
  }
  item.text += delta;
  events.push({
    type: "content.delta",
    threadId: state.threadId,
    itemId: item.itemId,
    stream: kind === "assistant" ? "assistant_text" : "reasoning_text",
    delta,
  });
}

function closeNestedTextItem(
  state: CursorSdkMapperState,
  parentCallId: string,
  kind: "assistant" | "thinking",
  events: RuntimeEvent[],
): void {
  const items = kind === "assistant" ? state.nestedAssistantItems : state.nestedThinkingItems;
  const item = items.get(parentCallId);
  if (!item) return;
  events.push({ type: "item.completed", threadId: state.threadId, itemId: item.itemId });
  items.delete(parentCallId);
}

function closeNestedItemsForParent(
  state: CursorSdkMapperState,
  parentCallId: string,
  events: RuntimeEvent[],
): void {
  closeNestedTextItem(state, parentCallId, "assistant", events);
  closeNestedTextItem(state, parentCallId, "thinking", events);
  const prefix = `${parentCallId}/`;
  for (const tool of [...state.toolItems.values()]) {
    if (!tool.key.startsWith(prefix)) continue;
    updateToolItem(state, tool, "error", undefined, events);
    events.push({ type: "item.completed", threadId: state.threadId, itemId: tool.itemId });
    state.toolItems.delete(tool.key);
    state.completedToolKeys.add(tool.key);
  }
}

function updateParentProgress(
  state: CursorSdkMapperState,
  parent: CursorSdkToolItem,
  progress: ToolCallProgress,
  events: RuntimeEvent[],
): void {
  parent.progress = { ...parent.progress, ...progress };
  updateToolItem(state, parent, "running", undefined, events);
}

function nextStepCount(tool: CursorSdkToolItem): number {
  return (tool.progress?.stepCount ?? 0) + 1;
}

function appendCompletionOutput(
  state: CursorSdkMapperState,
  tool: CursorSdkToolItem,
  result: unknown,
  events: RuntimeEvent[],
): void {
  if (tool.itemType === "command_execution") {
    const output = readCursorSdkShellOutput(result);
    if (output) appendToolOutputSnapshot(state, tool, output, events);
    return;
  }
  if (tool.itemType === "file_change") {
    const diff = readStringField(result, "diffString", "diff", "patch");
    if (diff) {
      events.push({
        type: "content.delta",
        threadId: state.threadId,
        itemId: tool.itemId,
        stream: "file_change_output",
        delta: diff,
      });
    }
  }
}

function appendToolOutputSnapshot(
  state: CursorSdkMapperState,
  tool: CursorSdkToolItem,
  output: string,
  events: RuntimeEvent[],
): void {
  if (output === tool.outputText) return;
  const tail = output.startsWith(tool.outputText)
    ? output.slice(tool.outputText.length)
    : output.slice(suffixPrefixOverlap(tool.outputText, output));
  if (!tail) return;
  tool.outputText += tail;
  events.push({
    type: "content.delta",
    threadId: state.threadId,
    itemId: tool.itemId,
    stream: "command_output",
    delta: tail,
  });
}

function appendToolOutputDelta(
  state: CursorSdkMapperState,
  tool: CursorSdkToolItem,
  delta: string,
  events: RuntimeEvent[],
): void {
  if (!delta) return;
  tool.outputText += delta;
  events.push({
    type: "content.delta",
    threadId: state.threadId,
    itemId: tool.itemId,
    stream: "command_output",
    delta,
  });
}

/**
 * Longest suffix of `emitted` that is also a prefix of `full`, i.e. how much of
 * a rewritten command snapshot was already streamed.
 *
 * Command output reaches hundreds of kilobytes, so this runs a linear KMP scan
 * (no per-candidate substring allocation) over a bounded tail/head window. The
 * window caps worst-case work on huge snapshots; real overlaps are the streamed
 * tail of the same buffer, far below the limit.
 */
function suffixPrefixOverlap(emitted: string, full: string): number {
  const pattern = full.length > OVERLAP_WINDOW ? full.slice(0, OVERLAP_WINDOW) : full;
  const text = emitted.length > OVERLAP_WINDOW ? emitted.slice(-OVERLAP_WINDOW) : emitted;
  if (pattern.length === 0 || text.length === 0) return 0;
  const fallback = prefixFunction(pattern);
  let matched = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    while (matched > 0 && char !== pattern[matched]) matched = fallback[matched - 1]!;
    if (char === pattern[matched]) matched += 1;
    if (matched === pattern.length) {
      if (index === text.length - 1) return matched;
      matched = fallback[matched - 1]!;
    }
  }
  return matched;
}

/** KMP failure table: longest proper prefix that is also a suffix, per index. */
function prefixFunction(pattern: string): Uint32Array {
  const fallback = new Uint32Array(pattern.length);
  let length = 0;
  for (let index = 1; index < pattern.length; index += 1) {
    const char = pattern[index];
    while (length > 0 && char !== pattern[length]) length = fallback[length - 1]!;
    if (char === pattern[length]) length += 1;
    fallback[index] = length;
  }
  return fallback;
}

function toolKeyDepth(key: string): number {
  return key.split("/").length;
}
