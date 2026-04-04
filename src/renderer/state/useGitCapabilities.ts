import { useGitStore } from "./gitStore";

export interface GitCapabilities {
  isRepo: boolean;
  hasRemote: boolean;
  isGitHub: boolean;
  remoteOwner: string;
  remoteRepo: string;
  hasBranch: boolean;
  isPushed: boolean;
}

function derive(
  status: { isRepo: boolean; hasRemote: boolean; remoteInfo: { platform: string; owner: string; repo: string } | null; tracking: string; ahead: number; branch: string } | undefined,
): GitCapabilities {
  if (!status) {
    return { isRepo: false, hasRemote: false, isGitHub: false, remoteOwner: "", remoteRepo: "", hasBranch: false, isPushed: false };
  }
  const ri = status.remoteInfo;
  return {
    isRepo: status.isRepo,
    hasRemote: status.hasRemote,
    isGitHub: ri?.platform === "github",
    remoteOwner: ri?.owner ?? "",
    remoteRepo: ri?.repo ?? "",
    hasBranch: Boolean(status.branch),
    isPushed: Boolean(status.tracking) && status.ahead === 0,
  };
}

export function useProjectGitCapabilities(projectId: string): GitCapabilities {
  const status = useGitStore((s) => s.statuses[projectId]);
  return derive(status);
}

export function useWorktreeGitCapabilities(worktreePath: string | undefined, projectId: string): GitCapabilities {
  const wtStatus = useGitStore((s) => worktreePath ? s.worktreeStatuses[worktreePath] : undefined);
  const projectStatus = useGitStore((s) => s.statuses[projectId]);
  // Worktree status for branch-level info, fall back to project status for remote info
  const status = wtStatus ?? projectStatus;
  return derive(status);
}
