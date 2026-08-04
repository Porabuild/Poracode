import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";

const bridge = vi.hoisted(() => ({
  startShell: vi.fn<(payload: unknown) => Promise<void>>(),
  onSupervisorEvent: vi.fn<() => () => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

import { runWorktreeSetupScript } from "./worktreeLaunchActions";

const project = {
  id: "project-1",
  name: "Project",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-07-16T00:00:00.000Z",
} satisfies Project;

describe("runWorktreeSetupScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.startShell.mockResolvedValue(undefined);
    bridge.onSupervisorEvent.mockReturnValue(() => undefined);
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
});
