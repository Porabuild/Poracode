import { useShallow } from "zustand/shallow";
import { useGitStore } from "../../state/gitStore";

/**
 * Which remote action to show in the git menu:
 * - "push"  — no tracking branch yet (first push with --set-upstream), OR tracked but only ahead
 * - "pull"  — tracked and only behind
 * - "sync"  — tracked and both ahead+behind, or tracked and up-to-date (nothing to do, but Sync is the safe default)
 */
export type SyncAction = "push" | "pull" | "sync";

export type GitMenuIcons = {
  review: React.ReactNode;
  sync: React.ReactNode;
  push: React.ReactNode;
  pull: React.ReactNode;
  pullFromSource: React.ReactNode;
  merge: React.ReactNode;
  openPr: React.ReactNode;
  createPr: React.ReactNode;
};

export interface WorktreeActionVisibility {
  syncAction: SyncAction;
  showMerge: boolean;
  showPullFromSource: boolean;
  /** Number of commits source branch is ahead (available to pull). */
  sourceAhead: number;
  /** Number of local commits ahead of remote (available to push). */
  ahead: number;
  /** Number of remote commits behind (available to pull). */
  behind: number;
  showCreatePr: boolean;
  showOpenPr: boolean;
  prNumber: number | undefined;
  prUrl: string | undefined;
  isPushed: boolean;
}

/**
 * Derives which git actions should be visible for a worktree (React hook).
 */
export function useWorktreeActionVisibility(
  projectId: string,
  worktreePath: string,
): WorktreeActionVisibility {
  return useGitStore(
    useShallow((s) => derive(s, projectId, worktreePath)),
  );
}

/**
 * Non-hook version for use in context menu builders (called inside event handlers).
 * Reads directly from the store without subscribing.
 */
export function getWorktreeActionVisibility(
  projectId: string,
  worktreePath: string,
): WorktreeActionVisibility {
  return derive(useGitStore.getState(), projectId, worktreePath);
}

/** A plain menu item descriptor (id + label + icon). */
export interface GitMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

/**
 * Build the git submenu items for a worktree context menu.
 * Returns an array of {id, label, icon} matching ContextMenuItem shape.
 */
export function buildWorktreeGitItems(
  vis: WorktreeActionVisibility,
  icons: GitMenuIcons,
): GitMenuItem[] {
  const syncMap: Record<SyncAction, GitMenuItem> = {
    sync: { id: "git-sync", label: "Sync", icon: icons.sync },
    push: { id: "git-push", label: vis.ahead > 0 ? `Push (${vis.ahead})` : "Push", icon: icons.push },
    pull: { id: "git-pull", label: vis.behind > 0 ? `Pull (${vis.behind})` : "Pull", icon: icons.pull },
  };

  return [
    { id: "git-review", label: "Review Changes", icon: icons.review },
    syncMap[vis.syncAction],
    ...(vis.showPullFromSource
      ? [{ id: "git-pull-from-source", label: `Pull from Source (${vis.sourceAhead})`, icon: icons.pullFromSource }]
      : []),
    ...(vis.showMerge
      ? [
          { id: "git-merge-to-source", label: "Merge to Source", icon: icons.merge },
          { id: "git-merge-and-remove", label: "Merge & Remove", icon: icons.merge },
        ]
      : []),
    ...(vis.showOpenPr
      ? [{ id: "open-pr", label: `Open PR #${vis.prNumber}`, icon: icons.openPr }]
      : vis.showCreatePr
        ? [{ id: "create-pr", label: "Create Pull Request", icon: icons.createPr }]
        : []),
  ];
}

// ── Internal ─────────────────────────────────────────────

function deriveSyncAction(hasTracking: boolean, ahead: number, behind: number): SyncAction {
  if (!hasTracking) return "push";
  if (ahead > 0 && behind === 0) return "push";
  if (behind > 0 && ahead === 0) return "pull";
  return "sync";
}

function derive(
  s: ReturnType<typeof useGitStore.getState>,
  projectId: string,
  worktreePath: string,
): WorktreeActionVisibility {
  const sourceInfo = s.worktreeSourceInfo[worktreePath];
  const wtStatus = s.worktreeStatuses[worktreePath];
  const ghOk = s.ghAvailable[projectId] ?? false;
  const pr = s.prData[worktreePath];
  const hasTracking = Boolean(wtStatus?.tracking);
  const ahead = wtStatus?.ahead ?? 0;
  const behind = wtStatus?.behind ?? 0;
  const isPushed = hasTracking && ahead === 0;
  const hasPr = Boolean(pr && pr.state !== "closed");

  return {
    syncAction: deriveSyncAction(hasTracking, ahead, behind),
    showMerge: (sourceInfo?.commitsAhead ?? 0) > 0,
    showPullFromSource: (sourceInfo?.sourceAhead ?? 0) > 0,
    sourceAhead: sourceInfo?.sourceAhead ?? 0,
    ahead,
    behind,
    showCreatePr: ghOk && !hasPr && isPushed,
    showOpenPr: ghOk && hasPr,
    prNumber: hasPr ? pr!.number : undefined,
    prUrl: hasPr ? pr!.url : undefined,
    isPushed,
  };
}
