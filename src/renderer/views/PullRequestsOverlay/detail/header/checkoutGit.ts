import type { GitBranchListResult, GitStatusResult, Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";

/** Whether `commit` and `headSha` name the same commit; either may be abbreviated (7+ characters). */
export function commitMatchesHead(commit: string, headSha: string): boolean {
  const a = commit.toLowerCase();
  const b = headSha.toLowerCase();
  const length = Math.min(a.length, b.length);
  return length >= 7 && a.slice(0, length) === b.slice(0, length);
}

export function hasUncommittedWork(status: GitStatusResult): boolean {
  return (
    status.staged.length > 0 ||
    status.unstaged.length > 0 ||
    (status.conflictFiles?.length ?? 0) > 0 ||
    status.mergeInProgress === true
  );
}

export function hasLocalBranch(branches: GitBranchListResult | undefined, name: string): boolean {
  return branches?.branches.some((branch) => !branch.isRemote && branch.name === name) ?? false;
}

function remoteTip(
  branches: GitBranchListResult | undefined,
  headBranch: string,
  remote: string,
): string | undefined {
  return branches?.branches.find(
    (branch) =>
      branch.isRemote && (branch.name === `${remote}/${headBranch}` || branch.name === headBranch),
  )?.commit;
}

/**
 * Which branch the checkout would use, if its tip is not the review's head: the local
 * branch of that name when there is one, otherwise the remote one. A same-named branch
 * from another repository (a fork's) or a stale local branch must not pass for the head.
 */
export function headMismatch(
  branches: GitBranchListResult | undefined,
  headBranch: string,
  remote: string,
  headSha: string | undefined,
): "local" | "remote" | null {
  if (!branches || !headSha) return null;
  const local = branches.branches.find((branch) => !branch.isRemote && branch.name === headBranch);
  const tip = local?.commit ?? remoteTip(branches, headBranch, remote);
  if (tip === undefined) return null;
  if (commitMatchesHead(tip, headSha) || Math.min(tip.length, headSha.length) < 7) return null;
  return local ? "local" : "remote";
}

/** Re-reads branches and worktrees so the menu and the sidebar see the change. */
export async function refreshProjectRefs(project: Project): Promise<void> {
  const bridge = readBridge();
  try {
    const [branches, worktrees] = await Promise.all([
      bridge.gitListBranches({ projectLocation: project.location, includeRemote: true }),
      bridge.gitListWorktrees({ projectLocation: project.location }),
    ]);
    const store = useGitStore.getState();
    store.setBranches(project.id, branches);
    store.setWorktrees(project.id, worktrees.worktrees);
  } catch {
    // The periodic git refresh converges the same data; a miss here is not an error.
  }
}
