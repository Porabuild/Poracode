import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { findPaneSlotId, type PaneLayout } from "@/shared/paneLayout";
import {
  readStoredSizes,
  splitStorageKey,
  writeStoredSizes,
} from "@/renderer/components/layout/paneSizeStorage";
import { useAppStore } from "./appStore";

describe("appStore runtime config sync", () => {
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

  it("applies resolved runtime config onto the stored thread", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });

    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
        effort: "low",
      },
      prompt: "hello",
    });

    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      config: {
        model: "gpt-5.4",
        effort: "high",
      },
      canResumeWithConfig: true,
    });

    expect(useAppStore.getState().threads[0]?.config.effort).toBe("high");
  });

  it("tags an existing thread with worktree metadata (set-worktree command path)", () => {
    const project = useAppStore.getState().addProject({ kind: "posix", path: "/repo" });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "claude",
      config: { model: "sonnet" },
      prompt: "hi",
    });
    expect(useAppStore.getState().threads[0]?.worktreePath).toBeUndefined();

    useAppStore.getState().setThreadWorktree(thread.id, "/repo/wt", "feature/x");

    const updated = useAppStore.getState().threads.find((t) => t.id === thread.id);
    expect(updated?.worktreePath).toBe("/repo/wt");
    expect(updated?.worktreeBranch).toBe("feature/x");
  });

  it("ensures the hidden Home project without replacing its draft config", () => {
    const location = { kind: "windows" as const, path: "C:\\Users\\demo" };
    const first = useAppStore.getState().ensureHomeProject(location);

    expect(first).toMatchObject({
      id: HOME_PROJECT_ID,
      name: HOME_PROJECT_NAME,
      location,
      disabled: true,
    });

    useAppStore.getState().updateProjectDraftConfig(HOME_PROJECT_ID, {
      agentKind: "codex",
      model: "gpt-5.5",
      effort: "high",
      mode: "agent",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      worktreeMode: false,
    });

    const second = useAppStore.getState().ensureHomeProject(location);
    expect(second.lastDraftConfig?.model).toBe("gpt-5.5");
    expect(useAppStore.getState().projects).toHaveLength(1);
  });

  it("preserves a user's pending composer change when runtime echoes the prior config", () => {
    // Reproduces the bug where a thread-state event from the supervisor (which
    // re-sends `session.config` on every status update) clobbered a pending
    // composer change made while the agent was working.
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });

    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4", effort: "low" },
      prompt: "hello",
    });

    // Initial runtime sync seeds the supervisor's known config.
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      config: { model: "gpt-5.4", effort: "low" },
      canResumeWithConfig: false,
    });

    // User flips effort in the composer mid-run.
    useAppStore.getState().updateThreadConfig(thread.id, {
      model: "gpt-5.4",
      effort: "high",
    });
    expect(useAppStore.getState().threads[0]?.config.effort).toBe("high");

    // Supervisor emits another status update echoing the *old* session.config.
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "needs_approval",
      attention: "needs_approval",
      config: { model: "gpt-5.4", effort: "low" },
      canResumeWithConfig: false,
    });

    expect(useAppStore.getState().threads[0]?.config.effort).toBe("high");
  });

  it("keeps updatedAt stable and uses doneAt when marking old threads done before auto-archive", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "hello",
    });
    useAppStore.setState((state) => ({
      threads: state.threads.map((t) =>
        t.id === thread.id ? { ...t, updatedAt: "2026-04-01T00:00:00.000Z" } : t,
      ),
    }));

    useAppStore.getState().markThreadDone(thread.id);
    useAppStore.getState().archiveOldDoneThreads(7);

    const stored = useAppStore.getState().threads.find((t) => t.id === thread.id);
    expect(stored?.done).toBe(true);
    expect(stored?.archived).toBe(false);
    expect(stored?.updatedAt).toBe("2026-04-01T00:00:00.000Z");
    expect(stored?.doneAt).toBe("2026-05-10T12:00:00.000Z");
  });

  it("accepts a real runtime config change after the pending edit is submitted", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });

    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4", effort: "low" },
      prompt: "hello",
    });

    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      config: { model: "gpt-5.4", effort: "low" },
      canResumeWithConfig: false,
    });

    // Once the user submits, the supervisor's session.config catches up and
    // the next echo carries the new effort — that should land.
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      config: { model: "gpt-5.4", effort: "high" },
      canResumeWithConfig: false,
    });

    expect(useAppStore.getState().threads[0]?.config.effort).toBe("high");
  });

  it("preserves the existing thread config when runtime sync omits it", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });

    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
        effort: "low",
      },
      prompt: "hello",
    });

    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });

    expect(useAppStore.getState().threads[0]?.config.effort).toBe("low");
  });

  it("updates the saved draft config when only context size, fast, and thinking change", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });

    useAppStore.getState().updateProjectDraftConfig(project.id, {
      agentKind: "claude",
      model: "claude-opus-4-7",
      effort: "high",
      contextSize: "1m",
      mode: "agent",
    });

    useAppStore.getState().updateProjectDraftConfig(project.id, {
      agentKind: "claude",
      model: "claude-opus-4-7",
      effort: "high",
      contextSize: "200k",
      fast: true,
      thinking: true,
      mode: "agent",
    });

    expect(useAppStore.getState().projects[0]?.lastDraftConfig).toMatchObject({
      contextSize: "200k",
      fast: true,
      thinking: true,
    });
  });

  it("createThread sets view to single pane", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });

    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "hello",
    });

    const view = useAppStore.getState().view;
    expect(view).toEqual({ kind: "thread", panes: [thread.id] });
  });

  it("opens schedules as a main view", () => {
    useAppStore.getState().openSchedules();
    expect(useAppStore.getState().view).toEqual({ kind: "schedules" });

    useAppStore.getState().openHome();
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
  });

  it("opens pull requests as a main view", () => {
    useAppStore.getState().openPullRequests();
    expect(useAppStore.getState().view).toEqual({ kind: "pullRequests" });
  });

  it("openThread replaces panes[0] and keeps secondary panes", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });

    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    const t2 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "b",
    });

    // Set up split view manually
    useAppStore.setState((s) => ({
      ...s,
      view: { kind: "thread", panes: [t1.id, t2.id] as [string, ...string[]] },
    }));

    const threadThree = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "c",
    });

    // createThread replaces entirely
    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [threadThree.id],
    });

    // Set up split again, then openThread replaces panes[0]
    useAppStore.setState((s) => ({
      ...s,
      view: { kind: "thread", panes: [t1.id, t2.id] as [string, ...string[]] },
    }));

    useAppStore.getState().openThread(threadThree.id);
    const view = useAppStore.getState().view;
    expect(view.kind === "thread" && view.panes).toEqual([threadThree.id, t2.id]);
    expect(view.kind === "thread" && view.paneLayout).toBeTruthy();
    if (view.kind !== "thread" || !view.paneLayout) return;
    expect(findPaneSlotId(view.paneLayout, threadThree.id)).toBe(t1.id);
  });

  it("openThread is no-op when thread is already in panes", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    useAppStore.getState().openThread(t1.id);
    expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [t1.id] });
  });

  it("openThreadSideBySide adds a second pane", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });
    const t2 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "b",
    });

    // t2 is now the sole pane (createThread replaces)
    useAppStore.getState().openThreadSideBySide(t1.id);
    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [t2.id, t1.id],
    });
  });

  it("openThreadSideBySide allows more than 3 panes", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(
        useAppStore.getState().createThread({
          projectId: project.id,
          agentKind: "codex",
          config: { model: "m" },
          prompt: `t${i}`,
        }).id,
      );
    }

    // Set up 3 panes manually, then add a 4th and 5th
    useAppStore.setState((s) => ({
      ...s,
      view: { kind: "thread", panes: [ids[0]!, ids[1]!, ids[2]!] as [string, ...string[]] },
    }));

    useAppStore.getState().openThreadSideBySide(ids[3]!);
    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [ids[0], ids[1], ids[2], ids[3]],
    });

    useAppStore.getState().openThreadSideBySide(ids[4]!);
    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [ids[0], ids[1], ids[2], ids[3], ids[4]],
    });
  });

  it("openThreadSideBySide is no-op for already visible thread", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    useAppStore.getState().openThreadSideBySide(t1.id);
    expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [t1.id] });
  });

  it("closePane removes a pane and preserves remaining", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });
    const t2 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "b",
    });

    useAppStore.setState((s) => ({
      ...s,
      view: { kind: "thread", panes: [t1.id, t2.id] as [string, ...string[]] },
    }));

    useAppStore.getState().closePane(t1.id);
    expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [t2.id] });
  });

  it("closePane navigates home when last pane is closed", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    useAppStore.getState().closePane(t1.id);
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
  });

  it("deleteThread removes from panes array", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });
    const t2 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "b",
    });

    useAppStore.setState((s) => ({
      ...s,
      view: { kind: "thread", panes: [t1.id, t2.id] as [string, ...string[]] },
    }));

    useAppStore.getState().deleteThread(t1.id);
    expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [t2.id] });
  });

  it("working→idle on non-visible thread sets finished", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    // Switch view away from t1
    useAppStore.setState((s) => ({ ...s, view: { kind: "home" } }));

    // Simulate working → idle
    useAppStore.getState().updateThreadRuntime(t1.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    expect(useAppStore.getState().threads[0]?.status).toBe("working");
    expect(useAppStore.getState().threads[0]?.activeTurnStartedAt).toBe("2026-05-01T12:00:00.000Z");

    vi.setSystemTime(new Date("2026-05-01T12:01:15.000Z"));
    useAppStore.getState().updateThreadRuntime(t1.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    expect(useAppStore.getState().threads[0]?.status).toBe("finished");
    expect(useAppStore.getState().threads[0]?.activeTurnStartedAt).toBeUndefined();
    expect(useAppStore.getState().threads[0]?.lastTurnStartedAt).toBe("2026-05-01T12:00:00.000Z");
    expect(useAppStore.getState().threads[0]?.lastTurnEndedAt).toBe("2026-05-01T12:01:15.000Z");
  });

  it("working→idle on visible thread stays idle", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    // t1 is visible (createThread sets view to its pane)
    useAppStore.getState().updateThreadRuntime(t1.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    useAppStore.getState().updateThreadRuntime(t1.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
  });

  it("preserves the stored session ref when runtime re-emits the same provider id", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "gemini",
      config: { model: "gemini-test" },
      prompt: "a",
    });

    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      sessionRef: {
        providerSessionId: "gemini-session-1",
        discoveredAt: "2026-05-01T12:00:00.000Z",
      },
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      sessionRef: {
        providerSessionId: "gemini-session-1",
        discoveredAt: "2026-05-01T12:05:00.000Z",
      },
    });

    expect(useAppStore.getState().threads[0]?.sessionRef).toEqual({
      providerSessionId: "gemini-session-1",
      discoveredAt: "2026-05-01T12:00:00.000Z",
    });
  });

  it("openThread on finished thread transitions to idle", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    // Make finished: switch away, then working→idle
    useAppStore.setState((s) => ({ ...s, view: { kind: "home" } }));
    useAppStore.getState().updateThreadRuntime(t1.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    useAppStore.getState().updateThreadRuntime(t1.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    expect(useAppStore.getState().threads[0]?.status).toBe("finished");

    // Open the thread — should transition to idle
    useAppStore.getState().openThread(t1.id);
    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
  });

  it("supervisor re-emit of idle preserves finished for non-visible thread", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const t1 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    // Make finished
    useAppStore.setState((s) => ({ ...s, view: { kind: "home" } }));
    useAppStore.getState().updateThreadRuntime(t1.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    useAppStore.getState().updateThreadRuntime(t1.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    expect(useAppStore.getState().threads[0]?.status).toBe("finished");

    // Supervisor re-emits idle — should stay finished
    useAppStore.getState().updateThreadRuntime(t1.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    expect(useAppStore.getState().threads[0]?.status).toBe("finished");
  });

  it("new live runtime overwrites stale active turn timing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T09:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    useAppStore.setState((state) => ({
      ...state,
      threads: state.threads.map((current) =>
        current.id === thread.id
          ? {
              ...current,
              status: "inactive",
              attention: "none",
              activeTurnStartedAt: "2026-04-01T08:00:00.000Z",
            }
          : current,
      ),
    }));

    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: true,
    });

    expect(useAppStore.getState().threads[0]?.activeTurnStartedAt).toBe("2026-05-02T09:00:00.000Z");
  });

  it("reconcileRuntimeSnapshots preserves the live turn start across hydration", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T09:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    useAppStore.setState((state) => ({
      ...state,
      threads: state.threads.map((current) =>
        current.id === thread.id
          ? {
              ...current,
              status: "inactive",
              attention: "none",
              activeTurnStartedAt: "2026-05-02T08:57:00.000Z",
            }
          : current,
      ),
    }));

    useAppStore.getState().reconcileRuntimeSnapshots([
      {
        threadId: thread.id,
        status: "working",
        attention: "working",
        canResumeWithConfig: true,
      },
    ]);

    expect(useAppStore.getState().threads[0]?.status).toBe("working");
    expect(useAppStore.getState().threads[0]?.activeTurnStartedAt).toBe("2026-05-02T08:57:00.000Z");
  });

  it("markThreadExited finalizes an active turn", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
    });

    vi.setSystemTime(new Date("2026-05-01T12:00:30.000Z"));
    useAppStore.getState().markThreadExited(thread.id);

    expect(useAppStore.getState().threads[0]?.status).toBe("inactive");
    expect(useAppStore.getState().threads[0]?.lastTurnStartedAt).toBe("2026-05-01T12:00:00.000Z");
    expect(useAppStore.getState().threads[0]?.lastTurnEndedAt).toBe("2026-05-01T12:00:30.000Z");
  });

  it("closes visible GUI idle updates even before assistant output", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
      presentationMode: "gui",
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });

    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "user-1",
      itemType: "user_message",
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: "user-1",
    });

    vi.setSystemTime(new Date("2026-05-01T12:00:01.000Z"));
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });

    expect(useAppStore.getState().threads[0]).toMatchObject({
      status: "idle",
      attention: "none",
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:00:01.000Z",
    });
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[thread.id]).toEqual([
      {
        startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:00:01.000Z").getTime(),
        anchorItemId: null,
      },
    ]);
  });

  it("closes an offscreen GUI thread when the transcript has not been hydrated", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
      presentationMode: "gui",
    });

    useAppStore.setState((state) => ({ ...state, view: { kind: "home" } }));
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });

    vi.setSystemTime(new Date("2026-05-01T12:00:05.000Z"));
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });

    expect(useAppStore.getState().threads[0]).toMatchObject({
      status: "finished",
      attention: "none",
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:00:05.000Z",
    });
  });

  it("lets a forced GUI idle close an interrupted turn before assistant output", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "generic-gui",
      config: { model: "m" },
      prompt: "a",
      presentationMode: "gui",
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });

    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "user-1",
      itemType: "user_message",
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: "user-1",
    });

    vi.setSystemTime(new Date("2026-05-01T12:00:01.000Z"));
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      forceCloseActiveTurn: true,
    });

    expect(useAppStore.getState().threads[0]).toMatchObject({
      status: "idle",
      attention: "none",
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:00:01.000Z",
    });
  });

  it("anchors completed turns to assistant output when present", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
      presentationMode: "gui",
    });

    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "user-1",
      itemType: "user_message",
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: "user-1",
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "assistant-1",
      itemType: "assistant_message",
    });

    vi.setSystemTime(new Date("2026-05-01T12:00:30.000Z"));
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });

    expect(useAppStore.getState().runtimeCompletedTurnsByThread[thread.id]?.[0]).toMatchObject({
      anchorItemId: "assistant-1",
    });
  });

  it("reopens a GUI turn when structured runtime activity arrives after a premature idle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "claude",
      config: { model: "m" },
      prompt: "a",
      presentationMode: "gui",
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "assistant-1",
      itemType: "assistant_message",
    });

    vi.setSystemTime(new Date("2026-05-01T12:00:50.000Z"));
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    expect(useAppStore.getState().threads[0]).toMatchObject({
      status: "idle",
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:00:50.000Z",
    });
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[thread.id]).toHaveLength(1);

    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "reasoning-1",
      itemType: "reasoning",
    });

    expect(useAppStore.getState().threads[0]).toMatchObject({
      status: "working",
      attention: "working",
      activeTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: undefined,
    });
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[thread.id]).toBeUndefined();

    vi.setSystemTime(new Date("2026-05-01T12:01:15.000Z"));
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });

    expect(useAppStore.getState().runtimeCompletedTurnsByThread[thread.id]?.[0]).toMatchObject({
      startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
      endedAt: new Date("2026-05-01T12:01:15.000Z").getTime(),
      anchorItemId: "reasoning-1",
    });
  });

  it("does not reopen a settled GUI turn when trailing activity arrives after turn.completed", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "claude",
      config: { model: "m" },
      prompt: "a",
      presentationMode: "gui",
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "turn.started",
      threadId: thread.id,
      turnId: "turn-1",
    });
    // An item that stays open across the turn boundary, mirroring the persistent
    // plan/todo item that `closeClaudeOpenItems` deliberately leaves open.
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "plan-1",
      itemType: "reasoning",
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: true,
    });
    // Turn settles: turn.completed is flushed before the idle status.
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "turn.completed",
      threadId: thread.id,
      turnId: "turn-1",
      state: "completed",
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    expect(useAppStore.getState().threads[0]?.status).toBe("idle");

    // A trailing live event for the already-settled turn lands after idle (the
    // post-idle IPC race). It must NOT flip the thread back to "working".
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.updated",
      threadId: thread.id,
      itemId: "plan-1",
      payload: {},
    });

    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
  });

  it("still reopens a GUI turn for live activity while the turn is still open", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "claude",
      config: { model: "m" },
      prompt: "a",
      presentationMode: "gui",
    });
    // Turn is open (turn.started, no turn.completed yet) but a premature idle
    // arrives — the safety net must still reopen when real activity follows.
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "turn.started",
      threadId: thread.id,
      turnId: "turn-1",
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    expect(useAppStore.getState().threads[0]?.status).toBe("idle");

    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "assistant-1",
      itemType: "assistant_message",
    });

    expect(useAppStore.getState().threads[0]).toMatchObject({
      status: "working",
      attention: "working",
    });
  });

  it("does not add sub-second completed turns", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "a",
      presentationMode: "gui",
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "assistant-1",
      itemType: "assistant_message",
    });

    vi.setSystemTime(new Date("2026-05-01T12:00:00.700Z"));
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });

    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[thread.id]).toBeUndefined();
  });
});

