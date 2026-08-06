import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type {
  McpServer,
  Project,
  ProjectLocation,
  ProjectScripts,
  ProjectSearchSettings,
  ProjectWorktreeLocation,
} from "@/shared/contracts";
import { deriveLocationFromPath } from "@/shared/createProject";
import { friendlyError } from "@/shared/messages";
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
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { discardExperiment } from "./experimentActions";

// The home dir doesn't change at runtime, so cache the single IPC roundtrip
// and reuse it across callers (MainView mount effect + WelcomeOverlay
// "Ask Question" path).
let homeScopeLocationPromise: Promise<ProjectLocation> | null = null;

type RemoteProjectPatch = Extract<RemoteProjectCommand, { kind: "update" }>["patch"];

function dispatchRemoteProjectMutation(
  project: Project,
  patch: RemoteProjectPatch,
  apply: () => void,
): boolean {
  const owner = remoteOwner(project);
  if (!owner) return false;
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

export function renameProject(projectId: string, name: string): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  store.renameProject(projectId, name);
  const owner = remoteOwner(project);
  if (owner) {
    useRemoteServersStore.getState().setProjectNameOverride(owner.desktopId, owner.remoteId, name);
  }
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

export function updateProjectMcpServers(projectId: string, mcpServers: McpServer[]): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const apply = () => useAppStore.getState().updateProjectMcpServers(projectId, mcpServers);
  if (
    dispatchRemoteProjectMutation(
      project,
      { mcpServers: mcpServers.length > 0 ? mcpServers : null },
      apply,
    )
  )
    return;
  apply();
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
  const experimentIds = Object.values(useExperimentStore.getState().experiments)
    .filter((experiment) => experiment.projectId === projectId)
    .map((experiment) => experiment.id);
  for (const experimentId of experimentIds) {
    if (!(await discardExperiment(experimentId))) return;
  }

  const store = useAppStore.getState();
  const projectThreadIds = store.threads.filter((t) => t.projectId === projectId).map((t) => t.id);

  store.deleteProject(projectId);

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
