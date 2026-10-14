import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { worktreeScriptShellId } from "@/shared/worktreeScriptShell";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { clearEagerShellStart, wasShellStartedEagerly } from "@/renderer/utils/shellUtils";
import { closeExitedShell } from "./terminalTabActions";

const bridge = vi.hoisted(() => ({
  gitAddWorktree:
    vi.fn<(payload: unknown) => Promise<{ path: string; changesTransferred?: boolean }>>(),
  startShell: vi.fn<(payload: unknown) => Promise<void>>(),
  onSupervisorEvent: vi.fn<(handler: (event: unknown) => void) => () => void>(),
  writeTerminal: vi.fn<(payload: { threadId: string; data: string }) => Promise<void>>(),
  readTerminalSnapshot: vi.fn<
    () => Promise<{
      generation: string | null;
      fromCursor: number;
      toCursor: number;
      data: string;
      processState: "running" | "exited";
      terminalSize: null;
    } | null>
  >(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("./worktreePlacement", () => ({
  worktreePlacementPayload: () => ({ worktreeRoot: "C:\\shared-worktrees" }),
}));

import {
  createWorktree,
  runWorktreeSetupScript,
  showHostWorktreeSetupTerminal,
} from "./worktreeLaunchActions";

const project = {
  id: "project-1",
  name: "Project",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-07-16T00:00:00.000Z",
} satisfies Project;

describe("createWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.gitAddWorktree.mockResolvedValue({ path: "C:\\shared-worktrees\\feature" });
  });

  it("applies the shared creation payload for local projects", async () => {
    await createWorktree(project, {
      branch: "feature",
      startPoint: "main",
      createBranch: true,
      transferUncommitted: true,
      keepChangesInSource: false,
    });

    expect(bridge.gitAddWorktree).toHaveBeenCalledWith({
      projectLocation: project.location,
      branch: "feature",
      startPoint: "main",
      createBranch: true,
      worktreeRoot: "C:\\shared-worktrees",
      transferUncommitted: true,
      keepChangesInSource: false,
    });
  });

  it("does not send local placement settings to remote projects", async () => {
    await createWorktree(
      { ...project, remoteServerId: "desktop-1", remoteId: "project-1" },
      {
        branch: "feature",
        createBranch: true,
        transferUncommitted: false,
        keepChangesInSource: false,
      },
    );

    expect(bridge.gitAddWorktree).toHaveBeenCalledWith({
      projectLocation: project.location,
      branch: "feature",
      createBranch: true,
      transferUncommitted: false,
      keepChangesInSource: false,
    });
  });
});

describe("runWorktreeSetupScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.startShell.mockResolvedValue(undefined);
    bridge.writeTerminal.mockResolvedValue(undefined);
    bridge.onSupervisorEvent.mockReturnValue(() => undefined);
    bridge.readTerminalSnapshot.mockResolvedValue({
      generation: "gen",
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "running",
      terminalSize: null,
    });
    useDevTerminalStore.setState({
      isOpen: false,
      activeProjectId: null,
      activeWorktreePath: null,
      tabs: [],
      activeTabId: null,
    });
  });

  it("creates and starts a setup tab without opening or selecting the terminal panel", async () => {
    const setup = runWorktreeSetupScript(project, "C:\\worktree", "pnpm install\npnpm setup", {
      openTerminalPanel: false,
    });

    await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledOnce());
    const [tab] = useDevTerminalStore.getState().tabs;
    expect(tab).toMatchObject({
      projectId: project.id,
      worktreePath: "C:\\worktree",
      title: "setup",
    });
    expect(bridge.startShell).toHaveBeenCalledWith({
      shellId: tab!.id,
      projectLocation: { kind: "windows", path: "C:\\worktree" },
      worktreePath: "C:\\worktree",
    });
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
    expect(useDevTerminalStore.getState().activeTabId).toBeNull();

    useDevTerminalStore.getState().removeTab(tab!.id);
    await setup;
  });

  it("starts only one setup shell at a time", async () => {
    const first = runWorktreeSetupScript(project, "C:\\first", "pnpm install", {
      openTerminalPanel: false,
    });
    const second = runWorktreeSetupScript(project, "C:\\second", "pnpm install", {
      openTerminalPanel: false,
    });

    await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledOnce());
    const [firstTab] = useDevTerminalStore.getState().tabs;
    expect(firstTab?.worktreePath).toBe("C:\\first");

    useDevTerminalStore.getState().removeTab(firstTab!.id);
    await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledTimes(2));
    const [secondTab] = useDevTerminalStore.getState().tabs;
    expect(secondTab?.worktreePath).toBe("C:\\second");

    useDevTerminalStore.getState().removeTab(secondTab!.id);
    await Promise.all([first, second]);
  });

  it("starts the setup shell when the terminal panel is already open", async () => {
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: project.id,
      activeWorktreePath: "C:\\worktree",
      tabs: [],
      activeTabId: null,
    });

    const setup = runWorktreeSetupScript(project, "C:\\worktree", "pnpm install");

    await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledOnce());
    const [tab] = useDevTerminalStore.getState().tabs;
    expect(tab?.title).toBe("setup");
    useDevTerminalStore.getState().removeTab(tab!.id);
    await setup;
  });

  it("still starts setup when the panel is closed and auto-show is off", async () => {
    const previous = useSharedSettings.getState().autoShowTerminalPanel;
    useSharedSettings.setState({ autoShowTerminalPanel: false });
    try {
      const setup = runWorktreeSetupScript(project, "C:\\worktree", "pnpm install");
      await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledOnce());
      const state = useDevTerminalStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.tabs[0]?.title).toBe("setup");
      state.removeTab(state.tabs[0]!.id);
      await setup;
    } finally {
      useSharedSettings.setState({ autoShowTerminalPanel: previous });
    }
  });

  it("unblocks later setups when the shell fails to start", async () => {
    bridge.startShell.mockRejectedValueOnce(new Error("pty failed"));
    const failed = runWorktreeSetupScript(project, "C:\\failed", "pnpm install", {
      openTerminalPanel: false,
    });
    await failed;
    expect(useDevTerminalStore.getState().tabs).toHaveLength(1);

    const next = runWorktreeSetupScript(project, "C:\\next", "pnpm install", {
      openTerminalPanel: false,
    });
    await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledTimes(2));
    for (const tab of useDevTerminalStore.getState().tabs) {
      useDevTerminalStore.getState().removeTab(tab.id);
    }
    await next;
  });

  it("removes the tab when setup exits and leaves it when the script fails", async () => {
    const handlers: Array<(event: SupervisorEvent) => void> = [];
    bridge.onSupervisorEvent.mockImplementation((handler) => {
      handlers.push(handler as (event: SupervisorEvent) => void);
      return () => undefined;
    });
    const succeeded = runWorktreeSetupScript(project, "C:\\ok", "echo hi", {
      openTerminalPanel: false,
    });
    await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledOnce());
    const shellId = useDevTerminalStore.getState().tabs[0]!.id;
    const prompt = {
      type: "thread-output" as const,
      threadId: shellId,
      data: "\u001B]133;B\u0007",
      outputLength: 1,
      terminalInstanceId: "gen",
    };
    for (const handler of handlers) handler(prompt);
    for (const handler of handlers) {
      handler({ type: "thread-exited", threadId: shellId, exitCode: 0 });
    }
    await succeeded;
    expect(useDevTerminalStore.getState().tabs).toEqual([]);

    handlers.length = 0;
    const failed = runWorktreeSetupScript(project, "C:\\bad", "npm install", {
      openTerminalPanel: false,
    });
    await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledTimes(2));
    const failedId = useDevTerminalStore.getState().tabs[0]!.id;
    for (const handler of handlers) {
      handler({ ...prompt, threadId: failedId });
    }
    const token = /poracode-shell-complete=([^:]+):/u.exec(
      bridge.writeTerminal.mock.calls.at(-1)?.[0].data ?? "",
    )?.[1];
    const marker = `\u001B]777;poracode-shell-complete=${token}:1\u0007`;
    for (const handler of handlers) {
      handler({
        type: "thread-output",
        threadId: failedId,
        data: marker,
        outputLength: marker.length,
        terminalInstanceId: "gen",
      });
    }
    await failed;
    expect(useDevTerminalStore.getState().tabs.map((tab) => tab.id)).toEqual([failedId]);
    useDevTerminalStore.getState().removeTab(failedId);
  });
});

describe("showHostWorktreeSetupTerminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.onSupervisorEvent.mockReturnValue(() => undefined);
    bridge.readTerminalSnapshot.mockResolvedValue({
      generation: "gen",
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "running",
      terminalSize: null,
    });
    useDevTerminalStore.setState({
      isOpen: false,
      activeProjectId: null,
      activeWorktreePath: null,
      tabs: [],
      activeTabId: null,
    });
  });

  it("adopts the host shell instead of starting a second PTY", async () => {
    const shellId = worktreeScriptShellId(project.id, "C:\\worktree", true);
    await showHostWorktreeSetupTerminal(
      { ...project, scripts: { actions: [], setupScript: "pnpm install" } },
      "C:\\worktree",
    );

    expect(wasShellStartedEagerly(shellId)).toBe(true);
    expect(bridge.startShell).not.toHaveBeenCalled();
    expect(useDevTerminalStore.getState().tabs[0]).toMatchObject({
      id: shellId,
      title: "setup",
      worktreePath: "C:\\worktree",
      projectId: project.id,
    });
    clearEagerShellStart(shellId);
  });

  it("does not adopt a setup shell the host never started", async () => {
    bridge.readTerminalSnapshot.mockResolvedValue(null);
    await showHostWorktreeSetupTerminal(
      { ...project, scripts: { actions: [], setupScript: "pnpm install" } },
      "C:\\worktree",
    );
    expect(useDevTerminalStore.getState().tabs).toEqual([]);
    expect(bridge.startShell).not.toHaveBeenCalled();
  });

  it("does not resurrect a setup shell that exited while its snapshot was loading", async () => {
    const shellId = worktreeScriptShellId(project.id, "C:\\finished-worktree", true);
    const snapshot =
      Promise.withResolvers<Awaited<ReturnType<typeof bridge.readTerminalSnapshot>>>();
    const unsubscribe = vi.fn<() => void>();
    const listeners: ((event: unknown) => void)[] = [];
    bridge.onSupervisorEvent.mockImplementation((listener) => {
      listeners.push(listener);
      return unsubscribe;
    });
    bridge.readTerminalSnapshot.mockReturnValue(snapshot.promise);

    const adoption = showHostWorktreeSetupTerminal(
      { ...project, scripts: { actions: [], setupScript: "echo done" } },
      "C:\\finished-worktree",
    );
    closeExitedShell(shellId);
    for (const listener of listeners) {
      listener({ type: "thread-exited", threadId: shellId, exitCode: 0 });
    }
    snapshot.resolve({
      generation: "gen",
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "running",
      terminalSize: null,
    });
    await adoption;

    expect(useDevTerminalStore.getState().tabs).toEqual([]);
    expect(wasShellStartedEagerly(shellId)).toBe(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