describe("markThreadDone / unmarkThreadDone", () => {
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

  function createTestThread() {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    return useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "hello",
    });
  }

  it("createThread initializes done as false", () => {
    const thread = createTestThread();
    expect(thread.done).toBe(false);
  });

  it("markThreadDone sets done to true", () => {
    const thread = createTestThread();
    useAppStore.getState().markThreadDone(thread.id);
    expect(useAppStore.getState().threads[0]?.done).toBe(true);
  });

  it("markThreadDone preserves updatedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const thread = createTestThread();
    useAppStore.setState((state) => ({
      threads: state.threads.map((t) =>
        t.id === thread.id ? { ...t, updatedAt: "2026-04-01T00:00:00.000Z" } : t,
      ),
    }));

    useAppStore.getState().markThreadDone(thread.id);

    const stored = useAppStore.getState().threads[0];
    expect(stored?.done).toBe(true);
    expect(stored?.updatedAt).toBe("2026-04-01T00:00:00.000Z");
    expect(stored?.doneAt).toBe("2026-05-10T12:00:00.000Z");
  });

  it("unmarkThreadDone sets done to false", () => {
    const thread = createTestThread();
    useAppStore.getState().markThreadDone(thread.id);
    expect(useAppStore.getState().threads[0]?.done).toBe(true);
    useAppStore.getState().unmarkThreadDone(thread.id);
    expect(useAppStore.getState().threads[0]?.done).toBe(false);
  });

  it("unmarkThreadDone preserves updatedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const thread = createTestThread();
    useAppStore.setState((state) => ({
      threads: state.threads.map((t) =>
        t.id === thread.id
          ? {
              ...t,
              done: true,
              doneAt: "2026-05-01T00:00:00.000Z",
              updatedAt: "2026-04-01T00:00:00.000Z",
            }
          : t,
      ),
    }));

    useAppStore.getState().unmarkThreadDone(thread.id);

    const stored = useAppStore.getState().threads[0];
    expect(stored?.done).toBe(false);
    expect(stored?.updatedAt).toBe("2026-04-01T00:00:00.000Z");
    expect(stored?.doneAt).toBeUndefined();
  });

  it("markThreadDone is a no-op if already done", () => {
    const thread = createTestThread();
    useAppStore.getState().markThreadDone(thread.id);
    const before = useAppStore.getState().threads[0]?.updatedAt;
    useAppStore.getState().markThreadDone(thread.id);
    expect(useAppStore.getState().threads[0]?.updatedAt).toBe(before);
  });

  it("openThread clears done when thread becomes visible in a pane", () => {
    const thread = createTestThread();
    useAppStore.getState().markThreadDone(thread.id);
    expect(useAppStore.getState().threads[0]?.done).toBe(true);

    useAppStore.getState().openThread(thread.id);
    expect(useAppStore.getState().threads[0]?.done).toBe(false);
  });

  it("markThreadExited preserves done flag", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const thread = createTestThread();
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    useAppStore.getState().markThreadDone(thread.id);
    expect(useAppStore.getState().threads[0]?.done).toBe(true);

    vi.setSystemTime(new Date("2026-05-01T12:00:30.000Z"));
    useAppStore.getState().markThreadExited(thread.id);
    expect(useAppStore.getState().threads[0]?.done).toBe(true);
    expect(useAppStore.getState().threads[0]?.status).toBe("inactive");
  });
});

