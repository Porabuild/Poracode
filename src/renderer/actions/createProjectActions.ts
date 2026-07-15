import { startTransition } from "react";
import type { CloneRepoSource, ProjectLocation } from "@/shared/contracts";
import {
  deriveLocationFromPath,
  parentDirOf,
  runtimeKeyForLocation,
  scratchKindForChoice,
  wslHomeDir,
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
 * Register a freshly materialized project: remember the browsed parent per
 * runtime (so the next create/clone starts there), add it to the store, detect
 * its setup script, and open its draft. Shared by the create and clone flows.
 */
function registerNewProject(location: ProjectLocation, name: string, lastUsedDir: string): void {
  useSharedSettings.getState().setLastUsedProjectDir(runtimeKeyForLocation(location), lastUsedDir);

  startTransition(() => {
    const project = useAppStore.getState().addProject(location, name || undefined);
    autoDetectSetupScript(project);
    useAppStore.getState().openDraft(project.id);
  });
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

  registerNewProject(location, name, lastUsedDir);
}

/**
 * "Use an existing folder": open the system folder picker directly (no modal).
 * Native opens at the last-used native directory or home; WSL opens inside the
 * selected distro. The picked path remains authoritative for the runtime.
 */
export async function addExistingProject(
  choice: RuntimeChoice = { kind: "native" },
): Promise<void> {
  const bridge = readBridge();
  const lastUsedProjectDirs = useSharedSettings.getState().lastUsedProjectDirs;
  let defaultDir =
    choice.kind === "wsl"
      ? (lastUsedProjectDirs[choice.distro] ?? wslHomeDir(choice.distro))
      : lastUsedProjectDirs.native;

  if (!defaultDir) {
    defaultDir = await loadHomeScopeLocation()
      .then(getProjectFsPath)
      .catch(() => undefined);
  }

  const picked = await bridge.pickFolder(defaultDir);
  if (!picked) return;

  await commitCreateProject({
    mode: "existing",
    choice,
    dir: picked,
    name: "",
  });
}

/**
 * A `ProjectLocation` to run the GitHub CLI in for a runtime choice (used when
 * listing accounts/repos, before a project exists). Native resolves to the
 * host's home dir; a WSL choice resolves to that distro's `/home` over the UNC
 * bridge. The cwd only needs to be a valid directory for `gh` — listing isn't
 * tied to any repo.
 */
export function resolveRuntimeContextLocation(choice: RuntimeChoice): Promise<ProjectLocation> {
  if (choice.kind === "wsl") {
    return Promise.resolve(
      deriveLocationFromPath(wslHomeDir(choice.distro), readBridge().platform),
    );
  }
  return loadHomeScopeLocation();
}

export interface CommitCloneProjectParams {
  choice: RuntimeChoice;
  /** Existing parent folder to clone into. */
  parentDir: string;
  /** New folder name for the clone. */
  name: string;
  source: CloneRepoSource;
}

/**
 * Clone a repository into `parentDir/name`, then add it as a project, remember
 * the parent per runtime (so the next clone/create starts there), and open its
 * draft. Errors (auth, network, an existing folder) propagate so the modal can
 * surface them.
 */
export async function commitCloneProject(params: CommitCloneProjectParams): Promise<void> {
  const platform = readBridge().platform;
  const name = params.name.trim();
  const parentLocation = deriveLocationFromPath(params.parentDir, platform);

  const { path } = await readBridge().cloneRepo({
    parentLocation,
    name,
    source: params.source,
  });

  registerNewProject(deriveLocationFromPath(path, platform), name, params.parentDir);
}
