import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { openThread, reopenStoredThread, toggleMarkThreadDone } from "./threadActions";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    closeThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
}));
const { hasHydratedThreadRuntimeItems, hydrateThreadRuntimeItems } = vi.hoisted(() => ({
  hasHydratedThreadRuntimeItems: vi.fn<(threadId: string) => boolean>().mockReturnValue(false),
  hydrateThreadRuntimeItems: vi.fn<(threadId: string) => Promise<void>>().mockResolvedValue(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
}));

describe("threadActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    hasHydratedThreadRuntimeItems.mockReturnValue(false);
    hydrateThreadRuntimeItems.mockResolvedValue(undefined);
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
      pendingThreadLaunches: {},
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeCompletedTurnsByThread: {},
    }));
  });

  it("hydrates a persisted GUI thread before opening the pane", async () => {
    let resolveHydration: () => void = () => undefined;
    const hydration = new Promise<void>((resolve) => {
      resolveHydration = resolve;
    });
    hydrateThreadRuntimeItems.mockReturnValueOnce(hydration);
    const thread = makeThread({ presentationMode: "gui", status: "idle" });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    openThread(thread.id);

    expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id);
    expect(useAppStore.getState().view).toEqual({ kind: "home" });

    resolveHydration();
    await hydration;
    await Promise.resolve();
    await Promise.resolve();

    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [thread.id],
    });
  });

  it("does not let an older GUI hydration override a newer thread open", async () => {
    let resolveFirstHydration: () => void = () => undefined;
    const firstHydration = new Promise<void>((resolve) => {
      resolveFirstHydration = resolve;
    });
    hydrateThreadRuntimeItems.mockReturnValueOnce(firstHydration);
    const firstThread = makeThread({
      id: "thread-gui",
      presentationMode: "gui",
      status: "idle",
    });
    const secondThread = makeThread({ id: "thread-terminal" });
    useAppStore.setState((state) => ({ ...state, threads: [firstThread, secondThread] }));

    openThread(firstThread.id);
    openThread(secondThread.id);

    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [secondThread.id],
    });

    resolveFirstHydration();
    await firstHydration;
    await Promise.resolve();

    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [secondThread.id],
    });
  });

  it("hydrates GUI siblings before opening a grouped thread layout", async () => {
    const firstThread = makeThread({
      id: "thread-group-a",
      groupId: "group-1",
      presentationMode: "gui",
    });
    const secondThread = makeThread({
      id: "thread-group-b",
      groupId: "group-1",
      presentationMode: "gui",
    });
    useAppStore.setState((state) => ({ ...state, threads: [firstThread, secondThread] }));

    openThread(firstThread.id);

    expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(firstThread.id);
    expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(secondThread.id);
    expect(useAppStore.getState().view).toEqual({ kind: "home" });

    await waitFor(() => {
      expect(useAppStore.getState().view).toEqual({
        kind: "thread",
        panes: [firstThread.id, secondThread.id],
        activeGroupId: "group-1",
      });
    });
  });

  it("marks inactive GUI threads launching when reopening", () => {
    const thread = makeThread({
      presentationMode: "gui",
      status: "inactive",
      sessionRef: {
        providerSessionId: "session-1",
        discoveredAt: "2026-03-22T00:00:00.000Z",
      },
    });
    useAppStore.setState((state) => ({ ...state, threads: [thread] }));

    reopenStoredThread(thread.id);

    const reopened = useAppStore.getState().threads[0];
    expect(reopened?.status).toBe("launching");
    expect(reopened?.attention).toBe("none");
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBe("");
  });

  it("closes a live CLI thread when marking done even before a session ref is known", async () => {
    const project = useAppStore.getState().addProject({
      kind: "posix",
      path: "/repo",
    });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      prompt: "hello",
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });

    toggleMarkThreadDone(thread.id);

    expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: thread.id });
    expect(useAppStore.getState().threads[0]?.done).toBe(true);

    await Promise.resolve();

    expect(useAppStore.getState().threads[0]?.status).toBe("inactive");
  });
});

function makeThread(input: Partial<Thread> = {}): Thread {
  const now = "2026-03-22T00:00:00.000Z";
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Persisted thread",
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
