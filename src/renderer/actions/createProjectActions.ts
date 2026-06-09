import { startTransition } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import {
  deriveLocationFromPath,
  parentDirOf,
  runtimeKeyForLocation,
  scratchKindForChoice,
  type RuntimeChoice,
} from "@/shared/createProject";
import { getProjectFsPath } from "@/shared/wsl";
import { readBridge } from "@/renderer/bridge";
import { loadHomeScopeLocation } from "@/renderer/actions/projectActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { autoDetectSetupScript } from "@/renderer/utils/gitHelpers";

/** Whether a project is being created from scratch or opened from an existing folder. */
export type CreateProjectMode = "scratch" | "existing";

export interface CommitCreateProjectParams {
  mode: CreateProjectMode;
  choice: RuntimeChoice;
  /** "scratch" → the parent directory; "existing" → the chosen project folder. */
  dir: string;
  name: string;
}

/**
 * Finalize project creation: for "scratch" create the directory on disk first,
 * then add the project, remember the browsed parent per runtime, and open its
 * draft. Errors (e.g. a folder that already exists) propagate to the caller so
 * the modal can surface them instead of failing silently.
 */
export async function commitCreateProject(params: CommitCreateProjectParams): Promise<void> {
  const platform = readBridge().platform;
  const name = params.name.trim();

  let location: ProjectLocation;
  let lastUsedDir: string;

  if (params.mode === "scratch") {
    const kind = scratchKindForChoice(params.choice, platform);
    const { path } = await readBridge().createProjectDirectory({ parent: params.dir, name, kind });
    location = deriveLocationFromPath(path, platform);
    lastUsedDir = params.dir;
  } else {
    location = deriveLocationFromPath(params.dir, platform);
    lastUsedDir = parentDirOf(params.dir, location.kind);
  }

  useSharedSettings.getState().setLastUsedProjectDir(runtimeKeyForLocation(location), lastUsedDir);

  startTransition(() => {
    const project = useAppStore.getState().addProject(location, name || undefined);
    autoDetectSetupScript(project);
    useAppStore.getState().openDraft(project.id);
  });
}

/**
 * "Use an existing folder": open the native folder picker directly (no modal)
 * and add the chosen directory as a project, just like the original flow. The
 * picked path is authoritative for the runtime — a `\\wsl...` path becomes a
 * WSL project, anything else a native one. The dialog opens at the last-used
 * native directory, falling back to home.
 */
export async function addExistingProject(): Promise<void> {
  let defaultDir = useSharedSettings.getState().lastUsedProjectDirs.native;
  if (!defaultDir) {
    defaultDir = await loadHomeScopeLocation()
      .then(getProjectFsPath)
      .catch(() => undefined);
  }

  const picked = await readBridge().pickFolder(defaultDir);
  if (!picked) return;

  await commitCreateProject({
    mode: "existing",
    choice: { kind: "native" },
    dir: picked,
    name: "",
  });
}
