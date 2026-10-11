import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import { RuntimeWriteQueue } from "./runtimeWriteQueue";
import type { RuntimeQueueCapacityChange } from "./runtimeQueueCapacity";

function delta(threadId: string, text = "chunk"): RuntimeEvent {
  return { type: "content.delta", threadId, itemId: "item", stream: "assistant_text", delta: text };
}
const budget = { maxThreads: 4, maxBytes: 1024 * 1024, maxMs: 100 };

describe("runtime queue capacity authority", () => {
  it("reports exact byte/count capacity for a partially admitted prefix", () => {
    const changes: RuntimeQueueCapacityChange[] = [];
    const queue = new RuntimeWriteQueue(
      () => undefined,
      {
        maxPendingEventsGlobal: 3,
        maxPendingEventsPerThread: 2,
      },
      undefined,
      undefined,
      (change) => changes.push(change),
    );
    const event = delta("a", "🙂é");
    const bytes = estimateRuntimeEventBytes(event);
    expect(queue.enqueue("a", [event, event, event])).toMatchObject({
      acceptedEvents: 2,
      refusedEvents: 1,
    });
    const capacity = queue.capacitySnapshot(["a", "b"]);
    expect(capacity.global).toMatchObject({
      pendingEvents: 2,
      pendingBytes: 2 * bytes,
      remainingEvents: 1,
    });
    expect(capacity.threads[0]).toMatchObject({
      pendingEvents: 2,
      pendingBytes: 2 * bytes,
      remainingEvents: 0,
      maxNextEventBytes: 0,
    });
    expect(capacity.threads[1]).toMatchObject({ pendingEvents: 0, remainingEvents: 2 });
    expect(changes).toEqual([
      { generation: 1, revision: 1, throughPersistSeq: 2, kind: "admitted", threadId: "a" },
    ]);
    queue.enqueue("b", [delta("b")]);
    expect(queue.capacitySnapshot(["c"]).threads[0]?.maxNextEventBytes).toBe(0);
    expect(queue.pendingEvents()).toBe(3);
  });

  it("does not return capacity on failed writes and returns only a committed chunk", () => {
    let failed = true;
    const changes: RuntimeQueueCapacityChange[] = [];
    const queue = new RuntimeWriteQueue(
      () => {
        if (failed) throw new Error("SQLite busy");
      },
      {},
      undefined,
      undefined,
      (change) => changes.push(change),
    );
    const events = [delta("a", "one"), delta("a", "two")];
    queue.enqueue("a", events);
    const pending = queue.capacitySnapshot(["a"]);
    expect(queue.flushThread("a").kind).toBe("failed");
    expect(queue.capacitySnapshot(["a"])).toEqual(pending);
    failed = false;
    expect(
      queue.flushThreadThrough("a", Number.MAX_SAFE_INTEGER, { maxEvents: 1, maxBytes: 1024 }).kind,
    ).toBe("committed");
    expect(queue.pendingBytes()).toBe(estimateRuntimeEventBytes(events[1]!));
    expect(queue.pendingEvents()).toBe(1);
    expect(changes.map((change) => change.kind)).toEqual(["admitted", "committed"]);
    queue.flushThread("a");
    const committed = queue.capacitySnapshot(["a"]);
    expect(committed.global).toMatchObject({ pendingEvents: 0, pendingBytes: 0 });
    queue.flushThread("a");
    expect(queue.capacitySnapshot(["a"])).toEqual(committed);
  });

  it("atomic rollback preserves all capacity until individual recovery commits", () => {
    let failed = true;
    const changes: RuntimeQueueCapacityChange[] = [];
    const queue = new RuntimeWriteQueue(
      () => {
        if (failed) throw new Error("busy");
      },
      {},
      undefined,
      () => ({ kind: "rolled-back", error: new Error("rollback") }),
      (change) => changes.push(change),
    );
    queue.enqueue("a", [delta("a")]);
    queue.enqueue("b", [delta("b")]);
    const pending = queue.capacitySnapshot(["a", "b"]);
    expect(queue.flushBudgeted(budget).committedEvents).toBe(0);
    expect(queue.capacitySnapshot(["a", "b"])).toEqual(pending);
    failed = false;
    expect(queue.flushBudgeted(budget).committedEvents).toBe(2);
    expect(queue.capacitySnapshot().global).toMatchObject({ pendingEvents: 0, pendingBytes: 0 });
    expect(
      changes.filter((change) => change.kind === "committed").map((change) => change.threadId),
    ).toEqual(["a", "b"]);
  });

  it("keeps aggregate custody through an atomic writer and publishes only after commit", () => {
    const changes: RuntimeQueueCapacityChange[] = [];
    let duringWrite: ReturnType<RuntimeWriteQueue["capacitySnapshot"]> | undefined;
    const queue = new RuntimeWriteQueue(
      () => {
        throw new Error("unexpected single fallback");
      },
      {},
      undefined,
      () => {
        duringWrite = queue.capacitySnapshot(["a", "b"]);
        expect(changes.filter((change) => change.kind === "committed")).toHaveLength(0);
        return { kind: "committed" };
      },
      (change) => changes.push(change),
    );
    queue.enqueue("a", [delta("a", "one"), delta("a", "two")]);
    queue.enqueue("b", [delta("b")]);
    expect(queue.flushBudgeted(budget).committedEvents).toBe(3);
    expect(duringWrite?.global.pendingEvents).toBe(3);
    expect(queue.pendingEvents()).toBe(0);
    expect(queue.pendingBytes()).toBe(0);
    expect(changes.map((change) => change.revision)).toEqual([1, 2, 3, 4]);
  });

  it("tracks pin changes without freeing an uncommitted suffix", () => {
    const queue = new RuntimeWriteQueue(() => undefined);
    queue.enqueue("a", [delta("a", "prefix")]);
    const through = queue.pinThread("a");
    queue.enqueue("a", [delta("a", "suffix")]);
    const pinned = queue.capacitySnapshot(["a"]);
    expect(pinned.threads[0]?.pinnedThrough).toBe(through);
    queue.setPin("a", through);
    expect(queue.capacitySnapshot(["a"])).toEqual(pinned);
    expect(queue.flushThread("a").committedEvents).toBe(1);
    expect(queue.pendingEvents()).toBe(1);
    const prefixCommitted = queue.capacitySnapshot(["a"]);
    expect(queue.flushThread("a").kind).toBe("empty");
    expect(queue.capacitySnapshot(["a"])).toEqual(prefixCommitted);
    queue.releasePin("a");
    expect(queue.capacitySnapshot(["a"]).revision).toBeGreaterThan(prefixCommitted.revision);
    expect(queue.pendingEvents()).toBe(1);
    queue.flushThread("a");
    expect(queue.pendingBytes()).toBe(0);
  });

  it("accounts the existing lone oversize exception apart from ordinary thread headroom", () => {
    const queue = new RuntimeWriteQueue(() => undefined, {
      maxPendingBytesPerThread: 1000,
      maxSingleEventBytes: 2000,
      maxPendingBytesGlobal: 3000,
    });
    const large = delta("a", "x".repeat(1200));
    const bytes = estimateRuntimeEventBytes(large);
    expect(queue.capacitySnapshot(["a"]).threads[0]?.maxNextEventBytes).toBe(2000);
    expect(queue.enqueue("a", [large]).acceptedEvents).toBe(1);
    expect(queue.capacitySnapshot(["a"]).threads[0]).toMatchObject({
      pendingBytes: bytes,
      remainingBytes: 0,
      maxNextEventBytes: 0,
    });
    expect(queue.stats()).toMatchObject({
      pendingEstimatedBytes: bytes,
      oversizeBytes: bytes,
      oversizeEvents: 1,
    });
    queue.discard("a");
    expect(queue.pendingBytes()).toBe(0);
    expect(queue.stats().oversizeEvents).toBe(0);
    queue.enqueue("a", [large]);
    queue.flushThread("a");
    expect(queue.pendingBytes()).toBe(0);
    expect(queue.capacitySnapshot(["a"]).threads[0]?.maxNextEventBytes).toBe(2000);
  });

  it("invalidates reset/discard revisions and snapshots do not expose mutable bounds", () => {
    const queue = new RuntimeWriteQueue(() => undefined);
    queue.enqueue("a", [delta("a")]);
    const before = queue.capacitySnapshot(["a"]);
    expect(queue.discard("a")).toBe(1);
    const discarded = queue.capacitySnapshot(["a"]);
    expect(discarded.revision).toBeGreaterThan(before.revision);
    expect(discarded.global.pendingBytes).toBe(0);
    expect(discarded.threads[0]?.pinnedThrough).toBeNull();
    queue.discard("missing");
    expect(queue.capacitySnapshot(["a"])).toEqual(discarded);
    Object.assign(discarded.limits, { maxPendingBytesGlobal: 0 });
    expect(queue.getBounds().maxPendingBytesGlobal).toBeGreaterThan(0);
    queue.enqueue("b", [delta("b")]);
    queue.clear();
    expect(queue.capacitySnapshot().generation).toBe(before.generation + 1);
    expect(queue.pendingBytes()).toBe(0);
    expect(queue.pendingEvents()).toBe(0);
  });

  it("a failing observer cannot convert a successful commit into a retry", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const writes = vi.fn<() => void>();
      const queue = new RuntimeWriteQueue(writes, {}, undefined, undefined, () => {
        throw new Error("observer failure");
      });
      queue.enqueue("a", [delta("a")]);
      expect(queue.flushThread("a").kind).toBe("committed");
      expect(queue.flushThread("a").kind).toBe("empty");
      expect(writes).toHaveBeenCalledOnce();
      expect(queue.capacitySnapshot().global.pendingEvents).toBe(0);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("aggregate counters match an independent event ledger through mixed operations", () => {
    const queue = new RuntimeWriteQueue(() => undefined, {
      maxPendingEventsPerThread: 8,
      maxPendingEventsGlobal: 24,
    });
    const ids = ["a", "b", "c", "d"];
    const pending = new Map<string, RuntimeEvent[]>();
    let seed = 17;
    for (let step = 0; step < 500; step++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const id = ids[(seed >>> 3) % ids.length]!;
      const events = pending.get(id) ?? [];
      switch (seed % 5) {
        case 0:
        case 1: {
          const batch = [delta(id, `🙂${step}`), delta(id, `é${step}`)];
          const admitted = queue.enqueue(id, batch);
          events.push(...batch.slice(0, admitted.acceptedEvents));
          pending.set(id, events);
          break;
        }
        case 2: {
          const flushed = queue.flushThreadThrough(id, Number.MAX_SAFE_INTEGER, {
            maxEvents: 1,
            maxBytes: 1024,
          });
          events.splice(0, flushed.committedEvents);
          break;
        }
        case 3:
          queue.discard(id);
          pending.delete(id);
          break;
        case 4:
          queue.clear();
          pending.clear();
          break;
      }
      const model = [...pending.values()].flat();
      expect(queue.pendingEvents()).toBe(model.length);
      expect(queue.pendingBytes()).toBe(
        model.reduce((bytes, event) => bytes + estimateRuntimeEventBytes(event), 0),
      );
      expect(queue.capacitySnapshot(ids).threads.map((thread) => thread.pendingEvents)).toEqual(
        ids.map((threadId) => pending.get(threadId)?.length ?? 0),
      );
    }
  });
});
