import type { Thread } from "../../shared/contracts";

export type ReorderPlacement = "before" | "after";

export function isReorderNoOp(
  ids: string[],
  sourceId: string,
  targetId: string,
  placement: ReorderPlacement,
): boolean {
  if (sourceId === targetId) {
    return true;
  }

  const sourceIdx = ids.findIndex((id) => id === sourceId);
  const targetIdx = ids.findIndex((id) => id === targetId);

  if (sourceIdx === -1 || targetIdx === -1) {
    return true;
  }

  return placement === "before" ? sourceIdx === targetIdx - 1 : sourceIdx === targetIdx + 1;
}

export function reorderIds(
  ids: string[],
  sourceId: string,
  targetId: string,
  placement: ReorderPlacement,
): string[] {
  if (isReorderNoOp(ids, sourceId, targetId, placement)) {
    return ids;
  }

  const sourceIdx = ids.findIndex((id) => id === sourceId);
  const targetIdx = ids.findIndex((id) => id === targetId);

  if (sourceIdx === -1 || targetIdx === -1) {
    return ids;
  }

  const nextIds = ids.filter((id) => id !== sourceId);
  const insertTargetIdx = nextIds.findIndex((id) => id === targetId);

  if (insertTargetIdx === -1) {
    return ids;
  }

  nextIds.splice(placement === "before" ? insertTargetIdx : insertTargetIdx + 1, 0, sourceId);
  return nextIds;
}

export function reorderThreadBlockInProject(
  threads: Thread[],
  blockIds: string[],
  targetId: string,
  placement: ReorderPlacement,
): Thread[] {
  if (blockIds.length === 0 || blockIds.includes(targetId)) return threads;

  const blockSet = new Set(blockIds);
  const firstBlock = threads.find((t) => blockSet.has(t.id));
  const targetThread = threads.find((t) => t.id === targetId);
  if (!firstBlock || !targetThread || firstBlock.projectId !== targetThread.projectId) {
    return threads;
  }

  const projectId = firstBlock.projectId;
  const projectThreads = threads.filter((t) => t.projectId === projectId);
  const blockThreads = projectThreads.filter((t) => blockSet.has(t.id));
  const remaining = projectThreads.filter((t) => !blockSet.has(t.id));

  const targetIdx = remaining.findIndex((t) => t.id === targetId);
  if (targetIdx === -1) return threads;

  const insertIdx = placement === "before" ? targetIdx : targetIdx + 1;
  remaining.splice(insertIdx, 0, ...blockThreads);

  let orderedIdx = 0;
  return threads.map((t) => {
    if (t.projectId !== projectId) return t;
    return remaining[orderedIdx++] ?? t;
  });
}

export function reorderThreadsInProject(
  threads: Thread[],
  sourceId: string,
  targetId: string,
  placement: ReorderPlacement,
): Thread[] {
  if (sourceId === targetId) {
    return threads;
  }

  const sourceThread = threads.find((thread) => thread.id === sourceId);
  const targetThread = threads.find((thread) => thread.id === targetId);

  if (!sourceThread || !targetThread || sourceThread.projectId !== targetThread.projectId) {
    return threads;
  }

  const projectThreadIds = threads
    .filter((thread) => thread.projectId === sourceThread.projectId)
    .map((thread) => thread.id);
  const reorderedIds = reorderIds(projectThreadIds, sourceId, targetId, placement);

  if (reorderedIds === projectThreadIds) {
    return threads;
  }

  const orderedProjectThreads = reorderedIds
    .map((id) => threads.find((thread) => thread.id === id))
    .filter((thread): thread is Thread => thread !== undefined);
  let orderedIdx = 0;

  return threads.map((thread) => {
    if (thread.projectId !== sourceThread.projectId) {
      return thread;
    }

    const nextThread = orderedProjectThreads[orderedIdx];
    orderedIdx += 1;
    return nextThread ?? thread;
  });
}
