import { BookOpen, FileDiff, History, LayoutList } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { makeLightballCountTrailing, type LightballTab } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";
import { reviewCacheMatchesSource } from "@/renderer/utils/forgeReviews";
import { usePrDetailNav, type PrTab } from "./prDetailNav";
import { usePrDetailScope } from "./prDetailScope";

/**
 * The detail's tabs and which one is open. The guide tab exists only where the
 * host writes guides, and a request for it elsewhere falls back to the summary.
 * `compact` drops the icons and counts so the tabs fit one bottom row.
 */
export function usePrDetailTabs(options: { compact: boolean }) {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const { tab } = usePrDetailNav();
  const details = useGitStore((s) => s.prDetails[scope.cacheKey]);
  const files = useGitStore((s) => s.prFiles[scope.cacheKey]);
  const guideAvailable =
    scope.scoped?.capabilities.reviewGuides === true &&
    reviewCacheMatchesSource(scope.source, details?.source);
  const active: PrTab = tab === "guide" && !guideAvailable ? "summary" : tab;

  const conversationCount =
    (details?.comments.length ?? 0) +
    (details?.reviews.filter(
      (r) => r.body || r.state === "APPROVED" || r.state === "CHANGES_REQUESTED",
    ).length ?? 0) +
    (details?.reviewThreads?.length ?? 0);
  const changesCount = files?.length ?? 0;
  const { compact } = options;
  const tabs: ReadonlyArray<LightballTab<PrTab>> = [
    {
      id: "summary",
      label: t`Summary`,
      ...(compact ? {} : { icon: <LayoutList className="size-3" /> }),
      ...(!compact && conversationCount > 0
        ? { trailing: makeLightballCountTrailing(conversationCount) }
        : {}),
    },
    {
      id: "timeline",
      label: t`Timeline`,
      ...(compact ? {} : { icon: <History className="size-3" /> }),
    },
    {
      id: "changes",
      label: t`Changes`,
      ...(compact ? {} : { icon: <FileDiff className="size-3" /> }),
      ...(!compact && changesCount > 0
        ? { trailing: makeLightballCountTrailing(changesCount) }
        : {}),
    },
    // The compact row has room for three segments; its menu opens the guide.
    ...(guideAvailable && !compact
      ? [
          {
            id: "guide" as const,
            label: t`Guide`,
            ...(compact ? {} : { icon: <BookOpen className="size-3" /> }),
          },
        ]
      : []),
  ];
  return { tabs, active, guideAvailable };
}
