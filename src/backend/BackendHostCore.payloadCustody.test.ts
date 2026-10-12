import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { getSqlite } from "@/host/db/connection";
import { dbApplyThreadRuntimeEvents, dbFlushThreadRuntimeWrites } from "@/host/db/runtimeItems";
import { persistSupervisorEvent } from "@/host/remote/server/runtimePersistence";
import {
  FORMAT_A,
  FORMAT_B,
  CustodyHandle,
  custodyAdapter,
  custodyStarted,
} from "@/supervisor/runtime/threadSession/runtimePayloadCustody.testFixtures";
import { SubagentRunManager } from "@/supervisor/crossagentMcp/SubagentRunManager";
import { ThreadSessionManager } from "@/supervisor/runtime/threadSessionManager";
import {
  makeRuntimePayloadCustodyHarness,
  settleCustodyMicrotasks,
} from "./runtimePayloadCustody.testFixtures";
import { captureRuntimePayloadOrigin } from "@/shared/runtimePayloadOriginProtocol";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";

const mocks = vi.hoisted(() => ({ fork: vi.fn<(...args: unknown[]) => unknown>() }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: mocks.fork,
}));
vi.mock("@/supervisor/agents/base", async (original) => ({
  ...(await original<typeof import("@/supervisor/agents/base")>()),
  resolveAgentProjectLocation: async (location: unknown) => location,
}));
type Harness = Awaited<ReturnType<typeof makeRuntimePayloadCustodyHarness>>;
let h: Harness | undefined;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (h) await h.dispose();
  h = undefined;
  vi.useRealTimers();
});

