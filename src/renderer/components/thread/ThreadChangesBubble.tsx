import { useShallow } from "zustand/shallow";
import { Tooltip } from "@heroui/react";
import { GitFork, GitPullRequest } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { getBasename } from "@/shared/pathUtils";
import {
  closeAllPanels,
  showGitReviewPage,
  showGitReviewPanel,
} from "@/renderer/actions/panelActions";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { DiffStat } from "@/renderer/components/common";
import {
  floatingGlassActiveClass,
  floatingGlassSurfaceClass,
} from "@/renderer/components/layout/floatingGlass";
import { useGitStore } from "@/renderer/state/gitStore";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  aggregatePrChecksStatus,
  combineChecksStatus,
  getPrStatusTone,
  PR_TONE_TEXT_CLASS,
} from "@/renderer/utils/prStatus";

/**
 * Translucent Git/worktree identity that floats over the top-right corner of
 * the composer. Worktrees remain visible when clean as an icon-only control;
 * root project scopes render only when they have changes. Clicking toggles the
 * docked Git review panel for the same scope.
 */
export function ThreadChangesBubble(props: {
  projectId: string;
  worktreePath?: string | undefined;
  worktreeName?: string | undefined;
}) {
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const {
    insertions,
    deletions,
    prNumber,
    prState,
    checksStatus,
    reviewDecision,
    mergeable,
    mergeStateStatus,
  } = useGitStore(
    useShallow((s) => {
      const status = props.worktreePath
        ? s.worktreeStatuses[props.worktreePath]
        : s.statuses[props.projectId];
      const pr = s.prData[resolvePrKey(props.projectId, props.worktreePath)];
      const details = pr?.number ? s.prDetails[`${props.projectId}#${pr.number}`] : undefined;
      return {
        insertions: status?.totalInsertions ?? 0,
        deletions: status?.totalDeletions ?? 0,
        prNumber: pr?.number,
        prState: pr?.state,
        reviewDecision: pr?.reviewDecision,
        mergeable: pr?.mergeable,
        mergeStateStatus: pr?.mergeStateStatus,
        checksStatus: combineChecksStatus(
          aggregatePrChecksStatus(details?.checks),
          pr?.checksStatus,
        ),
      };
    }),
  );
  // Active only when the current Git surface is showing this thread's scope.
  const isOpen = usePanelStore((s) => {
    const sameContext =
      s.gitReviewContext?.projectId === props.projectId &&
      s.gitReviewContext?.worktreePath === props.worktreePath;
    return compactLayout
      ? sameContext && s.gitOverlayOpen && !s.gitReviewAsPanel
      : sameContext && s.rightPanelTab === "git" && s.gitReviewAsPanel;
  });

  const hasChanges = insertions > 0 || deletions > 0;
  const hasVisiblePr =
    prNumber !== undefined &&
    prState !== "closed" &&
    (prState !== "merged" || props.worktreePath !== undefined);
  const worktreeName =
    props.worktreeName ?? (props.worktreePath ? getBasename(props.worktreePath) : undefined);

  if (!hasChanges && !props.worktreePath && !hasVisiblePr) return null;

  const bubble = (
    <button
      type="button"
      {...(!worktreeName ? { title: isOpen ? t`Close changes` : t`Review changes` } : {})}
      aria-label={isOpen ? t`Close changes` : t`Review changes`}
      aria-pressed={isOpen}
      /* Sized to a 28px pill — same height as the scroll-to-bottom circle and the
         rail's icon buttons, so the floating chrome shares one scale. */
      className={`${floatingGlassSurfaceClass} flex h-7 items-center gap-1.5 rounded-full text-xs font-medium transition-colors ${
        hasChanges || hasVisiblePr ? "px-3" : "w-7 justify-center px-0"
      } ${isOpen ? floatingGlassActiveClass : "hover:border-border/30"}`}
      onClick={() => {
        if (isOpen) {
          closeAllPanels();
          return;
        }
        if (compactLayout) {
          showGitReviewPage(props.projectId, props.worktreePath);
        } else {
          showGitReviewPanel(props.projectId, props.worktreePath);
        }
      }}
    >
      {hasVisiblePr ? (
        <>
          <GitPullRequest
            className={`size-3.5 shrink-0 ${PR_TONE_TEXT_CLASS[getPrStatusTone(prState, checksStatus, { reviewDecision, mergeable, mergeStateStatus })]}`}
          />
          <span>#{prNumber}</span>
        </>
      ) : props.worktreePath ? (
        <GitFork className="size-3.5 shrink-0 text-muted" />
      ) : null}
      <DiffStat animated insertions={insertions} deletions={deletions} />
    </button>
  );

  return (
    // Position an out-of-flow wrapper, not the tooltip trigger. HeroUI's trigger
    // then measures the real button without adding a line box above the composer.
    <div className="absolute right-3 bottom-full z-10 mb-1.5">
      {worktreeName ? (
        <Tooltip delay={0}>
          <Tooltip.Trigger>{bubble}</Tooltip.Trigger>
          <Tooltip.Content placement="top">{worktreeName}</Tooltip.Content>
        </Tooltip>
      ) : (
        bubble
      )}
    </div>
  );
}
