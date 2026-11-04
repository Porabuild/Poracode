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
import { areToolOverridesEqual, nonEmptyPluginOverrides } from "@/shared/contracts";
import { friendlyError, msg as resolveMessage } from "@/shared/messages";
import type { RemoteProjectCommand } from "@/shared/remote";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { runRendererAction } from "@/renderer/state/rendererActionStore";
import { presentProjectRemoval } from "@/renderer/state/projectRemovalPresentation";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { entityHost, intentHost } from "@/renderer/state/entityHost";
import { isRemoteProjectUnreachable } from "@/renderer/state/remoteServers/reachability";
import {
  catalogEditPatch,
  applyCatalogPatchFields,
  dispatchOptimisticCatalogEdit,
} from "@/renderer/state/pendingCatalogEdits";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

// The home dir doesn't change at runtime, so cache the single IPC roundtrip
// and reuse it across callers (MainView mount effect + WelcomeOverlay
// "Ask Question" path).
let homeScopeLocationPromise: Promise<ProjectLocation> | null = null;

type RemoteProjectPatch = Extract<RemoteProjectCommand, { kind: "update" }>["patch"];

const ghAccountMutationQueues = new Map<string, Promise<boolean>>();

/**
 * Routes one project content intent to the host that owns the project, as an
 * explicit host command. A host-forwarded mirror command never echoes (it
 * belongs to the local path).
 */
function dispatchHostProjectMutation(
  project: Project,
  patch: RemoteProjectPatch,
  apply: () => void,
  onConfirmed?: () => void,
): boolean {
  const host = intentHost(project);
  if (!host) return false;
  const previousView = useAppStore.getState().view;
  apply();
  const paintedView = useAppStore.getState().view;
  const painted = useAppStore.getState().projects.find((row) => row.id === project.id) ?? project;
  const localPatch = catalogEditPatch(project, painted);
  void dispatchOptimisticCatalogEdit({
    kind: "project",
    row: project,
    patch: localPatch,
    ...(Object.keys(patch).length === 1 && "scripts" in patch ? { coalesceKey: "scripts" } : {}),
    apply: () => {},
    write: () => host.runProjectCommand({ kind: "update", projectId: host.hostId, patch }),
    restore: (base) =>
      useAppStore.setState((state) => ({
        ...(state.view === paintedView ? { view: previousView } : {}),
        projects: state.projects.map((row) =>
          row.id === project.id ? applyCatalogPatchFields(row, base, localPatch) : row,
        ),
      })),
  })
    .then(() => onConfirmed?.())
    .catch((error) => toast.danger(friendlyError(error)));
  return true;
}

export function renameProject(projectId: string, name: string): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const apply = () => useAppStore.getState().renameProject(projectId, name);
  // The host owns the name, so every client sees the rename. A display alias
  // an older client kept for this project would hide it; drop that alias.
  const host = intentHost(project);
  const clearAlias = () => {
    if (host?.connectionKey)
      useRemoteServersStore.getState().clearProjectNameOverride(host.connectionKey, host.hostId);
  };
  if (dispatchHostProjectMutation(project, { name }, apply, clearAlias)) return;
  apply();
}

export function updateProjectIcon(projectId: string, icon: string | undefined): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const apply = () => useAppStore.getState().updateProjectIcon(projectId, icon);
  if (dispatchHostProjectMutation(project, { icon: icon ?? null }, apply)) return;
  apply();
}

export function updateProjectScripts(projectId: string, scripts: ProjectScripts): void {
  const store = useAppStore.getState();
  const project = store.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const apply = () => useAppStore.getState().updateProjectScripts(projectId, scripts);
  if (dispatchHostProjectMutation(project, { scripts }, apply)) return;
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
  if (dispatchHostProjectMutation(project, { searchSettings: searchSettings ?? null }, apply))
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
  if (dispatchHostProjectMutation(project, { worktreeLocation: worktreeLocation ?? null }, apply))
    return;
  apply();
}

