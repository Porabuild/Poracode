import { buildWorktreeLocation } from "@/shared/worktree";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  useSharedSettings,
  whenSharedSettingsHydrated,
} from "@/renderer/state/sharedSettingsStore";
import { useThreadOutputStore } from "@/renderer/state/threadOutputStore";
import { isCompactLayoutViewport } from "@/renderer/adaptiveLayout";
import {
  closeThreads,
  startShellWithToast,
  writeScriptToShellThenExitOnSuccess,
} from "@/renderer/utils/shellUtils";
import { closeAllPanels } from "./panelActions";

const actionRunTokens = new Map<string, symbol>();

function applyTerminalPanel(
  projectId: string,
  worktreePath: string | undefined,
  options: { toggleCloseIfActive: boolean },
): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;

  const store = useDevTerminalStore.getState();
  const panelStore = usePanelStore.getState();
  const compactLayout = isCompactLayoutViewport();
  const isBottom = useSharedSettings.getState().terminalPosition === "bottom";

  if (options.toggleCloseIfActive) {
    const rightPanelTab = panelStore.rightPanelTab;
    const isSameTerminal =
      store.isOpen &&
      store.activeProjectId === projectId &&
      (store.activeWorktreePath ?? undefined) === worktreePath;
    const terminalIsVisible = compactLayout
      ? panelStore.mobileUtilityPage === "terminal"
      : isBottom || rightPanelTab === "terminal";
    if (isSameTerminal && terminalIsVisible) {
      if (compactLayout) panelStore.closeMobileUtilityPage();
      else if (!isBottom) closeAllPanels();
      store.closePanel();
      return;
    }
  }

  if (worktreePath) {
    store.openWorktreePanel(projectId, worktreePath);
  } else {
    store.openPanel(projectId);
  }
  if (compactLayout) panelStore.openMobileUtilityPage("terminal");
  else if (!isBottom) panelStore.setRightPanelTab("terminal");

  const existingTab = store.tabs.find(
    (t) => t.projectId === projectId && (t.worktreePath ?? undefined) === worktreePath,
  );
  if (existingTab) {
    store.setActiveTab(existingTab.id);
    return;
  }

  const label = worktreePath ? (worktreePath.split(/[/\\]/).pop() ?? project.name) : project.name;
  const tab = store.addTab(projectId, label, worktreePath);
  store.setActiveTab(tab.id);
}

export function openTerminal(projectId: string): void {
  applyTerminalPanel(projectId, undefined, { toggleCloseIfActive: true });
}

export function openWorktreeTerminal(projectId: string, worktreePath: string): void {
  applyTerminalPanel(projectId, worktreePath, { toggleCloseIfActive: true });
}

export function showTerminalPanel(projectId: string, worktreePath?: string): void {
  applyTerminalPanel(projectId, worktreePath, { toggleCloseIfActive: false });
}

export function runProjectAction(projectId: string, actionId: string, worktreePath?: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const action = project.scripts?.actions?.find((a) => a.id === actionId);
  if (!action) return;

  const location = worktreePath
    ? buildWorktreeLocation(project.location, worktreePath)
    : project.location;

  const store = useDevTerminalStore.getState();
  const tabLabel = action.name;
  const tab =
    store.tabs.find(
      (candidate) =>
        candidate.projectId === projectId &&
        (candidate.worktreePath ?? undefined) === worktreePath &&
        candidate.runActionId === actionId,
    ) ?? store.addTab(projectId, tabLabel, worktreePath, actionId);
  store.setActiveTab(tab.id);
  store.markShellRunning(tab.id);
  useThreadOutputStore.getState().clearOutput(tab.id);
  const runToken = Symbol(tab.id);
  actionRunTokens.set(tab.id, runToken);

  // Decide panel visibility only once the authoritative settings are loaded —
  // right after launch the store still holds defaults (autoShowTerminalPanel:
  // true), which would open the panel for users who keep it hidden.
  void whenSharedSettingsHydrated().then(() => {
    if (!useSharedSettings.getState().autoShowTerminalPanel) return;
    if (worktreePath) {
      store.openWorktreePanel(projectId, worktreePath);
    } else {
      store.openPanel(projectId);
    }
    if (isCompactLayoutViewport()) {
      usePanelStore.getState().openMobileUtilityPage("terminal");
    }
  });

  void startShellWithToast(
    {
      shellId: tab.id,
      projectLocation: location,
      ...(worktreePath ? { worktreePath } : {}),
    },
    tabLabel,
  ).then((started) => {
    if (actionRunTokens.get(tab.id) !== runToken || started) return;
    actionRunTokens.delete(tab.id);
    useDevTerminalStore.getState().markShellExited(tab.id);
  });
  const markActionComplete = () => {
    if (actionRunTokens.get(tab.id) !== runToken) return;
    actionRunTokens.delete(tab.id);
    useDevTerminalStore.getState().markShellExited(tab.id);
    void closeThreads([tab.id]);
  };
  writeScriptToShellThenExitOnSuccess(
    tab.id,
    action.command,
    location.kind,
    markActionComplete,
    markActionComplete,
    project.remoteServerId,
    {
      onOutput: (output) => useThreadOutputStore.getState().appendOutput(tab.id, output),
      onReset: () => useThreadOutputStore.getState().clearOutput(tab.id),
    },
  );
}

export function stopProjectAction(
  projectId: string,
  actionId: string,
  worktreePath?: string,
): void {
  const store = useDevTerminalStore.getState();
  const tab = store.tabs.find(
    (candidate) =>
      candidate.projectId === projectId &&
      (candidate.worktreePath ?? undefined) === worktreePath &&
      candidate.runActionId === actionId,
  );
  if (!tab) return;

  actionRunTokens.delete(tab.id);
  store.removeTab(tab.id);
  useThreadOutputStore.getState().clearOutput(tab.id);
  void closeThreads([tab.id]);
}
