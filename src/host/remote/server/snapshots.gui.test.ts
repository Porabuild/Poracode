import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RuntimeFenceToken } from "@/host/db/runtimePersistenceTypes";
import type { RemoteServerContext } from "./context";
import { buildThreadSnapshot } from "./snapshots";
import { dbGetThread, dbReadThreadRuntimeItems } from "@/host/db";

const { MockPersistenceDegradedError, MockPersistenceContaminatedError, fence } = vi.hoisted(
  () => ({
    MockPersistenceDegradedError: class extends Error {
      override name = "RuntimePersistenceDegradedError";
      constructor(..._args: unknown[]) {
        super("runtime persistence degraded");
      }
    },
    MockPersistenceContaminatedError: class extends Error {
      override name = "RuntimePersistenceContaminatedError";
      constructor(..._args: unknown[]) {
        super("runtime persistence contaminated");
      }
    },
    fence: {
      /** Tests set this to force a non-committed fence outcome. */
      outcome: null as null | Record<string, unknown>,
      /** Committed rows at pin time; `beginRuntimeFence` snapshots this. */
      pinned: [] as unknown[],
      /** What the read behind the held fence sees. */
      captured: [] as unknown[],
    },
  }),
);

vi.mock("@/host/db", () => ({
  dbGetThread: vi.fn<() => Thread | undefined>(),
  dbReadThreadRuntimeItems: vi.fn<() => unknown[]>(() => fence.captured),
  dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => null>(() => null),
  dbGetThreadTerminalScrollback: vi.fn<() => string>(() => "persisted history"),
  RuntimePersistenceDegradedError: MockPersistenceDegradedError,
  RuntimePersistenceContaminatedError: MockPersistenceContaminatedError,
  beginRuntimeFence: vi.fn<(threadId: string) => RuntimeFenceToken>((threadId) => {
    fence.captured = [...fence.pinned];
    return { threadId, throughPersistSeq: 0, generation: 1 };
  }),
  flushRuntimeFence: vi.fn<() => Promise<unknown>>(async () =>
    fence.outcome === null
      ? { kind: "committed", persistSeq: 0, pendingEvents: 0, pendingBytes: 0 }
      : fence.outcome,
  ),
  readRuntimeFence: vi.fn<(token: RuntimeFenceToken, read: () => unknown) => unknown>(
    (_token, read) => read(),
  ),
  releaseRuntimeFence: vi.fn<() => void>(),
}));

const thread: Thread = {
  id: "snapshot-gui",
  projectId: "project",
  title: "Chat",
  agentKind: "claude",
  config: { model: "default" },
  presentationMode: "gui",
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-09-09T00:00:00Z",
  updatedAt: "2026-09-09T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(dbGetThread).mockReturnValue(thread);
  fence.outcome = null;
  fence.pinned = [];
  vi.mocked(dbReadThreadRuntimeItems).mockImplementation(() => fence.captured as never[]);
});

function context() {
  const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(async (method) => {
    if (method === "readTerminalScrollback") return "live terminal history";
    if (method === "readTerminalSize") return { cols: 80, rows: 24 };
    return [];
  });
  return {
    callSupervisor,
    ctx: {
      options: { callSupervisor },
      seq: 7,
      backgroundTasksByThread: new Map(),
    } as unknown as RemoteServerContext,
  };
}

describe("GUI snapshot supervisor reads", () => {
  it("reads structured background work and follow-up queues for a GUI chat", async () => {
    const { ctx, callSupervisor } = context();
    const snapshot = await buildThreadSnapshot(ctx, thread.id);
    expect(callSupervisor.mock.calls.map(([method]) => method)).toEqual([
      "readThreadBackgroundTasks",
      "getThreadFollowUpQueue",
    ]);
    expect(snapshot.terminalScrollback).toBe("persisted history");
    expect(snapshot.terminalSize).toBeUndefined();
    expect(snapshot.thread.presentationMode).toBe("gui");
  });

  it("preserves live terminal reads for terminal presentation", async () => {
    vi.mocked(dbGetThread).mockReturnValue({ ...thread, presentationMode: "terminal" });
    const { ctx, callSupervisor } = context();
    const snapshot = await buildThreadSnapshot(ctx, thread.id);
    expect(callSupervisor).toHaveBeenCalledTimes(3);
    expect(snapshot.terminalScrollback).toBe("live terminal history");
    expect(snapshot.terminalSize).toEqual({ cols: 80, rows: 24 });
  });

  it("captures the transcript and its cursor in one synchronous tick", async () => {
    let seq = 7;
    let releaseRead!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
      async (method) => {
        if (method === "readThreadBackgroundTasks") await gate;
        return [];
      },
    );
    const ctx = {
      options: { callSupervisor },
      get seq() {
        return seq;
      },
      backgroundTasksByThread: new Map(),
    } as unknown as RemoteServerContext;

    fence.pinned = [{ id: "early", type: "assistant_message", state: "updated", streams: {} }];
    const snapshotPromise = buildThreadSnapshot(ctx, thread.id);
    // A live event publishes while the supervisor read is suspended: its
    // sequence advances and its item commits. The held fence pinned the
    // transcript before that, so the snapshot must not carry the late item
    // (it is > cursor); replay delivers it exactly once instead.
    seq = 9;
    fence.pinned = [
      { id: "early", type: "assistant_message", state: "updated", streams: {} },
      { id: "late", type: "assistant_message", state: "updated", streams: {} },
    ];
    releaseRead();
    const snapshot = await snapshotPromise;

    expect(snapshot.snapshotSeq).toBe(7);
    expect(snapshot.runtimeItems.map((item) => item.id)).toEqual(["early"]);
  });

  it("refuses a degraded fence read with a retryable typed error", async () => {
    const { ctx } = context();
    fence.outcome = {
      kind: "degraded",
      persistSeq: 0,
      errorClass: "storage",
      error: new MockPersistenceDegradedError(),
    };
    await expect(buildThreadSnapshot(ctx, thread.id)).rejects.toMatchObject({
      code: "persistence_degraded",
      status: 503,
    });
  });

  it("refuses a contaminated fence read with a retryable typed error", async () => {
    const { ctx } = context();
    fence.outcome = {
      kind: "contaminated",
      persistSeq: 0,
      reason: "thread-bytes",
      refusedEvents: 3,
      refusedBytes: 512,
    };
    await expect(buildThreadSnapshot(ctx, thread.id)).rejects.toMatchObject({
      code: "persistence_contaminated",
      status: 503,
    });
  });

  it("omits the inlined scrollback for cursor-sync clients but keeps the terminal size", async () => {
    vi.mocked(dbGetThread).mockReturnValue({ ...thread, presentationMode: "terminal" });
    const { ctx, callSupervisor } = context();
    const snapshot = await buildThreadSnapshot(ctx, thread.id, { omitScrollback: true });
    // WS3 #2: the watch baseline re-delivers the tail — never fetch or inline it.
    expect(callSupervisor.mock.calls.map(([method]) => method)).toEqual([
      "readTerminalSize",
      "readThreadBackgroundTasks",
    ]);
    expect(snapshot.terminalScrollback).toBeUndefined();
    expect(snapshot.terminalSize).toEqual({ cols: 80, rows: 24 });
  });
});