/** Pin or unpin a branch at the top of the project's branch pickers. */
export function toggleProjectPinnedBranch(projectId: string, branch: string): void {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const current = project.pinnedBranches ?? [];
  const pinnedBranches = current.includes(branch)
    ? current.filter((name) => name !== branch)
    : [...current, branch];
  const apply = () => useAppStore.getState().updateProjectPinnedBranches(projectId, pinnedBranches);
  if (
    dispatchHostProjectMutation(
      project,
      { pinnedBranches: pinnedBranches.length > 0 ? pinnedBranches : null },
      apply,
    )
  )
    return;
  apply();
}

/**
 * Turn one Agent Plugin on or off for a project, or with `null` let it follow
 * the global plugin state again. Threads pick the change up on their next launch.
 */
export function setProjectPluginOverride(
  projectId: string,
  pluginName: string,
  enabled: boolean | null,
): void {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const { [pluginName]: _, ...rest } = project.pluginOverrides ?? {};
  const pluginOverrides = enabled === null ? rest : { ...rest, [pluginName]: enabled };
  if (areToolOverridesEqual(pluginOverrides, project.pluginOverrides ?? {})) return;
  const apply = () =>
    useAppStore.getState().updateProjectPluginOverrides(projectId, pluginOverrides);
  if (
    dispatchHostProjectMutation(
      project,
      { pluginOverrides: nonEmptyPluginOverrides(pluginOverrides) ?? null },
      apply,
    )
  )
    return;
  apply();
}

