import { useEffect, useId, useRef, useState } from "react";
import { GitBranch, GitBranchMinus, GitFork, GitPullRequest } from "lucide-react";
import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useDraggable } from "@dnd-kit/react";
import { readBridge } from "@/renderer/bridge";
import { DiffStat } from "@/renderer/components/common/DiffStat";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { buildBranchPrKey } from "@/renderer/state/gitSelectors";
import { coalesceByKey } from "@/shared/coalesce";
import { useShallow } from "zustand/shallow";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import {
  aggregatePrChecksStatus,
  combineChecksStatus,
  getPrStatusTone,
  isPrActive,
  PR_TONE_TEXT_CLASS,
} from "@/renderer/utils/prStatus";
import type { DragSourceData } from "@/renderer/dnd";

const gitBadgeButtonClass =
  "shrink-0 cursor-grab rounded text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing";

/**
 * A glyph-only badge is an 18px square around its 12px glyph — the same box as
 * every other icon button in these rows, so its background can't read as a
 * different-sized chip and its glyph shares their column. Only a badge carrying
 * diff counts takes extra horizontal room for the text.
 */
const gitBadgeIconPaddingClass = "p-[3px]";
const gitBadgeTextPaddingClass = "px-1 py-0.5";

/**
 * "Its Git panel is open" is a persistent accent wash behind the badge, at
 * roughly hover weight. Deliberately not a glyph recolor — the glyph carries the
 * PR's status tone, which the open state must not mask — and not a ring, which
 * drew outside the badge's box and clipped inside truncating rows. Overrides the
 * base `hover:bg-*` so hovering an open badge deepens the wash instead of
 * flattening it back to neutral.
 */
const activeGitBadgeClass = "bg-accent/15 hover:bg-accent/25";
const hiddenGitBadgeClass =
  "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto";

/**
 * In-flight project-branch PR verifications, keyed by project PR key + branch. Every
 * mounted project badge verifies on mount, and a flat thread list mounts one
 * badge per main-branch thread of the same project — without sharing, each
 * would clear the shared prData entry and fire its own `gh` lookup. Followers
 * for the same branch await the leader's lookup instead of starting another.
 */
const projectPrVerifications = new Map<string, Promise<void>>();

