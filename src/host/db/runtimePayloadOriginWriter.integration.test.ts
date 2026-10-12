import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { makeRuntimePayloadCustodyHarness } from "@/backend/runtimePayloadCustody.testFixtures";
import {
  custodyAdapter,
  custodyStarted,
  FORMAT_A,
  FORMAT_B,
} from "@/supervisor/runtime/threadSession/runtimePayloadCustody.testFixtures";
import { getSqlite } from "./connection";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbReplaceThreadRuntimeSnapshot,
} from "./runtimeItems";
import {
  captureRuntimePayloadOrigin,
  admitRuntimePayloadOriginEnvelope,
  admittedRuntimePayloadBatch,
  serializeRuntimePayloadOrigins,
} from "@/shared/runtimePayloadOriginProtocol";
import { applyThreadRuntimeEventsNow } from "./runtimeItemsWriter";
import { installFixtureOrigin } from "./runtimePayloadOrigins.testFixtures";
import { reserveRuntimeAdmission, applyReservedRuntimeEvents } from "./runtimePersistenceRuntime";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";

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
async function emit(event: RuntimeEvent, key: string | undefined) {
  h.source.attach(event.threadId, custodyAdapter("mutable-route", key)).handle.emit(event);
  await h.flush();
}
const update = (payload: unknown): RuntimeEvent => ({
  type: "item.updated",
  threadId: "a",
  itemId: "item",
  payload,
});

