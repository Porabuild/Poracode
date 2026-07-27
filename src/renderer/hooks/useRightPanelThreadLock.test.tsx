import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
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
const threadB = makeThread({
  id: "thread-b",
  projectId: "project-b",
  worktreePath: "/repo-b/.poracode/worktrees/feature",
});

function focusThread(threadId: string) {
  useAppStore.setState((state) => ({
    ...state,
    threads: [threadA, threadB],
    view: { kind: "thread", panes: [threadId] },
    focusedPaneId: threadId,
  }));
}

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
});
