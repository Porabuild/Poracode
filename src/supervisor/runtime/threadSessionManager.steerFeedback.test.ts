import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { StructuredSessionHandle } from "../agents/base";
import { createFollowUpQueueHarness } from "./threadSessionManager.followUpQueueTestHarness";

vi.mock("node-pty", () => ({ spawn: vi.fn<() => never>() }));

type Harness = ReturnType<typeof createFollowUpQueueHarness>;

function emittedEvents(harness: Harness): RuntimeEvent[] {
  return harness.emit.mock.calls.flatMap(([event]) => {
    if (event.type === "thread-runtime-event") return [event.event];
    if (event.type === "thread-runtime-events") return event.events;
    if (event.type === "thread-runtime-events-multi")
      return event.batches.flatMap((batch) => batch.events);
    return [];
  });
}

function enqueue(harness: Harness, event: RuntimeEvent): void {
  (
    harness.manager as unknown as {
      enqueueRuntimeEvent(threadId: string, event: RuntimeEvent): void;
    }
  ).enqueueRuntimeEvent(event.threadId, event);
}

describe("native steer feedback", () => {
  it("publishes ordinary feedback immediately behind buffered events without releasing child history", async () => {
    const harness = createFollowUpQueueHarness();
    const { session, manager, steerTurn } = harness;
    session.status = "working";
    const admission = Promise.withResolvers<void>();
    steerTurn.mockReturnValueOnce(admission.promise);
    try {
      enqueue(harness, {
        type: "item.started",
        threadId: session.threadId,
        itemId: "parent",
        itemType: "tool_call",
        payload: { name: "Task", status: "running" },
      });
      enqueue(harness, {
        type: "item.started",
        threadId: session.threadId,
        itemId: "child",
        itemType: "assistant_message",
        parentItemId: "parent",
      });
      expect(emittedEvents(harness)).toEqual([]);
      const steering = manager.setPendingSteer({
        threadId: session.threadId,
        prompt: "steer before admission",
        config: session.config,
      });
      await vi.waitFor(() => expect(steerTurn).toHaveBeenCalledOnce());
      const events = emittedEvents(harness);
      expect(events.map((event) => event.type)).toEqual([
        "item.started",
        "item.started",
        "item.completed",
      ]);
      expect(events[0]).toMatchObject({ itemId: "parent" });
      const user = events[1]!;
      expect(user).toMatchObject({ itemType: "user_message" });
      expect(steerTurn.mock.calls[0]![3]).toMatchObject({
        userMessageItemId: (user as { itemId: string }).itemId,
      });
      expect(events.some((event) => event.type === "turn.started")).toBe(false);
      admission.resolve();
      await steering;
    } finally {
      admission.resolve();
      harness.finish();
      await manager.dispose();
    }
  });

  it.each(["paused", "credit exhausted"])(
    "keeps steer feedback ordered when canonical delivery is %s",
    async (mode) => {
      let capacity = mode === "paused" ? Infinity : 0;
      const harness = createFollowUpQueueHarness({ canonicalCapacity: () => capacity });
      const { manager, session } = harness;
      session.status = "working";
      if (mode === "paused") manager.setCanonicalEventBackpressure(true);
      else manager.setCanonicalCreditCapacity(0);
      try {
        enqueue(harness, {
          type: "item.started",
          threadId: session.threadId,
          itemId: "assistant",
          itemType: "assistant_message",
        });
        await manager.setPendingSteer({
          threadId: session.threadId,
          prompt: "held steer",
          config: session.config,
        });
        expect(emittedEvents(harness)).toEqual([]);
        expect(manager.hasPendingCanonicalEvents()).toBe(true);
        if (mode === "paused") manager.setCanonicalEventBackpressure(false);
        else {
          capacity = 1_000_000;
          manager.setCanonicalCreditCapacity(capacity);
        }
        const events = emittedEvents(harness);
        expect(events).toHaveLength(3);
        expect(events[0]).toMatchObject({ itemId: "assistant" });
        expect(events[1]).toMatchObject({ itemType: "user_message" });
        expect(events[2]).toMatchObject({ type: "item.completed" });
      } finally {
        harness.finish();
        await manager.dispose();
      }
    },
  );

  it("publishes the fifth thread's steer while four provider admissions remain unresolved", async () => {
    const harness = createFollowUpQueueHarness();
    const { manager } = harness;
    const admissions = Array.from({ length: 4 }, () => Promise.withResolvers<void>());
    const requests: Promise<void>[] = [];
    try {
      for (let i = 0; i < 5; i++) {
        const threadId = `concurrent-${i}`;
        const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(
          () => admissions[i]?.promise ?? Promise.resolve(),
        );
        const session = {
          ...harness.session,
          threadId,
          instanceId: threadId,
          status: "working" as const,
          structuredSession: { ...harness.session.structuredSession!, steerTurn },
        };
        manager.sessions.set(threadId, session);
        requests.push(
          manager.setPendingSteer({ threadId, prompt: `steer-${i}`, config: session.config }),
        );
      }
      await requests[4];
      expect(
        emittedEvents(harness)
          .filter((event) => event.type === "item.started" && event.itemType === "user_message")
          .map((event) => event.threadId),
      ).toEqual(Array.from({ length: 5 }, (_, i) => `concurrent-${i}`));
    } finally {
      for (const admission of admissions) admission.resolve();
      await Promise.allSettled(requests);
      harness.finish();
      await manager.dispose();
    }
  });
});
