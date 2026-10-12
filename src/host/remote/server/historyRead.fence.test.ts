import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { CATALOG_READS_CAPABILITY } from "@/shared/remote/historyReadContract";
import type { RuntimeFenceToken } from "@/host/db/runtimePersistenceTypes";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";
import { buildBoundedThreadSnapshot, parseHistoryReadNegotiation } from "./historyRead";
import type { HistoryPageRowMeta } from "@/host/db/historyReads";

/**
 * B4 fence composition: the intake prefix and `ctx.seq` are captured in the
 * SAME synchronous turn before the awaited flush, phase 1 + phase 2 run inside
 * the held fence, and a failed fence outcome maps to the B1 typed 503 (never a
 * generic 500 or a short tail with a fresh cursor).
 */

const fence = vi.hoisted(() => ({
  fenceBegun: false,
  seqRead: 0,
  seqReadAtFlushCall: -1,
  insideFence: false,
  readCalled: false,
  phaseCalls: 0,
  phase1InsideFence: false,
  phase2InsideFence: false,
  phase2AfterPhase1: false,
  outcome: null as null | Record<string, unknown>,
}));

vi.mock("@/host/db/runtimePersistenceRuntime", () => ({
  beginRuntimeFence: vi.fn<(threadId: string) => RuntimeFenceToken>((threadId) => {
    fence.fenceBegun = true;
    return { threadId, throughPersistSeq: 0, generation: 1 };
  }),
  flushRuntimeFence: vi.fn<() => Promise<unknown>>(async () => {
    fence.seqReadAtFlushCall = fence.seqRead;
    return (
      fence.outcome ?? {
        kind: "committed",
        persistSeq: 0,
        pendingEvents: 0,
        pendingBytes: 0,
      }
    );
  }),
  readRuntimeFence: vi.fn<(token: RuntimeFenceToken, read: () => unknown) => unknown>(
    (_token, read) => {
      fence.readCalled = true;
      fence.insideFence = true;
      try {
        return read();
      } finally {
        fence.insideFence = false;
      }
    },
  ),
}));

vi.mock("@/host/db/projectsThreads", () => ({
  dbGetThread: vi.fn<() => Thread>(() => ({
    id: "thread-1",
    projectId: "project-1",
    title: "Fenced history",
    agentKind: "claude",
    config: { model: "default" },
    presentationMode: "gui",
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  })),
}));

vi.mock("@/host/db/terminalScrollback", () => ({
  dbGetThreadTerminalScrollback: vi.fn<() => string>(() => ""),
}));

vi.mock("@/host/db/historyReads", () => ({
  dbReadThreadHistoryPagePhase1: vi.fn<
    (threadId: string, query: unknown) => { rows: HistoryPageRowMeta[]; moreBeyondWindow: boolean }
  >((_threadId, _query) => {
    fence.phaseCalls += 1;
    fence.phase1InsideFence = fence.insideFence;
    return {
      rows: [
        {
          itemId: "item-1",
          position: 1,
          type: "assistant_message",
          state: "completed",
          parentItemId: null,
          kind: "item",
          boundWireBytes: 4096,
          boundStreamWireBytes: 4096,
          lowerBoundWireBytes: 128,
          lowerBoundDecodeBytes: 256,
          streamsElided: false,
        },
      ],
      moreBeyondWindow: false,
    };
  }),
  dbReadThreadHistoryPhase2: vi.fn<
    (
      threadId: string,
      ids: readonly string[],
    ) => Array<{ id: string; type: string; state: "completed"; streams: Record<string, string> }>
  >((_threadId, ids) => {
    fence.phase2InsideFence = fence.insideFence;
    fence.phase2AfterPhase1 = fence.phaseCalls === 1;
    return ids.map((id) => ({
      id,
      type: "assistant_message",
      state: "completed" as const,
      streams: {},
    }));
  }),
}));

vi.mock("@/host/db/completedTurnPages", () => ({
  dbReadCompletedTurnPhase1: vi.fn<() => { rows: never[]; moreBeyondWindow: false }>(() => ({
    rows: [],
    moreBeyondWindow: false,
  })),
  dbReadCompletedTurnPhase2: vi.fn<() => never[]>(() => []),
}));

vi.mock("@/host/db/runtimeItems", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/host/db/runtimeItems")>();
  return {
    ...actual,
    dbReadLatestThreadGoalItem: vi.fn<() => null>(() => null),
    dbGetThreadContextUsage: vi.fn<() => null>(() => null),
  };
});

function context(): RemoteServerContext {
  return {
    options: {
      callSupervisor: async (method: string) => {
        if (method === "readThreadBackgroundTasks") return [];
        return null;
      },
    },
    backgroundTasksByThread: new Map(),
    get seq() {
      fence.seqRead += 1;
      return 7;
    },
  } as unknown as RemoteServerContext;
}

function negotiation() {
  return parseHistoryReadNegotiation(
    new URL(`http://host/api/threads/thread-1/history?reads=${CATALOG_READS_CAPABILITY}`),
  );
}

describe("B4 bounded history fence composition", () => {
  it("captures seq before the awaited flush and runs phase 1 then phase 2 inside the held fence", async () => {
    fence.fenceBegun = false;
    fence.seqRead = 0;
    fence.seqReadAtFlushCall = -1;
    fence.insideFence = false;
    fence.readCalled = false;
    fence.phaseCalls = 0;
    fence.phase1InsideFence = false;
    fence.phase2InsideFence = false;
    fence.phase2AfterPhase1 = false;
    fence.outcome = null;

    const body = await buildBoundedThreadSnapshot(context(), "thread-1", negotiation());
    expect(body).toContain("item-1");
    expect(fence.fenceBegun).toBe(true);
    expect(fence.readCalled).toBe(true);
    // The cursor was read synchronously before the async flush was invoked.
    expect(fence.seqRead).toBeGreaterThan(0);
    expect(fence.seqReadAtFlushCall).toBeGreaterThan(0);
    // Both phases ran behind the held fence, phase 1 before phase 2.
    expect(fence.phase1InsideFence).toBe(true);
    expect(fence.phase2InsideFence).toBe(true);
    expect(fence.phase2AfterPhase1).toBe(true);
  });

  it("maps a contaminated fence outcome to the typed retryable 503", async () => {
    fence.outcome = {
      kind: "contaminated",
      persistSeq: 3,
      reason: "global-bytes",
      refusedEvents: 2,
      refusedBytes: 128,
    };
    let failure: unknown;
    try {
      await buildBoundedThreadSnapshot(context(), "thread-1", negotiation());
    } catch (error) {
      failure = error;
    }
    fence.outcome = null;
    expect(failure).toBeInstanceOf(RemoteHttpError);
    expect((failure as RemoteHttpError).status).toBe(503);
    expect((failure as RemoteHttpError).code).toBe("persistence_contaminated");
  });

  it("maps a cancelled fence outcome to a retryable read refusal", async () => {
    fence.outcome = { kind: "cancelled", persistSeq: 3 };
    let failure: unknown;
    try {
      await buildBoundedThreadSnapshot(context(), "thread-1", negotiation());
    } catch (error) {
      failure = error;
    }
    fence.outcome = null;
    expect(failure).toBeInstanceOf(RemoteHttpError);
    expect((failure as RemoteHttpError).status).toBe(503);
    expect((failure as RemoteHttpError).code).toBe("persistence_degraded");
  });
});
