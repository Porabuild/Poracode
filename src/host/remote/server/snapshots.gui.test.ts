import { ThreadHistoryReplay } from "@/host/remote/server/threadHistoryReplay";
import { ThreadLiveReadState } from "@/host/remote/server/threadLiveReadState";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RuntimeFenceToken } from "@/host/db/runtimePersistenceTypes";
import type { RemoteServerContext } from "./context";
import { SessionConfigInventory } from "./sessionConfigInventory";
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
  readRuntimeFenceAsync: vi.fn<
    (token: RuntimeFenceToken, read: () => Promise<unknown>) => Promise<unknown>
  >((_token, read) => read()),
  releaseRuntimeFence: vi.fn<() => void>(),
}));

vi.mock("@/host/db/runtimeSnapshotRead", async () => import("./snapshotReads.testFixtures"));

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
      threadLiveReadState: new ThreadLiveReadState(),
      threadHistoryReplay: new ThreadHistoryReplay(),
      sessionConfigInventory: new SessionConfigInventory(),
    } as unknown as RemoteServerContext,
  };
}

describe("GUI snapshot supervisor reads", () => {
  it("returns GUI history without any supervisor reads or terminal scrollback", async () => {
    const { ctx, callSupervisor } = context();
    callSupervisor.mockImplementation(() => new Promise(() => {}));
    const snapshot = await buildThreadSnapshot(ctx, thread.id);
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(snapshot.terminalScrollback).toBeUndefined();
    expect(snapshot.terminalSize).toBeUndefined();
    expect(snapshot.thread.presentationMode).toBe("gui");
  });

  it("returns durable terminal history independently of the live terminal connection", async () => {
    vi.mocked(dbGetThread).mockReturnValue({ ...thread, presentationMode: "terminal" });
    const { ctx, callSupervisor } = context();
    callSupervisor.mockImplementation(() => new Promise(() => {}));
    const snapshot = await buildThreadSnapshot(ctx, thread.id);
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(snapshot.terminalScrollback).toBe("persisted history");
    expect(snapshot.terminalSize).toBeUndefined();
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
      threadLiveReadState: new ThreadLiveReadState(),
      threadHistoryReplay: new ThreadHistoryReplay(),
      sessionConfigInventory: new SessionConfigInventory(),
    } as unknown as RemoteServerContext;

    fence.pinned = [{ id: "early", type: "assistant_message", state: "updated", streams: {} }];
    const snapshotPromise = buildThreadSnapshot(ctx, thread.id);
    // A live event publishes while the persistence fence flush is suspended: its
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

  it("omits the inlined scrollback for cursor-sync clients", async () => {
    vi.mocked(dbGetThread).mockReturnValue({ ...thread, presentationMode: "terminal" });
    const { ctx, callSupervisor } = context();
    const snapshot = await buildThreadSnapshot(ctx, thread.id, { omitScrollback: true });
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(snapshot.terminalScrollback).toBeUndefined();
    expect(snapshot.terminalSize).toBeUndefined();
  });
});
