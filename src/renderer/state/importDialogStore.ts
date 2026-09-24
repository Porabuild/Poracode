import { create } from "zustand";
import type { Project } from "@/shared/contracts";

/**
 * Scope for a project's import button: threads land in that project and the
 * list is narrowed to its folder. WSL projects get the project but no folder
 * filter — discovery is host-only, so a distro path would match nothing.
 */
export function importScopeForProject(project: Project | undefined): {
  projectId?: string;
  cwd?: string;
} {
  if (!project) return {};
  return {
    projectId: project.id,
    ...(project.location.kind === "wsl" ? {} : { cwd: project.location.path }),
  };
}

/**
 * The session-import dialog is opened from several places — a project's
 * "Import session" button, the collapsed rail — and rendered once by the
 * sidebar. This store carries the request (which project, which folder) from
 * whichever button opened it to the single dialog instance.
 */
interface ImportDialogState {
  open: boolean;
  /** Project the imported threads land in; null means "resolve per session". */
  projectId: string | null;
  /** Folder to scope the list to; null lists every session. */
  cwd: string | null;
  openFor: (scope: { projectId?: string; cwd?: string }) => void;
  close: () => void;
}

export const useImportDialogStore = create<ImportDialogState>((set) => ({
  open: false,
  projectId: null,
  cwd: null,
  openFor: (scope) =>
    set({ open: true, projectId: scope.projectId ?? null, cwd: scope.cwd ?? null }),
  close: () => set({ open: false }),
}));
