import { beforeEach, describe, expect, it } from "vitest";
import { beginShellLaunch, wasShellLaunched } from "@/renderer/utils/shellStartRegistry";
import {
  type DevTerminalTab,
  resetDevTerminalStore,
  useDevTerminalStore,
} from "./devTerminalStore";

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
      explicitlyOpened: false,
      activeProjectId: null,
      activeWorktreePath: null,
      tabs: [],
      activeTabId: null,
      focusRequestId: 0,
      tabActivity: {},
      streamingTabs: {},
      runningTabs: {},
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

describe("devTerminalStore explicit open marker", () => {
  beforeEach(() => {
    useDevTerminalStore.setState({
      isOpen: false,
      explicitlyOpened: false,
      activeProjectId: null,
      activeWorktreePath: null,
      tabs: [],
      activeTabId: null,
      focusRequestId: 0,
      tabActivity: {},
      streamingTabs: {},
      runningTabs: {},
    });
  });

  it("marks explicit opens and clears the marker on close and lock re-scope", () => {
    useDevTerminalStore.getState().openPanel("p1");
    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      explicitlyOpened: true,
      activeProjectId: "p1",
    });

    useDevTerminalStore.getState().closePanel();
    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: false,
      explicitlyOpened: false,
    });

    useDevTerminalStore.getState().openWorktreePanel("p1", "/wt/x");
    expect(useDevTerminalStore.getState()).toMatchObject({
      explicitlyOpened: true,
      activeWorktreePath: "/wt/x",
    });

    useDevTerminalStore.getState().setPanelScope("p2");
    expect(useDevTerminalStore.getState()).toMatchObject({
      explicitlyOpened: false,
      activeProjectId: "p2",
    });
  });

  it("clears the marker on a same-scope re-scope without touching the active tab", () => {
    useDevTerminalStore.setState({
      activeProjectId: "p1",
      tabs: [tab("a", "p1"), tab("b", "p1")],
      activeTabId: "b",
    });
    useDevTerminalStore.getState().openPanel("p1");

    useDevTerminalStore.getState().setPanelScope("p1");
    expect(useDevTerminalStore.getState()).toMatchObject({
      explicitlyOpened: false,
      activeProjectId: "p1",
      activeTabId: "b",
    });
  });
});

describe("devTerminalStore run-action tabs", () => {
  beforeEach(() => {
    useDevTerminalStore.setState({
      tabs: [],
      activeTabId: null,
      runningTabs: {},
    });
  });

  it("tags action-owned tabs and clears their running marker when removed", () => {
    const store = useDevTerminalStore.getState();
    const actionTab = store.addTab("p1", "Dev", "/wt/x", "dev");

    store.markShellRunning(actionTab.id);
    expect(useDevTerminalStore.getState()).toMatchObject({
      tabs: [{ id: actionTab.id, runActionId: "dev" }],
      runningTabs: { [actionTab.id]: true },
    });

    store.removeTab(actionTab.id);
    expect(useDevTerminalStore.getState().runningTabs).toEqual({});
  });

  it("clears a running marker when its shell exits", () => {
    const store = useDevTerminalStore.getState();
    const actionTab = store.addTab("p1", "Dev", undefined, "dev");
    store.markShellRunning(actionTab.id);

    store.markShellExited(actionTab.id);

    expect(useDevTerminalStore.getState().runningTabs).toEqual({});
  });
});

describe("devTerminalStore forgets deferred shell starts with tab state", () => {
  beforeEach(() => {
    useDevTerminalStore.setState({
      isOpen: false,
      explicitlyOpened: false,
      activeProjectId: null,
      activeWorktreePath: null,
      tabs: [],
      activeTabId: null,
      focusRequestId: 0,
      tabActivity: {},
      streamingTabs: {},
      runningTabs: {},
    });
  });

  function seedMarks(...shellIds: readonly string[]) {
    for (const shellId of shellIds) beginShellLaunch(shellId);
  }

  function expectMarks(shellIds: readonly string[], launched: boolean) {
    for (const shellId of shellIds) expect(wasShellLaunched(shellId)).toBe(launched);
  }

  it("removeTab forgets the tab's and its split's marks", () => {
    const store = useDevTerminalStore.getState();
    const added = store.addTab("p1", "Dev");
    const splitId = store.splitTab(added.id);
    seedMarks(added.id, splitId);

    store.removeTab(added.id);

    expect(useDevTerminalStore.getState().tabs).toHaveLength(0);
    expectMarks([added.id, splitId], false);
  });

  it("removeTabsForProject forgets every removed tab's and split's marks", () => {
    const store = useDevTerminalStore.getState();
    const first = store.addTab("p1", "Dev");
    const second = store.addTab("p1", "Dev");
    const splitId = store.splitTab(second.id);
    const other = store.addTab("p2", "Other");
    seedMarks(first.id, second.id, splitId, other.id);

    store.removeTabsForProject("p1");

    expectMarks([first.id, second.id, splitId], false);
    expect(wasShellLaunched(other.id)).toBe(true);
  });

  it("removeTabsForWorktree forgets every removed tab's and split's marks", () => {
    const store = useDevTerminalStore.getState();
    const worktreePath = "/repo/.poracode/worktrees/feature";
    const worktreeTab = store.addTab("p1", "feature", worktreePath);
    const worktreeSplit = store.splitTab(worktreeTab.id);
    const projectTab = store.addTab("p1", "Dev");
    seedMarks(worktreeTab.id, worktreeSplit, projectTab.id);

    store.removeTabsForWorktree(worktreePath);

    expectMarks([worktreeTab.id, worktreeSplit], false);
    expect(wasShellLaunched(projectTab.id)).toBe(true);
  });

  it("closeSplit forgets the split's mark", () => {
    const store = useDevTerminalStore.getState();
    const added = store.addTab("p1", "Dev");
    const splitId = store.splitTab(added.id);
    seedMarks(added.id, splitId);

    store.closeSplit(added.id);

    expect(wasShellLaunched(splitId)).toBe(false);
    expect(wasShellLaunched(added.id)).toBe(true);
  });

  it("resetDevTerminalStore forgets every tab's and split's marks", () => {
    const store = useDevTerminalStore.getState();
    const first = store.addTab("p1", "Dev");
    const second = store.addTab("p1", "Dev");
    const splitId = store.splitTab(second.id);
    seedMarks(first.id, second.id, splitId);

    resetDevTerminalStore();

    expect(useDevTerminalStore.getState().tabs).toHaveLength(0);
    expectMarks([first.id, second.id, splitId], false);
  });
});
// @vitest-environment node
