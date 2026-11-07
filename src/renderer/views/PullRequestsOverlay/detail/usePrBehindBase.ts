import { usePrMergeStateStatus } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrDetailScope } from "./prDetailScope";

/** Whether an open review is behind its base, and how the host lets it catch up. */
export function usePrBehindBase() {
  const scope = usePrDetailScope();
  const details = useGitStore((s) => s.prDetails[scope.cacheKey]);
  const mergeStateStatus = usePrMergeStateStatus(scope.prKey);
  const state = useGitStore((s) => s.prData[scope.prKey]?.state);
  const capabilities = (details?.source ?? scope.source)?.capabilities;
  return {
    behind: state === "open" && mergeStateStatus === "BEHIND" && details !== undefined,
    baseBranch: details?.baseBranch,
    canUpdate: !capabilities || capabilities.updateBranch || capabilities.rebaseBranch,
    disabled: scope.readOnly || scope.actions.prLoading,
    pending: scope.actions.pendingAction === "update",
    update: () =>
      void scope.actions.handleUpdatePrBranch(scope.source?.capabilities.updateBranch === false),
  };
}
