import { ThreadHistoryReplay } from "@/host/remote/server/threadHistoryReplay";
import {
  seedThreadLiveReadState,
  ThreadLiveReadState,
} from "@/host/remote/server/threadLiveReadState";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionConfigOptions, Thread, ThreadRuntimeSnapshot } from "@/shared/contracts";
import type { RuntimeFenceToken } from "@/host/db/runtimePersistenceTypes";
import type { RemoteServerContext } from "./context";
import { SessionConfigInventory } from "./sessionConfigInventory";
import { buildShellSnapshot, buildThreadListPage, buildThreadSnapshot } from "./snapshots";
import { dbGetThread, dbGetThreads, dbGetThreadsPage } from "@/host/db";

vi.mock("@/host/db", () => ({
  dbGetThreads: vi.fn<() => Thread[]>(() => []),
  dbGetThreadsPage: vi.fn<() => { threads: Thread[]; nextCursor: null }>(() => ({
    threads: [],
    nextCursor: null,
  })),
  dbGetProjects: vi.fn<() => never[]>(() => []),
  dbGetThreadRuntimeSummariesCommitted: vi.fn<() => Record<string, never>>(() => ({})),
  dbGetThread: vi.fn<() => Thread | undefined>(),
  dbReadThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
  dbReadLatestThreadGoalItem: vi.fn<() => null>(() => null),
  dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => null>(() => null),
  dbGetThreadTerminalScrollback: vi.fn<() => string>(() => ""),
  beginRuntimeFence: vi.fn<(threadId: string) => RuntimeFenceToken>((threadId) => ({
    threadId,
    throughPersistSeq: 0,
    generation: 1,
  })),
  flushRuntimeFence: vi.fn<() => Promise<unknown>>(async () => ({
    kind: "committed",
    persistSeq: 0,
    pendingEvents: 0,
    pendingBytes: 0,
  })),
  readRuntimeFenceAsync: vi.fn<
    (token: RuntimeFenceToken, read: () => Promise<unknown>) => Promise<unknown>
  >((_token, read) => read()),
}));

// These tests own host projection behavior; the read layer supplies committed
// data through its new aggregate seam instead of querying a real database.
vi.mock("@/host/db/legacyCatalogReads", async () => import("./snapshotReads.testFixtures"));
vi.mock("@/host/db/runtimeSnapshotRead", async () => import("./snapshotReads.testFixtures"));

const controls: SessionConfigOptions = [
  {
    type: "select",
    id: "model",
    name: "Model",
    role: "model",
    values: [{ value: "default", name: "Default" }],
    groups: [{ id: "main", name: "Main" }],
  },
];

