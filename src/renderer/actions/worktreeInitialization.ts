import type { Project } from "@/shared/contracts";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { primeWorktreeGitState, runWorktreeSetupScript } from "./worktreeLaunchActions";

/**
 * Shared follow-up for creating a thread in a worktree and moving one there.
 * Local setup uses the eager shell with prompt gating and success cleanup.
 * Projected projects already run setup on their host.
 */
export function initializeCreatedWorktree(project: Project, worktreePath: string): void {
  void primeWorktreeGitState(project, worktreePath);
  if (remoteOwner(project)) return;
  const setupScript = project.scripts?.setupScript;
  if (setupScript) void runWorktreeSetupScript(project, worktreePath, setupScript);
}
