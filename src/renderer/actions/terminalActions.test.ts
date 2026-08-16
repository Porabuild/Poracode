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

import { runProjectAction, stopProjectAction } from "./terminalActions";
import { useAppStore } from "@/renderer/state/appStore";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadOutputStore } from "@/renderer/state/threadOutputStore";

const project = {
  id: "p1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-08-08T00:00:00.000Z",
  scripts: {
    actions: [{ id: "dev", name: "Dev", command: "pnpm dev" }],
  },
} satisfies Project;

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

  it("restarts an action in its existing tracked terminal", () => {
    runProjectAction(project.id, "dev");
    const firstTab = useDevTerminalStore.getState().tabs[0]!;

    runProjectAction(project.id, "dev");

    expect(useDevTerminalStore.getState().tabs).toHaveLength(1);
    expect(useDevTerminalStore.getState().tabs[0]).toMatchObject({
      id: firstTab.id,
      runActionId: "dev",
    });
    expect(bridge.startShell).toHaveBeenCalledTimes(2);
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

    supervisorHandlers.forEach((handler) =>
      handler({
        type: "thread-output",
        threadId: tab.id,
        data: "PS> ",
        outputLength: 4,
        terminalInstanceId: "gen-test",
      }),
    );
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
    resolveSecond();
    rejectFirst(new Error("old start failed"));

    await vi.waitFor(() => {
      expect(useDevTerminalStore.getState().runningTabs[tab.id]).toBe(true);
    });
  });
});
