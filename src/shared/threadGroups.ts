import type { Thread } from "./contracts";

/** Experiment controls own membership, including admission of new members. */
export function canChangeThreadGroup(
  previousGroupId: string | undefined,
  nextGroupId: string | undefined,
  isExperimentGroup: (groupId: string) => boolean,
): boolean {
  if (previousGroupId === nextGroupId) return true;
  return (
    !(previousGroupId && isExperimentGroup(previousGroupId)) &&
    !(nextGroupId && isExperimentGroup(nextGroupId))
  );
}

/** Clear only group metadata on the current row, preserving unrelated runtime updates. */
export function clearThreadGroupFields(thread: Thread): Thread {
  const { groupId: _groupId, groupName: _groupName, ...rest } = thread;
  return rest;
}

/** Remove membership without mutating the input; dissolve only a lone remaining sibling. */
export function dissolveGroupMembership(
  threads: readonly Thread[],
  threadId: string,
  options: { all?: boolean } = {},
): { threads: Thread[]; clearedIds: string[] } {
  const target = threads.find((thread) => thread.id === threadId);
  if (!target) return { threads: [...threads], clearedIds: [] };
  const siblings = target.groupId
    ? threads.filter((thread) => thread.id !== threadId && thread.groupId === target.groupId)
    : [];
  const clearedIds = [threadId];
  if (options.all || siblings.length === 1) clearedIds.push(...siblings.map((thread) => thread.id));
  const cleared = new Set(clearedIds);
  return {
    threads: threads.map((thread) => {
      if (!cleared.has(thread.id)) return thread;
      return clearThreadGroupFields(thread);
    }),
    clearedIds,
  };
}
