/**
 * Sub-agent / child-session plumbing for the OpenCode canonical mapper.
 *
 * OpenCode runs `task` tools in a child session whose `parentID` points at
 * the main session. These helpers pair parent task-tool parts with their
 * child sessions, surface child progress on the parent tool_call payload, and
 * tag child-session items so the renderer routes them into the sub-agent
 * overlay buffer.
 */

import type { EventSubscribeResponse } from "@opencode-ai/sdk/v2";
import type { RuntimeEvent } from "@/shared/contracts";
import type {
  OpenCodeMapperState,
  OpenCodeSubAgentSessionState,
} from "../sdkCanonicalMappingState";
import { normalizeToolName } from "./readers";

/**
 * Try to link a queued `task` tool part to a queued child session. Pairs
 * the heads of both queues in FIFO order so concurrent task tools (rare
 * but possible) stay matched to the order they fired.
 */
export function tryLinkTaskToolToChildSession(state: OpenCodeMapperState): void {
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

export function emitSubAgentProgressUpdate(
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
export function applyChildSessionProgress(
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
export function tagChildEventsWithParent(events: RuntimeEvent[], parentItemId: string): void {
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i]!;
    if (ev.type !== "item.started") continue;
    if ("parentItemId" in ev && typeof ev.parentItemId === "string") continue;
    events[i] = { ...ev, parentItemId };
  }
}
