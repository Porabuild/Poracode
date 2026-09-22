import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type {
  GitHubAccountRef,
  McpServer,
  Project,
  ProjectLocation,
  ProjectScripts,
  ProjectSearchSettings,
  ProjectWorktreeLocation,
} from "@/shared/contracts";
import { deriveLocationFromPath } from "@/shared/createProject";
import { friendlyError, msg as resolveMessage } from "@/shared/messages";
import type { RemoteProjectCommand } from "@/shared/remote";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import {
  isApplyingHostOriginatedManagedRootMutation,
  managedRootOwner,
  sendManagedRootProjectCommand,
} from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { refreshManagedRootCatalogSoon } from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

// The home dir doesn't change at runtime, so cache the single IPC roundtrip
// and reuse it across callers (MainView mount effect + WelcomeOverlay
// "Ask Question" path).
let homeScopeLocationPromise: Promise<ProjectLocation> | null = null;

type RemoteProjectPatch = Extract<RemoteProjectCommand, { kind: "update" }>["patch"];

const remoteGhAccountMutationQueues = new Map<string, Promise<boolean>>();

/**
 * Routes one project content intent to the owner: a projected remote project
 * through the paired client, a root project through the managed loopback
 * client as an explicit host command. A host-forwarded mirror command never
 * echoes (it belongs to the local path).
 */
function dispatchRemoteProjectMutation(
  project: Project,
  patch: RemoteProjectPatch,
  apply: () => void,
): boolean {
  const owner = remoteOwner(project);
  if (owner) {
    void useRemoteServersStore
      .getState()
      .runProjectCommand(owner.desktopId, {
        kind: "update",
        projectId: owner.remoteId,
        patch,
      })
      .then(apply)
      .catch((error) => toast.danger(friendlyError(error)));
    return true;
  }
  const rootOwner = managedRootOwner(project);
  if (!rootOwner || isApplyingHostOriginatedManagedRootMutation()) return false;
  void sendManagedRootProjectCommand({
    kind: "update",
    projectId: rootOwner.threadId,
    patch,
  })
    .then(() => {
      apply();
      refreshManagedRootCatalogSoon();
    })
    .catch((error) => toast.danger(friendlyError(error)));
  return true;
}

export function renameProject(projectId: string, name: string): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const rootOwner = managedRootOwner(project);
  if (rootOwner && !isApplyingHostOriginatedManagedRootMutation()) {
    void sendManagedRootProjectCommand({
      kind: "update",
      projectId: rootOwner.threadId,
      patch: { name },
    })
      .then(() => {
        useAppStore.getState().renameProject(projectId, name);
        refreshManagedRootCatalogSoon();
      })
      .catch((error) => toast.danger(friendlyError(error)));
    return;
  }
  store.renameProject(projectId, name);
  const owner = remoteOwner(project);
  if (owner) {
    useRemoteServersStore.getState().setProjectNameOverride(owner.desktopId, owner.remoteId, name);
  }
}

export function updateProjectIcon(projectId: string, icon: string | undefined): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const apply = () => useAppStore.getState().updateProjectIcon(projectId, icon);
  if (dispatchRemoteProjectMutation(project, { icon: icon ?? null }, apply)) return;
  apply();
}

export function updateProjectScripts(projectId: string, scripts: ProjectScripts): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const apply = () => useAppStore.getState().updateProjectScripts(projectId, scripts);
  if (dispatchRemoteProjectMutation(project, { scripts }, apply)) return;
  apply();
}

export function updateProjectSearchSettings(
  projectId: string,
  searchSettings: ProjectSearchSettings | undefined,
): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const apply = () => useAppStore.getState().updateProjectSearchSettings(projectId, searchSettings);
  if (dispatchRemoteProjectMutation(project, { searchSettings: searchSettings ?? null }, apply))
    return;
  apply();
}

export function updateProjectWorktreeLocation(
  projectId: string,
  worktreeLocation: ProjectWorktreeLocation | undefined,
): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const apply = () =>
    useAppStore.getState().updateProjectWorktreeLocation(projectId, worktreeLocation);
  if (dispatchRemoteProjectMutation(project, { worktreeLocation: worktreeLocation ?? null }, apply))
    return;
  apply();
}

/**
 * Persist one project's MCP server list, resolving only after its owner has
 * confirmed the save: a remote-project save awaits the host command (the local
 * row is patched only on acceptance), a root-project save awaits the managed
 * loopback command, a local project applies immediately. Rejects with the
 * transport's error, so a caller that sequences another write after this one —
 * moving a server between destinations must not delete the source copy until
 * the destination save is confirmed — can refuse to continue when the save did
 * not land. Owner resolution and the host-originated fence are read
 * synchronously before the first await, exactly like
 * `dispatchRemoteProjectMutation`.
 */
