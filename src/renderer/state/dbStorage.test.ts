import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDbStorage } from "./dbStorage";
import { getPersistJsonEngine, resetClientEngineHostForTests } from "./remote/engine";
import {
  closeBrowserMetadataCacheForTest,
  __resetBrowserMetadataCacheForTest,
} from "./browserMetadataCache";

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
  beforeEach(async () => {
    bridge.windowKind = "main";
    bridge.dbGetProjects.mockReset().mockResolvedValue([]);
    bridge.dbGetThreads.mockReset().mockResolvedValue([]);
    bridge.dbGetThreadsPage.mockReset().mockResolvedValue({ threads: [], nextCursor: null });
    bridge.dbGetState.mockReset().mockResolvedValue(null);
    bridge.dbSetState.mockReset().mockResolvedValue(undefined);
    bridge.dbSyncAll.mockReset().mockResolvedValue(undefined);
    bridge.dbSyncChanges.mockReset().mockResolvedValue(undefined);
    window.poracode = {} as typeof window.poracode;
    localStorage.clear();
    await __resetBrowserMetadataCacheForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists preferences only and never ships catalog rows", async () => {
    const storage = createDbStorage<{
      projects: unknown[];
      threads: unknown[];
      view: { kind: "home" };
      groupLayouts: Record<string, unknown>;
    }>();
    const projects = [{ id: "project-1" }];
    const threads = [{ id: "thread-1" }];
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

    const viewWrites = () => bridge.dbSetState.mock.calls.filter(([key]) => key === "view");
    expect(viewWrites()).toHaveLength(1);
    expect(bridge.dbSetState).toHaveBeenCalledWith("view", '{"kind":"home"}');
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();

    await storage.setItem("poracode-app-v2", {
      state: { projects, threads: [...threads], view, groupLayouts },
      version: 5,
    });

    // Same preferences: no second write, and still no catalog write path.
    expect(viewWrites()).toHaveLength(1);
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();
  });

  it("writes a changed view/groupLayouts through dbSetState", async () => {
    const storage = createDbStorage();
    await storage.setItem("poracode-app-v2", {
      state: {
        projects: [],
        threads: [],
        view: { kind: "home" },
        groupLayouts: {},
      },
      version: 5,
    });

    await storage.setItem("poracode-app-v2", {
      state: {
        projects: [],
        threads: [],
        view: { kind: "thread", panes: ["thread-new"] },
        groupLayouts: { g1: { collapsed: true } },
      },
      version: 5,
    });

    expect(bridge.dbSetState).toHaveBeenCalledWith(
      "view",
      '{"kind":"thread","panes":["thread-new"]}',
    );
    expect(bridge.dbSetState).toHaveBeenCalledWith("groupLayouts", '{"g1":{"collapsed":true}}');
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();
  });

  it("does not echo the hydrated app preferences back to SQLite", async () => {
    bridge.dbGetState.mockImplementation(async (key) =>
      key === "view" ? '{"kind":"home"}' : null,
    );
    const storage = createDbStorage();
    const hydrated = await storage.getItem("poracode-app-v2");

    await storage.setItem("poracode-app-v2", hydrated as never);

    expect(bridge.dbSetState).not.toHaveBeenCalled();
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
  });

  it("hydrates preferences without any catalog read", async () => {
    bridge.dbGetState.mockImplementation(async (key) => {
      if (key === "view") return '{"kind":"thread","panes":["thread-1"]}';
      if (key === "groupLayouts") return '{"g1":{"collapsed":true}}';
      return null;
    });
    const storage = createDbStorage();
    const hydrated = (await storage.getItem("poracode-app-v2")) as {
      state: { view: unknown; groupLayouts: unknown; threads?: unknown };
    } | null;

    expect(hydrated?.state.view).toEqual({ kind: "thread", panes: ["thread-1"] });
    expect(hydrated?.state.groupLayouts).toEqual({ g1: { collapsed: true } });
    expect(hydrated?.state.threads).toBeUndefined();
    expect(bridge.dbGetThreadsPage).not.toHaveBeenCalled();
    expect(bridge.dbGetProjects).not.toHaveBeenCalled();
    expect(bridge.dbGetThreads).not.toHaveBeenCalled();
  });

  it("coalesces a synchronous app-state burst to one preference write", async () => {
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

    const viewWrites = bridge.dbSetState.mock.calls.filter(([key]) => key === "view");
    expect(viewWrites).toEqual([["view", '{"kind":"home"}']]);
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
  });

  it("keeps only the latest preference snapshot queued behind an in-flight write", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    bridge.dbSetState.mockImplementationOnce(
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

    // The stalled first write plus one coalesced successor holding the latest
    // preferences — catalog row churn never reaches SQLite.
    expect(bridge.dbSetState).toHaveBeenCalledTimes(2);
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();
  });

  it("allows an identical preference snapshot to retry after persistence fails", async () => {
    bridge.dbSetState.mockRejectedValueOnce(new Error("db locked"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = createDbStorage();
    const snapshot = {
      state: { projects: [], threads: [], view: { kind: "home" }, groupLayouts: {} },
      version: 4,
    } as const;

    await storage.setItem("poracode-app-v2", snapshot as never);
    await storage.setItem("poracode-app-v2", snapshot as never);

    expect(bridge.dbSetState.mock.calls.filter(([key]) => key === "view")).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it("retries an identical preference snapshot queued while the first write is failing", async () => {
    let rejectFirstWrite: ((error: Error) => void) | undefined;
    bridge.dbSetState.mockImplementationOnce(
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

    expect(bridge.dbSetState.mock.calls.filter(([key]) => key === "view")).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it("clears preferences on removal without deleting shared host rows", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    bridge.dbSetState.mockImplementationOnce(
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

    const keys = bridge.dbSetState.mock.calls.map(([key]) => key);
    expect(keys[0]).toBe("view");
    expect(keys).toContain("groupLayouts");
    expect(keys).toContain("poracode-app-v2");
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();
  });

  it("keeps bridge-less browser writes ordered and serves the latest snapshot when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
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

    expect(await storage.getItem("poracode-app-v2")).toEqual({
      state: { projects: [], threads: [{ id: "later" }], view: { kind: "home" } },
      version: 4,
    });
    expect(localStorage.getItem("poracode-app-v2")).toBeNull();
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

    // A reload reopens the connection and hydrates from the committed record,
    // not from the synchronous localStorage path this cache replaced.
    closeBrowserMetadataCacheForTest();
    const reopened = createDbStorage();
    expect(await reopened.getItem("poracode-app-v2")).toEqual(snapshot);
    expect(localStorage.getItem("poracode-app-v2")).toBeNull();
    // The cache is local-only: hydration and persistence never touch the local
    // backend, let alone write cached state back to the host.
    expect(bridge.dbGetProjects).not.toHaveBeenCalled();
    expect(bridge.dbGetState).not.toHaveBeenCalled();
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
  });

  it("migrates a legacy localStorage payload into IndexedDB once and removes it after the commit", async () => {
    window.poracode = undefined as unknown as typeof window.poracode;
    const legacy = JSON.stringify({ state: { collapsed: true }, version: 2 });
    localStorage.setItem("poracode-thread-todo-dock-v1", legacy);
    const storage = createDbStorage<{ collapsed: boolean }>();

    await expect(storage.getItem("poracode-thread-todo-dock-v1")).resolves.toEqual({
      state: { collapsed: true },
      version: 2,
    });
    expect(localStorage.getItem("poracode-thread-todo-dock-v1")).toBeNull();

    closeBrowserMetadataCacheForTest();
    const reopened = createDbStorage<{ collapsed: boolean }>();
    await expect(reopened.getItem("poracode-thread-todo-dock-v1")).resolves.toEqual({
      state: { collapsed: true },
      version: 2,
    });
  });

  it("drops a legacy payload when the persist lifecycle removes the browser store", async () => {
    window.poracode = undefined as unknown as typeof window.poracode;
    const legacy = JSON.stringify({ state: { collapsed: true }, version: 2 });
    localStorage.setItem("poracode-thread-todo-dock-v1", legacy);
    const storage = createDbStorage<{ collapsed: boolean }>();

    await storage.removeItem("poracode-thread-todo-dock-v1");

    expect(localStorage.getItem("poracode-thread-todo-dock-v1")).toBeNull();
    // A later session must hydrate nothing instead of re-migrating the clear.
    closeBrowserMetadataCacheForTest();
    const reopened = createDbStorage<{ collapsed: boolean }>();
    await expect(reopened.getItem("poracode-thread-todo-dock-v1")).resolves.toBeNull();
  });

  it("does not serialize the whole app state synchronously on the browser path", async () => {
    window.poracode = { arch: "web", appVersion: "remote" } as typeof window.poracode;
    const storage = createDbStorage();
    const snapshot = {
      state: {
        projects: [{ id: "remote-project" }],
        threads: [{ id: "remote-thread" }],
        view: { kind: "thread", panes: ["remote-thread"] },
      },
      version: 5,
    };
    const stringify = vi.spyOn(JSON, "stringify");

    const write = storage.setItem("poracode-app-v2", snapshot as never);
    // The pane-change path only records the snapshot reference and enqueues it.
    expect(stringify).not.toHaveBeenCalled();

    await write;
    expect(stringify.mock.calls.some(([value]) => value === snapshot)).toBe(false);
    stringify.mockRestore();
  });

  it("keeps the legacy localStorage payload when the browser cache commit fails", async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    window.poracode = undefined as unknown as typeof window.poracode;
    const legacy = JSON.stringify({ state: { collapsed: true }, version: 2 });
    localStorage.setItem("poracode-thread-todo-dock-v1", legacy);
    const storage = createDbStorage<{ collapsed: boolean }>();

    await expect(storage.getItem("poracode-thread-todo-dock-v1")).resolves.toEqual({
      state: { collapsed: true },
      version: 2,
    });
    expect(localStorage.getItem("poracode-thread-todo-dock-v1")).toBe(legacy);
    putSpy.mockRestore();
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

  it("routes a large incoming value through the persist engine even when the previous value was small", async () => {
    const engine = getPersistJsonEngine();
    const stringifySpy = vi.spyOn(engine, "stringifyJson");
    try {
      const storage = createDbStorage<{ blob: string }>();
      const value = { state: { blob: "x".repeat(33_000) }, version: 1 };
      await storage.setItem("poracode-large-growth", value);
      // The old previous-length heuristic would have run the whole-graph
      // JSON.stringify synchronously on the UI thread for this first write.
      expect(stringifySpy).toHaveBeenCalledOnce();
      expect(bridge.dbSetState).toHaveBeenCalledWith(
        "poracode-large-growth",
        JSON.stringify(value),
      );
    } finally {
      stringifySpy.mockRestore();
    }
  });

  it("parses and deduplicates large generic persisted payloads", async () => {
    const value = { state: { blob: "x".repeat(32 * 1024) }, version: 1 };
    const raw = JSON.stringify(value);
    expect(raw.length).toBeGreaterThanOrEqual(32 * 1024);
    bridge.dbGetState.mockResolvedValue(raw);
    const storage = createDbStorage<{ blob: string }>();

    await expect(storage.getItem("poracode-large-state")).resolves.toEqual(value);

    await storage.setItem("poracode-large-state", value);
    await storage.setItem("poracode-large-state", value);
    expect(bridge.dbSetState).toHaveBeenCalledTimes(1);
    expect(bridge.dbSetState).toHaveBeenCalledWith("poracode-large-state", raw);
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
    bridge.dbSetState.mockImplementation((key: string) => {
      if (key === "view" && !releaseFirstWrite) {
        return new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      }
      return Promise.resolve();
    });
    const storage = createDbStorage();
    storage.setItem("poracode-app-v2", snapshotWithThread("stalled"));
    await flushMicrotasks();

    // Alternate remove/write bursts: without caps this grows the queue by one
    // remove per cycle for as long as the first write is stalled.
    const operations: unknown[] = [];
    for (let index = 0; index < 40; index += 1) {
      operations.push(storage.removeItem("poracode-app-v2"));
      operations.push(storage.setItem("poracode-app-v2", snapshotWithThread(`burst-${index}`)));
    }
    await flushMicrotasks();

    // While the first write is stalled, backpressure holds: at most one view
    // write has started and every burst caller waits instead of piling
    // snapshots into the queue.
    expect(bridge.dbSetState.mock.calls.length).toBeLessThanOrEqual(2);

    releaseFirstWrite?.();
    await Promise.all(operations);

    // After release every removal ran (none dropped, each clears the app key)
    // and the queue never wrote catalog rows.
    const appKeyClears = bridge.dbSetState.mock.calls.filter(
      ([key, value]) => key === "poracode-app-v2" && value === "",
    );
    expect(appKeyClears).toHaveLength(40);
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();
  });

  it("supersedes a queued preference write behind a removal without stale snapshots", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    bridge.dbSetState.mockImplementationOnce(
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

    const keys = bridge.dbSetState.mock.calls.map(([key]) => key);
    expect(keys.filter((key) => key === "view").length).toBeGreaterThanOrEqual(1);
    expect(keys).toContain("poracode-app-v2");
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();
  });

  it("backpressures more pending removals than the cap and resolves every waiter", async () => {
    bridge.dbSetState.mockResolvedValue(undefined);
    const storage = createDbStorage();
    const removals = Array.from({ length: 24 }, () => storage.removeItem("poracode-app-v2"));
    await Promise.all(removals);
    // Every removal ran (none dropped): 24 app-key clears, still no catalog
    // write of any kind.
    const appKeyClears = bridge.dbSetState.mock.calls.filter(
      ([key, value]) => key === "poracode-app-v2" && value === "",
    );
    expect(appKeyClears).toHaveLength(24);
    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
    expect(bridge.dbSyncChanges).not.toHaveBeenCalled();
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

  it("reports a rejected preference write instead of silently dropping it", async () => {
    bridge.dbSetState.mockRejectedValue(new Error("db locked"));
    const storage = createDbStorage();

    await storage.setItem("poracode-app-v2", {
      state: { projects: [], threads: [], view: { kind: "home" }, groupLayouts: {} },
      version: 5,
    } as never);
    await flushMicrotasks();

    expect(bridge.dbSetState).toHaveBeenCalledWith("view", '{"kind":"home"}');
    expect(captureRendererException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ featureArea: "app-state-persistence" }),
    );
  });

  it("reports and skips a generic store value the aux engine refuses", async () => {
    const storage = createDbStorage();
    const stringify = vi.spyOn(JSON, "stringify");

    await storage.setItem("some-other-store", { state: { bad: 1n }, version: 1 } as never);

    expect(bridge.dbSetState).not.toHaveBeenCalled();
    expect(stringify).not.toHaveBeenCalled();
    expect(captureRendererException).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ClientEngineAuxInputTooLargeError" }),
      expect.objectContaining({ featureArea: "app-state-persistence" }),
    );
  });

  it("refuses a Date whose own toJSON would sync-stringify megabytes under the route threshold", async () => {
    const storage = createDbStorage();
    const ownToJson = vi.fn<() => string>(() => "z".repeat(5_000_000));
    const date = new Date(0) as Date & { toJSON: () => string };
    date.toJSON = ownToJson;
    const value = { state: { d: date }, version: 1 };
    const stringify = vi.spyOn(JSON, "stringify");
    let stringifiedWholeGraph = false;
    try {
      await storage.setItem("poracode-refused-exotic-value", value as never);
      stringifiedWholeGraph = stringify.mock.calls.some(([argument]) => argument === value);
    } finally {
      stringify.mockRestore();
    }

    // The projection admits only graphs it can bound: an unbounded toJSON is
    // refused before the route decision, so the 5 MB whole-graph
    // JSON.stringify never runs on the UI thread and nothing unmeasurable is
    // written. Failed before the fix: the Date fast path admitted it and
    // `dbSetState` received the 5 MB string with no report.
    expect(stringifiedWholeGraph).toBe(false);
    expect(ownToJson).not.toHaveBeenCalled();
    expect(bridge.dbSetState).not.toHaveBeenCalled();
    expect(captureRendererException).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ClientEngineAuxInputTooLargeError" }),
      expect.objectContaining({ featureArea: "app-state-persistence" }),
    );
  });

  it("reports and skips a large generic write when the persist engine is unavailable", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("worker construction unavailable");
        }
      },
    );
    resetClientEngineHostForTests();
    try {
      const storage = createDbStorage<{ blob: string }>();
      const value = { state: { blob: "x".repeat(33_000) }, version: 1 };
      await storage.setItem("poracode-large-unavailable", value);
      expect(bridge.dbSetState).not.toHaveBeenCalled();
      expect(captureRendererException).toHaveBeenCalledWith(
        expect.objectContaining({ name: "ClientEngineWorkerUnavailableError" }),
        expect.objectContaining({ featureArea: "app-state-persistence" }),
      );
    } finally {
      resetClientEngineHostForTests();
    }
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
