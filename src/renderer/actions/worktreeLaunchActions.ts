import { msg } from "@lingui/core/macro";
import type { Project } from "@/shared/contracts";
import { worktreeScriptShellId } from "@/shared/worktreeScriptShell";
import { buildWorktreeLocation, normalizeWorktreePathForComparison } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { removeTerminalTab } from "@/renderer/actions/terminalTabActions";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { getProjectActiveWorktreePaths } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  adoptExternalShell,
  normalizeShellScript,
  startShellWithToast,
  writeScriptToShellThenExitOnSuccess,
} from "@/renderer/utils/shellUtils";
import { cancelPendingWorktreeSetup, enqueueWorktreeSetup } from "./worktreeSetupQueue";
import { worktreePlacementPayload } from "./worktreePlacement";

export function createWorktree(
  project: Project,
  input: {
    branch: string;
    startPoint?: string;
    createBranch: boolean;
    transferUncommitted: boolean;
    keepChangesInSource: boolean;
  },
) {
  const copyIgnoredPatterns = project.scripts?.worktreeCopyPatterns;
  return readBridge().gitAddWorktree({
    projectLocation: project.location,
    branch: input.branch,
    ...(input.startPoint ? { startPoint: input.startPoint } : {}),
    createBranch: input.createBranch,
    ...(!remoteOwner(project) ? worktreePlacementPayload(project) : {}),
    ...(copyIgnoredPatterns?.length ? { copyIgnoredPatterns } : {}),
    transferUncommitted: input.transferUncommitted,
    keepChangesInSource: input.keepChangesInSource,
  });
}

export async function primeWorktreeGitState(project: Project, worktreePath: string): Promise<void> {
  const worktreePaths = [
    ...new Set([...getProjectActiveWorktreePaths(project.id), worktreePath]),
  ].sort();
  const watchWorktrees = readBridge()
    .gitWatchWorktrees({ projectId: project.id, worktreePaths })
    .catch(() => undefined);
  if (project.location.kind === "wsl") return;
  await watchWorktrees;
  void readBridge()
    .getGitStatus({ projectLocation: buildWorktreeLocation(project.location, worktreePath) })
    .then((status) => useGitStore.getState().setWorktreeStatus(worktreePath, status))
    .catch(() => undefined);
}

export function runWorktreeSetupScript(
  project: Project,
  worktreePath: string,
  setupScript: string,
  options: { openTerminalPanel?: boolean } = {},
): Promise<void> {
  // Blank / comments-only scripts have nothing to run — skip the terminal
  // entirely rather than leaving an idle "setup" shell behind.
  if (!normalizeShellScript(setupScript)) return Promise.resolve();

  return enqueueWorktreeSetup(worktreeSetupKey(project, worktreePath), () =>
    startWorktreeSetupScript(project, worktreePath, setupScript, options),
  );
}

export function cancelQueuedWorktreeSetup(project: Project, worktreePath: string): void {
  cancelPendingWorktreeSetup(worktreeSetupKey(project, worktreePath));
}

function setupTabTitle(): string {
  return i18n._(msg`setup`);
}

/**
 * Shows the setup shell the host already started for a new worktree.
 * The tab id matches {@link worktreeScriptShellId} so PTY bytes land in this
 * pane, and the shell is marked external so the surface does not spawn a
 * second PTY. A successful script exits the shell, which closes the tab.
 */
export async function showHostWorktreeSetupTerminal(
  project: Project,
  worktreePath: string,
): Promise<void> {
  const setupScript = project.scripts?.setupScript;
  if (!setupScript || !normalizeShellScript(setupScript)) return;
  const shellId = worktreeScriptShellId(
    project.id,
    worktreePath,
    project.location.kind === "windows",
  );
  // Adopting a shell that never started leaves an empty tab the panel is
  // forbidden to spawn. A missing snapshot means start failed.
  const bridge = readBridge();
  let exited = false;
  const unsubscribe = bridge.onSupervisorEvent((event) => {
    if (event.type === "thread-exited" && event.threadId === shellId) exited = true;
  });
  let running = false;
  try {
    const snapshot = await bridge.readTerminalSnapshot({ threadId: shellId });
    running = snapshot?.processState === "running";
  } catch {
    return;
  } finally {
    unsubscribe();
  }
  // An exit may reach the renderer while a previously running snapshot is
  // still in flight. It must not resurrect an already-disposed setup tab.
  if (!running || exited) return;
  adoptExternalShell(shellId);
  const store = useDevTerminalStore.getState();
  const tab = store.ensureTrackedShellTab(shellId, project.id, setupTabTitle(), worktreePath);
  if (useSharedSettings.getState().autoShowTerminalPanel || store.isOpen) {
    store.openWorktreePanel(project.id, worktreePath);
  }
  store.setActiveTab(tab.id);
}

function worktreeSetupKey(project: Project, worktreePath: string): string {
  const comparablePath = normalizeWorktreePathForComparison(
    worktreePath,
    project.location.kind === "windows",
  );
  return `${project.id}:${comparablePath}`;
}

function startWorktreeSetupScript(
  project: Project,
  worktreePath: string,
  setupScript: string,
  options: { openTerminalPanel?: boolean },
): Promise<void> {
  const wtLocation = buildWorktreeLocation(project.location, worktreePath);
  const store = useDevTerminalStore.getState();
  const tab = store.addTab(project.id, setupTabTitle(), worktreePath);
  const openTerminalPanel = options.openTerminalPanel !== false;
  const autoShow = openTerminalPanel && useSharedSettings.getState().autoShowTerminalPanel;
  if (autoShow) store.openWorktreePanel(project.id, worktreePath);
  if (openTerminalPanel) store.setActiveTab(tab.id);

  // Successful setup exits and removes its tab; failures stay open for inspection.
  return new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    const detach = writeScriptToShellThenExitOnSuccess(
      tab.id,
      setupScript,
      wtLocation.kind,
      () => {
        finish();
        removeTerminalTab(tab);
      },
      finish,
      project.remoteServerId,
    );
    // Always start the PTY here. A visible surface used to own the spawn, but a
    // short pane never reaches the resize threshold, so the tab stayed empty
    // and never exited. The eager mark makes that surface attach instead of
    // starting a second process. The command itself waits for the shell prompt.
    // A rejected start disposes the session without an exit event; unblock the
    // queue or every later worktree setup waits forever.
    void startShellWithToast(
      { shellId: tab.id, projectLocation: wtLocation, worktreePath },
      "setup shell",
    ).then((started) => {
      if (started) return;
      detach();
      finish();
    });
    const unsubscribeTabs = useDevTerminalStore.subscribe((state, prev) => {
      if (state.tabs === prev.tabs) return;
      if (state.tabs.some((item) => item.id === tab.id)) return;
      detach();
      unsubscribeTabs();
      finish();
    });
  });
}
