import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { GitBranchInfo, ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { getProjectPosixPath } from "@/shared/wsl";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";

export function useSourceBranchData(params: {
  project: { location: ProjectLocation };
  effectiveBranch: string | undefined;
  effectivePrKey: string | undefined;
  isGitHub: boolean;
  ghAvailable: boolean;
  /** When set (e.g. PR base), overrides the inferred source branch. */
  preferredSourceBranch?: string | undefined;
  refreshKey: number;
}) {
  const { t } = useLingui();
  const {
    project,
    effectiveBranch,
    effectivePrKey,
    isGitHub,
    ghAvailable,
    preferredSourceBranch,
    refreshKey,
  } = params;

  const projectLocationKind = project.location.kind;
  const projectLocationPath = getProjectPosixPath(project.location);
  const projectLocationDistro = project.location.kind === "wsl" ? project.location.distro : null;
  const projectLocationUncPath = project.location.kind === "wsl" ? project.location.uncPath : null;
  const projectRemoteServerId = project.location.remoteServerId;

  const [sourceBranchLoading, setSourceBranchLoading] = useState(false);
  const [sourceBranches, setSourceBranches] = useState<readonly GitBranchInfo[] | null>(null);
  const [sourceBranchesRetryKey, setSourceBranchesRetryKey] = useState(0);

  useEffect(() => {
    if (!effectiveBranch || !effectivePrKey) {
      setSourceBranchLoading(false);
      setSourceBranches(null);
      return;
    }
    let isActive = true;
    const sourceProjectLocation: ProjectLocation =
      projectLocationKind === "wsl"
        ? {
            kind: "wsl",
            distro: projectLocationDistro!,
            linuxPath: projectLocationPath,
            uncPath: projectLocationUncPath!,
            ...(projectRemoteServerId ? { remoteServerId: projectRemoteServerId } : {}),
          }
        : projectLocationKind === "posix"
          ? {
              kind: "posix",
              path: projectLocationPath,
              ...(projectRemoteServerId ? { remoteServerId: projectRemoteServerId } : {}),
            }
          : {
              kind: "windows",
              path: projectLocationPath,
              ...(projectRemoteServerId ? { remoteServerId: projectRemoteServerId } : {}),
            };
    setSourceBranchLoading(true);
    setSourceBranches(null);
    const sourceBranchesRequest =
      isGitHub && ghAvailable
        ? readBridge()
            .gitListBranches({
              projectLocation: sourceProjectLocation,
              includeRemote: true,
            })
            .then((result) => result.branches)
            .catch((error) => {
              if (isActive) {
                toast.danger(friendlyError(error), {
                  actionProps: {
                    children: t`Retry`,
                    onPress: () => {
                      if (isActive) setSourceBranchesRetryKey((key) => key + 1);
                    },
                  },
                });
              }
              return null;
            })
        : Promise.resolve(null);
    readBridge()
      .gitGetWorktreeSourceBranch({
        projectLocation: sourceProjectLocation,
        branch: effectiveBranch,
        ...(preferredSourceBranch ? { sourceBranchOverride: preferredSourceBranch } : {}),
      })
      .then(async (result) => {
        const branches = await sourceBranchesRequest;
        if (!isActive) return;
        setSourceBranches(branches);
        useGitStore.getState().setWorktreeSourceInfo(effectivePrKey, {
          sourceBranch: result.sourceBranch,
          commitsAhead: result.commitsAhead,
          sourceAhead: result.sourceAhead,
        });
      })
      .catch(() => {
        if (!isActive) return;
        setSourceBranches(null);
        useGitStore.getState().setWorktreeSourceInfo(effectivePrKey, {
          sourceBranch: null,
          commitsAhead: 0,
          sourceAhead: 0,
        });
      })
      .finally(() => {
        if (isActive) {
          setSourceBranchLoading(false);
        }
      });
    return () => {
      isActive = false;
    };
  }, [
    effectiveBranch,
    effectivePrKey,
    ghAvailable,
    isGitHub,
    preferredSourceBranch,
    projectLocationDistro,
    projectLocationKind,
    projectLocationPath,
    projectRemoteServerId,
    projectLocationUncPath,
    refreshKey,
    sourceBranchesRetryKey,
    t,
  ]);

  // Fetch PR data on mount / refreshKey change for both worktree and
  // non-worktree modes.  Worktree PR data is also polled by the periodic
  // refreshGitProject cycle, but that cycle may not have run yet when the
  // panel is first opened — leaving the PR section blank after a "commit &
  // create PR" action or when reopening the panel.
  useEffect(() => {
    if (!isGitHub || !ghAvailable || !effectiveBranch || !effectivePrKey) return;
    let isActive = true;
    readBridge()
      .ghGetPrForBranch({ projectLocation: project.location, branch: effectiveBranch })
      .then((pr) => {
        if (!isActive) return;
        useGitStore.getState().setPrData(effectivePrKey, pr);
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, [isGitHub, ghAvailable, effectiveBranch, effectivePrKey, project.location, refreshKey]);

  return { sourceBranchLoading, sourceBranches };
}
