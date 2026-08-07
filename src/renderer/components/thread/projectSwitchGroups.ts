import { useShallow } from "zustand/shallow";
import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useActiveWorkspaceId } from "@/renderer/state/workspaceStore";
import { useWorkspaceProjectFilter } from "@/renderer/state/workspaceSelectors";

export interface ProjectSwitchEntry {
  project: Project;
  /** Workspace this project is filed in, set only for out-of-workspace entries. */
  otherWorkspaceName?: string;
}

export interface ProjectSwitchGroups {
  /**
   * Home first (while the Home scope setting is on), then local projects,
   * then projects mirrored from a remote server — the flat fallback order.
   */
  all: readonly ProjectSwitchEntry[];
  inWorkspace: readonly ProjectSwitchEntry[];
  /** Projects filed to another workspace; picking one switches the workspace. */
  others: readonly ProjectSwitchEntry[];
  activeWorkspaceName: string | undefined;
}

/**
 * Preferred selector order: the Home scope first, then local projects, then
 * remote-mirrored ones. Store order alone would scatter newly added remote
 * mirrors between local projects. Stable, so projects keep their store order
 * within each bucket.
 */
function compareSelectorOrder(a: Project, b: Project): number {
  const rank = (project: Project) => {
    if (isHomeProject(project)) return 0;
    return project.remoteServerId ? 2 : 1;
  };
  return rank(a) - rank(b);
}

/**
 * Splits the project list the way the project switcher presents it: the active
 * workspace's projects, then everything filed elsewhere. Out-of-workspace
 * projects stay reachable rather than being hidden — a project the user cannot
 * see is worse than one shown under a heading — and the workspace membership
 * rule stays the shared one in `@/shared/contracts/workspace`.
 */
export function useProjectSwitchGroups(): ProjectSwitchGroups {
  const isInWorkspace = useWorkspaceProjectFilter();
  const workspaces = useSharedSettings((state) => state.workspaces);
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const activeWorkspaceId = useActiveWorkspaceId();
  // Home is persisted with `disabled: true` as an internal marker (it is not a
  // user-disabled project), so it has to survive the disabled filter — but it
  // is only offered while the Home scope setting is on.
  const projects = useAppStore(
    useShallow((state) =>
      state.projects
        .filter((project) => (isHomeProject(project) ? homeScopeEnabled : !project.disabled))
        .sort(compareSelectorOrder),
    ),
  );

  const inWorkspace: ProjectSwitchEntry[] = [];
  const others: ProjectSwitchEntry[] = [];
  for (const project of projects) {
    if (isInWorkspace(project)) {
      inWorkspace.push({ project });
      continue;
    }
    const name = workspaces.find((workspace) => workspace.id === project.workspaceId)?.name;
    others.push({ project, ...(name ? { otherWorkspaceName: name } : {}) });
  }

  return {
    all: [...inWorkspace, ...others],
    inWorkspace,
    others,
    activeWorkspaceName: workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name,
  };
}
