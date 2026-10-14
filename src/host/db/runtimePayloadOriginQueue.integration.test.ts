import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { makeRuntimePayloadCustodyHarness } from "@/backend/runtimePayloadCustody.testFixtures";
import {
  custodyStarted,
  FORMAT_A,
  FORMAT_B,
} from "@/supervisor/runtime/threadSession/runtimePayloadCustody.testFixtures";
import {
  admitRuntimePayloadOriginEnvelope,
  admittedRuntimePayloadBatch,
  captureRuntimePayloadOrigin,
  serializeRuntimePayloadOrigins,
} from "@/shared/runtimePayloadOriginProtocol";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import { getSqlite } from "./connection";
import { runtimePersistenceController } from "./runtimePersistenceRuntime";
import { applyRuntimeEventBatchesNow, applyThreadRuntimeEventsNow } from "./runtimeItemsWriter";
import { RuntimeWriteQueue } from "./runtimeWriteQueue";
import {
  durableRuntimeRows,
  eventsWithUsage,
  installDeferredCommitFailure,
} from "./runtimePersistence.atomic.testFixtures";

const mocks = vi.hoisted(() => ({ fork: vi.fn<(...args: unknown[]) => unknown>() }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: mocks.fork,
}));
type Harness = Awaited<ReturnType<typeof makeRuntimePayloadCustodyHarness>>;
let h: Harness;
beforeEach(async () => {
  vi.useFakeTimers();
  h = await makeRuntimePayloadCustodyHarness(mocks.fork);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await h.dispose();
  vi.useRealTimers();
});
function admitted(threadId: string, events: RuntimeEvent[]) {
  const wire = serializeRuntimePayloadOrigins(
    { type: "thread-runtime-events", threadId, events },
    "boot",
  );
  const admission = admitRuntimePayloadOriginEnvelope(
    JSON.parse(JSON.stringify(wire)) as typeof wire,
    "boot",
  )!;
  return admittedRuntimePayloadBatch(admission, 0).events;
}
function origins() {
  return getSqlite()
    .prepare("SELECT * FROM thread_runtime_item_payload_origins ORDER BY thread_id, item_id")
    .all();
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("bounded queue/index/transaction payload origin conservation", () => {
  it("single/thread/multi chunking coalesces deltas without shifting sparse A/unknown/B positions", async () => {
    const shared = h.source.attach("a", h.adapterA);
    shared.handle.emit(custodyStarted("a", "a-1"));
    h.router.append("a", {
      type: "content.delta",
      threadId: "a",
      itemId: "a-1",
      stream: "command_output",
      delta: "1",
    });
    h.router.append("a", {
      type: "content.delta",
      threadId: "a",
      itemId: "a-1",
      stream: "command_output",
      delta: "2",
    });
    h.router.append("a", custodyStarted("a", "unknown"));
    h.source.attach("a", h.adapterB).handle.emit(custodyStarted("a", "b-1"));
    h.b.handle.emit(custodyStarted("b", "b-2"));
    await h.flush();
    expect(h.wire[0]).toHaveProperty("runtimePayloadOrigins.entries", [
      [0, 0, FORMAT_A],
      [0, 3, FORMAT_B],
      [1, 0, FORMAT_B],
    ]);
    expect(h.origin("a", "a-1")).toBe(FORMAT_A);
    expect(h.origin("a", "unknown")).toBeUndefined();
    expect(h.origin("a", "b-1")).toBe(FORMAT_B);
    expect(h.origin("b", "b-2")).toBe(FORMAT_B);
    expect(JSON.stringify(h.published)).not.toContain("runtimePayloadOrigins");
  });

  it("accepted prefixes and every partial publication shape retain exact indices and strip private fields", async () => {
    const bounds = runtimePersistenceController.getBounds();
    const previous = { ...bounds };
    Object.assign(bounds, { maxPendingEventsPerThread: 1, maxPendingEventsGlobal: 20 });
    try {
      h.emitA(custodyStarted("a", "accepted-A"));
      h.emitA(custodyStarted("a", "refused-A"));
      h.emitB(custodyStarted("b", "accepted-B"));
      h.emitB(custodyStarted("b", "refused-B"));
      h.router.flush();
      expect(h.published[0]).toMatchObject({
        type: "thread-runtime-events-multi",
        batches: [
          { threadId: "a", events: [{ itemId: "accepted-A" }] },
          { threadId: "b", events: [{ itemId: "accepted-B" }] },
        ],
      });
      expect(JSON.stringify(h.published)).not.toContain("runtimePayloadOrigins");
      expect(runtimePersistenceController.shutdown().kind).toBe("drained");
      expect(h.origin("a", "accepted-A")).toBe(FORMAT_A);
      expect(h.origin("b", "accepted-B")).toBe(FORMAT_B);
      expect(h.row("a", "refused-A")).toBeUndefined();
      expect(h.row("b", "refused-B")).toBeUndefined();
    } finally {
      Object.assign(bounds, previous);
    }
  });

  it("credit-held single/thread chunks retry exact sparse positions after coalescing", async () => {
    const charge =
      estimateRuntimeEventBytes(
        captureRuntimePayloadOrigin(custodyStarted("a", "first"), FORMAT_A),
      ) + 256;
    h.sender.setCanonicalCredit({ windowBytes: charge, generation: h.generation });
    h.emitA(custodyStarted("a", "first"));
    h.router.flush();
    h.emitA(custodyStarted("a", "second"));
    h.router.append("a", custodyStarted("a", "unknown"));
    h.router.flush();
    expect(h.router.hasPending()).toBe(true);
    expect(h.wire[0]).toHaveProperty("runtimePayloadOrigins.entries", [[0, 0, FORMAT_A]]);
    // The larger tail cannot fit the current chunk; a new grant releases it.
    h.sender.setCanonicalCredit({ windowBytes: 8000, generation: h.generation });
    await h.flush();
    expect(h.wire[1]).toMatchObject({
      type: "thread-runtime-events",
      events: [{ itemId: "second" }, { itemId: "unknown" }],
    });
    expect(h.wire[1]).toHaveProperty("runtimePayloadOrigins.entries", [[0, 0, FORMAT_A]]);
    expect(h.origin("a", "first")).toBe(FORMAT_A);
    expect(h.origin("a", "second")).toBe(FORMAT_A);
    expect(h.origin("a", "unknown")).toBeUndefined();
  });

  it.each(["single", "thread", "multi-single", "multi-thread"] as const)(
    "strips private metadata from %s accepted-prefix publication",
    (shape) => {
      const bounds = runtimePersistenceController.getBounds();
      const previous = { ...bounds };
      Object.assign(bounds, { maxPendingEventsPerThread: shape.endsWith("thread") ? 2 : 1 });
      try {
        h.emitA(custodyStarted("a", "accepted-one"));
        if (shape !== "single") {
          h.emitA(custodyStarted("a", "accepted-two"));
          h.emitA(custodyStarted("a", "refused"));
        }
        if (shape.startsWith("multi")) {
          // Pre-fill B so its entire batch is refused and the public multi
          // envelope collapses into a single event or thread batch.
          for (let index = 0; index < bounds.maxPendingEventsPerThread; index++)
            h.b.handle.emit(custodyStarted("b", `existing-${index}`));
          h.router.releaseThread("b");
          h.published.length = 0;
          h.b.handle.emit(custodyStarted("b", "refused-B"));
        }
        h.router.flush();
        expect(h.published[0]?.type).toBe(
          shape.endsWith("thread") ? "thread-runtime-events" : "thread-runtime-event",
        );
        expect(JSON.stringify(h.published)).not.toContain("runtimePayloadOrigins");
        expect(runtimePersistenceController.shutdown().kind).toBe("drained");
        expect(h.origin("a", "accepted-one")).toBe(FORMAT_A);
        expect(h.origin("a", "refused")).toBeUndefined();
      } finally {
        Object.assign(bounds, previous);
      }
    },
  );

  it("metadata consumes sender/source/host queue limits, including the single-event refusal boundary", () => {
    const event = custodyStarted("a", "cost");
    const source = captureRuntimePayloadOrigin(event, FORMAT_A);
    const charged = estimateRuntimeEventBytes(source);
    expect(charged).toBeGreaterThan(estimateRuntimeEventBytes(event));
    h.router.setPaused(true);
    h.emitA(event);
    expect(h.router.pendingStats().bytes).toBe(charged);
    const bounds = runtimePersistenceController.getBounds();
    const previous = { ...bounds };
    Object.assign(bounds, { maxSingleEventBytes: charged - 1 });
    try {
      h.router.setPaused(false);
      expect(h.published).toHaveLength(0);
      expect(runtimePersistenceController.sample().refusedBytes).toBeGreaterThanOrEqual(charged);
      expect(h.origin("a", "cost")).toBeUndefined();
    } finally {
      Object.assign(bounds, previous);
    }
  });

  it("SQL COMMIT rollback keeps original queue indices, payloads and usage together, and retry commits each origin once", () => {
    const queue = new RuntimeWriteQueue(
      applyThreadRuntimeEventsNow,
      {},
      () => 0,
      applyRuntimeEventBatchesNow,
    );
    for (const threadId of ["a", "b"]) {
      const key = threadId === "a" ? FORMAT_A : FORMAT_B;
      const events = eventsWithUsage(threadId);
      events[0] = captureRuntimePayloadOrigin(
        custodyStarted(threadId, "item", { exact: "evidence", from: key }),
        key,
      );
      queue.enqueue(threadId, admitted(threadId, events));
    }
    const beforeRows = durableRuntimeRows();
    const beforeOrigins = origins();
    const beforeQueue = queue.stats();
    let clock = 0;
    installDeferredCommitFailure(() => {
      clock += 5;
    });
    const outcome = queue.flushBudgeted({
      maxThreads: 4,
      maxBytes: 4 * 1024 * 1024,
      maxMs: 5,
      now: () => clock,
    });
    expect(outcome.failure).not.toBeNull();
    expect(getSqlite().inTransaction).toBe(false);
    expect(queue.stats()).toEqual(beforeQueue);
    expect(durableRuntimeRows()).toEqual(beforeRows);
    expect(origins()).toEqual(beforeOrigins);
    const rollbackSha256 = hash({ rows: durableRuntimeRows(), origins: origins() });
    expect(rollbackSha256).toBe(hash({ rows: beforeRows, origins: beforeOrigins }));
    getSqlite().exec("DROP TRIGGER atomic_test_failure");
    expect(
      queue.flushBudgeted({ maxThreads: 4, maxBytes: 4 * 1024 * 1024, maxMs: 5, now: () => clock }),
    ).toMatchObject({ committedEvents: 14, remainingThreads: 0 });
    expect(h.origin("a", "item")).toBe(FORMAT_A);
    expect(h.origin("b", "item")).toBe(FORMAT_B);
    expect(getSqlite().prepare("SELECT value FROM usage_events ORDER BY id").all()).toEqual([
      { value: 100 },
      { value: 19 },
      { value: 100 },
      { value: 19 },
    ]);
    const current = durableRuntimeRows();
    applyThreadRuntimeEventsNow(
      "a",
      eventsWithUsage("a").filter(
        (event) =>
          event.type === "item.started" ||
          event.type === "item.completed" ||
          event.type === "usage.spent",
      ),
    ); // Ignored duplicate + no-payload completion.
    expect(durableRuntimeRows()).toEqual(current);
    expect(h.origin("a", "item")).toBe(FORMAT_A);
    if (process.env.PORACODE_CUSTODY_RECEIPT)
      writeFileSync(
        process.env.PORACODE_CUSTODY_RECEIPT,
        JSON.stringify(
          {
            formatVersion: 1,
            rollback: {
              beforeSha256: hash({ rows: beforeRows, origins: beforeOrigins }),
              afterSha256: rollbackSha256,
              queueRetained: true,
            },
            commit: { inputEvents: 14, committedEvents: 14, origins: origins(), usageEvents: 4 },
            replayConservation: {
              beforeSha256: hash(current),
              afterSha256: hash(durableRuntimeRows()),
              exactRawCanonicalUsageAndStreams: true,
            },
          },
          null,
          2,
        ) + "\n",
      );
  });

  it("proven atomic rollback permits ordered single-thread fallback without relabeling unknown/mixed entries", () => {
    getSqlite().exec(
      "CREATE TRIGGER custody_poison BEFORE INSERT ON thread_runtime_items WHEN NEW.item_id = 'poison' BEGIN SELECT RAISE(ABORT, 'poison'); END;",
    );
    const queue = new RuntimeWriteQueue(
      applyThreadRuntimeEventsNow,
      {},
      () => 0,
      applyRuntimeEventBatchesNow,
    );
    queue.enqueue(
      "a",
      admitted("a", [
        captureRuntimePayloadOrigin(custodyStarted("a", "A"), FORMAT_A),
        custodyStarted("a", "unknown"),
      ]),
    );
    queue.enqueue(
      "b",
      admitted("b", [captureRuntimePayloadOrigin(custodyStarted("b", "poison"), FORMAT_B)]),
    );
    expect(
      queue.flushBudgeted({ maxThreads: 4, maxBytes: 4 * 1024 * 1024, maxMs: 5, now: () => 0 }),
    ).toMatchObject({ committedEvents: 2, remainingThreads: 1 });
    expect(h.origin("a", "A")).toBe(FORMAT_A);
    expect(h.origin("a", "unknown")).toBeUndefined();
    expect(h.origin("b", "poison")).toBeUndefined();
    getSqlite().exec("DROP TRIGGER custody_poison");
    expect(queue.flushThread("b").kind).toBe("committed");
    expect(h.origin("b", "poison")).toBe(FORMAT_B);
  });
});
