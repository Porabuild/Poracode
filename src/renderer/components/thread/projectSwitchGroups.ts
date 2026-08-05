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
  /** Active-workspace projects first, then the rest — the flat fallback order. */
  all: readonly ProjectSwitchEntry[];
  inWorkspace: readonly ProjectSwitchEntry[];
  /** Projects filed to another workspace; picking one switches the workspace. */
  others: readonly ProjectSwitchEntry[];
  activeWorkspaceName: string | undefined;
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
  const activeWorkspaceId = useActiveWorkspaceId();
  // Home is persisted with `disabled: true` as an internal marker (it is not a
  // user-disabled project), so it has to survive the disabled filter.
  const projects = useAppStore(
    useShallow((state) =>
      state.projects.filter((project) => isHomeProject(project) || !project.disabled),
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
