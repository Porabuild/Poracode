import { useShallow } from "zustand/shallow";
import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceProjectFilter } from "@/renderer/state/workspaceSelectors";

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
 * The project list the switcher presents: exactly the projects the active
 * workspace shows in the sidebar, in the preferred selector order. Projects
 * filed in another workspace stay out of the list — the sidebar's workspace
 * switcher is the way to reach them. The membership rule stays the shared one
 * in `@/shared/contracts/workspace`.
 */
export function useProjectSwitchProjects(): readonly Project[] {
  const isInWorkspace = useWorkspaceProjectFilter();
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  // Home is persisted with `disabled: true` as an internal marker (it is not a
  // user-disabled project), so it has to survive the disabled filter — but it
  // is only offered while the Home scope setting is on.
  return useAppStore(
    useShallow((state) =>
      state.projects
        .filter((project) => (isHomeProject(project) ? homeScopeEnabled : !project.disabled))
        .filter(isInWorkspace)
        .sort(compareSelectorOrder),
    ),
  );
}