describe("grid layout actions", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
    }));
  });

  function createThreads(count: number) {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(
        useAppStore.getState().createThread({
          projectId: project.id,
          agentKind: "codex",
          config: { model: "m" },
          prompt: `t${i}`,
        }).id,
      );
    }
    return ids;
  }

  it("replacePaneAtIndex replaces pane at any index", () => {
    const ids = createThreads(4);
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!] as [string, ...string[]],
      },
    }));

    useAppStore.getState().replacePaneAtIndex(ids[3]!, 1);
    const view = useAppStore.getState().view;
    expect(view.kind === "thread" && view.panes).toEqual([ids[0], ids[3], ids[2]]);
    expect(view.kind === "thread" && view.paneLayout).toBeTruthy();
    if (view.kind !== "thread" || !view.paneLayout) return;
    expect(findPaneSlotId(view.paneLayout, ids[3]!)).toBe(ids[1]);
  });

  it("movePaneToIndex reorders pane position", () => {
    const ids = createThreads(4);
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!, ids[3]!] as [string, ...string[]],
      },
    }));

    useAppStore.getState().movePaneToIndex(ids[0]!, 4);
    const view = useAppStore.getState().view;
    expect(view).toEqual({
      kind: "thread",
      panes: [ids[1], ids[2], ids[3], ids[0]],
    });
  });

  it("insertPaneAtIndex with left/right edge adds to existing row", () => {
    const ids = createThreads(3);
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!] as [string, ...string[]],
      },
    }));

    // Insert right → stays in same row
    useAppStore.getState().insertPaneAtIndex(ids[1]!, 1, "right");
    const view1 = useAppStore.getState().view;
    expect(view1).toEqual({ kind: "thread", panes: [ids[0], ids[1]] });
    // No rowLayout set yet (single row default)
  });

  it("insertPaneAtIndex with top/bottom edge creates new row", () => {
    const ids = createThreads(3);
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!] as [string, ...string[]],
      },
    }));

    // Insert bottom → creates 2 rows
    useAppStore.getState().insertPaneAtIndex(ids[1]!, 1, "bottom");
    const view1 = useAppStore.getState().view;
    expect(view1.kind === "thread" && view1.rowLayout).toEqual([1, 1]);
    expect(view1.kind === "thread" && view1.panes).toEqual([ids[0], ids[1]]);

    // Insert right of top pane → row 0 grows to 2 cols
    useAppStore.getState().insertPaneAtIndex(ids[2]!, 1, "right");
    const view2 = useAppStore.getState().view;
    expect(view2.kind === "thread" && view2.rowLayout).toEqual([2, 1]);
    expect(view2.kind === "thread" && view2.panes).toEqual([ids[0], ids[2], ids[1]]);
  });

  it("closePane removes from correct row in rowLayout", () => {
    const ids = createThreads(3);
    // rowLayout [2, 1] = Row 0: [A,B], Row 1: [C]
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!] as [string, ...string[]],
        rowLayout: [2, 1],
      },
    }));

    // Close B (index 1) from row 0 → row 0 shrinks to 1 col
    useAppStore.getState().closePane(ids[1]!);
    const view = useAppStore.getState().view;
    expect(view.kind === "thread" && view.rowLayout).toEqual([1, 1]);
    expect(view.kind === "thread" && view.panes).toEqual([ids[0], ids[2]]);
  });

  it("closePane removes empty rows from rowLayout", () => {
    const ids = createThreads(2);
    // rowLayout [1, 1] = 2 rows
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!] as [string, ...string[]],
        rowLayout: [1, 1],
      },
    }));

    useAppStore.getState().closePane(ids[0]!);
    const view = useAppStore.getState().view;
    // Row 0 removed, only row 1 remains
    expect(view.kind === "thread" && view.rowLayout).toEqual([1]);
    expect(view.kind === "thread" && view.panes).toEqual([ids[1]]);
  });

  it("openThreadSideBySide preserves rowLayout", () => {
    const ids = createThreads(4);
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!] as [string, ...string[]],
        rowLayout: [1, 1],
      },
    }));

    // Appends to last row
    useAppStore.getState().openThreadSideBySide(ids[2]!);
    const view = useAppStore.getState().view;
    expect(view.kind === "thread" && view.rowLayout).toEqual([1, 2]);
    expect(view.kind === "thread" && view.panes).toEqual([ids[0], ids[1], ids[2]]);
  });

  it("movePaneToIndex can split a full-width row into two columns", () => {
    const ids = createThreads(4);
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!, ids[3]!] as [string, ...string[]],
        rowLayout: [3, 1],
      },
    }));

    useAppStore.getState().movePaneToIndex(ids[1]!, 3, "left");
    const view = useAppStore.getState().view;
    expect(view.kind === "thread" && view.rowLayout).toEqual([2, 2]);
    expect(view.kind === "thread" && view.panes).toEqual([ids[0], ids[2], ids[1], ids[3]]);
  });

  it("movePaneToIndex can insert a row between two existing rows", () => {
    const ids = createThreads(4);
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!, ids[3]!] as [string, ...string[]],
        rowLayout: [2, 2],
      },
    }));

    useAppStore.getState().movePaneToIndex(ids[3]!, 2, "top");
    const view = useAppStore.getState().view;
    expect(view.kind === "thread" && view.rowLayout).toEqual([2, 1, 1]);
    expect(view.kind === "thread" && view.panes).toEqual([ids[0], ids[1], ids[3], ids[2]]);
  });

  it("splitPaneById can split only the middle pane into two rows", () => {
    const ids = createThreads(4);
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!] as [string, ...string[]],
      },
    }));

    useAppStore.getState().splitPaneById(ids[3]!, ids[1]!, "bottom");
    const view = useAppStore.getState().view;
    expect(view.kind).toBe("thread");
    expect(view.kind === "thread" && view.panes).toEqual([ids[0], ids[1], ids[3], ids[2]]);
    expect(view.kind === "thread" && view.paneLayout).toEqual({
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: ids[0] },
        {
          kind: "split",
          axis: "horizontal",
          children: [
            { kind: "leaf", paneId: ids[1] },
            { kind: "leaf", paneId: ids[3] },
          ],
        },
        { kind: "leaf", paneId: ids[2] },
      ],
    });
  });

  it("splitPaneById preserves ancestor split sizes", () => {
    const ids = createThreads(3);
    const initialLayout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: ids[0]! },
        { kind: "leaf", paneId: ids[1]! },
      ],
    };
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!] as [string, ...string[]],
        paneLayout: initialLayout,
      },
    }));
    writeStoredSizes(splitStorageKey(initialLayout, "vertical"), [40, 60]);

    useAppStore.getState().splitPaneById(ids[2]!, ids[1]!, "bottom");

    const view = useAppStore.getState().view;
    expect(view.kind).toBe("thread");
    if (view.kind !== "thread" || !view.paneLayout) return;
    expect(readStoredSizes(splitStorageKey(view.paneLayout, "vertical"), 2)).toEqual([40, 60]);
  });

  it("closePane preserves ancestor split sizes", () => {
    const ids = createThreads(3);
    const initialLayout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: ids[0]! },
        {
          kind: "split",
          axis: "horizontal",
          children: [
            { kind: "leaf", paneId: ids[1]! },
            { kind: "leaf", paneId: ids[2]! },
          ],
        },
      ],
    };
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!] as [string, ...string[]],
        paneLayout: initialLayout,
      },
    }));
    writeStoredSizes(splitStorageKey(initialLayout, "vertical"), [35, 65]);

    useAppStore.getState().closePane(ids[2]!);

    const view = useAppStore.getState().view;
    expect(view.kind).toBe("thread");
    if (view.kind !== "thread" || !view.paneLayout) return;
    expect(readStoredSizes(splitStorageKey(view.paneLayout, "vertical"), 2)).toEqual([35, 65]);
  });

  it("insertPaneAtLayoutTarget can create a global second row", () => {
    const ids = createThreads(4);
    useAppStore.setState((s) => ({
      ...s,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!] as [string, ...string[]],
      },
    }));

    useAppStore
      .getState()
      .insertPaneAtLayoutTarget(ids[3]!, { path: [], axis: "horizontal", index: 1 });
    const view = useAppStore.getState().view;
    expect(view.kind).toBe("thread");
    expect(view.kind === "thread" && view.panes).toEqual([ids[0], ids[1], ids[2], ids[3]]);
    expect(view.kind === "thread" && view.paneLayout).toEqual({
      kind: "split",
      axis: "horizontal",
      children: [
        {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: ids[0] },
            { kind: "leaf", paneId: ids[1] },
            { kind: "leaf", paneId: ids[2] },
          ],
        },
        { kind: "leaf", paneId: ids[3] },
      ],
    });
  });

  it("keeps a secondary pane slot through replacement, move, and swap", () => {
    const ids = createThreads(4);
    useAppStore.setState((state) => ({
      ...state,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!] as [string, ...string[]],
        paneLayout: {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: ids[0]!, slotId: "slot-a" },
            { kind: "leaf", paneId: ids[1]!, slotId: "slot-b" },
            { kind: "leaf", paneId: ids[2]!, slotId: "slot-c" },
          ],
        },
      },
    }));

    useAppStore.getState().replacePaneById(ids[3]!, ids[1]!);
    let view = useAppStore.getState().view;
    expect(view.kind === "thread" && view.paneLayout).toBeTruthy();
    if (view.kind !== "thread" || !view.paneLayout) return;
    expect(findPaneSlotId(view.paneLayout, ids[3]!)).toBe("slot-b");

    useAppStore.getState().movePaneToLayoutTarget(ids[3]!, { paneId: ids[2]!, edge: "right" });
    view = useAppStore.getState().view;
    if (view.kind !== "thread" || !view.paneLayout) return;
    expect(findPaneSlotId(view.paneLayout, ids[3]!)).toBe("slot-b");

    useAppStore.getState().swapPanes(ids[3]!, ids[0]!);
    view = useAppStore.getState().view;
    if (view.kind !== "thread" || !view.paneLayout) return;
    expect(findPaneSlotId(view.paneLayout, ids[3]!)).toBe("slot-b");
    expect(findPaneSlotId(view.paneLayout, ids[0]!)).toBe("slot-a");
  });
});

