import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import { RuntimeEventRouter } from "./runtimeEventRouter";
import { SubAgentRegistry } from "./subAgentRegistry";

function delta(threadId: string, text: string): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId: "child",
    stream: "assistant_text",
    delta: text,
  };
}

function flattened(envelopes: SupervisorEvent[]): RuntimeEvent[] {
  return envelopes.flatMap((envelope) => {
    if (envelope.type === "thread-runtime-event") return [envelope.event];
    if (envelope.type === "thread-runtime-events") return envelope.events;
    if (envelope.type === "thread-runtime-events-multi")
      return envelope.batches.flatMap((b) => b.events);
    return [];
  });
}

describe("unopened child output admission", () => {
  it("clears child routing after an entirely spilled parent completes", () => {
    const emitted: SupervisorEvent[] = [];
    const router = new RuntimeEventRouter((e) => {
      emitted.push(e);
    });
    router.append("t", {
      type: "item.started",
      threadId: "t",
      itemId: "child",
      itemType: "assistant_message",
      parentItemId: "p",
    });
    router.append("t", delta("t", "x".repeat(300_000)));
    router.append("t", { type: "item.completed", threadId: "t", itemId: "p" });
    router.flush();
    emitted.length = 0;
    const late: RuntimeEvent = {
      type: "item.updated",
      threadId: "t",
      itemId: "child",
      payload: { status: "success" },
    };
    router.append("t", late);
    router.flush();
    expect(flattened(emitted)).toEqual([late]);
  });

  it.each(["release", "marker"])(
    "drains every private parent tail before a %s boundary while credit is blocked",
    (boundary) => {
      const emitted: SupervisorEvent[] = [];
      let capacity = 0;
      const router = new RuntimeEventRouter(
        (e) => {
          emitted.push(e);
        },
        { canonicalCapacity: () => capacity },
      );
      const marker: SupervisorEvent = {
        type: "thread-runtime-event",
        threadId: "t",
        event: { type: "error", threadId: "t", message: "stopped" },
      };
      for (const parent of ["p1", "p2"]) {
        router.append("t", {
          type: "item.started",
          threadId: "t",
          itemId: parent,
          itemType: "tool_call",
        });
        router.append("t", {
          type: "item.started",
          threadId: "t",
          itemId: `child-${parent}`,
          itemType: "assistant_message",
          parentItemId: parent,
        });
        router.append("t", {
          type: "content.delta",
          threadId: "t",
          itemId: `child-${parent}`,
          stream: "assistant_text",
          delta: parent.repeat(8_192),
        });
      }
      if (boundary === "release") router.releaseThread("t");
      router.queueStopMarker("t", marker);
      expect(emitted).toEqual([]);
      capacity = Number.POSITIVE_INFINITY;
      router.setCanonicalCapacity(capacity);
      const all = flattened(emitted);
      expect(all.filter((e) => e.type === "content.delta").map((e) => e.delta)).toEqual([
        "p1".repeat(8_192),
        "p2".repeat(8_192),
      ]);
      expect(all.at(-1)).toEqual(marker.event);
      const count = emitted.length;
      router.subscribe("t", "p1");
      router.subscribe("t", "p2");
      router.flush();
      expect(emitted).toHaveLength(count);
    },
  );

  it("includes in-progress spilled prefixes in a synchronous producer stop", () => {
    const emitted: SupervisorEvent[] = [];
    const marker: SupervisorEvent = {
      type: "thread-runtime-event",
      threadId: "t",
      event: { type: "error", threadId: "t", message: "stopped" },
    };
    let router!: RuntimeEventRouter;
    router = new RuntimeEventRouter(
      (e) => {
        emitted.push(e);
      },
      {
        maxPendingEventsPerThread: 1,
        onOverflow: () => {
          router.releaseThread("t");
          router.queueStopMarker("t", marker);
          router.setPaused(false);
        },
      },
    );
    router.setPaused(true);
    router.append("t", {
      type: "item.started",
      threadId: "t",
      itemId: "child",
      itemType: "assistant_message",
      parentItemId: "p",
    });
    const first = "a".repeat(200_000);
    const tail = "b".repeat(100_000);
    router.append("t", delta("t", first));
    // This spills [item.started, first] while tail is already private. The
    // overflow callback must consume that staged first before the newer tail.
    router.append("t", delta("t", tail));
    router.flush();
    const all = flattened(emitted);
    expect(
      all
        .filter((e) => e.type === "content.delta")
        .map((e) => e.delta)
        .join(""),
    ).toBe(first + tail);
    expect(all.at(-1)).toEqual(marker.event);
    const count = emitted.length;
    router.subscribe("t", "p");
    router.flush();
    expect(emitted).toHaveLength(count);
  });

  it("includes an arrived parent completion before a stop during its child drain", () => {
    const emitted: SupervisorEvent[] = [];
    const marker: SupervisorEvent = {
      type: "thread-runtime-event",
      threadId: "t",
      event: { type: "error", threadId: "t", message: "stopped" },
    };
    let router!: RuntimeEventRouter;
    router = new RuntimeEventRouter(
      (e) => {
        emitted.push(e);
      },
      {
        maxPendingEventsPerThread: 1,
        onOverflow: () => {
          router.releaseThread("t");
          router.queueStopMarker("t", marker);
          router.setPaused(false);
        },
      },
    );
    router.setPaused(true);
    router.append("t", {
      type: "item.started",
      threadId: "t",
      itemId: "child",
      itemType: "assistant_message",
      parentItemId: "p",
    });
    router.append("t", delta("t", "accepted child output"));
    const completion: RuntimeEvent = { type: "item.completed", threadId: "t", itemId: "p" };
    router.append("t", completion);
    router.flush();
    const all = flattened(emitted);
    expect(
      all
        .filter((e) => e.type === "content.delta")
        .map((e) => e.delta)
        .join(""),
    ).toBe("accepted child output");
    expect(all.slice(-2)).toEqual([completion, marker.event]);
  });

  it("releases exact prefixes before a parent byte budget is exceeded, including Unicode", () => {
    const events = Array.from({ length: 100 }, (_, i) => delta("t", `${i}:😀`));
    const max = estimateRuntimeEventBytes(events[0]!) * 3;
    const registry = new SubAgentRegistry({ maxBytesPerParent: max });
    const released: RuntimeEvent[] = [];
    for (const event of events) {
      released.push(...registry.bufferEvent("t", "parent", event).flatMap((b) => b.events));
      expect(registry.pendingStats().bytes).toBeLessThanOrEqual(max);
    }
    released.push(...registry.subscribe("t", "parent"));
    expect(released.map((e) => (e.type === "content.delta" ? e.delta : "")).join("")).toBe(
      events.map((e) => (e.type === "content.delta" ? e.delta : "")).join(""),
    );
    expect(registry.pendingStats()).toEqual({ bytes: 0, admittedEvents: 0, parents: 0 });
  });

  it("bounds aggregate admissions across threads and parents, then refunds cleanup", () => {
    const registry = new SubAgentRegistry({ maxEventsGlobal: 3 });
    const released: RuntimeEvent[] = [];
    for (let i = 0; i < 20; i++) {
      released.push(
        ...registry
          .bufferEvent(`t${i}`, `p${i}`, delta(`t${i}`, String(i)))
          .flatMap((b) => b.events),
      );
      expect(registry.pendingStats().admittedEvents).toBeLessThanOrEqual(3);
      expect(registry.pendingStats().parents).toBeLessThanOrEqual(3);
    }
    expect(released.map((e) => e.threadId)).toEqual(Array.from({ length: 17 }, (_, i) => `t${i}`));
    registry.clear("t17", "p17");
    registry.clearAllForThread("t18");
    const remainder = registry.drainBuffered("t19", "p19");
    expect(remainder).toEqual([delta("t19", "19")]);
    expect(registry.pendingStats()).toEqual({ bytes: 0, admittedEvents: 0, parents: 0 });
  });

  it("passes indivisible large events through after their prefix without privately retaining them", () => {
    const prefix = delta("t", "first");
    const large = delta("t", "x".repeat(1_024));
    const registry = new SubAgentRegistry({ maxBytesPerParent: estimateRuntimeEventBytes(prefix) });
    expect(registry.bufferEvent("t", "p", prefix)).toEqual([]);
    expect(registry.bufferEvent("t", "p", large).flatMap((b) => b.events)).toEqual([prefix, large]);
    expect(registry.pendingStats()).toEqual({ bytes: 0, admittedEvents: 0, parents: 0 });
  });

  it("publishes bounded unopened prefixes through normal admission before final subscription", () => {
    const emitted: SupervisorEvent[] = [];
    const router = new RuntimeEventRouter((e) => {
      emitted.push(e);
    });
    try {
      router.append("t", {
        type: "item.started",
        threadId: "t",
        itemId: "parent",
        itemType: "tool_call",
      });
      router.append("t", {
        type: "item.started",
        threadId: "t",
        itemId: "child",
        itemType: "assistant_message",
        parentItemId: "parent",
      });
      const texts = Array.from({ length: 100 }, (_, i) => `${i}:` + "x".repeat(4_096));
      for (const text of texts) router.append("t", delta("t", text));
      router.flush();
      expect(flattened(emitted).some((e) => e.type === "content.delta")).toBe(true);
      expect(router.subscribe("t", "parent")).toEqual([]);
      router.append("t", { type: "item.completed", threadId: "t", itemId: "parent" });
      router.flush();
      const all = flattened(emitted);
      expect(all.slice(0, 2).map((e) => e.type)).toEqual(["item.started", "item.started"]);
      expect(
        all
          .filter((e) => e.type === "content.delta")
          .map((e) => e.delta)
          .join(""),
      ).toBe(texts.join(""));
      expect(all.at(-1)).toMatchObject({ type: "item.completed", itemId: "parent" });
    } finally {
      router.clearAllForThread("t");
    }
  });

  it("uses the existing canonical producer-stop policy for oversized child events", () => {
    const emitted: SupervisorEvent[] = [];
    const onOverflow = vi.fn<(info: unknown) => void>();
    const router = new RuntimeEventRouter(
      (e) => {
        emitted.push(e);
      },
      { maxSingleEventBytes: 300, onOverflow },
    );
    try {
      router.append("t", {
        type: "item.started",
        threadId: "t",
        itemId: "child",
        itemType: "assistant_message",
        parentItemId: "p",
      });
      router.append("t", delta("t", "x".repeat(300_000)));
      router.flush();
      expect(onOverflow).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: "t", reason: "oversize" }),
      );
      expect(flattened(emitted).filter((e) => e.type === "content.delta")).toEqual([]);
      expect(router.subscribe("t", "p")).toEqual([]);
    } finally {
      router.clearAllForThread("t");
    }
  });
});