export async function saveProjectMcpServers(
  projectId: string,
  mcpServers: McpServer[],
): Promise<void> {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error(resolveMessage("remote.project.notFound"));
  const apply = () => useAppStore.getState().updateProjectMcpServers(projectId, mcpServers);
  const patch: RemoteProjectPatch = { mcpServers: mcpServers.length > 0 ? mcpServers : null };
  const owner = remoteOwner(project);
  if (owner) {
    await useRemoteServersStore.getState().runProjectCommand(owner.desktopId, {
      kind: "update",
      projectId: owner.remoteId,
      patch,
    });
    apply();
    return;
  }
  const rootOwner = managedRootOwner(project);
  if (!rootOwner || isApplyingHostOriginatedManagedRootMutation()) {
    apply();
    return;
  }
  await sendManagedRootProjectCommand({ kind: "update", projectId: rootOwner.threadId, patch });
  apply();
  refreshManagedRootCatalogSoon();
}

export function updateProjectMcpServers(projectId: string, mcpServers: McpServer[]): void {
  void saveProjectMcpServers(projectId, mcpServers).catch((error) =>
    toast.danger(friendlyError(error)),
  );
}

export function updateProjectGhAccount(
  projectId: string,
  ghAccount: GitHubAccountRef | undefined,
): Promise<boolean> {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return Promise.resolve(false);
  const apply = () => useAppStore.getState().updateProjectGhAccount(projectId, ghAccount);
  const owner = remoteOwner(project);
  if (!owner) {
    apply();
    return Promise.resolve(true);
  }

  const key = `${owner.desktopId}\0${owner.remoteId}`;
  const execute = async (): Promise<boolean> => {
    try {
      await useRemoteServersStore.getState().runProjectCommand(owner.desktopId, {
        kind: "update",
        projectId: owner.remoteId,
        patch: { ghAccount: ghAccount ?? null },
      });
      apply();
      return true;
    } catch (error) {
      toast.danger(friendlyError(error));
      return false;
    }
  };
  const previous = remoteGhAccountMutationQueues.get(key);
  const current = previous ? previous.catch(() => false).then(execute) : execute();
  remoteGhAccountMutationQueues.set(key, current);
  void current.then(() => {
    if (remoteGhAccountMutationQueues.get(key) === current) {
      remoteGhAccountMutationQueues.delete(key);
    }
  });
  return current;
}

export function loadHomeScopeLocation(): Promise<ProjectLocation> {
  if (!homeScopeLocationPromise) {
    homeScopeLocationPromise = readBridge()
      .getHomeScopeLocation()
      .catch((err) => {
        homeScopeLocationPromise = null;
        throw err;
      });
  }
  return homeScopeLocationPromise;
}

export async function ensureHomeScopeProject(): Promise<Project> {
  const location = await loadHomeScopeLocation();
  return useAppStore.getState().ensureHomeProject(location);
}

export function setProjectDisabled(projectId: string, disabled: boolean): void {
  const store = useAppStore.getState();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) return;
  if ((project.disabled ?? false) === disabled) return;

  const apply = () => {
    store.setProjectDisabled(projectId, disabled);

    if (disabled) {
      const wslDistro = project.location.kind === "wsl" ? project.location.distro : undefined;
      const releaseWslDistro =
        wslDistro &&
        !useAppStore
          .getState()
          .projects.some(
            (candidate) =>
              !candidate.disabled &&
              candidate.location.kind === "wsl" &&
              candidate.location.distro === wslDistro,
          )
          ? wslDistro
          : undefined;
      if (!project.remoteServerId) {
        void readBridge()
          .gitUnwatchProject({
            projectId,
            ...(releaseWslDistro ? { releaseWslDistro } : {}),
          })
          .catch(() => undefined);
      }

      useGitStore.getState().clearStatus(projectId);

      const termStore = useDevTerminalStore.getState();
      if (termStore.isOpen && termStore.activeProjectId === projectId) {
        termStore.closePanel();
      }

      const panelStore = usePanelStore.getState();
      if (panelStore.gitReviewContext?.projectId === projectId) {
        panelStore.setGitOverlayOpen(false);
        panelStore.setGitReviewContext(null);
      }
      if (panelStore.filesPanelContext?.projectId === projectId) {
        panelStore.setFilesPanelContext(null);
        useFileEditorStore.getState().clearSession();
      }
    }
  };

  if (dispatchRemoteProjectMutation(project, { disabled }, apply)) return;
  apply();
}

/**
 * Re-point a project at a new on-disk folder after the user moved it. The repo
 * itself isn't copied — git worktrees are repaired and watchers/caches rebuilt
 * supervisor-side, then the project's stored location is updated. Blocks while
 * the project has running threads, whose captured working directory can't be
 * updated live. Native (non-WSL) projects only.
 */
