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
