import { getBasename } from "@/shared/pathUtils";

/** Compact project/worktree scope label for docked panel headers. */
export function formatProjectScopeLabel(projectName: string, worktreePath?: string): string {
  if (!worktreePath) return projectName;
  const worktreeName = getBasename(worktreePath);
  return worktreeName ? `${projectName} / ${worktreeName}` : projectName;
}