describe("actual producer → buffer → IPC → BackendHostCore → queue → SQL custody", () => {
  it("captures actual A/B adapters, rejects stale callbacks, preserves admission ACK and never publishes metadata", async () => {
    h = await makeRuntimePayloadCustodyHarness(mocks.fork);
    const stale = h.a.handle.listener!;
    h.a.session.agentKind = h.adapterB.kind; // Mutable thread/profile routing is not the source.
    h.a.session.adapter = h.adapterB;
    h.emitA(custodyStarted("a", "from-a"));
    h.emitB(custodyStarted("b", "from-b"));
    h.router.flush();
    expect(h.origin("a", "from-a")).toBeUndefined(); // ACK is admission, not SQL commit.
    expect(h.wire[0]?.type).toBe("thread-runtime-events-multi");
    expect(h.wire[0]).toHaveProperty("runtimePayloadOrigins.entries", [
      [0, 0, FORMAT_A],
      [1, 0, FORMAT_B],
    ]);
    expect(h.published).toHaveLength(1);
    expect(JSON.stringify(h.published)).not.toContain("runtimePayloadOrigins");
    vi.advanceTimersByTime(0);
    expect(
      h.child.send.mock.calls.some(
        ([m]) => (m as { control?: string }).control === "ack-canonical-flow",
      ),
    ).toBe(true);
    expect(h.origin("a", "from-a")).toBeUndefined();
    await dbFlushThreadRuntimeWrites();
    expect(h.origin("a", "from-a")).toBe(FORMAT_A);
    expect(h.origin("b", "from-b")).toBe(FORMAT_B);
    const replacement = h.source.attach("a", h.adapterB);
    stale.onRuntimeEvent?.(custodyStarted("a", "stale-a"));
    replacement.session.ignoreExit = true;
    replacement.handle.emit(custodyStarted("a", "ignored-b"));
    replacement.session.ignoreExit = false;
    replacement.handle.emit(custodyStarted("a", "fresh-b"));
    await h.flush();
    expect(h.row("a", "stale-a")).toBeUndefined();
    expect(h.row("a", "ignored-b")).toBeUndefined();
    expect(h.origin("a", "fresh-b")).toBe(FORMAT_B);
    expect(h.core.supervisorClient.getPeerCanonicalCapabilities().admissionVersion).toBeUndefined();
  });

  it("keeps old-receiver and old-sender writes unknown while ignoring native origin strings", async () => {
    h = await makeRuntimePayloadCustodyHarness(mocks.fork, { negotiate: false });
    h.sender.enableRuntimePayloadOrigins({
      control: "enable-runtime-payload-origins",
      version: 1,
      generation: "stale",
    });
    const native = {
      ...custodyStarted("a", "old-receiver"),
      runtimePayloadOrigins: { formatOwnerKey: FORMAT_B },
    };
    h.emitA(native as RuntimeEvent);
    await h.flush();
    expect(h.wire[0]).not.toHaveProperty("runtimePayloadOrigins");
    expect(h.origin("a", "old-receiver")).toBeUndefined();
    // New host receiving old events, even with a producer-like public string.
    h.child.emit("message", {
      type: "thread-runtime-event",
      threadId: "a",
      event: { ...custodyStarted("a", "old-sender"), origin: FORMAT_A },
    });
    await dbFlushThreadRuntimeWrites();
    expect(h.origin("a", "old-sender")).toBeUndefined();
    expect(JSON.stringify(h.published)).not.toContain("runtimePayloadOrigins");
  });

  it("keeps a structured childB owned by B under parentA, holds/releases its actual events, and leaves synthetic tiles unknown", async () => {
    h = await makeRuntimePayloadCustodyHarness(mocks.fork, { envelopeBytes: 1000 });
    const handles: CustodyHandle[] = [];
    const childAdapter = custodyAdapter("fixture-child-b", FORMAT_B, async () => {
      const handle = new CustodyHandle();
      handle.replay = custodyStarted("child", "history-before-dispatch");
      handles.push(handle);
      return handle;
    });
    // Execute the actual parent append wrapper without constructing a process-owning manager.
    const wrapper = Object.assign(Object.create(ThreadSessionManager.prototype) as object, {
      sessions: h.source.sessions,
      runtimeEventRouter: h.router,
    }) as unknown as ThreadSessionManager;
    const manager = new SubagentRunManager({
      adapters: new Map([[childAdapter.kind, childAdapter]]),
      host: {
        getParentContext: () => ({
          projectLocation: { kind: "posix", path: "/fixture" },
          config: { model: "fixture-model" },
        }),
        appendRuntimeEvent: (threadId, event) =>
          wrapper.appendSubagentRuntimeEvent(threadId, event),
      },
    });
    const { runId } = manager.spawn("parent", { agent: childAdapter.kind, prompt: "fixture" });
    await settleCustodyMicrotasks();
    const child = handles[0]!;
    const late = child.listener!;
    child.emit(custodyStarted("child", "native-tool", { retained: "child-B" }));
    child.emit({
      type: "content.delta",
      threadId: "child",
      itemId: "native-tool",
      stream: "command_output",
      delta: "one",
    });
    child.emit({
      type: "content.delta",
      threadId: "child",
      itemId: "native-tool",
      stream: "command_output",
      delta: "two",
    });
    child.emit({
      type: "item.updated",
      threadId: "child",
      itemId: "native-tool",
      payload: { next: "B" },
    });
    await h.flush();
    expect(h.wire.every((e) => !JSON.stringify(e).includes("native-tool"))).toBe(true); // Gated until subscribe.
    h.router.subscribe("parent", `sub:${runId}`);
    await h.flush();
    const rows = getSqlite()
      .prepare("SELECT item_id, payload FROM thread_runtime_items WHERE thread_id = 'parent'")
      .all() as Array<{ item_id: string; payload: string }>;
    const childRow = rows.find((row) => row.item_id.endsWith("native-tool"))!;
    expect(childRow).toBeDefined();
    expect(h.origin("parent", childRow.item_id)).toBe(FORMAT_B);
    expect(h.origin("parent", `sub:${runId}`)).toBeUndefined();
    expect(rows.some((row) => row.item_id.includes("history-before-dispatch"))).toBe(false);
    child.emit({ type: "turn.completed", threadId: "child", turnId: "turn", state: "completed" });
    await settleCustodyMicrotasks();
    await manager.waitForSettlement("parent", runId);
    late.onRuntimeEvent?.(custodyStarted("child", "stale-child"));
    await h.flush();
    expect(
      getSqlite()
        .prepare("SELECT 1 FROM thread_runtime_items WHERE item_id LIKE '%stale-child'")
        .get(),
    ).toBeUndefined();
    expect(JSON.stringify(h.published)).not.toContain("runtimePayloadOrigins");
  });

  it("generic enqueue, public persistence and public DB entry points cannot mint or replay custody", async () => {
    h = await makeRuntimePayloadCustodyHarness(mocks.fork);
    const tagged = captureRuntimePayloadOrigin(custodyStarted("a", "generic-enqueue"), FORMAT_A);
    const wrapper = Object.assign(
      Object.create(ThreadSessionManager.prototype) as ThreadSessionManager,
      { runtimeEventRouter: h.router },
    );
    (
      wrapper as unknown as { enqueueRuntimeEvent(threadId: string, event: RuntimeEvent): void }
    ).enqueueRuntimeEvent("a", tagged);
    await h.flush();
    expect(h.origin("a", "generic-enqueue")).toBeUndefined();
    const forged = {
      type: "thread-runtime-event" as const,
      threadId: "a",
      event: custodyStarted("a", "public-publisher"),
      runtimePayloadOrigins: { version: 1, generation: h.generation, entries: [[0, 0, FORMAT_A]] },
    };
    const outcome = persistSupervisorEvent(forged);
    expect(outcome.kind).toBe("publish");
    if (outcome.kind === "withhold") throw new Error("Expected public publication.");
    expect(outcome.event).not.toHaveProperty("runtimePayloadOrigins");
    dbApplyThreadRuntimeEvents("a", [
      captureRuntimePayloadOrigin(custodyStarted("a", "direct-db"), FORMAT_A),
    ]);
    await dbFlushThreadRuntimeWrites();
    expect(h.origin("a", "public-publisher")).toBeUndefined();
    expect(h.origin("a", "direct-db")).toBeUndefined();
  });

  it("the disabled events-only admission2 path publishes unknown payloads with every private field removed", async () => {
    h = await makeRuntimePayloadCustodyHarness(mocks.fork);
    h.child.emit("message", {
      kind: "supervisor-flow-control-capabilities",
      versions: [1],
      canonicalFlowGeneration: h.generation,
      canonicalAdmissionVersions: [2],
    });
    const event = custodyStarted("a", "private-admission2");
    const bytes = estimateRuntimeEventBytes(event);
    const identity = { version: 2, generation: h.generation, requestSeq: 1, threadId: "a" };
    h.child.emit("message", {
      kind: "canonical-admission-request",
      ...identity,
      cost: { eventCount: 1, eventBytes: bytes, maxEventBytes: bytes },
    });
    const grant = h.child.send.mock.calls
      .map(([m]) => m as { control?: string; reservationId?: string })
      .find((m) => m.control === "canonical-admission-grant")!;
    expect(grant).toBeDefined();
    h.child.emit("message", {
      kind: "canonical-admission-delivery",
      ...identity,
      reservationId: grant.reservationId,
      runtimePayloadOrigins: { version: 1 },
      events: [{ ...event, runtimePayloadOrigins: { formatOwnerKey: FORMAT_A } }],
    });
    await dbFlushThreadRuntimeWrites();
    expect(h.origin("a", "private-admission2")).toBeUndefined();
    expect(h.published).toHaveLength(1);
    expect(JSON.stringify(h.published)).not.toContain("runtimePayloadOrigins");
  });
});
