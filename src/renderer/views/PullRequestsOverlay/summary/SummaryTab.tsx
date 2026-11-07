import { Trans, useLingui } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";
import { reviewCacheMatchesSource } from "@/renderer/utils/forgeReviews";
import { usePrDetailScope } from "../detail/prDetailScope";
import { usePrFlow } from "../detail/prFlow";
import { PrLoadError } from "../parts/PrLoadError";
import { ActivityComposer } from "./ActivityComposer";
import { ActivityFeed } from "./ActivityFeed";
import { DescriptionCard } from "./DescriptionCard";
import { RailChanges } from "./RailChanges";
import { RailChecks } from "./RailChecks";
import { RailLabels } from "./RailLabels";
import { RailMergeStatus } from "./RailMergeStatus";
import { RailReviewers } from "./RailReviewers";

/**
 * Description, reactions, activity and composer in the main column, with merge
 * status, size, reviewers, labels and checks in a rail. The rail drops below the
 * main column when the tab is narrower than 900px. Both scroll together.
 */
export function SummaryTab() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const { flow } = usePrFlow();
  const ready = useGitStore((s) =>
    reviewCacheMatchesSource(scope.source, s.prDetails[scope.cacheKey]?.source)
      ? s.prDetails[scope.cacheKey] !== undefined
      : false,
  );

  if (!ready) {
    return scope.loadError ? (
      <PrLoadError message={scope.loadError} onRetry={scope.reload} />
    ) : scope.contentReady ? (
      <p className="px-6 py-8 text-center text-xs text-muted/60">
        <Trans>This pull request could not be loaded.</Trans>
      </p>
    ) : (
      <div className={`flex items-center justify-center ${flow ? "min-h-48" : "h-full"}`}>
        <PixelLoader size="md" />
      </div>
    );
  }

  if (flow) {
    // One column: merge status leads, then the conversation, then the rest of the rail.
    return (
      <div className="flex min-w-0 flex-col gap-5 px-[var(--m-page-inline)] pb-6 pt-1">
        <aside aria-label={t`Pull request details`}>
          <RailMergeStatus />
        </aside>
        <DescriptionCard />
        <ActivityFeed />
        <ActivityComposer />
        <div className="flex min-w-0 flex-col">
          <RailReviewers />
          <RailLabels />
          <RailChecks />
        </div>
      </div>
    );
  }

  return (
    <div className="@container h-full min-h-0 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 py-4 @[900px]:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <DescriptionCard />
          <ActivityFeed />
          <ActivityComposer />
        </div>
        <aside aria-label={t`Pull request details`} className="flex min-w-0 flex-col">
          <RailMergeStatus />
          <RailChanges />
          <RailReviewers />
          <RailLabels />
          <RailChecks />
        </aside>
      </div>
    </div>
  );
}
