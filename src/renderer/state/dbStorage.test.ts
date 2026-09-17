import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDbStorage } from "./dbStorage";

const bridge = vi.hoisted(() => ({
  windowKind: "main" as "main" | "quickComposer",
  dbGetProjects: vi.fn<() => Promise<[]>>(),
  dbGetThreads: vi.fn<() => Promise<[]>>(),
  dbGetThreadsPage:
    vi.fn<
      (query: {
        limit: number;
        cursor?: string;
      }) => Promise<{ threads: unknown[]; nextCursor: string | null }>
    >(),
  dbGetState: vi.fn<(key: string) => Promise<string | null>>(),
  dbSetState: vi.fn<(key: string, value: string) => Promise<void>>(),
  dbSyncAll: vi.fn<(projects: unknown[], threads: unknown[], viewJson: string) => Promise<void>>(),
  dbSyncChanges:
    vi.fn<
      (payload: {
        projects: unknown[];
        threads: unknown[];
        deletedProjectIds: string[];
        deletedThreadIds: string[];
        viewJson: string;
      }) => Promise<void>
    >(),
}));

vi.mock("../bridge", () => ({
  readBridge: () => bridge,
  isQuickComposerWindow: () => bridge.windowKind === "quickComposer",
}));

const captureRendererException = vi.hoisted(() =>
  vi.fn<(error: unknown, context?: { featureArea?: string }) => void>(),
);
vi.mock("../diagnostics/sentry", () => ({ captureRendererException }));

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createDbStorage", () => {
  beforeEach(() => {
    bridge.windowKind = "main";
    bridge.dbGetProjects.mockReset().mockResolvedValue([]);
    bridge.dbGetThreads.mockReset().mockResolvedValue([]);
    bridge.dbGetThreadsPage.mockReset().mockResolvedValue({ threads: [], nextCursor: null });
    bridge.dbGetState.mockReset().mockResolvedValue(null);
    bridge.dbSetState.mockReset().mockResolvedValue(undefined);
    bridge.dbSyncAll.mockReset().mockResolvedValue(undefined);
    bridge.dbSyncChanges.mockReset().mockResolvedValue(undefined);
    window.poracode = {} as typeof window.poracode;
  });

  it("skips duplicate app metadata writes before any SQLite call", async () => {
    const storage = createDbStorage<{
      projects: unknown[];
      threads: unknown[];
      view: { kind: "home" };
      groupLayouts: Record<string, unknown>;
    }>();
    const projects: unknown[] = [];
    const threads: unknown[] = [];
    const view = { kind: "home" as const };
    const groupLayouts = {};

    await storage.setItem("poracode-app-v2", {
      state: { projects, threads, view, groupLayouts },
      version: 5,
    });
    await storage.setItem("poracode-app-v2", {
      state: { projects, threads, view, groupLayouts },
      version: 5,
    });

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(1);
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();

    await storage.setItem("poracode-app-v2", {
      state: { projects, threads: [...threads], view, groupLayouts },
      version: 5,
    });

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(1);
    expect(bridge.dbSyncChanges).toHaveBeenCalledTimes(1);
  });

  it("ships only changed rows and explicit deletions after the first full sync", async () => {
    const storage = createDbStorage();
    const project = { id: "project-1" };
    const untouched = { id: "thread-kept", title: "kept" };
    const removed = { id: "thread-gone", title: "gone" };
    await storage.setItem("poracode-app-v2", {
      state: {
        projects: [project],
        threads: [untouched, removed],
        view: { kind: "home" },
        groupLayouts: {},
      },
      version: 5,
    });
    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(1);

    const edited = { id: "thread-kept", title: "kept (edited)" };
    const added = { id: "thread-new", title: "new" };
    await storage.setItem("poracode-app-v2", {
      state: {
        projects: [project],
        threads: [edited, added],
        view: { kind: "thread", panes: ["thread-new"] },
        groupLayouts: {},
      },
      version: 5,
    });

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(1);
    expect(bridge.dbSyncChanges).toHaveBeenCalledTimes(1);
    expect(bridge.dbSyncChanges).toHaveBeenCalledWith({
      projects: [],
      threads: [
        { thread: edited, sortOrder: 0 },
        { thread: added, sortOrder: 1 },
      ],
      deletedProjectIds: [],
      deletedThreadIds: ["thread-gone"],
      threadOrder: ["thread-kept", "thread-new"],
      viewJson: '{"kind":"thread","panes":["thread-new"]}',
    });
  });

  it("persists a drag reorder that permutes row objects without changing them", async () => {
    const storage = createDbStorage();
    const first = { id: "thread-1", title: "first" };
    const second = { id: "thread-2", title: "second" };
    await storage.setItem("poracode-app-v2", {
      state: {
        projects: [],
        threads: [first, second],
        view: { kind: "home" },
        groupLayouts: {},
      },
      version: 5,
    });
    bridge.dbSyncChanges.mockClear();

    // Same row objects, new array order — the identity diff is empty but the
    // id sequence changed, so the order list must travel.
    await storage.setItem("poracode-app-v2", {
      state: {
        projects: [],
        threads: [second, first],
        view: { kind: "home" },
        groupLayouts: {},
      },
      version: 5,
    });

    expect(bridge.dbSyncChanges).toHaveBeenCalledTimes(1);
    expect(bridge.dbSyncChanges).toHaveBeenCalledWith({
      projects: [],
      threads: [],
      deletedProjectIds: [],
      deletedThreadIds: [],
      threadOrder: ["thread-2", "thread-1"],
      viewJson: '{"kind":"home"}',
    });
  });

  it("does not echo the hydrated app snapshot back to SQLite", async () => {
    bridge.dbGetProjects.mockResolvedValue([]);
    bridge.dbGetThreadsPage.mockResolvedValue({ threads: [], nextCursor: null });
    bridge.dbGetState.mockImplementation(async (key) =>
      key === "view" ? '{"kind":"home"}' : null,
    );
    const storage = createDbStorage();
    const hydrated = await storage.getItem("poracode-app-v2");

    await storage.setItem("poracode-app-v2", hydrated as never);

    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
  });

  it("hydrates the thread list through bounded cursor pages, not one full-list read", async () => {
    bridge.dbGetProjects.mockResolvedValue([]);
    const pageOne = [{ id: "thread-0" }, { id: "thread-1" }];
    const pageTwo = [{ id: "thread-2" }];
    bridge.dbGetThreadsPage
      .mockResolvedValueOnce({ threads: pageOne, nextCursor: "tp1.abc" })
      .mockResolvedValueOnce({ threads: pageTwo, nextCursor: null });
    bridge.dbGetState.mockImplementation(async (key) =>
      key === "view" ? '{"kind":"home"}' : null,
    );
    const storage = createDbStorage();
    const hydrated = (await storage.getItem("poracode-app-v2")) as {
      state: { threads: unknown[] };
    } | null;

    expect(bridge.dbGetThreadsPage).toHaveBeenCalledTimes(2);
    expect(bridge.dbGetThreadsPage).toHaveBeenNthCalledWith(1, { limit: 100 });
    expect(bridge.dbGetThreadsPage).toHaveBeenNthCalledWith(2, {
      limit: 100,
      cursor: "tp1.abc",
    });
    expect(hydrated?.state.threads).toEqual([...pageOne, ...pageTwo]);
  });

  it("coalesces a synchronous app-state burst to the latest snapshot", async () => {
    const storage = createDbStorage();
    const writes = Array.from({ length: 1_000 }, (_, index) =>
      storage.setItem("poracode-app-v2", {
        state: {
          projects: [],
          threads: [{ id: String(index) }],
          view: { kind: "home" },
          groupLayouts: {},
        },
        version: 4,
      } as never),
    );

    await Promise.all(writes);

    expect(bridge.dbSyncAll).toHaveBeenCalledExactlyOnceWith(
      [],
      [{ id: "999" }],
      '{"kind":"home"}',
    );
  });

  it("keeps only the latest snapshot queued behind an in-flight write", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    bridge.dbSyncAll.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        }),
    );
    const storage = createDbStorage();
    const first = storage.setItem("poracode-app-v2", {
      state: { projects: [], threads: [{ id: "first" }], view: { kind: "home" } },
      version: 4,
    } as never);
    await flushMicrotasks();

    const second = storage.setItem("poracode-app-v2", {
      state: { projects: [], threads: [{ id: "second" }], view: { kind: "home" } },
      version: 4,
    } as never);
    const final = storage.setItem("poracode-app-v2", {
      state: { projects: [], threads: [{ id: "final" }], view: { kind: "home" } },
      version: 4,
    } as never);
    releaseFirstWrite?.();
    await Promise.all([first, second, final]);

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(1);
    expect(bridge.dbSyncChanges).toHaveBeenCalledTimes(1);
    expect(bridge.dbSyncChanges).toHaveBeenCalledWith({
      projects: [],
      threads: [{ thread: { id: "final" }, sortOrder: 0 }],
      deletedProjectIds: [],
      deletedThreadIds: ["first"],
      threadOrder: ["final"],
      viewJson: '{"kind":"home"}',
    });
  });

  it("allows an identical snapshot to retry after persistence fails", async () => {
    bridge.dbSyncAll.mockRejectedValueOnce(new Error("db locked"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = createDbStorage();
    const snapshot = {
      state: { projects: [], threads: [], view: { kind: "home" }, groupLayouts: {} },
      version: 4,
    } as const;

    await storage.setItem("poracode-app-v2", snapshot as never);
    await storage.setItem("poracode-app-v2", snapshot as never);

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it("retries an identical snapshot queued while the first write is failing", async () => {
    let rejectFirstWrite: ((error: Error) => void) | undefined;
    bridge.dbSyncAll.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirstWrite = reject;
        }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = createDbStorage();
    const snapshot = {
      state: { projects: [], threads: [], view: { kind: "home" }, groupLayouts: {} },
      version: 4,
    } as const;
    const first = storage.setItem("poracode-app-v2", snapshot as never);
    await flushMicrotasks();

    const retry = storage.setItem("poracode-app-v2", snapshot as never);
    rejectFirstWrite?.(new Error("db locked"));
    await Promise.all([first, retry]);

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it("orders app-store removal after an in-flight write and before a later snapshot", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    bridge.dbSyncAll.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        }),
    );
    const storage = createDbStorage();
    const first = storage.setItem("poracode-app-v2", {
      state: { projects: [], threads: [{ id: "first" }], view: { kind: "home" } },
      version: 4,
    } as never);
    await flushMicrotasks();

    const removal = storage.removeItem("poracode-app-v2");
    const later = storage.setItem("poracode-app-v2", {
      state: { projects: [], threads: [{ id: "later" }], view: { kind: "home" } },
      version: 4,
    } as never);
    releaseFirstWrite?.();
    await Promise.all([first, removal, later]);

    expect(bridge.dbSyncAll).toHaveBeenNthCalledWith(1, [], [{ id: "first" }], '{"kind":"home"}');
    expect(bridge.dbSyncAll).toHaveBeenNthCalledWith(2, [], [], '{"kind":"home"}');
    expect(bridge.dbSyncAll).toHaveBeenNthCalledWith(3, [], [{ id: "later" }], '{"kind":"home"}');
    expect(bridge.dbSetState).toHaveBeenCalledWith("groupLayouts", "");
    expect(bridge.dbSetState).toHaveBeenCalledWith("poracode-app-v2", "");
  });

  it("keeps bridge-less localStorage operations synchronous and ordered", async () => {
    window.poracode = undefined as unknown as typeof window.poracode;
    const storage = createDbStorage();
    const first = storage.setItem("poracode-app-v2", {
      state: { projects: [], threads: [{ id: "first" }], view: { kind: "home" } },
      version: 4,
    } as never);
    const removal = storage.removeItem("poracode-app-v2");
    const later = storage.setItem("poracode-app-v2", {
      state: { projects: [], threads: [{ id: "later" }], view: { kind: "home" } },
      version: 4,
    } as never);

    await Promise.all([first, removal, later]);

    expect(JSON.parse(localStorage.getItem("poracode-app-v2") ?? "null")).toEqual({
      state: { projects: [], threads: [{ id: "later" }], view: { kind: "home" } },
      version: 4,
    });
  });

  it("persists the canonical app snapshot locally in the browser runtime", async () => {
    window.poracode = { arch: "web", appVersion: "remote" } as typeof window.poracode;
    const storage = createDbStorage();
    const snapshot = {
      state: {
        projects: [{ id: "remote-project" }],
        threads: [{ id: "remote-thread" }],
        view: { kind: "thread", panes: ["remote-thread"] },
      },
      version: 4,
    };

    await storage.setItem("poracode-app-v2", snapshot as never);

    expect(await storage.getItem("poracode-app-v2")).toEqual(snapshot);
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
  });

  it("still deduplicates generic persisted stores by serialized value", async () => {
    const storage = createDbStorage<{ collapsed: boolean }>();

    await storage.setItem("poracode-thread-todo-dock-v1", {
      state: { collapsed: false },
      version: 1,
    });
    await storage.setItem("poracode-thread-todo-dock-v1", {
      state: { collapsed: false },
      version: 1,
    });

    expect(bridge.dbSetState).toHaveBeenCalledTimes(1);
  });

  it("migrates a pre-rebrand generic state key on first read", async () => {
    const legacy = JSON.stringify({ state: { collapsed: true }, version: 1 });
    bridge.dbGetState.mockImplementation(async (key) =>
      key === "lightcode-thread-todo-dock-v1" ? legacy : null,
    );
    const storage = createDbStorage<{ collapsed: boolean }>();

    await expect(storage.getItem("poracode-thread-todo-dock-v1")).resolves.toEqual({
      state: { collapsed: true },
      version: 1,
    });
    expect(bridge.dbGetState).toHaveBeenNthCalledWith(1, "poracode-thread-todo-dock-v1");
    expect(bridge.dbGetState).toHaveBeenNthCalledWith(2, "lightcode-thread-todo-dock-v1");
    expect(bridge.dbSetState).toHaveBeenCalledWith("poracode-thread-todo-dock-v1", legacy);
  });

  it("never writes the shared app snapshot from the quick composer window", async () => {
    bridge.windowKind = "quickComposer";
    const storage = createDbStorage();

    await storage.setItem("poracode-app-v2", {
      state: {
        projects: [{ id: "quick-composer-only" }],
        threads: [],
        view: { kind: "home" },
        groupLayouts: {},
      },
      version: 5,
    } as never);

    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
  });
});

