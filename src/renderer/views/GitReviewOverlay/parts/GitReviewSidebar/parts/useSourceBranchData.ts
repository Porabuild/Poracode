import { useEffect, useState } from "react";
import type { ProjectLocation } from "@/shared/contracts";
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

  const [sourceBranchLoading, setSourceBranchLoading] = useState(false);

  useEffect(() => {
    if (!effectiveBranch || !effectivePrKey) {
      setSourceBranchLoading(false);
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
          }
        : projectLocationKind === "posix"
          ? { kind: "posix", path: projectLocationPath }
          : { kind: "windows", path: projectLocationPath };
    setSourceBranchLoading(true);
    readBridge()
      .gitGetWorktreeSourceBranch({
        projectLocation: sourceProjectLocation,
        branch: effectiveBranch,
        ...(preferredSourceBranch ? { sourceBranchOverride: preferredSourceBranch } : {}),
      })
      .then((result) => {
        if (!isActive) return;
        useGitStore.getState().setWorktreeSourceInfo(effectivePrKey, {
          sourceBranch: result.sourceBranch,
          commitsAhead: result.commitsAhead,
          sourceAhead: result.sourceAhead,
        });
      })
      .catch(() => {
        if (!isActive) return;
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
    preferredSourceBranch,
    projectLocationDistro,
    projectLocationKind,
    projectLocationPath,
    projectLocationUncPath,
    refreshKey,
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

  return { sourceBranchLoading };
}
