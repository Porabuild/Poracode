import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { RuntimeEventRouter } from "./runtimeEventRouter";
import { SubAgentRegistry } from "./subAgentRegistry";

function makeRouter() {
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  return { router: new RuntimeEventRouter(emit), emit };
}

function collectEmittedRuntimeEvents(
  emit: ReturnType<typeof vi.fn<(event: SupervisorEvent) => void>>,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const call of emit.mock.calls) {
    const payload = call[0];
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

describe("RuntimeEventRouter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drains buffered child events before the parent completion and clears stale child routing", () => {
    const { router, emit } = makeRouter();
    const threadId = "t1";
    const parentId = "task-1";

    router.append(threadId, {
      type: "item.started",
      threadId,
      itemId: parentId,
      itemType: "tool_call",
      payload: { name: "Task", status: "running" },
    });
    router.append(threadId, {
      type: "item.started",
      threadId,
      itemId: "child-1",
      itemType: "assistant_message",
      parentItemId: parentId,
    });
    router.append(threadId, {
      type: "item.started",
      threadId,
      itemId: "child-2",
      itemType: "tool_call",
      parentItemId: parentId,
      payload: { name: "Read", status: "running" },
    });
    router.append(threadId, {
      type: "item.completed",
      threadId,
      itemId: parentId,
    });

    vi.runAllTimers();

    expect(collectEmittedRuntimeEvents(emit).map((event) => event.type)).toEqual([
      "item.started",
      "item.started",
      "item.started",
      "item.completed",
    ]);
    expect(router.subscribe(threadId, parentId)).toEqual([]);

    emit.mockClear();
    router.append(threadId, {
      type: "item.updated",
      threadId,
      itemId: "child-2",
      payload: { status: "success" },
    });
    vi.runAllTimers();

    expect(collectEmittedRuntimeEvents(emit)).toEqual([
      {
        type: "item.updated",
        threadId,
        itemId: "child-2",
        payload: { status: "success" },
      },
    ]);
  });

  it("emits an untracked parent completion without creating buffered history", () => {
    const { router, emit } = makeRouter();
    const threadId = "t1";
    const parentId = "task-1";

    router.append(threadId, {
      type: "item.started",
      threadId,
      itemId: parentId,
      itemType: "tool_call",
      payload: { name: "Task", status: "running" },
    });
    router.append(threadId, {
      type: "item.completed",
      threadId,
      itemId: parentId,
    });

    vi.runAllTimers();

    expect(
      collectEmittedRuntimeEvents(emit).map(
        (event) => `${event.type}:${"itemId" in event ? event.itemId : ""}`,
      ),
    ).toEqual([`item.started:${parentId}`, `item.completed:${parentId}`]);
    expect(router.subscribe(threadId, parentId)).toEqual([]);
  });

  it("replays buffered child history onto the runtime stream on subscribe", () => {
    const { router, emit } = makeRouter();
    const threadId = "t1";
    const parentId = "task-1";

    router.append(threadId, {
      type: "item.started",
      threadId,
      itemId: parentId,
      itemType: "tool_call",
      payload: { name: "Task", status: "running" },
    });
    router.append(threadId, {
      type: "item.started",
      threadId,
      itemId: "child-1",
      itemType: "assistant_message",
      parentItemId: parentId,
    });
    router.append(threadId, {
      type: "content.delta",
      threadId,
      itemId: "child-1",
      stream: "assistant_text",
      delta: "hi",
    });
    router.append(threadId, {
      type: "item.started",
      threadId,
      itemId: "child-2",
      itemType: "tool_call",
      parentItemId: parentId,
      payload: { name: "Read", status: "running" },
    });
    vi.runAllTimers();
    emit.mockClear();

    // Subscribe drains the buffer onto the normal stream and returns empty history.
    expect(router.subscribe(threadId, parentId)).toEqual([]);
    vi.runAllTimers();

    const replayed = collectEmittedRuntimeEvents(emit);
    expect(replayed).toEqual([
      {
        type: "item.started",
        threadId,
        itemId: "child-1",
        itemType: "assistant_message",
        parentItemId: parentId,
      },
      {
        type: "content.delta",
        threadId,
        itemId: "child-1",
        stream: "assistant_text",
        delta: "hi",
      },
      {
        type: "item.started",
        threadId,
        itemId: "child-2",
        itemType: "tool_call",
        parentItemId: parentId,
        payload: { name: "Read", status: "running" },
      },
    ]);

    // Subsequent child events stream live without re-buffering or duplicating
    // the replayed history.
    emit.mockClear();
    router.append(threadId, {
      type: "item.completed",
      threadId,
      itemId: "child-2",
    });
    vi.runAllTimers();
    expect(collectEmittedRuntimeEvents(emit)).toEqual([
      {
        type: "item.completed",
        threadId,
        itemId: "child-2",
      },
    ]);

    // Second subscribe returns empty and does not re-emit.
    emit.mockClear();
    expect(router.subscribe(threadId, parentId)).toEqual([]);
    vi.runAllTimers();
    expect(collectEmittedRuntimeEvents(emit)).toEqual([]);
  });
});