describe("app-store write queue caps (Gate 4 Batch 1)", () => {
  beforeEach(() => {
    bridge.windowKind = "main";
    bridge.dbGetProjects.mockReset().mockResolvedValue([]);
    bridge.dbGetThreads.mockReset().mockResolvedValue([]);
    bridge.dbGetThreadsPage.mockReset().mockResolvedValue({ threads: [], nextCursor: null });
    bridge.dbGetState.mockReset().mockResolvedValue(null);
    bridge.dbSetState.mockReset().mockResolvedValue(undefined);
    bridge.dbSyncAll.mockReset().mockResolvedValue(undefined);
    bridge.dbSyncChanges.mockReset().mockResolvedValue(undefined);
    window.poracode = {} as typeof window.poracode;
  });

  const snapshotWithThread = (id: string) =>
    ({
      state: { projects: [], threads: [{ id }], view: { kind: "home" }, groupLayouts: {} },
      version: 4,
    }) as never;

  it("bounds content writes during a remove/write storm on a stalled IPC write", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    bridge.dbSyncAll.mockImplementation((projects: unknown[], threads: unknown[]) => {
      if (threads.length > 0 && !releaseFirstWrite) {
        return new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      }
      // Removal clears arrive as empty threads; the stalled write is the only
      // non-empty threads list.
      void projects;
      return Promise.resolve();
    });
    const storage = createDbStorage();
    storage.setItem("poracode-app-v2", snapshotWithThread("stalled"));
    await flushMicrotasks();

    // Alternate remove/write bursts: without caps this grows the queue by one
    // remove per cycle for as long as the first write is stalled. The queue
    // adapter's PersistStorage return type is `unknown`, so the operations are
    // collected untyped and awaited together below.
    const operations: unknown[] = [];
    for (let index = 0; index < 40; index += 1) {
      operations.push(storage.removeItem("poracode-app-v2"));
      operations.push(storage.setItem("poracode-app-v2", snapshotWithThread(`burst-${index}`)));
    }
    await flushMicrotasks();

    // While the first write is stalled, backpressure holds: exactly ONE SQLite
    // call has happened (the stalled write) and every burst caller is waiting
    // instead of piling snapshots into the queue.
    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(1);

    releaseFirstWrite?.();
    await Promise.all(operations);

    // After release everything drains: all 40 removals ran (none dropped) and
    // every burst waiter resolved.
    const clears = bridge.dbSyncAll.mock.calls.filter(
      ([, threads]) => (threads as unknown[]).length === 0,
    );
    expect(clears).toHaveLength(40);
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();
  });

  it("supersedes a queued write behind a removal without persisting stale snapshots", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    bridge.dbSyncAll.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        }),
    );
    const storage = createDbStorage();
    const first = storage.setItem("poracode-app-v2", snapshotWithThread("in-flight"));
    await flushMicrotasks();

    const superseded = storage.setItem("poracode-app-v2", snapshotWithThread("stale"));
    const removal = storage.removeItem("poracode-app-v2");
    const latest = storage.setItem("poracode-app-v2", snapshotWithThread("latest"));
    releaseFirstWrite?.();
    await Promise.all([first, superseded, removal, latest]);

    // in-flight (full) -> removal clear -> latest (full; diffs against nothing).
    const threadsWritten = bridge.dbSyncAll.mock.calls.map(([, threads]) =>
      (threads as Array<{ id: string }>).map((thread) => thread.id),
    );
    expect(threadsWritten).toEqual([["in-flight"], [], ["latest"]]);
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();
  });

  it("backpressures more pending removals than the cap and resolves every waiter", async () => {
    bridge.dbSyncAll.mockResolvedValue(undefined);
    const storage = createDbStorage();
    const removals = Array.from({ length: 24 }, () => storage.removeItem("poracode-app-v2"));
    await Promise.all(removals);
    // Every removal ran (none dropped): 24 clears.
    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(24);
    bridge.dbSyncAll.mock.calls.forEach(([, threads, viewJson]) => {
      expect(threads).toEqual([]);
      expect(viewJson).toBe('{"kind":"home"}');
    });
  });
});