export async function relocateProject(projectId: string): Promise<void> {
  const store = useAppStore.getState();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) return;

  const hasRunningThread = store.threads.some(
    (thread) => thread.projectId === projectId && thread.status === "working",
  );
  if (hasRunningThread) {
    toast.danger(i18n._(msg`Stop the project's running threads before changing its folder.`));
    return;
  }

  // WSL folders are browsed via their `\\wsl.localhost` UNC path (the native
  // dialog can open them); deriveLocationFromPath turns the pick back into the
  // right location kind — WSL when a UNC path is chosen, native otherwise.
  const location = project.location;
  const currentPath = location.kind === "wsl" ? location.uncPath : location.path;
  const picked = await readBridge().pickFolder(currentPath || undefined);
  if (!picked || picked === currentPath) return;

  const newLocation = deriveLocationFromPath(picked, readBridge().platform);

  try {
    await readBridge().relocateProject({ projectId, newLocation });
  } catch (error) {
    toast.danger(friendlyError(error));
    return;
  }

  store.updateProjectLocation(projectId, newLocation);
  void readBridge()
    .gitWatchProject({ projectId, projectLocation: newLocation })
    .catch(() => undefined);
  void refreshGitProject({ id: projectId, location: newLocation }, "manual", "full");
  toast.success(i18n._(msg`Project folder updated. Reopen any terminals in this project.`));
}

export async function relocateRemoteProject(projectId: string, path: string): Promise<void> {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  const owner = remoteOwner(project);
  if (!owner) return;
  try {
    await useRemoteServersStore.getState().runProjectCommand(owner.desktopId, {
      kind: "relocate",
      projectId: owner.remoteId,
      path,
    });
  } catch (error) {
    toast.danger(friendlyError(error));
  }
}

export function deleteProject(projectId: string): void {
  void deleteProjectAsync(projectId);
}

async function deleteProjectAsync(projectId: string): Promise<void> {
  const remoteProject = useAppStore.getState().projects.find((project) => project.id === projectId);
  const owner = remoteOwner(remoteProject);
  if (owner) {
    await useRemoteServersStore
      .getState()
      .runProjectCommand(owner.desktopId, {
        kind: "remove",
        projectId: owner.remoteId,
      })
      .catch((error) => toast.danger(friendlyError(error)));
    return;
  }
  const rootOwner = managedRootOwner(remoteProject ?? { id: projectId });
  if (rootOwner && !isApplyingHostOriginatedManagedRootMutation()) {
    // The host cascades its threads and broadcasts membership; the catalog
    // deletion gate removes the rows. Local renderer surfaces close after the
    // host confirmed the delete.
    const cleanup = () => {
      const store = useAppStore.getState();
      for (const threadId of store.threads
        .filter((thread) => thread.projectId === projectId)
        .map((thread) => thread.id)) {
        void readBridge()
          .closeThread({ threadId })
          .catch(() => undefined);
      }
      const termStore = useDevTerminalStore.getState();
      for (const tabId of termStore.removeTabsForProject(projectId)) {
        void readBridge()
          .closeThread({ threadId: tabId })
          .catch(() => undefined);
      }
      if (termStore.isOpen && termStore.activeProjectId === projectId) {
        termStore.closePanel();
      }
      useGitStore.getState().clearStatus(projectId);
      refreshManagedRootCatalogSoon();
    };
    try {
      await sendManagedRootProjectCommand({ kind: "remove", projectId: rootOwner.threadId });
      cleanup();
    } catch (error) {
      toast.danger(friendlyError(error));
    }
    return;
  }
  const store = useAppStore.getState();
  const projectThreadIds = store.threads.filter((t) => t.projectId === projectId).map((t) => t.id);

  store.deleteProject(projectId);
  // Local project removal (no experiment authority on this runtime): reconcile
  // the in-memory projection only. The host-owned path above already cascades
  // experiment records host-side.
  useExperimentStore.getState().removeProjectExperiments(projectId);

  for (const threadId of projectThreadIds) {
    void readBridge()
      .closeThread({ threadId })
      .catch(() => undefined);
  }

  const termStore = useDevTerminalStore.getState();
  const removedTabIds = termStore.removeTabsForProject(projectId);
  for (const tabId of removedTabIds) {
    void readBridge()
      .closeThread({ threadId: tabId })
      .catch(() => undefined);
  }

  if (termStore.isOpen && termStore.activeProjectId === projectId) {
    termStore.closePanel();
  }

  useGitStore.getState().clearStatus(projectId);

  const panelStore = usePanelStore.getState();
  if (panelStore.gitReviewContext?.projectId === projectId) {
    panelStore.setGitOverlayOpen(false);
    panelStore.setGitReviewContext(null);
  }
  if (panelStore.filesPanelContext?.projectId === projectId) {
    panelStore.setFilesPanelContext(null);
    useFileEditorStore.getState().clearSession();
  }
}
