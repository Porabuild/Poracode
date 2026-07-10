import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { ThreadSessionManager } from "./threadSessionManager";

/**
 * Focused tests for the sub-agent event gating + buffer-drain behavior in
 * `ThreadSessionManager`. The buffer holds child events while no overlay is
 * subscribed; the parent's completion drains it so the renderer can replay
 * every turn even if the overlay was never opened during the run.
 */

function makeManager() {
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const manager = new ThreadSessionManager({
    emit,
    isDev: false,
    logsDir: "",
    settingsPath: "",
    readDisableCliHookPlugin: () => false,
    adapters: new Map(),
    windowsShell: { shell: "cmd", kind: "cmd", args: [] },
  });
  return { manager, emit };
}

type EnqueueFn = (threadId: string, event: RuntimeEvent) => void;

function enqueue(manager: ThreadSessionManager, threadId: string, event: RuntimeEvent) {
  const enq = (manager as unknown as { enqueueRuntimeEvent: EnqueueFn }).enqueueRuntimeEvent;
  enq.call(manager, threadId, event);
}

function collectEmittedRuntimeEvents(
  emit: ReturnType<typeof vi.fn<(event: SupervisorEvent) => void>>,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const call of emit.mock.calls) {
    const payload = call[0];
    if (!payload) continue;
    if (payload.type === "thread-runtime-event") {
      events.push(payload.event);
    } else if (payload.type === "thread-runtime-events") {
      events.push(...payload.events);
    } else if (payload.type === "thread-runtime-events-multi") {
      for (const batch of payload.batches) events.push(...batch.events);
    }
  }
  return events;
}

describe("ThreadSessionManager sub-agent buffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drains buffered child events when the parent completes so the renderer sees every turn", () => {
    const { manager, emit } = makeManager();
    const threadId = "t1";
    const parentId = "task-1";

    enqueue(manager, threadId, {
      type: "item.started",
      threadId,
      itemId: parentId,
      itemType: "tool_call",
      payload: { name: "Task", status: "running" },
    });

    enqueue(manager, threadId, {
      type: "item.started",
      threadId,
      itemId: "child-1",
      itemType: "assistant_message",
      parentItemId: parentId,
    });
    enqueue(manager, threadId, {
      type: "item.completed",
      threadId,
      itemId: "child-1",
    });
    enqueue(manager, threadId, {
      type: "item.started",
      threadId,
      itemId: "child-2",
      itemType: "tool_call",
      parentItemId: parentId,
      payload: { name: "Read", status: "running" },
    });

    enqueue(manager, threadId, {
      type: "item.completed",
      threadId,
      itemId: parentId,
    });

    vi.runAllTimers();

    const emitted = collectEmittedRuntimeEvents(emit);
    const ids = emitted.map((e) => `${e.type}:${"itemId" in e ? e.itemId : ""}`);

    expect(ids).toEqual([
      `item.started:${parentId}`,
      "item.started:child-1",
      "item.completed:child-1",
      "item.started:child-2",
      `item.completed:${parentId}`,
    ]);

    expect(manager.subagentSubscribe({ threadId, parentItemId: parentId }).history).toEqual([]);
  });

  it("forwards child events live once the overlay is subscribed", () => {
    const { manager, emit } = makeManager();
    const threadId = "t1";
    const parentId = "task-1";

    enqueue(manager, threadId, {
      type: "item.started",
      threadId,
      itemId: parentId,
      itemType: "tool_call",
      payload: { name: "Task", status: "running" },
    });
    vi.runAllTimers();
    emit.mockClear();

    expect(manager.subagentSubscribe({ threadId, parentItemId: parentId }).history).toEqual([]);

    enqueue(manager, threadId, {
      type: "item.started",
      threadId,
      itemId: "child-live",
      itemType: "assistant_message",
      parentItemId: parentId,
    });
    vi.runAllTimers();

    const emitted = collectEmittedRuntimeEvents(emit);
    expect(emitted).toEqual([
      {
        type: "item.started",
        threadId,
        itemId: "child-live",
        itemType: "assistant_message",
        parentItemId: parentId,
      },
    ]);
  });

  it("forwards parent progress while child events remain buffered", () => {
    const { manager, emit } = makeManager();
    const threadId = "t1";
    const parentId = "task-1";

    enqueue(manager, threadId, {
      type: "item.started",
      threadId,
      itemId: parentId,
      itemType: "tool_call",
      payload: { name: "Task", status: "running", isSubAgent: true },
    });
    vi.runAllTimers();
    emit.mockClear();

    enqueue(manager, threadId, {
      type: "item.started",
      threadId,
      itemId: "child-buffered",
      itemType: "tool_call",
      parentItemId: parentId,
      payload: { name: "Read", status: "running" },
    });
    enqueue(manager, threadId, {
      type: "item.updated",
      threadId,
      itemId: parentId,
      payload: { progress: { stepCount: 1 } },
    });
    vi.runAllTimers();

    expect(collectEmittedRuntimeEvents(emit)).toEqual([
      {
        type: "item.updated",
        threadId,
        itemId: parentId,
        payload: { progress: { stepCount: 1 } },
      },
    ]);
    expect(manager.subagentSubscribe({ threadId, parentItemId: parentId }).history).toEqual([
      {
        type: "item.started",
        threadId,
        itemId: "child-buffered",
        itemType: "tool_call",
        parentItemId: parentId,
        payload: { name: "Read", status: "running" },
      },
    ]);
  });
});
