import { buildWorktreeLocation } from "@/shared/worktree";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { watchRemoteTerminal } from "@/renderer/state/remoteTerminalFeed";
import { readBridge } from "@/renderer/bridge";
import {
  useSharedSettings,
  whenSharedSettingsHydrated,
} from "@/renderer/state/sharedSettingsStore";
import {
  normalizeShellScript,
  startShellWithToast,
  writeScriptToShell,
} from "@/renderer/utils/shellUtils";
import { closeAllPanels } from "./panelActions";

function applyTerminalPanel(
  projectId: string,
  worktreePath: string | undefined,
  options: { toggleCloseIfActive: boolean },
): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;

  const store = useDevTerminalStore.getState();
  const isBottom = useSharedSettings.getState().terminalPosition === "bottom";

  if (options.toggleCloseIfActive) {
    const rightPanelTab = usePanelStore.getState().rightPanelTab;
    const isSameTerminal =
      store.isOpen &&
      store.activeProjectId === projectId &&
      (store.activeWorktreePath ?? undefined) === worktreePath;
    if (isSameTerminal && (isBottom || rightPanelTab === "terminal")) {
      if (!isBottom) closeAllPanels();
      store.closePanel();
      return;
    }
  }

  if (worktreePath) {
    store.openWorktreePanel(projectId, worktreePath);
  } else {
    store.openPanel(projectId);
  }
  if (!isBottom) usePanelStore.getState().setRightPanelTab("terminal");

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
  const tab = store.addTab(projectId, tabLabel, worktreePath);
  store.setActiveTab(tab.id);

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
  });

  startShellWithToast(
    {
      shellId: tab.id,
      projectLocation: location,
      ...(worktreePath ? { worktreePath } : {}),
    },
    tabLabel,
  );
  if (project.remoteServerId) {
    let armed = true;
    const unsubscribe = watchRemoteTerminal(project.remoteServerId, tab.id, {
      onOutput: () => {
        if (!armed) return;
        armed = false;
        void readBridge().writeTerminal({
          threadId: tab.id,
          data: `${normalizeShellScript(action.command)}\r`,
        });
      },
      onReset: () => {
        armed = true;
      },
      onExited: () => unsubscribe(),
    });
  } else {
    writeScriptToShell(tab.id, action.command);
  }
}
