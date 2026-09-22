import type { RuntimeEvent } from "@/shared/contracts";
import { type CodexMapperState, newItemId, normalizeItemType } from "../canonicalMappingState";
import type { CodexItemPayload } from "./readers";

/**
 * Canonical tool name the shared chat pane renders as a context-compaction row
 * (see `isContextCompactionToolCall`).
 */
const CONTEXT_COMPACTION_TOOL_NAME = "ContextCompaction";

/** Codex app-server `ThreadItem` `{ type: "contextCompaction", id }`. */
export function isCodexContextCompactionItem(item: CodexItemPayload): boolean {
  return normalizeItemType(item.type ?? item.kind) === "context compaction";
}

/**
 * Map a `contextCompaction` item lifecycle to a `ContextCompaction` tool row.
 *
 * Tracked in `compactionItemIdMap`, not the per-turn item maps: auto-compaction
 * runs as its own internal turn, so a settling `turn/completed` can arrive
 * between the item's start and completion and must not orphan the row.
 */
export function mapCodexContextCompaction(
  phase: "started" | "completed",
  codexItemId: string,
  state: CodexMapperState,
): RuntimeEvent[] {
  const { threadId } = state;
  const existingItemId = state.compactionItemIdMap.get(codexItemId);
  if (phase === "started") {
    if (existingItemId) return [];
    const itemId = newItemId("compact");
    state.compactionItemIdMap.set(codexItemId, itemId);
    return [
      {
        type: "item.started",
        threadId,
        itemId,
        itemType: "tool_call",
        payload: { name: CONTEXT_COMPACTION_TOOL_NAME, status: "running" },
      },
    ];
  }

  state.compactionItemIdMap.delete(codexItemId);
  const itemId = existingItemId ?? newItemId("compact");
  const payload = { name: CONTEXT_COMPACTION_TOOL_NAME, status: "success" as const };
  const events: RuntimeEvent[] = [];
  if (!existingItemId) {
    events.push({ type: "item.started", threadId, itemId, itemType: "tool_call", payload });
  }
  events.push({ type: "item.completed", threadId, itemId, payload });
  return events;
}
