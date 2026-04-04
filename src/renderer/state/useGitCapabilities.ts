import { useShallow } from "zustand/shallow";
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
  return useGitStore(useShallow((s) => derive(s.statuses[projectId])));
}

export function useWorktreeGitCapabilities(worktreePath: string | undefined, projectId: string): GitCapabilities {
  return useGitStore(
    useShallow((s) => {
      const status = (worktreePath ? s.worktreeStatuses[worktreePath] : undefined) ?? s.statuses[projectId];
      return derive(status);
    }),
  );
}
