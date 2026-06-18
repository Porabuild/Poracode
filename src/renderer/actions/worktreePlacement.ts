import type { Project } from "@/shared/contracts";
import { resolveWorktreePlacement } from "@/shared/worktree";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

/**
 * Build the `gitAddWorktree` placement fields (root + omitRepoDir) for a project
 * from the current global settings and the project's per-project override. The
 * result is spread straight into the IPC payload; it is empty when the built-in
 * default applies, so existing behaviour is unchanged for default configs.
 */
export function worktreePlacementPayload(project: Project): {
  worktreeRoot?: string;
  worktreeOmitRepoDir?: boolean;
} {
  const placement = resolveWorktreePlacement(
    useSharedSettings.getState(),
    project.worktreeLocation,
    project.location,
  );
  return {
    ...(placement.root ? { worktreeRoot: placement.root } : {}),
    ...(placement.omitRepoDir ? { worktreeOmitRepoDir: true } : {}),
  };
}
