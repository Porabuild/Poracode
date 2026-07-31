import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useRightPanelThreadLock } from "./useRightPanelThreadLock";

function makeThread(input: Partial<Thread> = {}): Thread {
  const now = "2026-03-22T00:00:00.000Z";
  return {
    id: "thread-a",
    projectId: "project-a",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

const threadA = makeThread({ id: "thread-a", projectId: "project-a" });
const threadA2 = makeThread({ id: "thread-a2", projectId: "project-a" });
const threadBWorktreePath = "/repo-b/.poracode/worktrees/feature";
const threadB = makeThread({
  id: "thread-b",
  projectId: "project-b",
  worktreePath: threadBWorktreePath,
});

function focusThread(threadId: string) {
  useAppStore.setState((state) => ({
    ...state,
    threads: [threadA, threadA2, threadB],
    view: { kind: "thread", panes: [threadId] },
    focusedPaneId: threadId,
  }));
}

const terminalTabA = {
  id: "terminal-a",
  projectId: "project-a",
  title: "Project A",
  createdAt: "2026-03-22T00:00:00.000Z",
};
const terminalTabB = {
  id: "terminal-b",
  projectId: "project-b",
  title: "Project B",
  createdAt: "2026-03-22T00:00:00.000Z",
};
/** thread-b's worktree shell — distinct from `terminalTabB`, project-b's plain shell. */
const terminalTabBWorktree = {
  ...terminalTabB,
  id: "terminal-b-worktree",
  worktreePath: threadBWorktreePath,
  title: "Feature",
};

describe("useRightPanelThreadLock", () => {
  beforeEach(() => {
    localStorage.clear();
    usePanelStore.setState({
      rightPanelFollowsThread: true,
      gitReviewContext: { projectId: "project-a" },
      gitReviewAsPanel: true,
      filesPanelContext: null,
      rightPanelTab: "git",
    });
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
    useSharedSettings.setState({ terminalPosition: "bottom" });
    focusThread("thread-a");
  });

  it("re-scopes the open git panel to the focused thread", () => {
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    focusThread("thread-b");
    rerender();

    expect(usePanelStore.getState().gitReviewContext).toEqual({
      projectId: "project-b",
      worktreePath: threadB.worktreePath,
    });
    expect(usePanelStore.getState().rightPanelTab).toBe("git");
  });

  it("keeps the active tab when re-scoping", () => {
    usePanelStore.setState({ rightPanelTab: "usage" });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    focusThread("thread-b");
    rerender();

    expect(usePanelStore.getState().gitReviewContext?.projectId).toBe("project-b");
    expect(usePanelStore.getState().rightPanelTab).toBe("usage");
  });

  it("leaves the panel alone while unlocked", () => {
    usePanelStore.setState({ rightPanelFollowsThread: false });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    focusThread("thread-b");
    rerender();

    expect(usePanelStore.getState().gitReviewContext).toEqual({ projectId: "project-a" });
  });

  it("does not open panels the user has closed", () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    focusThread("thread-b");
    rerender();

    expect(usePanelStore.getState().gitReviewContext).toBeNull();
    expect(usePanelStore.getState().filesPanelContext).toBeNull();
  });

  it("re-scopes the open bottom terminal to the focused thread", () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: "project-a",
      tabs: [terminalTabA, terminalTabBWorktree],
      activeTabId: terminalTabA.id,
    });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    focusThread("thread-b");
    rerender();

    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      activeProjectId: "project-b",
      activeWorktreePath: threadBWorktreePath,
      activeTabId: terminalTabBWorktree.id,
    });
  });

  it("keeps a terminal the user opened for another project", () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    useDevTerminalStore.setState({ tabs: [terminalTabA, terminalTabB] });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    // Opening a terminal directly is explicit intent — the lock must not snap
    // it back to the focused thread's project.
    useDevTerminalStore.getState().openPanel("project-b");
    rerender();

    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      activeProjectId: "project-b",
    });
  });

  it("re-scopes an explicitly opened terminal on the next thread switch", () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    useDevTerminalStore.setState({ tabs: [terminalTabA, terminalTabB] });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    useDevTerminalStore.getState().openPanel("project-b");
    rerender();

    focusThread("thread-a2");
    rerender();

    expect(useDevTerminalStore.getState()).toMatchObject({
      activeProjectId: "project-a",
      activeWorktreePath: null,
      activeTabId: terminalTabA.id,
    });
  });

  it("keeps a git panel the user re-pointed when a terminal opens", () => {
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    usePanelStore.getState().setGitReviewContext({ projectId: "project-b" });
    useDevTerminalStore.getState().openPanel("project-b");
    rerender();

    expect(usePanelStore.getState().gitReviewContext).toEqual({ projectId: "project-b" });
  });

  it("re-scopes a right-docked terminal to the focused thread", () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    useSharedSettings.setState({ terminalPosition: "right" });
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: "project-a",
      activeWorktreePath: null,
      tabs: [terminalTabA, terminalTabBWorktree],
      activeTabId: terminalTabA.id,
    });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    focusThread("thread-b");
    rerender();

    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      activeProjectId: "project-b",
      activeWorktreePath: threadBWorktreePath,
      activeTabId: terminalTabBWorktree.id,
    });
  });

  it("shows the empty state instead of spawning a shell for an unscoped thread", () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: "project-a",
      tabs: [terminalTabA],
      activeTabId: terminalTabA.id,
    });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    focusThread("thread-b");
    rerender();

    // No tab exists for thread-b's worktree — the panel stays open with no
    // selected shell rather than starting one.
    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      activeProjectId: "project-b",
      activeWorktreePath: threadBWorktreePath,
      activeTabId: null,
      tabs: [terminalTabA],
    });
  });
});
