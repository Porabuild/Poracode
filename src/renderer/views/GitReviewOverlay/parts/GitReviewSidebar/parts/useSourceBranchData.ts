import { useEffect, useState } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { getProjectPosixPath } from "@/shared/wsl";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";

export function useSourceBranchData(params: {
  project: { location: ProjectLocation };
  effectiveBranch: string | undefined;
  effectivePrKey: string | undefined;
  worktreePath: string | undefined;
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
    worktreePath,
    isGitHub,
    ghAvailable,
    preferredSourceBranch,
    refreshKey,
  } = params;

  const projectLocationKind = project.location.kind;
  const projectLocationPath = getProjectPosixPath(project.location);
  const projectLocationDistro = project.location.kind === "wsl" ? project.location.distro : null;
  const projectLocationUncPath = project.location.kind === "wsl" ? project.location.uncPath : null;
  const projectLocationHost = project.location.kind === "ssh" ? project.location.host : null;

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
          : projectLocationKind === "ssh"
            ? { kind: "ssh", host: projectLocationHost!, path: projectLocationPath }
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
    projectLocationHost,
    projectLocationKind,
    projectLocationPath,
    projectLocationUncPath,
    refreshKey,
  ]);

  // Fetch PR data for non-worktree mode (worktree PR data is polled elsewhere)
  useEffect(() => {
    if (worktreePath || !isGitHub || !ghAvailable || !effectiveBranch || !effectivePrKey) return;
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
  }, [
    worktreePath,
    isGitHub,
    ghAvailable,
    effectiveBranch,
    effectivePrKey,
    project.location,
    refreshKey,
  ]);

  return { sourceBranchLoading };
}
