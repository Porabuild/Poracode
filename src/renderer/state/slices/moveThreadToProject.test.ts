import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../appStore";

function currentThread(threadId: string) {
  return useAppStore.getState().threads.find((thread) => thread.id === threadId);
}

describe("moveThreadToProject", () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
    }));
  });

  function threadInWorktree() {
    const sourceProject = useAppStore
      .getState()
      .addProject({ kind: "windows", path: "C:\\repo-a" });
    const targetProject = useAppStore
      .getState()
      .addProject({ kind: "windows", path: "C:\\repo-b" });
    const thread = useAppStore.getState().createThread({
      projectId: sourceProject.id,
      agentKind: "claude",
      config: { model: "claude-opus-5", effort: "high" },
      prompt: "start the task",
      presentationMode: "gui",
      worktreePath: "C:\\repo-a\\.poracode\\worktrees\\feature",
      worktreeBranch: "poracode/feature",
    });
    return { sourceProject, targetProject, thread };
  }

  it("moves the thread and clears its worktree fields", () => {
    const { targetProject, thread } = threadInWorktree();

    useAppStore.getState().moveThreadToProject(thread.id, targetProject.id);

    const after = currentThread(thread.id)!;
    expect(after.projectId).toBe(targetProject.id);
    expect(after.worktreePath).toBeUndefined();
    expect(after.worktreeBranch).toBeUndefined();
    expect("worktreePath" in after).toBe(false);
    expect("worktreeBranch" in after).toBe(false);
  });

  it("leaves other threads untouched", () => {
    const { sourceProject, targetProject, thread } = threadInWorktree();
    const otherThread = useAppStore.getState().createThread({
      projectId: sourceProject.id,
      agentKind: "claude",
      config: { model: "claude-opus-5", effort: "high" },
      prompt: "another task",
      presentationMode: "gui",
    });
    const otherBefore = currentThread(otherThread.id)!;

    useAppStore.getState().moveThreadToProject(thread.id, targetProject.id);

    const otherAfter = currentThread(otherThread.id)!;
    expect(otherAfter).toEqual(otherBefore);
  });

  it("leaves everything but projectId and the worktree fields unchanged", () => {
    const sourceProject = useAppStore
      .getState()
      .addProject({ kind: "windows", path: "C:\\repo-a" });
    const targetProject = useAppStore
      .getState()
      .addProject({ kind: "windows", path: "C:\\repo-b" });
    const thread = useAppStore.getState().createThread({
      projectId: sourceProject.id,
      agentKind: "claude",
      config: { model: "claude-opus-5", effort: "high" },
      prompt: "start the task",
      presentationMode: "gui",
      title: "Custom title",
    });
    useAppStore.getState().starThread(thread.id);
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    const before = currentThread(thread.id)!;
    expect(before.title).toBe("Custom title");
    expect(before.starred).toBe(true);
    expect(before.status).toBe("idle");
    expect(before.config).toEqual({ model: "claude-opus-5", effort: "high" });

    useAppStore.getState().moveThreadToProject(thread.id, targetProject.id);

    const after = currentThread(thread.id)!;
    expect(after.projectId).toBe(targetProject.id);
    expect(after.title).toBe(before.title);
    expect(after.starred).toBe(before.starred);
    expect(after.status).toBe(before.status);
    expect(after.config).toEqual(before.config);
  });

  it("is a no-op for an unknown thread", () => {
    const before = useAppStore.getState().threads;
    useAppStore.getState().moveThreadToProject("missing-thread", "some-project");
    expect(useAppStore.getState().threads).toBe(before);
  });
});