/** Set (or, with `undefined`, clear) the base ref new worktrees fork from. */
export function updateProjectWorktreeBaseBranch(
  projectId: string,
  baseBranch: string | undefined,
): void {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  const apply = () => useAppStore.getState().updateProjectWorktreeBaseBranch(projectId, baseBranch);
  if (dispatchHostProjectMutation(project, { worktreeBaseBranch: baseBranch ?? null }, apply))
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
 * `dispatchHostProjectMutation`.
 */
export async function saveProjectMcpServers(
  projectId: string,
  mcpServers: McpServer[],
): Promise<void> {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error(resolveMessage("remote.project.notFound"));
  const apply = () => useAppStore.getState().updateProjectMcpServers(projectId, mcpServers);
  const patch: RemoteProjectPatch = { mcpServers: mcpServers.length > 0 ? mcpServers : null };
  const host = intentHost(project);
  if (host) await host.runProjectCommand({ kind: "update", projectId: host.hostId, patch });
  apply();
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
  const host = intentHost(project);
  if (!host) {
    apply();
    return Promise.resolve(true);
  }

  // Serialized per project, so a later choice never lands before an earlier one.
  const key = projectId;
  const execute = async (): Promise<boolean> => {
    try {
      await host.runProjectCommand({
        kind: "update",
        projectId: host.hostId,
        patch: { ghAccount: ghAccount ?? null },
      });
      apply();
      return true;
    } catch (error) {
      toast.danger(friendlyError(error));
      return false;
    }
  };
  const previous = ghAccountMutationQueues.get(key);
  const current = previous ? previous.catch(() => false).then(execute) : execute();
  ghAccountMutationQueues.set(key, current);
  void current.then(() => {
    if (ghAccountMutationQueues.get(key) === current) {
      ghAccountMutationQueues.delete(key);
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

  const apply = () => useAppStore.getState().setProjectDisabled(projectId, disabled);
  const cleanup = () => {
    // A later toggle may already have re-enabled this project while awaiting ACK.
    if (useAppStore.getState().projects.find((row) => row.id === projectId)?.disabled !== disabled)
      return;
    if (disabled) {
      // A distro belongs to the host the project lives on, so only that host's
      // other projects keep it in use.
      const wslDistro = project.location.kind === "wsl" ? project.location.distro : undefined;
      const releaseWslDistro =
        wslDistro &&
        !useAppStore
          .getState()
          .projects.some(
            (candidate) =>
              !candidate.disabled &&
              candidate.remoteServerId === project.remoteServerId &&
              candidate.location.kind === "wsl" &&
              candidate.location.distro === wslDistro,
          )
          ? wslDistro
          : undefined;
      // The owning host drops its watch; an unreachable host cannot be asked and
      // replaces the watch when it returns.
      if (!isRemoteProjectUnreachable(project)) {
        void readBridge()
          .gitUnwatchProject({
            projectId,
            ...(releaseWslDistro ? { releaseWslDistro } : {}),
          })
          .catch(() => undefined);
      }

      useGitStore.getState().clearStatus(projectId);

      const termStore = useDevTerminalStore.getState();
      if (termStore.source === "project" && termStore.activeProjectId === projectId) {
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

  if (dispatchHostProjectMutation(project, { disabled }, apply, cleanup)) return;
  apply();
  cleanup();
}

/**
 * Re-point a project at a new folder after the user moved it, on whichever
 * host owns the project. The repo itself isn't copied: the host repairs its
 * git worktrees, rebuilds watchers and caches, then stores the new location.
 * It refuses while the project has running threads, whose captured working
 * directory can't be updated live.
 */
/**
 * Whether a project's folder cannot change right now because one of its
 * threads is running; says so. Checked before a folder is offered for choosing
 * and again before the change is sent.
 */
export function isFolderChangeBlockedByRunningThread(projectId: string): boolean {
  const running = useAppStore
    .getState()
    .threads.some((thread) => thread.projectId === projectId && thread.status === "working");
  if (running)
    toast.danger(i18n._(msg`Stop the project's running threads before changing its folder.`));
  return running;
}

export async function relocateProject(projectId: string, path: string): Promise<void> {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  const host = entityHost(project);
  if (!project || !host || isFolderChangeBlockedByRunningThread(projectId)) return;
  try {
    await host.runProjectCommand({ kind: "relocate", projectId: host.hostId, path });
  } catch (error) {
    toast.danger(friendlyError(error));
    return;
  }
  toast.success(i18n._(msg`Project folder updated. Reopen any terminals in this project.`));
}

/** Choose a project's new folder with this machine's folder dialog. */
export async function pickProjectFolder(project: Project): Promise<string | null> {
  // WSL folders are browsed via their `\\wsl.localhost` UNC path (the native
  // dialog can open them); the host derives the location kind from the pick.
  const location = project.location;
  const currentPath = location.kind === "wsl" ? location.uncPath : location.path;
  const picked = await readBridge().pickFolder(currentPath || undefined);
  return picked && picked !== currentPath ? picked : null;
}

export function deleteProject(projectId: string): void {
  void runRendererAction(`project:remove:${projectId}`, () => deleteProjectAsync(projectId));
}

async function deleteProjectAsync(projectId: string): Promise<void> {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  const host = intentHost(project);
  if (project && host) {
    // The host cascades its threads and broadcasts membership; its catalog
    // removes the rows. This client's own surfaces close once the host
    // confirmed the removal.
    const threadIds = projectThreadIds(projectId);
    try {
      await presentProjectRemoval(project, async () => {
        await host.runProjectCommand({ kind: "remove", projectId: host.hostId });
        closeProjectSurfaces(projectId, threadIds);
      });
    } catch (error) {
      toast.danger(friendlyError(error));
    }
    return;
  }
  // A removal the host already applied, mirrored into this client.
  const threadIds = projectThreadIds(projectId);
  useAppStore.getState().deleteProject(projectId);
  useExperimentStore.getState().removeProjectExperiments(projectId);
  closeProjectSurfaces(projectId, threadIds);
}

function projectThreadIds(projectId: string): string[] {
  return useAppStore
    .getState()
    .threads.filter((thread) => thread.projectId === projectId)
    .map((thread) => thread.id);
}

/** Closes this client's sessions, panels and caches for a removed project. */
function closeProjectSurfaces(projectId: string, threadIds: readonly string[]): void {
  for (const threadId of threadIds) {
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
  if (termStore.source === "project" && termStore.activeProjectId === projectId) {
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
