import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../appStore";

function currentThread(threadId: string) {
  return useAppStore.getState().threads.find((thread) => thread.id === threadId);
}

describe("applyProviderSwitch", () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      pendingThreadLaunches: {},
      pendingLaunchSegments: {},
      pendingLaunchUserMessageItemIds: {},
      pendingLaunchProviderSwitches: {},
      view: { kind: "home" },
    }));
  });

  function switchedThread() {
    const project = useAppStore.getState().addProject({ kind: "windows", path: "C:\\repo" });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "claude",
      config: { model: "claude-opus-5", effort: "high" },
      prompt: "start the task",
      presentationMode: "gui",
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      sessionRef: {
        providerSessionId: "claude-session-1",
        discoveredAt: "2026-08-29T00:00:01.000Z",
      },
      slashCommands: [{ id: "compact", label: "compact", description: "Compact context" }],
    });
    return thread;
  }

  it("retargets the thread to the new provider without changing its identity", () => {
    const thread = switchedThread();
    const before = currentThread(thread.id)!;

    useAppStore.getState().applyProviderSwitch(thread.id, {
      agentKind: "copilot",
      config: { model: "gpt-5" },
      presentationMode: "gui",
    });

    const after = currentThread(thread.id)!;
    expect(after.id).toBe(before.id);
    expect(after.title).toBe(before.title);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.agentKind).toBe("copilot");
    expect(after.config).toEqual({ model: "gpt-5" });
    expect(after.status).toBe("launching");
  });

  // The monotonic merge in `updateThreadRuntime` can only ever adopt a newer
  // ref, so without an explicit clear the old provider's session id would ship
  // to an adapter that cannot resume it.
  it("clears the previous provider's session ref and slash commands", () => {
    const thread = switchedThread();
    expect(currentThread(thread.id)?.sessionRef?.providerSessionId).toBe("claude-session-1");

    useAppStore.getState().applyProviderSwitch(thread.id, {
      agentKind: "copilot",
      config: { model: "gpt-5" },
      presentationMode: "gui",
    });

    const after = currentThread(thread.id)!;
    expect(after.sessionRef).toBeUndefined();
    expect(after.slashCommands).toBeUndefined();
    expect(after.canResumeWithConfig).toBe(false);
  });

  // Closing the old session emits one last `thread-state`, and `emitState`
  // ships the entire session — its ref, model, slash commands and `inactive`
  // status — not just the ref. Merging any of it would undo the switch.
  it("ignores the torn-down session's final state entirely", () => {
    const thread = switchedThread();
    useAppStore.getState().applyProviderSwitch(thread.id, {
      agentKind: "copilot",
      config: { model: "gpt-5" },
      presentationMode: "gui",
    });

    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "inactive",
      attention: "none",
      agentKind: "claude",
      canResumeWithConfig: true,
      config: { model: "claude-opus-5", effort: "high" },
      launchConfig: { model: "claude-opus-5", effort: "high" },
      slashCommands: [{ id: "compact", label: "compact", description: "Compact context" }],
      forceCloseActiveTurn: true,
      sessionRef: {
        providerSessionId: "claude-session-1",
        discoveredAt: "2026-08-29T00:00:01.000Z",
      },
    });

    const after = currentThread(thread.id)!;
    expect(after.agentKind).toBe("copilot");
    expect(after.sessionRef).toBeUndefined();
    // The old provider's model must not come back under the new provider.
    expect(after.config).toEqual({ model: "gpt-5" });
    expect(after.slashCommands).toBeUndefined();
    expect(after.canResumeWithConfig).toBe(false);
    expect(after.status).toBe("launching");
    expect(useAppStore.getState().lastRuntimeConfigByThreadId[thread.id]).toEqual({
      model: "gpt-5",
    });
    expect(useAppStore.getState().runtimeLaunchConfigByThreadId[thread.id]).toBeUndefined();
  });

  it("accepts the ref once the new provider's own session reports in", () => {
    const thread = switchedThread();
    useAppStore.getState().applyProviderSwitch(thread.id, {
      agentKind: "copilot",
      config: { model: "gpt-5" },
      presentationMode: "gui",
    });

    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      agentKind: "copilot",
      canResumeWithConfig: true,
      sessionRef: {
        providerSessionId: "copilot-session-1",
        discoveredAt: "2026-08-29T00:00:02.000Z",
      },
    });

    expect(currentThread(thread.id)?.sessionRef?.providerSessionId).toBe("copilot-session-1");
  });

  it("leaves updates that name no provider unfiltered", () => {
    const thread = switchedThread();
    useAppStore.getState().applyProviderSwitch(thread.id, {
      agentKind: "copilot",
      config: { model: "gpt-5" },
      presentationMode: "gui",
    });

    // Renderer-local callers (initial launch, launch failure) speak about the
    // thread's current provider and omit the tag.
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
      sessionRef: {
        providerSessionId: "copilot-session-2",
        discoveredAt: "2026-08-29T00:00:03.000Z",
      },
    });

    expect(currentThread(thread.id)?.sessionRef?.providerSessionId).toBe("copilot-session-2");
  });

  it("drops the old provider's authoritative launch snapshot", () => {
    const thread = switchedThread();
    useAppStore.setState((state) => ({
      runtimeLaunchConfigByThreadId: {
        ...state.runtimeLaunchConfigByThreadId,
        [thread.id]: { model: "claude-opus-5" },
      },
    }));

    useAppStore.getState().applyProviderSwitch(thread.id, {
      agentKind: "copilot",
      config: { model: "gpt-5" },
      presentationMode: "gui",
    });

    expect(useAppStore.getState().runtimeLaunchConfigByThreadId[thread.id]).toBeUndefined();
    expect(useAppStore.getState().lastRuntimeConfigByThreadId[thread.id]).toEqual({
      model: "gpt-5",
    });
  });

  // Nothing resolves an approval once its session is gone, so leaving it open
  // would block the pane waiting on an answer no agent is listening for.
  it("drops an approval left open by the abandoned session", () => {
    const thread = switchedThread();
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "request.opened",
      threadId: thread.id,
      requestId: "req-1",
      requestType: "command_execution_approval",
      payload: { summary: "Run rm -rf build" },
    });
    expect(useAppStore.getState().runtimeRequestsByThread[thread.id]).toHaveLength(1);

    useAppStore.getState().applyProviderSwitch(thread.id, {
      agentKind: "copilot",
      config: { model: "gpt-5" },
      presentationMode: "gui",
    });

    expect(useAppStore.getState().runtimeRequestsByThread[thread.id]).toBeUndefined();
  });

  it("keeps the transcript the new provider is continuing from", () => {
    const thread = switchedThread();
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "assistant-1",
      itemType: "assistant_message",
      payload: { content: [{ kind: "text", text: "Earlier answer" }] },
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: "assistant-1",
    });

    useAppStore.getState().applyProviderSwitch(thread.id, {
      agentKind: "copilot",
      config: { model: "gpt-5" },
      presentationMode: "gui",
    });

    expect(useAppStore.getState().runtimeItemIdsByThread[thread.id]).toContain("assistant-1");
  });

  it("is a no-op for an unknown thread", () => {
    const before = useAppStore.getState().threads;
    useAppStore.getState().applyProviderSwitch("missing-thread", {
      agentKind: "copilot",
      config: { model: "gpt-5" },
      presentationMode: "gui",
    });
    expect(useAppStore.getState().threads).toBe(before);
  });
});

describe("queueThreadLaunch provider switch marker", () => {
  beforeEach(() => {
    useAppStore.setState((state) => ({
      ...state,
      pendingThreadLaunches: {},
      pendingLaunchSegments: {},
      pendingLaunchUserMessageItemIds: {},
      pendingLaunchProviderSwitches: {},
    }));
  });

  it("carries the switch marker and clears it once consumed", () => {
    useAppStore.getState().queueThreadLaunch("thread-1", "continue", undefined, undefined, {
      fromAgentKind: "claude",
      handoffItemId: "handoff-1",
    });

    expect(useAppStore.getState().pendingLaunchProviderSwitches["thread-1"]).toEqual({
      fromAgentKind: "claude",
      handoffItemId: "handoff-1",
    });

    useAppStore.getState().consumeThreadLaunch("thread-1");

    expect(useAppStore.getState().pendingLaunchProviderSwitches["thread-1"]).toBeUndefined();
  });

  it("leaves an ordinary launch unmarked", () => {
    useAppStore.getState().queueThreadLaunch("thread-2", "hello");
    expect(useAppStore.getState().pendingLaunchProviderSwitches["thread-2"]).toBeUndefined();
  });
});