describe("canonical SQL payload installation custody regressions", () => {
  it("stamps only successful fresh INSERTs and preserves ignored duplicate starts from any producer", async () => {
    await emit(custodyStarted("a", "item", { first: "A", unknown: { preserved: true } }), FORMAT_A);
    const before = h.row("a", "item");
    await emit(custodyStarted("a", "item", { replacement: "B" }), FORMAT_B);
    expect(h.row("a", "item")).toEqual(before);
    expect(h.origin("a", "item")).toBe(FORMAT_A);
    await emit(custodyStarted("a", "item", { synthetic: true }), undefined);
    expect(h.row("a", "item")).toEqual(before);
    expect(h.origin("a", "item")).toBe(FORMAT_A);
    await emit(custodyStarted("a", "unknown", { retained: "unknown" }), undefined);
    await emit(custodyStarted("a", "unknown", { ignored: "A" }), FORMAT_A);
    expect(h.origin("a", "unknown")).toBeUndefined();
  });

  it("same-producer shallow merges preserve proof; cross-producer and unknown prior evidence cannot be certified", async () => {
    await emit(custodyStarted("a", "item", { retained: "A", status: "running" }), FORMAT_A);
    await emit(update({ status: "next", result: { exact: "🙂\r\n" } }), FORMAT_A);
    expect(h.origin("a", "item")).toBe(FORMAT_A);
    expect(h.row("a", "item")).toMatchObject({
      payload: JSON.stringify({ retained: "A", status: "next", result: { exact: "🙂\r\n" } }),
    });
    await emit(update({ status: "cross-B" }), FORMAT_B);
    expect(h.origin("a", "item")).toBeUndefined();
    await emit(update({ status: "A-again" }), FORMAT_A);
    expect(h.origin("a", "item")).toBeUndefined();
    await emit(
      { type: "item.completed", threadId: "a", itemId: "item", payload: { status: "complete" } },
      FORMAT_A,
    );
    expect(h.origin("a", "item")).toBeUndefined();
    expect(h.row("a", "item")).toMatchObject({
      state: "completed",
      payload: JSON.stringify({ retained: "A", status: "complete", result: { exact: "🙂\r\n" } }),
    });
  });

  it("a separately complete replacement owns the resulting payload without claiming retained shallow evidence", async () => {
    await emit(custodyStarted("a", "item", { retained: "unknown" }), undefined);
    await emit(update("B-complete-evidence"), FORMAT_B);
    expect(h.origin("a", "item")).toBe(FORMAT_B);
    expect(h.row("a", "item")).toMatchObject({ payload: '"B-complete-evidence"' });
    await emit(update({ replacedPrimitive: "A" }), FORMAT_A);
    expect(h.origin("a", "item")).toBe(FORMAT_A);
  });

  it("no-payload completions, stream and state writes preserve valid unchanged evidence, without inferring from current B", async () => {
    await emit(custodyStarted("a", "item", { retained: "A", number: 0 }), FORMAT_A);
    const raw = (h.row("a", "item") as { payload: string }).payload;
    await emit(
      {
        type: "content.delta",
        threadId: "a",
        itemId: "item",
        stream: "command_output",
        delta: "first\r\n🙂",
      },
      FORMAT_B,
    );
    await emit(
      {
        type: "content.delta",
        threadId: "a",
        itemId: "item",
        stream: "command_output",
        delta: " second",
      },
      undefined,
    );
    expect(h.origin("a", "item")).toBe(FORMAT_A);
    await emit({ type: "item.completed", threadId: "a", itemId: "item" }, FORMAT_B);
    expect(h.origin("a", "item")).toBe(FORMAT_A);
    expect(h.row("a", "item")).toMatchObject({ payload: raw, state: "completed" });
    getSqlite()
      .prepare(
        "UPDATE thread_runtime_items SET state = 'updated' WHERE thread_id = 'a' AND item_id = 'item'",
      )
      .run();
    expect(h.origin("a", "item")).toBe(FORMAT_A);
  });

  it("no-payload completion retains proved evidence through the released JSON encoding and clears malformed prior evidence", async () => {
    await emit(
      custodyStarted("a", "spaced", { exact: "\r\n🙂", summary: { added: 0 } }),
      undefined,
    );
    getSqlite()
      .prepare(
        "UPDATE thread_runtime_items SET payload = ? WHERE thread_id = 'a' AND item_id = 'spaced'",
      )
      .run(' { "exact": "\\r\\n🙂", "summary": {"added":0} } ');
    installFixtureOrigin(
      getSqlite(),
      "spaced",
      { formatOwnerKey: FORMAT_A, originFormatVersion: 1 },
      "a",
    );
    await emit({ type: "item.completed", threadId: "a", itemId: "spaced" }, FORMAT_B);
    expect(h.origin("a", "spaced")).toBe(FORMAT_A);
    expect(h.row("a", "spaced")).toMatchObject({
      payload: '{"exact":"\\r\\n🙂","summary":{"added":0}}',
    });
    await emit(custodyStarted("a", "malformed"), undefined);
    getSqlite()
      .prepare(
        "UPDATE thread_runtime_items SET payload = '{invalid' WHERE thread_id = 'a' AND item_id = 'malformed'",
      )
      .run();
    installFixtureOrigin(
      getSqlite(),
      "malformed",
      { formatOwnerKey: FORMAT_A, originFormatVersion: 1 },
      "a",
    );
    await emit({ type: "item.completed", threadId: "a", itemId: "malformed" }, FORMAT_A);
    expect(h.origin("a", "malformed")).toBeUndefined();
    expect(h.row("a", "malformed")).toMatchObject({ payload: null });
  });

  it("disabled admission2 remains explicitly unknown and uses its unchanged event-only quote costs", async () => {
    const event = custodyStarted("a", "admission2");
    const wire = serializeRuntimePayloadOrigins(
      {
        type: "thread-runtime-event",
        threadId: "a",
        event: captureRuntimePayloadOrigin(event, FORMAT_A),
      },
      "boot",
    );
    const admission = admitRuntimePayloadOriginEnvelope(
      JSON.parse(JSON.stringify(wire)) as typeof wire,
      "boot",
    )!;
    const bytes = estimateRuntimeEventBytes(event);
    const lease = reserveRuntimeAdmission("a", {
      eventCount: 1,
      eventBytes: bytes,
      maxEventBytes: bytes,
    });
    if (lease.kind !== "granted") throw new Error("Expected an event-only reservation.");
    expect(
      applyReservedRuntimeEvents(
        "a",
        lease.reservation.id,
        admittedRuntimePayloadBatch(admission, 0).events,
      ).kind,
    ).toBe("accepted");
    await dbFlushThreadRuntimeWrites();
    expect(h.origin("a", "admission2")).toBeUndefined();
    expect(h.core.supervisorClient.getPeerCanonicalCapabilities().admissionVersion).toBeUndefined();
  });

  it("synthetic/direct same-byte assignments and public snapshot replacements invalidate proof", async () => {
    await emit(custodyStarted("a", "item", { value: "A" }), FORMAT_A);
    await emit(update({ value: "A" }), undefined);
    expect(h.origin("a", "item")).toBeUndefined();
    await emit(custodyStarted("a", "direct", { value: "A" }), FORMAT_A);
    getSqlite()
      .prepare(
        "UPDATE thread_runtime_items SET payload = payload WHERE thread_id = 'a' AND item_id = 'direct'",
      )
      .run();
    expect(h.origin("a", "direct")).toBeUndefined();
    await emit(custodyStarted("a", "snapshot", { value: "A" }), FORMAT_A);
    await dbReplaceThreadRuntimeSnapshot(
      "a",
      [
        {
          id: "snapshot",
          type: "tool_call",
          state: "started",
          payload: { value: "A", origin: FORMAT_A },
          streams: {},
        },
      ],
      [],
      null,
    );
    expect(h.origin("a", "snapshot")).toBeUndefined();
    expect(h.row("a", "item")).toBeUndefined();
    expect(h.row("a", "direct")).toBeUndefined();
  });

  it("public exposure cannot mutate admitted evidence and even real admission tags cannot enter public DB intake", async () => {
    h.emitA(custodyStarted("a", "item", { value: "actual-source" }));
    h.router.flush();
    const event = h.published[0]!;
    if (event.type !== "thread-runtime-event" || event.event.type !== "item.started")
      throw new Error("Expected a single actual source event.");
    (event.event.payload as { value: string }).value = "public-mutation";
    await dbFlushThreadRuntimeWrites();
    expect(h.row("a", "item")).toMatchObject({ payload: '{"value":"actual-source"}' });
    expect(h.origin("a", "item")).toBe(FORMAT_A);
    const wire = serializeRuntimePayloadOrigins(
      {
        type: "thread-runtime-event",
        threadId: "a",
        event: captureRuntimePayloadOrigin(custodyStarted("a", "public-replay"), FORMAT_A),
      },
      "boot",
    );
    const admission = admitRuntimePayloadOriginEnvelope(
      JSON.parse(JSON.stringify(wire)) as typeof wire,
      "boot",
    )!;
    dbApplyThreadRuntimeEvents("a", admittedRuntimePayloadBatch(admission, 0).events);
    await dbFlushThreadRuntimeWrites();
    expect(h.origin("a", "public-replay")).toBeUndefined();
  });

  it("missing updates, reasoning deletion, malformed serialization and SQL errors preserve the writer's existing effects/exceptions", async () => {
    await emit(
      { type: "item.completed", threadId: "a", itemId: "missing", payload: { from: "A" } },
      FORMAT_A,
    );
    expect(h.origin("a", "missing")).toBeUndefined();
    await emit(
      {
        type: "item.started",
        threadId: "a",
        itemId: "reasoning",
        itemType: "reasoning",
        payload: {},
      },
      FORMAT_A,
    );
    expect(h.origin("a", "reasoning")).toBe(FORMAT_A);
    await emit({ type: "item.completed", threadId: "a", itemId: "reasoning" }, FORMAT_A);
    expect(h.row("a", "reasoning")).toBeUndefined();
    expect(h.origin("a", "reasoning")).toBeUndefined();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => applyThreadRuntimeEventsNow("a", [custodyStarted("a", "cyclic", cyclic)])).toThrow(
      /circular/i,
    );
    expect(h.row("a", "cyclic")).toBeUndefined();
    expect(h.origin("a", "cyclic")).toBeUndefined();
  });

  it("user items and synthetic request wrappers remain unknown even under a declared actual adapter", async () => {
    await emit(
      {
        type: "item.started",
        threadId: "a",
        itemId: "user",
        itemType: "user_message",
        payload: { content: "user" },
      },
      FORMAT_A,
    );
    await emit(
      { type: "item.updated", threadId: "a", itemId: "user", payload: { content: "edited" } },
      FORMAT_A,
    );
    expect(h.origin("a", "user")).toBeUndefined();
    await emit(
      {
        type: "request.opened",
        threadId: "a",
        requestId: "req",
        requestType: "tool_call_approval",
        payload: { summary: "synthetic wrapper" },
      },
      FORMAT_A,
    );
    expect(
      getSqlite()
        .prepare("SELECT COUNT(*) AS count FROM thread_runtime_item_payload_origins")
        .get(),
    ).toEqual({ count: 0 });
  });
});