export function GitBadge(props: {
  projectId: string;
  projectName: string;
  onPress?: () => void;
  worktreePath?: string;
  isActive?: boolean;
  /**
   * When set, a worktree with no PR (and no PR to create) falls back to a
   * `GitFork` marker in this slot instead of rendering nothing, so the row keeps
   * a single git glyph that reflects state (PR icon when a PR exists, fork
   * otherwise). The `projectName` is used as the branch name in its tooltip.
   */
  fallbackToWorktreeIcon?: boolean;
  /** Inline compact metadata keeps the badge inside its 18px description row. */
  compact?: boolean;
}) {
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const elementRef = useRef<HTMLDivElement>(null);
  const dragId = useId();
  useDraggable({
    id: `sidebar-panel:git:${props.projectId}:${props.worktreePath ?? "root"}:${dragId}`,
    type: "sidebar-panel",
    data: {
      type: "sidebar-panel",
      panel: "git",
      projectId: props.projectId,
      ...(props.worktreePath ? { worktreePath: props.worktreePath } : {}),
    } satisfies DragSourceData,
    element: elementRef,
  });

  const projectLocation = useAppStore((s) =>
    props.worktreePath ? undefined : s.projects.find((p) => p.id === props.projectId)?.location,
  );
  const [verifiedProjectPrBranch, setVerifiedProjectPrBranch] = useState<string | null>(null);
  const projectPrKey = buildBranchPrKey(props.projectId);

  const {
    hasStatus,
    isRepo,
    branch,
    remotePlatform,
    ghAvailable,
    totalInsertions,
    totalDeletions,
    prState,
    checksStatus,
    reviewDecision,
    mergeable,
    mergeStateStatus,
    canCreatePr,
  } = useGitStore(
    useShallow((s) => {
      const gitStatus = props.worktreePath
        ? s.worktreeStatuses[props.worktreePath]
        : s.statuses[props.projectId];
      const currentBranch = gitStatus?.branch ?? "";
      const pr = props.worktreePath
        ? s.prData[props.worktreePath]
        : verifiedProjectPrBranch === currentBranch
          ? s.prData[projectPrKey]
          : null;
      const details = pr?.number ? s.prDetails[`${props.projectId}#${pr.number}`] : undefined;
      const detailsStatus = aggregatePrChecksStatus(details?.checks);
      const isWorktree = props.worktreePath !== undefined;
      const hasActivePr = isPrActive(pr?.state);
      return {
        hasStatus: gitStatus !== undefined,
        isRepo: gitStatus?.isRepo ?? false,
        branch: currentBranch,
        remotePlatform: gitStatus?.remoteInfo?.platform,
        ghAvailable: s.ghAvailable[props.projectId] ?? false,
        totalInsertions: gitStatus?.totalInsertions ?? 0,
        totalDeletions: gitStatus?.totalDeletions ?? 0,
        prState: pr?.state,
        checksStatus: combineChecksStatus(detailsStatus, pr?.checksStatus),
        reviewDecision: pr?.reviewDecision,
        mergeable: pr?.mergeable,
        mergeStateStatus: pr?.mergeStateStatus,
        canCreatePr:
          isWorktree &&
          (s.ghAvailable[props.projectId] ?? false) &&
          !hasActivePr &&
          Boolean(gitStatus?.tracking) &&
          (gitStatus?.ahead ?? 0) === 0,
      };
    }),
  );

  useEffect(() => {
    if (props.worktreePath) return;
    setVerifiedProjectPrBranch(null);
    useGitStore.getState().setPrData(projectPrKey, null);
    if (!isRepo || !branch || !projectLocation || !ghAvailable) return;
    if (remotePlatform !== "github" && remotePlatform !== "unknown") return;

    let isActive = true;
    const markVerified = () => {
      if (!isActive) return;
      if (useGitStore.getState().statuses[props.projectId]?.branch !== branch) return;
      setVerifiedProjectPrBranch(branch);
    };
    void coalesceByKey(projectPrVerifications, `${projectPrKey}\0${branch}`, () =>
      readBridge()
        .ghGetPrForBranch({ projectLocation, branch })
        .then((pr) => {
          if (useGitStore.getState().statuses[props.projectId]?.branch !== branch) return;
          useGitStore.getState().setPrData(projectPrKey, pr);
        })
        .catch(() => undefined),
    ).then(markVerified);
    return () => {
      isActive = false;
    };
  }, [
    props.worktreePath,
    props.projectId,
    projectPrKey,
    isRepo,
    branch,
    projectLocation,
    ghAvailable,
    remotePlatform,
  ]);

  const hasChanges = totalInsertions > 0 || totalDeletions > 0;
  const isWorktree = props.worktreePath !== undefined;
  if (hasStatus && !isRepo) {
    return (
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <div
            ref={elementRef}
            role="button"
            tabIndex={0}
            aria-label={t`Git status for ${props.projectName}: not a Git repository`}
            className={`${gitBadgeButtonClass} ${gitBadgeIconPaddingClass} ${props.compact ? "poracode-compact-git-badge" : ""} ${
              props.isActive ? activeGitBadgeClass : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              props.onPress?.();
            }}
            onKeyDown={(e) =>
              handleKeyActivate(e, () => props.onPress?.(), { stopPropagation: true })
            }
          >
            <GitBranchMinus className="size-3 shrink-0 text-warning" />
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content placement="right">
          <Trans>Not a Git repository</Trans>
        </Tooltip.Content>
      </Tooltip>
    );
  }
  const hasVisiblePr =
    prState !== undefined && (isWorktree || (prState !== "merged" && prState !== "closed"));
  const showPrIcon = hasVisiblePr || canCreatePr;
  const showWorktreeFork = (props.fallbackToWorktreeIcon ?? false) && isWorktree && !showPrIcon;
  if (!isRepo || (!hasChanges && !showPrIcon && !showWorktreeFork)) {
    return (
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <div
            ref={elementRef}
            role="button"
            tabIndex={0}
            aria-label={t`Git status for ${props.projectName}`}
            className={`${gitBadgeButtonClass} ${gitBadgeIconPaddingClass} ${props.compact ? "poracode-compact-git-badge" : ""} ${
              props.isActive ? activeGitBadgeClass : hiddenGitBadgeClass
            }`}
            onClick={(e) => {
              e.stopPropagation();
              props.onPress?.();
            }}
            onKeyDown={(e) =>
              handleKeyActivate(e, () => props.onPress?.(), { stopPropagation: true })
            }
          >
            <span className="flex items-center gap-1 text-[10px] font-medium">
              <GitBranch className="size-3 shrink-0" />
            </span>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content placement="right">
          <Trans>Open Git panel</Trans>
        </Tooltip.Content>
      </Tooltip>
    );
  }
  const prIconColor =
    prState === undefined
      ? "text-[color:var(--git-branch-tone)]"
      : PR_TONE_TEXT_CLASS[
          getPrStatusTone(prState, checksStatus, {
            reviewDecision,
            mergeable,
            mergeStateStatus,
          })
        ];
  return (
    <div
      ref={elementRef}
      role="button"
      tabIndex={0}
      aria-label={t`Git status for ${props.projectName}`}
      className={`${gitBadgeButtonClass} ${
        hasChanges ? gitBadgeTextPaddingClass : gitBadgeIconPaddingClass
      } ${props.compact ? "poracode-compact-git-badge" : ""} ${props.isActive ? activeGitBadgeClass : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        props.onPress?.();
      }}
      onKeyDown={(e) => handleKeyActivate(e, () => props.onPress?.(), { stopPropagation: true })}
    >
      <span className="flex items-center gap-1 text-[10px] font-medium">
        {hasChanges && (
          <DiffStat
            animated={!compactLayout}
            className="flex items-center gap-0.5"
            insertions={totalInsertions}
            deletions={totalDeletions}
          />
        )}
        {showPrIcon && <GitPullRequest className={`size-3 shrink-0 ${prIconColor}`} />}
        {showWorktreeFork && (
          <Tooltip delay={150}>
            <Tooltip.Trigger tabIndex={-1} role="none">
              <span className="flex shrink-0 items-center">
                <GitFork className="size-3 text-[color:var(--git-branch-tone)]" />
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content placement="right">
              <Trans>Worktree: {props.projectName}</Trans>
            </Tooltip.Content>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
