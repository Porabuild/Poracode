import { startTransition } from "react";
import { toast } from "@heroui/react";
import type { CloneRepoSource, Project, ProjectLocation } from "@/shared/contracts";
import { friendlyError, msg } from "@/shared/messages";
import type { RemoteProjectCommandResponse } from "@/shared/remote";
import {
  deriveLocationFromPath,
  parentDirOf,
  runtimeKeyForLocation,
  scratchKindForChoice,
  wslHomeDir,
  type RuntimeChoice,
} from "@/shared/createProject";
import { getProjectFsPath } from "@/shared/wsl";
import { captureProductEvent } from "@/renderer/analytics/productAnalytics";
import { readBridge } from "@/renderer/bridge";
import { loadHomeScopeLocation } from "@/renderer/actions/projectActions";
import { useAppStore } from "@/renderer/state/appStore";
import {
  isApplyingHostOriginatedManagedRootMutation,
  isManagedRootDesktopRuntime,
  sendManagedRootProjectCommand,
} from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { applyRootCatalogProjectRows } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import { refreshManagedRootCatalogSoon } from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import { remoteProjectId } from "@/renderer/state/remoteProjection";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { getActiveWorkspaceId } from "@/renderer/state/workspaceStore";
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
async function registerNewProject(
  location: ProjectLocation,
  name: string,
  lastUsedDir: string,
  source: "clone" | "existing" | "scratch",
): Promise<void> {
  useSharedSettings.getState().setLastUsedProjectDir(runtimeKeyForLocation(location), lastUsedDir);

  if (isManagedRootDesktopRuntime() && !isApplyingHostOriginatedManagedRootMutation()) {
    // B4: the host owns project rows. The directory already exists (created or
    // cloned by the caller); this is the explicit registration intent, and the
    // returned authoritative row is installed locally before its draft opens.
    await sendManagedRootProjectCommand({
      kind: "add-existing",
      path: getProjectFsPath(location),
      ...(name ? { name } : {}),
      ...(getActiveWorkspaceId() ? { workspaceId: getActiveWorkspaceId()! } : {}),
    }).then((response) => {
      refreshManagedRootCatalogSoon();
      const project = response.project as Project | undefined;
      // Older hosts omit the row; their refreshed catalog still lists the project.
      if (!project) return;
      startTransition(() => {
        applyRootCatalogProjectRows([project]);
        if (response.created !== false) {
          captureProductEvent("project.added", {
            location_kind: location.kind,
            source,
          });
          autoDetectSetupScript(project);
        } else {
          toast.info(msg("project.locationConflict"));
        }
        useAppStore.getState().openDraft(project.id);
      });
    });
    return;
  }

  startTransition(() => {
    // New projects join the workspace the user is currently looking at,
    // otherwise they'd land unfiled and show up in every workspace.
    const store = useAppStore.getState();
    const { project, created } = store.addProjectWithResult(
      location,
      name || undefined,
      getActiveWorkspaceId() ?? undefined,
    );
    if (created) {
      captureProductEvent("project.added", {
        location_kind: location.kind,
        source,
      });
      autoDetectSetupScript(project);
    } else {
      toast.info(msg("project.locationConflict"));
    }
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

  await registerNewProject(location, name, lastUsedDir, params.mode);
}

/**
 * "Add folder": open the system folder picker directly (no modal).
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
  }).catch((error: unknown) => toast.danger(friendlyError(error)));
}

/** How long a just-registered remote project may take to reach this device's catalog. */
const MIRROR_WAIT_MS = 5_000;

/** Open a mirrored project's draft now, or once the catalog refresh mirrors its row. */
function openDraftWhenMirrored(projectId: string): void {
  const mirrored = () => useAppStore.getState().projects.some((row) => row.id === projectId);
  const open = () => startTransition(() => useAppStore.getState().openDraft(projectId));
  if (mirrored()) {
    open();
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = useAppStore.subscribe(() => {
    if (!mirrored()) return;
    unsubscribe();
    clearTimeout(timer);
    open();
  });
  timer = setTimeout(unsubscribe, MIRROR_WAIT_MS);
}

/**
 * Open the draft of a project a paired machine just registered, like a local
 * add. The host reconciles registration by location, so a folder that is
 * already a project there reopens that project.
 */
function openRegisteredRemoteProject(
  connectionKey: string,
  { project, created }: RemoteProjectCommandResponse,
): void {
  if (!project) return;
  // Adding the folder again is an explicit choice to see it on this device.
  useRemoteServersStore.getState().setRemoteProjectSynced(connectionKey, project.id, true);
  if (created === false) toast.info(msg("project.locationConflict"));
  openDraftWhenMirrored(remoteProjectId(connectionKey, project.id));
}

/**
 * "Add folder" on a paired machine: register the folder picked in
 * that machine's folder browser, then open its draft.
 */
export async function addRemoteExistingProject(connectionKey: string, path: string): Promise<void> {
  try {
    const response = await useRemoteServersStore
      .getState()
      .runProjectCommand(connectionKey, { kind: "add-existing", path });
    openRegisteredRemoteProject(connectionKey, response);
  } catch (error) {
    toast.danger(friendlyError(error));
  }
}

/**
 * A path on a paired machine as a location that machine owns. The machine's
 * reported platform decides the kind; records paired before platforms were
 * reported fall back to the path's shape (a drive letter or UNC prefix).
 * Routed procedures address the machine through `remoteServerId`.
 */
export function machinePathLocation(
  connectionKey: string,
  path: string,
  platform: NodeJS.Platform | undefined,
): ProjectLocation {
  const resolved = platform ?? (/^[A-Za-z]:[\\/]|^\\\\/.test(path) ? "win32" : "linux");
  return { ...deriveLocationFromPath(path, resolved), remoteServerId: connectionKey };
}

/**
 * A paired machine's home folder: where the create and clone dialogs start
 * browsing, and the cwd the clone dialog's GitHub CLI listing runs in.
 */
export async function resolveMachineHomeLocation(connectionKey: string): Promise<ProjectLocation> {
  const { homePath } = await useRemoteServersStore
    .getState()
    .browseHostDirectory(connectionKey, "");
  const platform = useRemoteServersStore
    .getState()
    .servers.find((server) => remoteConnectionKey(server) === connectionKey)?.platform;
  return machinePathLocation(connectionKey, homePath, platform);
}

export interface CommitRemoteCreateProjectParams {
  /** The paired machine that creates and owns the project. */
  connectionKey: string;
  /** Existing parent folder on that machine. */
  parentDir: string;
  name: string;
}

/**
 * "New project" on a paired machine: the machine creates `parentDir/name`
 * and registers the project in one command, then its draft opens here. Errors
 * (e.g. a folder that already exists) propagate so the modal can surface them.
 */
export async function commitRemoteCreateProject(
  params: CommitRemoteCreateProjectParams,
): Promise<void> {
  const response = await useRemoteServersStore.getState().runProjectCommand(params.connectionKey, {
    kind: "create",
    parentPath: params.parentDir,
    name: params.name.trim(),
  });
  openRegisteredRemoteProject(params.connectionKey, response);
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

  await registerNewProject(deriveLocationFromPath(path, platform), name, params.parentDir, "clone");
}

export interface CommitRemoteCloneProjectParams {
  /** The paired machine that clones and owns the project. */
  connectionKey: string;
  /** Existing parent folder on that machine. */
  parentDir: string;
  /** New folder name for the clone. */
  name: string;
  source: CloneRepoSource;
}

/**
 * Clone a repository on a paired machine: the machine clones into
 * `parentDir/name` and registers the project in one command, then its draft
 * opens here. Errors propagate so the modal can surface them.
 */
export async function commitRemoteCloneProject(
  params: CommitRemoteCloneProjectParams,
): Promise<void> {
  const response = await useRemoteServersStore.getState().runProjectCommand(params.connectionKey, {
    kind: "clone",
    parentPath: params.parentDir,
    name: params.name.trim(),
    source: params.source,
  });
  openRegisteredRemoteProject(params.connectionKey, response);
}