describe("dbStorage persistence error reporting", () => {
  beforeEach(() => {
    bridge.windowKind = "main";
    bridge.dbSetState.mockReset().mockResolvedValue(undefined);
    bridge.dbSyncAll.mockReset().mockResolvedValue(undefined);
    captureRendererException.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.poracode = {} as typeof window.poracode;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a rejected app-store sync instead of silently dropping it", async () => {
    bridge.dbSyncAll.mockRejectedValue(new Error("db locked"));
    const storage = createDbStorage();

    await storage.setItem("poracode-app-v2", {
      state: { projects: [], threads: [], view: { kind: "home" }, groupLayouts: {} },
      version: 5,
    } as never);
    await flushMicrotasks();

    expect(bridge.dbSyncAll).toHaveBeenCalledOnce();
    expect(captureRendererException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ featureArea: "app-state-persistence" }),
    );
  });

  it("reports a rejected generic state write", async () => {
    bridge.dbSetState.mockRejectedValue(new Error("disk full"));
    const storage = createDbStorage();

    await storage.setItem("some-other-store", { state: { x: 1 }, version: 1 } as never);
    await flushMicrotasks();

    expect(bridge.dbSetState).toHaveBeenCalledOnce();
    expect(captureRendererException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ featureArea: "app-state-persistence" }),
    );
  });

  it("does not report when the write succeeds", async () => {
    const storage = createDbStorage();

    await storage.setItem("some-other-store", { state: { y: 2 }, version: 1 } as never);
    await flushMicrotasks();

    expect(bridge.dbSetState).toHaveBeenCalledOnce();
    expect(captureRendererException).not.toHaveBeenCalled();
  });
});
