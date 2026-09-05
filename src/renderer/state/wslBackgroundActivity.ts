import type { ProjectLocation } from "@/shared/contracts";
import { useAppStore } from "./appStore";
import { useDevTerminalStore } from "./devTerminalStore";

/** Open projects alone must not keep waking WSL through background Git polls. */
export function shouldPollProject(project: { id: string; location: ProjectLocation }): boolean {
  if (project.location.kind !== "wsl") return true;
  if (
    useAppStore
      .getState()
      .threads.some((thread) => thread.projectId === project.id && thread.status !== "inactive")
  )
    return true;
  const terminal = useDevTerminalStore.getState();
  return terminal.isOpen && terminal.activeProjectId === project.id;
}
