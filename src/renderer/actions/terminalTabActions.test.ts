import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./panelActions", () => ({ closeAllPanels: vi.fn<() => void>() }));

import { closeAllPanels } from "./panelActions";
import { closeExitedShell, removeTerminalTab } from "./terminalTabActions";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const FILES_CONTEXT = { projectId: "p1", projectName: "Project", rootLabel: "Project" };

function openProjectTab(projectId = "p1") {
  const store = useDevTerminalStore.getState();
  const tab = store.addTab(projectId, "Shell");
  store.openPanel(projectId);
  store.setActiveTab(tab.id);
  return tab;
}

function resetPanelStore() {
  usePanelStore.setState({
    rightPanelTab: "terminal",
    rightPanelSplit: null,
    filesPanelContext: null,
    browserPanelOpen: false,
    notesPanelOpen: false,
  });
}

function tabById(id: string) {
  return useDevTerminalStore.getState().tabs.find((tab) => tab.id === id);
}

describe("closeExitedShell", () => {
  beforeEach(() => {
    resetDevTerminalStore();
    resetPanelStore();
    useSharedSettings.setState({ terminalPosition: "bottom" });
    vi.mocked(closeAllPanels).mockClear();
  });

  it("removes a shell tab whose shell exited and keeps the panel open for the others", () => {
    const first = openProjectTab();
    const second = openProjectTab();

    closeExitedShell(second.id);

    expect(useDevTerminalStore.getState().tabs.map((tab) => tab.id)).toEqual([first.id]);
    expect(useDevTerminalStore.getState().activeTabId).toBe(first.id);
    expect(useDevTerminalStore.getState().isOpen).toBe(true);
  });

  it("hides the panel when the last tab in the shown scope exits", () => {
    const tab = openProjectTab();

    closeExitedShell(tab.id);

    expect(useDevTerminalStore.getState().tabs).toEqual([]);
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(closeAllPanels).not.toHaveBeenCalled();
  });

  it("closes the right panel when the last tab exits in right mode", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    const tab = openProjectTab();

    closeExitedShell(tab.id);

    expect(closeAllPanels).toHaveBeenCalledTimes(1);
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
  });

  it("keeps the active Files tab when the terminal behind it exits", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    const tab = openProjectTab();
    usePanelStore.setState({ rightPanelTab: "files", filesPanelContext: FILES_CONTEXT });

    closeExitedShell(tab.id);

    expect(closeAllPanels).not.toHaveBeenCalled();
    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "files",
      filesPanelContext: FILES_CONTEXT,
    });
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
  });

  it("keeps the active Browser tab when the terminal behind it exits", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    const tab = openProjectTab();
    usePanelStore.setState({ rightPanelTab: "browser", browserPanelOpen: true });

    closeExitedShell(tab.id);

    expect(closeAllPanels).not.toHaveBeenCalled();
    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "browser",
      browserPanelOpen: true,
    });
  });

  it("keeps a split that does not hold the terminal when the terminal behind it exits", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    const tab = openProjectTab();
    const split = { tab: "notes", placement: "bottom" } as const;
    usePanelStore.setState({
      rightPanelTab: "files",
      rightPanelSplit: split,
      filesPanelContext: FILES_CONTEXT,
      notesPanelOpen: true,
    });

    closeExitedShell(tab.id);

    expect(closeAllPanels).not.toHaveBeenCalled();
    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "files",
      rightPanelSplit: split,
      filesPanelContext: FILES_CONTEXT,
      notesPanelOpen: true,
    });
  });

  it("closes only the split section when the terminal in it exits", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    const tab = openProjectTab();
    usePanelStore.setState({
      rightPanelTab: "files",
      rightPanelSplit: { tab: "terminal", placement: "bottom" },
      filesPanelContext: FILES_CONTEXT,
    });

    closeExitedShell(tab.id);

    expect(closeAllPanels).not.toHaveBeenCalled();
    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "files",
      rightPanelSplit: null,
      filesPanelContext: FILES_CONTEXT,
    });
  });

  it("hands the panel to the split sibling when the active terminal exits", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    const tab = openProjectTab();
    usePanelStore.setState({
      rightPanelTab: "terminal",
      rightPanelSplit: { tab: "files", placement: "bottom" },
      filesPanelContext: FILES_CONTEXT,
    });

    closeExitedShell(tab.id);

    expect(closeAllPanels).not.toHaveBeenCalled();
    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "files",
      rightPanelSplit: null,
      filesPanelContext: FILES_CONTEXT,
    });
  });

  it("leaves the panel alone when the exited tab belongs to a scope it is not showing", () => {
    const shown = openProjectTab("p1");
    const background = useDevTerminalStore.getState().addTab("p2", "Other");

    closeExitedShell(background.id);

    expect(useDevTerminalStore.getState().tabs.map((tab) => tab.id)).toEqual([shown.id]);
    expect(useDevTerminalStore.getState()).toMatchObject({ isOpen: true, activeProjectId: "p1" });
    expect(closeAllPanels).not.toHaveBeenCalled();
  });

  it("closes only the split pane when the split shell exits", () => {
    const tab = openProjectTab();
    const splitId = useDevTerminalStore.getState().splitTab(tab.id);

    closeExitedShell(splitId);

    expect(tabById(tab.id)).toBeDefined();
    expect(tabById(tab.id)?.splitId).toBeUndefined();
    expect(useDevTerminalStore.getState().isOpen).toBe(true);
  });

  it("lets the split fill the tab when the main shell exits first", () => {
    const tab = openProjectTab();
    const splitId = useDevTerminalStore.getState().splitTab(tab.id);

    closeExitedShell(tab.id);

    expect(tabById(tab.id)).toMatchObject({ splitId, mainExited: true });
    expect(useDevTerminalStore.getState().isOpen).toBe(true);
  });

  it("removes the tab once both of its shells have exited", () => {
    const tab = openProjectTab();
    const splitId = useDevTerminalStore.getState().splitTab(tab.id);

    closeExitedShell(tab.id);
    closeExitedShell(splitId);

    expect(useDevTerminalStore.getState().tabs).toEqual([]);
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
  });

  it("keeps a Run-action tab and its output when the action shell exits", () => {
    const store = useDevTerminalStore.getState();
    const tab = store.addTab("p1", "Dev", undefined, "dev");
    store.openPanel("p1");
    store.markShellRunning(tab.id);

    closeExitedShell(tab.id);

    expect(tabById(tab.id)).toBeDefined();
    expect(useDevTerminalStore.getState().runningTabs).toEqual({});
    expect(useDevTerminalStore.getState().isOpen).toBe(true);
  });

  it("ignores shells that have no tab", () => {
    const tab = openProjectTab();

    closeExitedShell("shell:cleanup");

    expect(tabById(tab.id)).toBeDefined();
    expect(useDevTerminalStore.getState().isOpen).toBe(true);
  });
});

describe("removeTerminalTab", () => {
  beforeEach(() => {
    resetDevTerminalStore();
    resetPanelStore();
    useSharedSettings.setState({ terminalPosition: "bottom" });
    vi.mocked(closeAllPanels).mockClear();
  });

  it("reports whether it hid the panel", () => {
    const first = openProjectTab();
    const second = openProjectTab();

    expect(removeTerminalTab(first)).toBe(false);
    expect(removeTerminalTab(second)).toBe(true);
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
  });

  it("uses the position the caller passes over the saved setting", () => {
    const tab = openProjectTab();

    removeTerminalTab(tab, { position: "right" });

    expect(closeAllPanels).toHaveBeenCalledTimes(1);
  });
});
