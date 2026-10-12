import {
  gitReviewActionStoreKey,
  useGitReviewActionStore,
  type GitActionPhase,
} from "@/renderer/state/gitReviewActionStore";

/** Sidebar commands share the review panel's operation lease and visible feedback. */
export function runGitActionWithFeedback(input: {
  projectId: string;
  worktreePath?: string;
  flag: "isSyncing" | "isMerging" | "isPullingFromSource";
  phase?: GitActionPhase;
  run: () => Promise<unknown>;
}): void {
  const key = gitReviewActionStoreKey(input.projectId, input.worktreePath);
  const store = useGitReviewActionStore.getState();
  const current = store.panels[key];
  if (
    current &&
    (current.actionPhase ||
      current.isSyncing ||
      current.isMerging ||
      current.isPullingFromSource ||
      current.isCommitting ||
      current.isAbortingMerge ||
      current.isFinishingMerge ||
      current.isCreatingPr)
  )
    return;
  store.patch(key, { [input.flag]: true, ...(input.phase ? { actionPhase: input.phase } : {}) });
  void Promise.resolve()
    .then(input.run)
    .finally(() => {
      store.patch(key, { [input.flag]: false });
      if (input.phase) store.clearActionPhase(key, input.phase);
    })
    .catch(() => {});
}
