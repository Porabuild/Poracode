import { toast } from "@heroui/react";
import { msg, plural } from "@lingui/core/macro";
import { isProjectInWorkspace, type Workspace } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { getActiveWorkspaceId, useWorkspaceStore } from "@/renderer/state/workspaceStore";

/** Create a workspace and switch to it. Returns null when the name is blank. */
export function createWorkspace(name: string): Workspace | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const workspace = useSharedSettings.getState().addWorkspace(trimmed);
  useWorkspaceStore.getState().setActiveWorkspaceId(workspace.id);
  return workspace;
}

/**
 * Follow a project into its own workspace when it lives outside the active one.
 * Opening work the current workspace hides would otherwise leave the user
 * staring at a sidebar that does not contain the thread they just started, so
 * the view moves to where the work is. No-op for projects the active workspace
 * already shows (including unfiled ones and Home).
 */
export function switchWorkspaceForProject(projectId: string): void {
  const project = useAppStore.getState().projects.find((item) => item.id === projectId);
  const targetWorkspaceId = project?.workspaceId;
  if (!project || !targetWorkspaceId) return;
  const knownWorkspaceIds = new Set(
    (useSharedSettings.getState().workspaces ?? []).map((workspace) => workspace.id),
  );
  if (isProjectInWorkspace(project, getActiveWorkspaceId(), knownWorkspaceIds)) return;
  useWorkspaceStore.getState().setActiveWorkspaceId(targetWorkspaceId);
}

export function renameWorkspace(workspaceId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  useSharedSettings.getState().renameWorkspace(workspaceId, trimmed);
}

/**
 * Where a deleted workspace's projects would land. Exported so the confirm dialog
 * names the same destination the deletion actually uses — two copies of this rule
 * would let the dialog promise one workspace while the action picks another.
 */
export function workspaceDeletionFallback(workspaceId: string): Workspace | undefined {
  return useSharedSettings.getState().workspaces.find((w) => w.id !== workspaceId);
}

/**
 * Delete a workspace, handing its projects to another one first. Deleting a
 * grouping must never delete the work inside it, so the projects are always
 * re-filed rather than left pointing at a workspace that no longer exists.
 */
export function deleteWorkspace(workspaceId: string): void {
  const fallback = workspaceDeletionFallback(workspaceId);
  if (!fallback) {
    toast.warning(i18n._(msg`Keep at least one workspace.`));
    return;
  }

  let movedCount = 0;
  for (const project of useAppStore.getState().projects) {
    if (project.workspaceId === workspaceId) movedCount += 1;
  }
  const wasActive = getActiveWorkspaceId() === workspaceId;

  useAppStore.getState().refileProjects(workspaceId, fallback.id);
  useSharedSettings.getState().removeWorkspace(workspaceId);
  if (wasActive) useWorkspaceStore.getState().setActiveWorkspaceId(fallback.id);

  if (movedCount > 0) {
    const target = fallback.name;
    toast.info(
      i18n._(
        msg`${plural(movedCount, {
          one: `Moved # project to ${target}.`,
          other: `Moved # projects to ${target}.`,
        })}`,
      ),
    );
  }
}