function dbRow(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project",
    title: "Chat",
    agentKind: "acp-agent",
    config: { model: "default" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

function runtimeSnapshot(overrides: Partial<ThreadRuntimeSnapshot>): ThreadRuntimeSnapshot {
  return {
    threadId: "thread-1",
    agentKind: "acp-agent",
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    ...overrides,
  };
}

function context(
  inventory: SessionConfigInventory,
  callSupervisor?: RemoteServerContext["options"]["callSupervisor"],
) {
  return {
    options: {
      // Non-seeded procedures answer the null/empty shape so the builder's
      // fallbacks apply (empty scrollback falls back to the persisted read,
      // a null terminal size stays absent).
      callSupervisor:
        callSupervisor ??
        (async (method: string) =>
          method === "getThreadSnapshots" ? ([] as never) : (null as never)),
    },
    seq: 7,
    backgroundTasksByThread: new Map(),
    threadLiveReadState: new ThreadLiveReadState(),
    threadHistoryReplay: new ThreadHistoryReplay(),
    sessionConfigInventory: inventory,
  } as unknown as RemoteServerContext;
}

beforeEach(() => {
  vi.mocked(dbGetThread).mockReturnValue(dbRow());
  vi.mocked(dbGetThreads).mockReturnValue([dbRow()]);
  vi.mocked(dbGetThreadsPage).mockReturnValue({ threads: [dbRow()], nextCursor: null });
});

describe("session-config pull enrichment", () => {
  it("overlays the event inventory onto shell snapshot rows and prunes deleted threads", () => {
    const inventory = new SessionConfigInventory();
    inventory.observeThreadState({
      threadId: "thread-1",
      agentKind: "acp-agent",
      sessionConfigOptions: controls,
    });
    inventory.observeThreadState({
      threadId: "deleted-thread",
      agentKind: "acp-agent",
      sessionConfigOptions: controls,
    });
    const snapshot = buildShellSnapshot(context(inventory));
    expect(snapshot.threads[0]?.sessionConfigOptions).toEqual(controls);
    // The unbounded list saw the full catalog: the deleted thread's entry is gone.
    expect(inventory.entryFor("deleted-thread")).toBeUndefined();
  });

  it("serves a retired (null) inventory on the shell snapshot", () => {
    const inventory = new SessionConfigInventory();
    inventory.observeThreadState({
      threadId: "thread-1",
      agentKind: "acp-agent",
      sessionConfigOptions: null,
    });
    const snapshot = buildShellSnapshot(context(inventory));
    expect(snapshot.threads[0]?.sessionConfigOptions).toBeNull();
  });

  it("leaves shell rows untouched when the store has no inventory", () => {
    const snapshot = buildShellSnapshot(context(new SessionConfigInventory()));
    expect(snapshot.threads[0]).not.toHaveProperty("sessionConfigOptions");
  });

  it("overlays the event inventory onto thread-list pages without pruning", () => {
    const inventory = new SessionConfigInventory();
    inventory.observeThreadState({
      threadId: "thread-1",
      agentKind: "acp-agent",
      sessionConfigOptions: controls,
    });
    inventory.observeThreadState({
      threadId: "deleted-thread",
      agentKind: "acp-agent",
      sessionConfigOptions: controls,
    });
    const page = buildThreadListPage(context(inventory), { limit: 10 });
    expect(page.threads[0]?.sessionConfigOptions).toEqual(controls);
    // A bounded page cannot vouch for absence, so it never prunes.
    expect(inventory.entryFor("deleted-thread")).toBeDefined();
  });

  it("seeds the inventory independently of history and serves cached controls", async () => {
    const inventory = new SessionConfigInventory();
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
      async (method) => {
        if (method === "getThreadSnapshots") {
          return [
            runtimeSnapshot({ threadId: "thread-1", sessionConfigOptions: controls }),
            runtimeSnapshot({ threadId: "other-live-thread", sessionConfigOptions: controls }),
          ] as never;
        }
        return null as never;
      },
    );
    const ctx = context(inventory, callSupervisor);
    await seedThreadLiveReadState(ctx, () => {});
    callSupervisor.mockClear();
    const snapshot = await buildThreadSnapshot(ctx, "thread-1");
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(snapshot.thread.sessionConfigOptions).toEqual(controls);
    // The no-arg pull seeds every live session, not just the opened one.
    expect(inventory.entryFor("other-live-thread")).toBeDefined();
  });

  it("prefers an event that landed while the seed was in flight", async () => {
    const inventory = new SessionConfigInventory();
    let releaseSeed!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSeed = resolve;
    });
    let markSeedStarted!: () => void;
    const seedStarted = new Promise<void>((resolve) => {
      markSeedStarted = resolve;
    });
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
      async (method) => {
        if (method === "getThreadSnapshots") {
          markSeedStarted();
          await gate;
        }
        return null as never;
      },
    );
    const ctx = context(inventory, callSupervisor);
    const seed = seedThreadLiveReadState(ctx, () => {});
    // Wait until the builder captured its seed token, then race the event in.
    await seedStarted;
    inventory.observeThreadState({
      threadId: "thread-1",
      agentKind: "acp-agent",
      sessionConfigOptions: null,
    });
    releaseSeed();
    await seed;
    const snapshot = await buildThreadSnapshot(ctx, "thread-1");
    // The late seed (empty supervisor answer) must not clobber the retirement.
    expect(snapshot.thread.sessionConfigOptions).toBeNull();
  });

  it("keeps the older-host row shape when the seed call fails", async () => {
    const inventory = new SessionConfigInventory();
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
      async (method) => {
        if (method === "getThreadSnapshots") throw new Error("old supervisor");
        return null as never;
      },
    );
    const snapshot = await buildThreadSnapshot(context(inventory, callSupervisor), "thread-1");
    expect(snapshot.thread).not.toHaveProperty("sessionConfigOptions");
  });

  it("serves an event-installed inventory on the opened-thread snapshot", async () => {
    const inventory = new SessionConfigInventory();
    inventory.observeThreadState({
      threadId: "thread-1",
      agentKind: "acp-agent",
      sessionConfigOptions: controls,
    });
    const snapshot = await buildThreadSnapshot(context(inventory), "thread-1");
    expect(snapshot.thread.sessionConfigOptions).toEqual(controls);
  });

  it("retires a foreign-owner inventory on the opened-thread snapshot", async () => {
    const inventory = new SessionConfigInventory();
    inventory.observeThreadState({
      threadId: "thread-1",
      agentKind: "previous-agent",
      sessionConfigOptions: controls,
    });
    vi.mocked(dbGetThread).mockReturnValue(dbRow({ agentKind: "switched-agent" }));
    const snapshot = await buildThreadSnapshot(context(inventory), "thread-1");
    expect(snapshot.thread).not.toHaveProperty("sessionConfigOptions");
    expect(inventory.entryFor("thread-1")).toBeUndefined();
  });
  it.each(["switch", "delete"])(
    "re-reads the row after a %s during a pending inventory seed",
    async (mutation) => {
      const inventory = new SessionConfigInventory();
      let releaseSeed!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseSeed = resolve;
      });
      let markSeedStarted!: () => void;
      const seedStarted = new Promise<void>((resolve) => {
        markSeedStarted = resolve;
      });
      const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
        async (method) => {
          if (method === "getThreadSnapshots") {
            markSeedStarted();
            await gate;
            return [runtimeSnapshot({ sessionConfigOptions: controls })] as never;
          }
          return null as never;
        },
      );
      const ctx = context(inventory, callSupervisor);
      const seed = seedThreadLiveReadState(ctx, () => {});
      await seedStarted;
      // Let all other reads settle while this final read is deliberately held.
      await new Promise((resolve) => setTimeout(resolve, 0));
      vi.mocked(dbGetThread).mockReturnValue(
        mutation === "switch" ? dbRow({ agentKind: "replacement" }) : null,
      );
      releaseSeed();
      await seed;
      const outcome = await buildThreadSnapshot(ctx, "thread-1").then(
        (snapshot) => ({
          kind: "row",
          owner: snapshot.thread.agentKind,
          options: snapshot.thread.sessionConfigOptions,
        }),
        (error) => ({ kind: "error", code: error.code }),
      );
      expect(outcome).toEqual(
        mutation === "delete"
          ? { kind: "error", code: "thread_not_found" }
          : { kind: "row", owner: "replacement", options: undefined },
      );
    },
  );
});
