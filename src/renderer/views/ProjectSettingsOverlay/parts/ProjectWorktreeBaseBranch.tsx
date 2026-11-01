import { useEffect } from "react";
import { useLingui } from "@lingui/react/macro";
import type { GitBranchInfo } from "@/shared/contracts";
import { dedupePickerBranches } from "@/renderer/components/common/BranchSelector/parts/useBranchList";
import { updateProjectWorktreeBaseBranch } from "@/renderer/actions/projectActions";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProject } from "@/renderer/state/useThread";
import { Select, type SelectOption } from "@/renderer/components/common";

const REPOSITORY_DEFAULT_ID = "\u0000repository-default";
const EMPTY_BRANCHES: GitBranchInfo[] = [];

/** Picks the branch new worktrees fork from, or the repository's default branch. */
export function ProjectWorktreeBaseBranch(props: { projectId: string }) {
  const { t } = useLingui();
  const project = useProject(props.projectId);
  const branches = useGitStore((s) => s.branches[props.projectId]?.branches ?? EMPTY_BRANCHES);
  const projectLocation = project?.location;
  const needsBranches = branches.length === 0;
  // Load the branch list when settings open before any picker has fetched it.
  useEffect(() => {
    if (!needsBranches || !projectLocation) return;
    void refreshGitProject({ id: props.projectId, location: projectLocation }, "manual", "full");
  }, [needsBranches, projectLocation, props.projectId]);
  if (!project) return null;
  const pinned = project.worktreeBaseBranch;

  const names = dedupePickerBranches(branches).map((branch) => branch.name);
  // Keep a pin whose branch is not listed (not loaded yet, or deleted) selectable.
  if (pinned && !names.includes(pinned)) names.unshift(pinned);
  const options: SelectOption[] = [
    { id: REPOSITORY_DEFAULT_ID, label: t`Repository default branch` },
    ...names.map((name) => ({ id: name, label: name })),
  ];

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{t`Default worktree base`}</p>
        <p className="text-xs text-muted">
          {t`Branch new worktrees fork from. You can also star one in the composer's branch picker.`}
        </p>
      </div>
      <Select
        aria-label={t`Default worktree base`}
        className="w-[320px] shrink-0"
        options={options}
        value={pinned ?? REPOSITORY_DEFAULT_ID}
        onChange={(value) =>
          updateProjectWorktreeBaseBranch(
            project.id,
            value === REPOSITORY_DEFAULT_ID ? undefined : value,
          )
        }
      />
    </div>
  );
}
