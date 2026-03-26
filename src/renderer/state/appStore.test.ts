import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./appStore";

describe("appStore runtime config sync", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      pendingServerRequests: [],
      agentStatuses: [],
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

    const t3 = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "c",
    });

    // createThread replaces entirely
    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [t3.id],
    });

    // Set up split again, then openThread replaces panes[0]
    useAppStore.setState((s) => ({
      ...s,
      view: { kind: "thread", panes: [t1.id, t2.id] as [string, ...string[]] },
    }));

    useAppStore.getState().openThread(t3.id);
    const view = useAppStore.getState().view;
    expect(view).toEqual({ kind: "thread", panes: [t3.id, t2.id] });
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

  it("openThreadSideBySide caps at 3 panes", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(
        useAppStore.getState().createThread({
          projectId: project.id,
          agentKind: "codex",
          config: { model: "m" },
          prompt: `t${i}`,
        }).id,
      );
    }

    // Last created is ids[3], set up 3 panes manually
    useAppStore.setState((s) => ({
      ...s,
      view: { kind: "thread", panes: [ids[0]!, ids[1]!, ids[2]!] as [string, ...string[]] },
    }));

    useAppStore.getState().openThreadSideBySide(ids[3]!);
    const view = useAppStore.getState().view;
    expect(view).toEqual({
      kind: "thread",
      panes: [ids[0], ids[1], ids[3]],
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

  it("tracks and clears non-persisted thread server requests", () => {
    const project = useAppStore.getState().addProject({
      kind: "windows",
      path: "C:\\repo",
    });

    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
      },
      prompt: "hello",
    });

    useAppStore.getState().addThreadServerRequest({
      threadId: thread.id,
      requestId: "request-1",
      method: "item/tool/requestUserInput",
      params: {
        questions: [],
      },
    });

    expect(useAppStore.getState().pendingServerRequests).toHaveLength(1);

    useAppStore.getState().removeThreadServerRequest(thread.id, "request-1");
    expect(useAppStore.getState().pendingServerRequests).toHaveLength(0);

    useAppStore.getState().addThreadServerRequest({
      threadId: thread.id,
      requestId: "request-2",
      method: "item/tool/requestUserInput",
      params: {
        questions: [],
      },
    });

    useAppStore.getState().markThreadExited(thread.id);
    expect(useAppStore.getState().pendingServerRequests).toHaveLength(0);
  });
});
