/**
 * Assistant / reasoning text-item lifecycle helpers for the OpenCode mapper.
 *
 * Tracks per-part emitted text so interleaved incremental deltas and full
 * snapshot updates don't double-emit, and closes any open content items at
 * turn boundaries.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import { newItemId } from "../../contextUsage";
import type { OpenCodeMapperState } from "../sdkCanonicalMappingState";
import { suffixPrefixOverlap } from "./readers";

export function ensureAssistantItemForMessage(
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

export function ensureReasoningItemForPart(
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

export function completeReasoningItem(
  state: OpenCodeMapperState,
  partID: string,
  events: RuntimeEvent[],
): void {
  const entry = state.reasoningItems.get(partID);
  if (!entry) return;
  events.push({ type: "item.completed", threadId: state.threadId, itemId: entry.itemId });
  state.reasoningItems.delete(partID);
}

export function emitTextDelta(
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

export function appendDelta(
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
