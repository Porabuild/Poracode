import { PrWatchControls } from "@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/parts/PrWatchControls";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrMergeReadiness } from "@/renderer/hooks/usePrMergeReadiness";
import { usePrDetailScope } from "../prDetailScope";

/** The PR automation popover for the open review; absent when the review has no head branch. */
export function PrAutomationControl(props: {
  triggerClassName?: string;
  sheet?: { open: boolean; onOpenChange: (open: boolean) => void };
}) {
  const scope = usePrDetailScope();
  const details = useGitStore((s) => s.prDetails[scope.cacheKey]);
  const { capabilities } = usePrMergeReadiness(scope.prKey, scope.cacheKey);
  const source = details?.source ?? scope.source;
  if (!details?.headBranch) return null;
  return (
    <PrWatchControls
      projectId={scope.projectId}
      prNumber={scope.prNumber}
      headBranch={details.headBranch}
      {...(source ? { source } : {})}
      {...(capabilities
        ? { autoMergeAvailable: capabilities.autoMerge, autoFixAvailable: capabilities.autoFix }
        : {})}
      {...(scope.worktreePath ? { worktreePath: scope.worktreePath } : {})}
      {...(props.triggerClassName ? { triggerClassName: props.triggerClassName } : {})}
      {...(props.sheet ? { sheet: props.sheet } : {})}
      onRefreshPr={scope.reload}
    />
  );
}
