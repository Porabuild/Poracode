export type RunThreadMutation = <Result>(
  threadId: string,
  operation: () => Promise<Result>,
) => Promise<Result>;

/** Acquire in one order so overlapping multi-thread operations cannot deadlock. */
export function withThreadMutationCustody<Result>(
  runThreadMutation: RunThreadMutation,
  threadIds: readonly string[],
  operation: (ordered: readonly string[]) => Promise<Result>,
): Promise<Result> {
  const ordered = [...new Set(threadIds)].sort();
  const acquire = (index: number): Promise<Result> => {
    const threadId = ordered[index];
    return threadId === undefined
      ? operation(ordered)
      : runThreadMutation(threadId, async () => {
          // Unlike experiment candidates, ordinary worktree groups are unbounded.
          await Promise.resolve();
          return acquire(index + 1);
        });
  };
  return acquire(0);
}
