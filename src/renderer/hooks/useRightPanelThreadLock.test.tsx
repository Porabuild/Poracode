import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePanelVisibility } from "@/renderer/views/MainView/parts/AppShell/parts/usePanelVisibility";
import {
  syncRightPanelTabToFocusedThread,
  useRightPanelThreadLock,
} from "./useRightPanelThreadLock";

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
      explicitlyOpened: false,
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
    focusThread("thread-b");
    syncRightPanelTabToFocusedThread("git");

    expect(usePanelStore.getState().gitReviewContext).toEqual({
      projectId: "project-b",
      worktreePath: threadB.worktreePath,
    });
    expect(usePanelStore.getState().rightPanelTab).toBe("git");
  });

  it("does not re-scope git while another right-panel tab is active", () => {
    usePanelStore.setState({ rightPanelTab: "usage" });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    focusThread("thread-b");
    rerender();

    expect(usePanelStore.getState().gitReviewContext?.projectId).toBe("project-a");
    expect(usePanelStore.getState().rightPanelTab).toBe("usage");
  });

  it("reconciles a deferred git scope before revealing its tab", () => {
    usePanelStore.setState({ rightPanelTab: "usage" });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    focusThread("thread-b");
    rerender();
    syncRightPanelTabToFocusedThread("git");

    expect(usePanelStore.getState().gitReviewContext).toEqual({
      projectId: "project-b",
      worktreePath: threadB.worktreePath,
    });
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

  it("re-scopes the open bottom terminal to the focused thread", async () => {
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

    await waitFor(() => {
      expect(useDevTerminalStore.getState()).toMatchObject({
        isOpen: true,
        activeProjectId: "project-b",
        activeWorktreePath: threadBWorktreePath,
        activeTabId: terminalTabBWorktree.id,
      });
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

  it("re-scopes an explicitly opened terminal on the next thread switch", async () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    useDevTerminalStore.setState({ tabs: [terminalTabA, terminalTabB] });
    const { rerender } = renderHook(() => useRightPanelThreadLock());

    useDevTerminalStore.getState().openPanel("project-b");
    rerender();

    focusThread("thread-a2");
    rerender();

    await waitFor(() => {
      expect(useDevTerminalStore.getState()).toMatchObject({
        activeProjectId: "project-a",
        activeWorktreePath: null,
        activeTabId: terminalTabA.id,
      });
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
    usePanelStore.setState({ rightPanelTab: "terminal" });
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
    syncRightPanelTabToFocusedThread("terminal");

    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      activeProjectId: "project-b",
      activeWorktreePath: threadBWorktreePath,
      activeTabId: terminalTabBWorktree.id,
    });
  });

  it("does not re-scope a right-docked terminal behind another tab", () => {
    usePanelStore.setState({ rightPanelTab: "git" });
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
      activeProjectId: "project-a",
      activeWorktreePath: null,
      activeTabId: terminalTabA.id,
    });
  });

  it("hides the bottom terminal for a thread without a shell", () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: "project-a",
      tabs: [terminalTabA],
      activeTabId: terminalTabA.id,
    });
    const { result, rerender } = renderHook(() => {
      useRightPanelThreadLock();
      return usePanelVisibility();
    });

    focusThread("thread-b");
    rerender();

    // No tab exists for thread-b's worktree, so the stale bottom panel hides
    // without closing or removing any shells.
    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      activeProjectId: "project-a",
      activeWorktreePath: null,
      activeTabId: terminalTabA.id,
      tabs: [terminalTabA],
    });
    expect(result.current.rightPanelOpen).toBe(false);
  });

  it("shows a bottom terminal explicitly opened for another scope", () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    useDevTerminalStore.setState({ tabs: [terminalTabA] });
    const { result, rerender } = renderHook(() => {
      useRightPanelThreadLock();
      return usePanelVisibility();
    });

    // Focused on thread-a (project-a); the user clicks the terminal icon for
    // project-b's worktree. The scope does not match the focused thread, but
    // the explicit open must reveal the bottom panel immediately.
    useDevTerminalStore.getState().openWorktreePanel("project-b", threadBWorktreePath);
    rerender();

    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      activeProjectId: "project-b",
      activeWorktreePath: threadBWorktreePath,
    });
    expect(result.current.rightPanelOpen).toBe(true);

    // The follow lock cannot re-scope (no tab for thread-b's scope), so the
    // user's explicit terminal stays visible instead of vanishing.
    focusThread("thread-b");
    rerender();
    expect(result.current.rightPanelOpen).toBe(true);
  });

  it("hides the bottom terminal on the new-thread page", () => {
    usePanelStore.setState({ gitReviewContext: null, gitReviewAsPanel: false });
    useDevTerminalStore.setState({
      isOpen: true,
      activeProjectId: "project-a",
      tabs: [terminalTabA],
      activeTabId: terminalTabA.id,
    });
    const { result, rerender } = renderHook(() => {
      useRightPanelThreadLock();
      return usePanelVisibility();
    });

    useAppStore.setState({
      view: { kind: "draft", projectId: "project-a" },
      focusedPaneId: null,
    });
    rerender();

    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      activeProjectId: "project-a",
      tabs: [terminalTabA],
    });
    expect(result.current.rightPanelOpen).toBe(false);

    focusThread("thread-a");
    rerender();

    expect(result.current.rightPanelOpen).toBe(true);
  });
});