describe("SubAgentRegistry", () => {
  it("tracks a child item until the child completes", () => {
    const registry = new SubAgentRegistry();
    const threadId = "t1";
    const parentId = "task-1";

    expect(
      registry.resolveParent(threadId, {
        type: "item.started",
        threadId,
        itemId: "child-1",
        itemType: "assistant_message",
        parentItemId: parentId,
      }),
    ).toBe(parentId);
    expect(
      registry.resolveParent(threadId, {
        type: "content.delta",
        threadId,
        itemId: "child-1",
        stream: "assistant_text",
        delta: "hello",
      }),
    ).toBe(parentId);
    expect(
      registry.resolveParent(threadId, {
        type: "item.completed",
        threadId,
        itemId: "child-1",
      }),
    ).toBe(parentId);
    expect(
      registry.resolveParent(threadId, {
        type: "item.updated",
        threadId,
        itemId: "child-1",
        payload: { status: "success" },
      }),
    ).toBeUndefined();
  });

  it("drains buffered events on subscribe and marks the parent subscribed", () => {
    const registry = new SubAgentRegistry();
    const threadId = "t1";
    const parentId = "task-1";
    const event: RuntimeEvent = {
      type: "item.started",
      threadId,
      itemId: "child-1",
      itemType: "assistant_message",
      parentItemId: parentId,
    };

    registry.bufferEvent(threadId, parentId, event);

    expect(registry.hasBuffer(threadId, parentId)).toBe(true);
    expect(registry.subscribe(threadId, parentId)).toEqual([event]);
    expect(registry.hasBuffer(threadId, parentId)).toBe(false);
    expect(registry.isSubscribed(threadId, parentId)).toBe(true);

    registry.unsubscribe(threadId, parentId);

    expect(registry.isSubscribed(threadId, parentId)).toBe(false);
  });

  it("compacts adjacent buffered deltas without changing stream order", () => {
    const registry = new SubAgentRegistry();
    const threadId = "t1";
    const parentId = "task-1";

    registry.bufferEvent(threadId, parentId, {
      type: "content.delta",
      threadId,
      itemId: "child-1",
      stream: "assistant_text",
      delta: "hel",
    });
    registry.bufferEvent(threadId, parentId, {
      type: "content.delta",
      threadId,
      itemId: "child-1",
      stream: "assistant_text",
      delta: "lo",
    });
    registry.bufferEvent(threadId, parentId, {
      type: "content.delta",
      threadId,
      itemId: "child-1",
      stream: "reasoning_text",
      delta: "why",
    });
    registry.bufferEvent(threadId, parentId, {
      type: "content.delta",
      threadId,
      itemId: "child-1",
      stream: "assistant_text",
      delta: "!",
    });

    expect(registry.subscribe(threadId, parentId)).toEqual([
      {
        type: "content.delta",
        threadId,
        itemId: "child-1",
        stream: "assistant_text",
        delta: "hello",
      },
      {
        type: "content.delta",
        threadId,
        itemId: "child-1",
        stream: "reasoning_text",
        delta: "why",
      },
      {
        type: "content.delta",
        threadId,
        itemId: "child-1",
        stream: "assistant_text",
        delta: "!",
      },
    ]);
  });
});
