import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import type { Project } from "@/shared/contracts";

const bridge = vi.hoisted(() => ({
  onSupervisorEvent: vi.fn<(handler: (event: SupervisorEvent) => void) => () => void>(),
  startShell: vi.fn<(payload: unknown) => Promise<void>>(),
  writeTerminal: vi.fn<(payload: { threadId: string; data: string }) => Promise<void>>(),
  closeThread: vi.fn<(payload: { threadId: string }) => Promise<void>>(),
  setRendererEventInterests: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const supervisorHandlers: Array<(event: SupervisorEvent) => void> = [];

vi.mock("@heroui/react", () => ({
  toast: { danger: vi.fn<(message: string) => void>() },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

import {
  closeGlobalTerminalTab,
  openTerminal,
  runProjectAction,
  stopProjectAction,
  toggleGlobalTerminal,
} from "./terminalActions";
import { useAppStore } from "@/renderer/state/appStore";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadOutputStore } from "@/renderer/state/threadOutputStore";
import { useGlobalTerminalStore } from "@/renderer/state/globalTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";

const project = {
  id: "p1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-08-08T00:00:00.000Z",
  scripts: {
    actions: [{ id: "dev", name: "Dev", command: "pnpm dev" }],
  },
} satisfies Project;

describe("global terminal panel", () => {
  beforeEach(() => {
    resetDevTerminalStore();
    useGlobalTerminalStore.setState({ tabs: [], activeTabId: null });
    useAppStore.setState({ projects: [] });
    usePanelStore.setState({ rightPanelTab: "files", rightPanelSplit: null });
    bridge.closeThread.mockReset().mockResolvedValue(undefined);
  });

  it.each(["bottom", "right"] as const)(
    "uses the normal %s panel without a project",
    (position) => {
      useSharedSettings.setState({ terminalPosition: position });
      toggleGlobalTerminal();
      const shellId = useGlobalTerminalStore.getState().activeTabId;
      expect(shellId).toMatch(/^shell:/);
      expect(useDevTerminalStore.getState()).toMatchObject({
        isOpen: true,
        source: "global",
        tabs: [],
      });
      expect(usePanelStore.getState().rightPanelTab).toBe(
        position === "right" ? "terminal" : "files",
      );

      toggleGlobalTerminal();
      expect(useDevTerminalStore.getState().isOpen).toBe(false);
      toggleGlobalTerminal();
      expect(useGlobalTerminalStore.getState().activeTabId).toBe(shellId);
    },
  );

  it("switches back to a project terminal with the same saved scope", () => {
    useSharedSettings.setState({ terminalPosition: "bottom" });
    useAppStore.setState({ projects: [project] });
    openTerminal(project.id);
    const projectTab = useDevTerminalStore.getState().activeTabId;
    toggleGlobalTerminal();
    const shellId = useGlobalTerminalStore.getState().activeTabId;
    openTerminal(project.id);
    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      source: "project",
      activeProjectId: project.id,
      activeTabId: projectTab,
    });
    toggleGlobalTerminal();
    expect(useDevTerminalStore.getState().source).toBe("global");
    expect(useGlobalTerminalStore.getState().activeTabId).toBe(shellId);
  });

  it("closes other right-panel surfaces when hiding the main global terminal", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    usePanelStore.setState({
      filesPanelContext: { projectId: "p1", projectName: "Project", rootLabel: "Project" },
    });
    toggleGlobalTerminal();
    toggleGlobalTerminal();
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(usePanelStore.getState().filesPanelContext).toBeNull();
  });

  it("hides the global split while keeping the main panel", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    toggleGlobalTerminal();
    usePanelStore.setState({
      rightPanelTab: "files",
      rightPanelSplit: { tab: "terminal", placement: "bottom" },
    });
    toggleGlobalTerminal();
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "files",
      rightPanelSplit: null,
    });
  });

  it("promotes the split sibling when hiding the main global terminal", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    toggleGlobalTerminal();
    usePanelStore.setState({ rightPanelSplit: { tab: "notes", placement: "bottom" } });
    toggleGlobalTerminal();
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "notes",
      rightPanelSplit: null,
    });
  });

  it("closes one global tab and keeps the panel open for the others", () => {
    useSharedSettings.setState({ terminalPosition: "bottom" });
    toggleGlobalTerminal();
    const first = useGlobalTerminalStore.getState().tabs[0]!;
    const second = useGlobalTerminalStore.getState().addTab();

    closeGlobalTerminalTab(first.id);

    expect(useGlobalTerminalStore.getState()).toMatchObject({
      tabs: [second],
      activeTabId: second.id,
    });
    expect(useDevTerminalStore.getState()).toMatchObject({ isOpen: true, source: "global" });
    expect(bridge.closeThread).toHaveBeenCalledExactlyOnceWith({ threadId: first.id });
  });

  it("keeps a project terminal open when the last background global tab closes", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    toggleGlobalTerminal();
    const globalTab = useGlobalTerminalStore.getState().tabs[0]!;
    useAppStore.setState({ projects: [project] });
    openTerminal(project.id);
    const projectTabs = useDevTerminalStore.getState().tabs;

    closeGlobalTerminalTab(globalTab.id);

    expect(useGlobalTerminalStore.getState().tabs).toEqual([]);
    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      source: "project",
      tabs: projectTabs,
    });
    expect(bridge.closeThread).toHaveBeenCalledExactlyOnceWith({ threadId: globalTab.id });
  });

  it("promotes a split sibling after closing the last global tab", () => {
    useSharedSettings.setState({ terminalPosition: "right" });
    toggleGlobalTerminal();
    const globalTab = useGlobalTerminalStore.getState().tabs[0]!;
    usePanelStore.setState({ rightPanelSplit: { tab: "notes", placement: "bottom" } });

    closeGlobalTerminalTab(globalTab.id);

    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "notes",
      rightPanelSplit: null,
    });
  });

  it("ignores a close for an unowned tab without hiding the global panel", () => {
    useSharedSettings.setState({ terminalPosition: "bottom" });
    toggleGlobalTerminal();
    closeGlobalTerminalTab("shell:unrelated");
    expect(useGlobalTerminalStore.getState().tabs).toHaveLength(1);
    expect(useDevTerminalStore.getState().isOpen).toBe(true);
    expect(bridge.closeThread).not.toHaveBeenCalled();
  });
});

