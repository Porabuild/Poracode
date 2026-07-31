import { useShallow } from "zustand/shallow";
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { deriveSyncAction, type SyncAction } from "@/renderer/actions/gitCommandRunner";
import { isPrActive } from "@/renderer/utils/prStatus";

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
  return useGitStore(useShallow((s) => derive(s, projectId, worktreePath)));
}

/**
 * Hook variant that keeps a worktree git submenu in sync with store updates.
 */
export function useWorktreeGitItems(
  projectId: string,
  worktreePath: string,
  icons: GitMenuIcons,
): GitMenuItem[] {
  const visibility = useWorktreeActionVisibility(projectId, worktreePath);
  return buildWorktreeGitItems(visibility, icons);
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
    sync: { id: "git-sync", label: i18n._(msg`Sync`), icon: icons.sync },
    push: {
      id: "git-push",
      label: vis.ahead > 0 ? i18n._(msg`Push (${vis.ahead})`) : i18n._(msg`Push`),
      icon: icons.push,
    },
    pull: {
      id: "git-pull",
      label: vis.behind > 0 ? i18n._(msg`Pull (${vis.behind})`) : i18n._(msg`Pull`),
      icon: icons.pull,
    },
  };

  return [
    { id: "git-review", label: i18n._(msg`Review Changes`), icon: icons.review },
    syncMap[vis.syncAction],
    ...(vis.showPullFromSource
      ? [
          {
            id: "git-pull-from-source",
            label: i18n._(msg`Pull from Source (${vis.sourceAhead})`),
            icon: icons.pullFromSource,
          },
        ]
      : []),
    ...(vis.showMerge
      ? [
          { id: "git-merge-to-source", label: i18n._(msg`Merge to Source`), icon: icons.merge },
          { id: "git-merge-and-remove", label: i18n._(msg`Merge & Remove`), icon: icons.merge },
        ]
      : []),
    ...(vis.showOpenPr && vis.prNumber !== undefined
      ? [{ id: "open-pr", label: i18n._(msg`Open PR #${vis.prNumber}`), icon: icons.openPr }]
      : vis.showCreatePr
        ? [{ id: "create-pr", label: i18n._(msg`Create Pull Request`), icon: icons.createPr }]
        : []),
  ];
}

// ── Internal ─────────────────────────────────────────────

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
  const activePr = pr && isPrActive(pr.state) ? pr : undefined;

  return {
    syncAction: deriveSyncAction(hasTracking, ahead, behind),
    showMerge: (sourceInfo?.commitsAhead ?? 0) > 0,
    showPullFromSource: (sourceInfo?.sourceAhead ?? 0) > 0,
    sourceAhead: sourceInfo?.sourceAhead ?? 0,
    ahead,
    behind,
    showCreatePr: ghOk && !activePr && isPushed,
    showOpenPr: ghOk && Boolean(activePr),
    prNumber: activePr?.number,
    prUrl: activePr?.url,
    isPushed,
  };
}
