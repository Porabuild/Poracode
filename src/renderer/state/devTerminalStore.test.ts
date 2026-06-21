import { beforeEach, describe, expect, it } from "vitest";
import { type DevTerminalTab, useDevTerminalStore } from "./devTerminalStore";

function tab(id: string, projectId: string, worktreePath?: string): DevTerminalTab {
  return {
    id,
    projectId,
    ...(worktreePath ? { worktreePath } : {}),
    title: id,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("devTerminalStore cycleTab", () => {
  beforeEach(() => {
    useDevTerminalStore.setState({
      isOpen: false,
      activeProjectId: null,
      activeWorktreePath: null,
      tabs: [],
      activeTabId: null,
      focusRequestId: 0,
      tabActivity: {},
      streamingTabs: {},
    });
  });

  it("cycles forward and backward within the active project's strip", () => {
    useDevTerminalStore.setState({
      activeProjectId: "p1",
      tabs: [tab("a", "p1"), tab("b", "p1"), tab("c", "p1")],
      activeTabId: "b",
    });

    useDevTerminalStore.getState().cycleTab("next");
    expect(useDevTerminalStore.getState().activeTabId).toBe("c");

    useDevTerminalStore.getState().cycleTab("previous");
    expect(useDevTerminalStore.getState().activeTabId).toBe("b");
  });

  it("wraps around at the ends", () => {
    useDevTerminalStore.setState({
      activeProjectId: "p1",
      tabs: [tab("a", "p1"), tab("b", "p1")],
      activeTabId: "b",
    });

    useDevTerminalStore.getState().cycleTab("next");
    expect(useDevTerminalStore.getState().activeTabId).toBe("a");
  });

  it("only cycles tabs in the active worktree scope", () => {
    useDevTerminalStore.setState({
      activeProjectId: "p1",
      activeWorktreePath: "/wt/x",
      tabs: [
        tab("a", "p1", "/wt/x"),
        tab("b", "p1", "/wt/x"),
        tab("other-project", "p2", "/wt/x"),
        tab("other-worktree", "p1", "/wt/y"),
        tab("project-root", "p1"),
      ],
      activeTabId: "a",
    });

    useDevTerminalStore.getState().cycleTab("next");
    expect(useDevTerminalStore.getState().activeTabId).toBe("b");

    // Wraps within the two /wt/x tabs only — the other project/worktree/root tabs
    // are not part of the visible strip.
    useDevTerminalStore.getState().cycleTab("next");
    expect(useDevTerminalStore.getState().activeTabId).toBe("a");
  });

  it("ignores worktree tabs when the panel shows the project root", () => {
    useDevTerminalStore.setState({
      activeProjectId: "p1",
      activeWorktreePath: null,
      tabs: [tab("root-1", "p1"), tab("root-2", "p1"), tab("wt", "p1", "/wt/x")],
      activeTabId: "root-1",
    });

    useDevTerminalStore.getState().cycleTab("next");
    expect(useDevTerminalStore.getState().activeTabId).toBe("root-2");
  });

  it("is a no-op with fewer than two visible tabs", () => {
    useDevTerminalStore.setState({
      activeProjectId: "p1",
      tabs: [tab("a", "p1"), tab("b", "p2")],
      activeTabId: "a",
    });

    useDevTerminalStore.getState().cycleTab("next");
    expect(useDevTerminalStore.getState().activeTabId).toBe("a");
    expect(useDevTerminalStore.getState().focusRequestId).toBe(0);
  });

  it("bumps focusRequestId when switching (so the panel refocuses)", () => {
    useDevTerminalStore.setState({
      activeProjectId: "p1",
      tabs: [tab("a", "p1"), tab("b", "p1")],
      activeTabId: "a",
      focusRequestId: 5,
    });

    useDevTerminalStore.getState().cycleTab("next");
    expect(useDevTerminalStore.getState().activeTabId).toBe("b");
    expect(useDevTerminalStore.getState().focusRequestId).toBe(6);
  });
});