describe("runProjectAction", () => {
  beforeEach(() => {
    resetDevTerminalStore();
    useThreadOutputStore.setState({ buffers: {} });
    useAppStore.setState({ projects: [project] });
    useSharedSettings.setState({ autoShowTerminalPanel: false });
    bridge.startShell.mockReset().mockResolvedValue(undefined);
    bridge.writeTerminal.mockReset().mockResolvedValue(undefined);
    bridge.closeThread.mockReset().mockResolvedValue(undefined);
    supervisorHandlers.length = 0;
    bridge.onSupervisorEvent.mockReset().mockImplementation((handler) => {
      supervisorHandlers.push(handler);
      return () => {
        const index = supervisorHandlers.indexOf(handler);
        if (index >= 0) supervisorHandlers.splice(index, 1);
      };
    });
  });

  it("restarts an action in its existing tracked terminal", async () => {
    runProjectAction(project.id, "dev");
    const firstTab = useDevTerminalStore.getState().tabs[0]!;

    runProjectAction(project.id, "dev");

    expect(useDevTerminalStore.getState().tabs).toHaveLength(1);
    expect(useDevTerminalStore.getState().tabs[0]).toMatchObject({
      id: firstTab.id,
      runActionId: "dev",
    });
    await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledTimes(2));
    expect(bridge.startShell).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ shellId: firstTab.id }),
    );
    expect(useDevTerminalStore.getState().runningTabs[firstTab.id]).toBe(true);
  });

  it("tracks the same action separately in each worktree", () => {
    runProjectAction(project.id, "dev", "C:\\repo\\wt-a");
    runProjectAction(project.id, "dev", "C:\\repo\\wt-b");

    expect(useDevTerminalStore.getState().tabs).toHaveLength(2);
  });

  it("clears the running marker when shell startup fails", async () => {
    bridge.startShell.mockRejectedValueOnce(new Error("spawn failed"));
    runProjectAction(project.id, "dev");
    const tab = useDevTerminalStore.getState().tabs[0]!;

    await vi.waitFor(() => {
      expect(useDevTerminalStore.getState().runningTabs[tab.id]).toBeUndefined();
    });
  });

  it("closes the PTY and clears the running marker when a command fails", async () => {
    runProjectAction(project.id, "dev");
    const tab = useDevTerminalStore.getState().tabs[0]!;

    vi.useFakeTimers();
    try {
      supervisorHandlers.forEach((handler) =>
        handler({
          type: "thread-output",
          threadId: tab.id,
          data: "PS> ",
          outputLength: 4,
          terminalInstanceId: "gen-test",
        }),
      );
      vi.advanceTimersByTime(250);
      const command = bridge.writeTerminal.mock.calls[0]?.[0].data ?? "";
      const token = /poracode-shell-complete=([^:]+):/u.exec(command)?.[1];
      expect(token).toBeTruthy();
      supervisorHandlers.forEach((handler) =>
        handler({
          type: "thread-output",
          threadId: tab.id,
          data: command,
          outputLength: command.length,
          terminalInstanceId: "gen-test",
        }),
      );
      supervisorHandlers.forEach((handler) =>
        handler({
          type: "thread-output",
          threadId: tab.id,
          data: "command failed\r\n",
          outputLength: command.length + 16,
          terminalInstanceId: "gen-test",
        }),
      );
      const marker = `\u001B]777;poracode-shell-complete=${token}:1\u0007`;
      supervisorHandlers.forEach((handler) =>
        handler({
          type: "thread-output",
          threadId: tab.id,
          data: marker,
          outputLength: marker.length,
          terminalInstanceId: "gen-test",
        }),
      );

      expect(useDevTerminalStore.getState().runningTabs[tab.id]).toBeUndefined();
      expect(useDevTerminalStore.getState().tabs).toContainEqual(tab);
      expect(useThreadOutputStore.getState().readTail(tab.id, 100_000)).toContain("command failed");
      expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: tab.id });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears retained output when rerunning the action", () => {
    runProjectAction(project.id, "dev");
    const tab = useDevTerminalStore.getState().tabs[0]!;
    useThreadOutputStore.getState().appendOutput(tab.id, "old run");

    runProjectAction(project.id, "dev");

    expect(useThreadOutputStore.getState().readTail(tab.id, 100_000)).toBe("");
  });

  it("stops an action by removing and killing its terminal", async () => {
    runProjectAction(project.id, "dev");
    const tab = useDevTerminalStore.getState().tabs[0]!;
    useThreadOutputStore.getState().appendOutput(tab.id, "running");

    stopProjectAction(project.id, "dev");

    expect(useDevTerminalStore.getState().runningTabs[tab.id]).toBeUndefined();
    expect(useDevTerminalStore.getState().tabs).not.toContainEqual(tab);
    expect(useThreadOutputStore.getState().readTail(tab.id, 100_000)).toBe("");
    await vi.waitFor(() => {
      expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: tab.id });
    });
  });

  it("does not let an older failed restart clear a newer run", async () => {
    let rejectFirst!: (error: Error) => void;
    let resolveSecond!: () => void;
    bridge.startShell
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    runProjectAction(project.id, "dev");
    const tab = useDevTerminalStore.getState().tabs[0]!;
    runProjectAction(project.id, "dev");
    await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledTimes(2));
    resolveSecond();
    rejectFirst(new Error("old start failed"));

    await vi.waitFor(() => {
      expect(useDevTerminalStore.getState().runningTabs[tab.id]).toBe(true);
    });
  });
});
