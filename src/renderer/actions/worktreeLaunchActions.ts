import type { Project } from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { closeAllPanels } from "@/renderer/actions/panelActions";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { getProjectActiveWorktreePaths } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
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

function worktreeSetupKey(project: Project, worktreePath: string): string {
  const normalizedPath = worktreePath.replace(/\\/gu, "/").replace(/\/+$/u, "");
  const comparablePath =
    project.location.kind === "windows" ? normalizedPath.toLowerCase() : normalizedPath;
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
  const tab = store.addTab(project.id, "setup", worktreePath);
  const openTerminalPanel = options.openTerminalPanel !== false;
  const autoShow = openTerminalPanel && useSharedSettings.getState().autoShowTerminalPanel;
  const panelAlreadyOpen = store.isOpen;
  if (autoShow) store.openWorktreePanel(project.id, worktreePath);
  if (openTerminalPanel) store.setActiveTab(tab.id);

  // Visible tabs mount an XTerm surface that starts the PTY. Start it eagerly
  // only when no surface will mount, avoiding a second setup process.
  if (!openTerminalPanel || (!autoShow && !panelAlreadyOpen)) {
    startShellWithToast(
      { shellId: tab.id, projectLocation: wtLocation, worktreePath },
      "setup shell",
    );
  }

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
        removeWorktreeSetupTab(tab);
      },
      finish,
      project.remoteServerId,
    );
    const unsubscribeTabs = useDevTerminalStore.subscribe((state, prev) => {
      if (state.tabs === prev.tabs) return;
      if (state.tabs.some((item) => item.id === tab.id)) return;
      detach();
      unsubscribeTabs();
      finish();
    });
  });
}

function removeWorktreeSetupTab(tab: DevTerminalTab): void {
  const store = useDevTerminalStore.getState();
  const showingThisContext =
    store.isOpen &&
    store.activeProjectId === tab.projectId &&
    (store.activeWorktreePath ?? undefined) === tab.worktreePath;
  store.removeTab(tab.id);
  if (!showingThisContext) return;
  const remaining = useDevTerminalStore
    .getState()
    .tabs.filter(
      (item) => item.projectId === tab.projectId && item.worktreePath === tab.worktreePath,
    );
  if (remaining.length > 0) return;
  if (useSharedSettings.getState().terminalPosition !== "bottom") closeAllPanels();
  useDevTerminalStore.getState().closePanel();
}
