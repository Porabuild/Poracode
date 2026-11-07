import type { PersistedRuntimeItem, PersistedCompletedTurn } from "./ipc/schemas";
import type { Thread } from "./contracts/thread";
import { msg } from "./messages";

export function canForkThread(thread: Pick<Thread, "presentationMode" | "status">): boolean {
  return thread.presentationMode === "gui" && ["idle", "inactive", "error"].includes(thread.status);
}

/** Freeze a settled conversation prefix without copying live requests or goals. */
export function selectThreadForkSnapshot(
  items: readonly PersistedRuntimeItem[],
  turns: readonly PersistedCompletedTurn[],
  throughItemId?: string,
): { items: PersistedRuntimeItem[]; turns: PersistedCompletedTurn[]; throughItemId: string } {
  const anchor = throughItemId ?? turns.at(-1)?.anchorItemId;
  const turnIndex = turns.findIndex((turn) => turn.anchorItemId === anchor);
  const itemIndex = items.findIndex((item) => item.id === anchor);
  if (!anchor || turnIndex < 0 || itemIndex < 0) {
    throw new Error(msg("thread.forkBoundaryUnavailable"));
  }
  const excluded = new Set<string>();
  const snapshot: PersistedRuntimeItem[] = [];
  const inheritedIds = new Set(items.slice(0, itemIndex + 1).map((item) => item.id));
  for (const item of items) {
    if (item.parentItemId && inheritedIds.has(item.parentItemId)) inheritedIds.add(item.id);
    if (!inheritedIds.has(item.id)) continue;
    const status = (item.payload as { status?: unknown } | undefined)?.status;
    if (
      item.type === "goal" ||
      item.type === "pending_request" ||
      status === "running" ||
      (item.parentItemId !== undefined && excluded.has(item.parentItemId))
    ) {
      excluded.add(item.id);
      continue;
    }
    snapshot.push({ ...item, state: "completed" });
  }
  const boundary = snapshot.findLast((item) => !item.parentItemId)?.id;
  if (!boundary) {
    throw new Error(msg("thread.forkBoundaryActive"));
  }
  return {
    items: snapshot,
    turns: turns
      .slice(0, turnIndex + 1)
      .map((turn, index) => (index === turnIndex ? { ...turn, anchorItemId: boundary } : turn)),
    throughItemId: boundary,
  };
}
