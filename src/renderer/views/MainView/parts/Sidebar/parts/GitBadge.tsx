import { useId, useRef } from "react";
import { GitPullRequest } from "lucide-react";
import { useDraggable } from "@dnd-kit/react";
import { useGitStore } from "@/renderer/state/gitStore";
import { buildBranchPrKey } from "@/renderer/state/gitSelectors";
import { useShallow } from "zustand/shallow";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import {
  aggregatePrChecksStatus,
  combineChecksStatus,
  getPrStatusTone,
  PR_TONE_TEXT_CLASS,
} from "@/renderer/utils/prStatus";
import type { DragSourceData } from "@/renderer/dnd";

export function GitBadge(props: {
  projectId: string;
  projectName: string;
  onPress?: () => void;
  worktreePath?: string;
  isActive?: boolean;
}) {
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

  const { isRepo, totalInsertions, totalDeletions, prState, checksStatus, canCreatePr } =
    useGitStore(
      useShallow((s) => {
        const gitStatus = props.worktreePath
          ? s.worktreeStatuses[props.worktreePath]
          : s.statuses[props.projectId];
        const pr = props.worktreePath
          ? s.prData[props.worktreePath]
          : s.prData[buildBranchPrKey(props.projectId)];
        const details = pr?.number ? s.prDetails[`${props.projectId}#${pr.number}`] : undefined;
        const detailsStatus = aggregatePrChecksStatus(details?.checks);
        const isWorktree = props.worktreePath !== undefined;
        const hasPr = pr !== undefined && pr !== null && pr.state !== "closed";
        return {
          isRepo: gitStatus?.isRepo ?? false,
          totalInsertions: gitStatus?.totalInsertions ?? 0,
          totalDeletions: gitStatus?.totalDeletions ?? 0,
          prState: pr?.state,
          checksStatus: combineChecksStatus(detailsStatus, pr?.checksStatus),
          canCreatePr:
            isWorktree &&
            (s.ghAvailable[props.projectId] ?? false) &&
            !hasPr &&
            Boolean(gitStatus?.tracking) &&
            (gitStatus?.ahead ?? 0) === 0,
        };
      }),
    );
  const hasChanges = totalInsertions > 0 || totalDeletions > 0;
  const isWorktree = props.worktreePath !== undefined;
  const hasVisiblePr =
    prState !== undefined && prState !== "closed" && (prState !== "merged" || isWorktree);
  const showPrIcon = hasVisiblePr || canCreatePr;
  if (!isRepo || (!hasChanges && !showPrIcon)) return null;
  const prIconColor = canCreatePr
    ? "text-muted/60"
    : PR_TONE_TEXT_CLASS[getPrStatusTone(prState, checksStatus)];
  return (
    <div
      ref={elementRef}
      role="button"
      tabIndex={0}
      aria-label={`Git status for ${props.projectName}`}
      className={`shrink-0 cursor-grab rounded px-1 py-0.5 transition-colors hover:bg-white/[0.04] hover:text-foreground active:cursor-grabbing ${
        props.isActive ? "bg-accent/15 ring-1 ring-accent/40" : "text-muted/60"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        props.onPress?.();
      }}
      onKeyDown={(e) => handleKeyActivate(e, () => props.onPress?.(), { stopPropagation: true })}
    >
      <span className="flex items-center gap-1 text-[10px] font-medium">
        {showPrIcon && <GitPullRequest className={`size-3 ${prIconColor}`} />}
        {hasChanges && (
          <span className="flex items-center gap-0.5">
            {totalInsertions > 0 && <span className="text-success">+{totalInsertions}</span>}
            {totalDeletions > 0 && <span className="text-danger">-{totalDeletions}</span>}
          </span>
        )}
      </span>
    </div>
  );
}
