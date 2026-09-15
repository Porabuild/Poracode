import type { RuntimeEvent } from "@/shared/contracts";
import type { RuntimeEventSlice } from "./runtimeEventSlice";

type TranscriptState = Pick<
  RuntimeEventSlice,
  "runtimeItemIdsByThread" | "runtimeItemsByIdByThread" | "runtimeCompletedTurnsByThread"
>;

export function applyRuntimeTruncation(
  state: TranscriptState,
  threadId: string,
  event: Extract<RuntimeEvent, { type: "runtime.truncated" }>,
): Partial<TranscriptState> {
  const patch: Partial<TranscriptState> = {};
  const removedAnchors = new Set(event.removedCompletedTurnAnchors);
  const turns = state.runtimeCompletedTurnsByThread[threadId];
  if (turns?.some((turn) => turn.anchorItemId !== null && removedAnchors.has(turn.anchorItemId))) {
    patch.runtimeCompletedTurnsByThread = {
      ...state.runtimeCompletedTurnsByThread,
      [threadId]: turns.filter(
        (turn) => turn.anchorItemId === null || !removedAnchors.has(turn.anchorItemId),
      ),
    };
  }

  const ids = state.runtimeItemIdsByThread[threadId];
  const checkpointIndex = ids?.indexOf(event.itemId) ?? -1;
  // A paged client may not have the checkpoint. The transport must fetch an
  // authoritative baseline; local membership cannot identify the deleted tail.
  if (!ids || checkpointIndex < 0 || checkpointIndex === ids.length - 1) return patch;
  const keptIds = ids.slice(0, checkpointIndex + 1);
  const items = { ...state.runtimeItemsByIdByThread[threadId] };
  for (const id of ids.slice(checkpointIndex + 1)) delete items[id];
  patch.runtimeItemIdsByThread = { ...state.runtimeItemIdsByThread, [threadId]: keptIds };
  patch.runtimeItemsByIdByThread = { ...state.runtimeItemsByIdByThread, [threadId]: items };
  return patch;
}
