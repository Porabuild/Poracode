import type { Project } from "@/shared/contracts";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { primeWorktreeGitState, runWorktreeSetupScript } from "./worktreeLaunchActions";

/**
 * Shared follow-up for creating a thread in a worktree and moving one there.
 * Local setup uses the eager shell with prompt gating and success cleanup.
 * Projected projects already run setup on their host.
 *
 * `trackGitState: false` skips watching and reading the new worktree's git status, for
 * a worktree that belongs to no thread: the host only accepts a worktree location that
 * is registered through a thread, and refuses (HTTP 403) a status read of any other.
 */
export function initializeCreatedWorktree(
  project: Project,
  worktreePath: string,
  options: { trackGitState?: boolean } = {},
): void {
  if (options.trackGitState !== false) void primeWorktreeGitState(project, worktreePath);
  if (remoteOwner(project)) return;
  const setupScript = project.scripts?.setupScript;
  if (setupScript) void runWorktreeSetupScript(project, worktreePath, setupScript);
}