describe("group view layout restore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      groupLayouts: {},
      view: { kind: "home" },
    }));
  });

  it("restores the saved pane layout after closing and reopening a reordered group", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const groupId = "group-1";
    const ids = Array.from(
      { length: 4 },
      (_, index) =>
        useAppStore.getState().createThread({
          projectId: project.id,
          agentKind: "codex",
          config: { model: "m" },
          prompt: `t${index}`,
          groupId,
          groupName: "Group 1",
        }).id,
    );

    useAppStore.setState((state) => ({
      ...state,
      view: {
        kind: "thread",
        panes: [ids[0]!, ids[1]!, ids[2]!, ids[3]!] as [string, ...string[]],
        paneLayout: {
          kind: "split",
          axis: "horizontal",
          children: [
            {
              kind: "split",
              axis: "vertical",
              children: [
                { kind: "leaf", paneId: ids[0]! },
                { kind: "leaf", paneId: ids[1]! },
              ],
            },
            {
              kind: "split",
              axis: "vertical",
              children: [
                { kind: "leaf", paneId: ids[2]! },
                { kind: "leaf", paneId: ids[3]! },
              ],
            },
          ],
        },
        activeGroupId: groupId,
      },
    }));

    useAppStore.getState().reorderThreads(ids[3]!, ids[0]!, "before");
    useAppStore.getState().closeGroupView();
    useAppStore.getState().openGroupView(groupId);

    const view = useAppStore.getState().view;
    expect(view.kind).toBe("thread");
    expect(view.kind === "thread" && view.panes).toEqual([ids[0], ids[1], ids[2], ids[3]]);
    expect(view.kind === "thread" && view.paneLayout).toEqual({
      kind: "split",
      axis: "horizontal",
      children: [
        {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: ids[0] },
            { kind: "leaf", paneId: ids[1] },
          ],
        },
        {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: ids[2] },
            { kind: "leaf", paneId: ids[3] },
          ],
        },
      ],
    });
  });

  it("restores the saved pane layout when clicking a thread inside a group from outside the group view", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const groupId = "group-1";
    const ids = Array.from(
      { length: 4 },
      (_, index) =>
        useAppStore.getState().createThread({
          projectId: project.id,
          agentKind: "codex",
          config: { model: "m" },
          prompt: `t${index}`,
          groupId,
          groupName: "Group 1",
        }).id,
    );

    const savedLayout: PaneLayout = {
      kind: "split",
      axis: "horizontal",
      children: [
        {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: ids[0]! },
            { kind: "leaf", paneId: ids[1]! },
          ],
        },
        {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: ids[2]! },
            { kind: "leaf", paneId: ids[3]! },
          ],
        },
      ],
    };

    useAppStore.setState((state) => ({
      ...state,
      view: { kind: "home" as const },
      groupLayouts: {
        [groupId]: {
          panes: [ids[0]!, ids[1]!, ids[2]!, ids[3]!],
          paneLayout: savedLayout,
        },
      },
    }));

    useAppStore.getState().openThread(ids[2]!);

    const view = useAppStore.getState().view;
    expect(view.kind).toBe("thread");
    expect(view.kind === "thread" && view.activeGroupId).toBe(groupId);
    expect(view.kind === "thread" && view.panes).toEqual([ids[0], ids[1], ids[2], ids[3]]);
    expect(view.kind === "thread" && view.paneLayout).toEqual(savedLayout);
  });
});
