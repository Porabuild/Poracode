import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDbStorage } from "./dbStorage";

const bridge = vi.hoisted(() => ({
  windowKind: "main" as "main" | "quickComposer",
  dbGetProjects: vi.fn<() => Promise<[]>>(),
  dbGetThreads: vi.fn<() => Promise<[]>>(),
  dbGetState: vi.fn<(key: string) => Promise<string | null>>(),
  dbSetState: vi.fn<(key: string, value: string) => Promise<void>>(),
  dbSyncAll: vi.fn<(projects: unknown[], threads: unknown[], viewJson: string) => Promise<void>>(),
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
    bridge.dbGetState.mockReset().mockResolvedValue(null);
    bridge.dbSetState.mockReset().mockResolvedValue(undefined);
    bridge.dbSyncAll.mockReset().mockResolvedValue(undefined);
    window.poracode = {} as typeof window.poracode;
  });

  it("skips duplicate app metadata writes before dbSyncAll", async () => {
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

    await storage.setItem("poracode-app-v2", {
      state: { projects, threads: [...threads], view, groupLayouts },
      version: 5,
    });

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(2);
  });

  it("does not echo the hydrated app snapshot back to SQLite", async () => {
    bridge.dbGetProjects.mockResolvedValue([]);
    bridge.dbGetThreads.mockResolvedValue([]);
    bridge.dbGetState.mockImplementation(async (key) =>
      key === "view" ? '{"kind":"home"}' : null,
    );
    const storage = createDbStorage();
    const hydrated = await storage.getItem("poracode-app-v2");

    await storage.setItem("poracode-app-v2", hydrated as never);

    expect(bridge.dbSyncAll).not.toHaveBeenCalled();
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

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(2);
    expect(bridge.dbSyncAll).toHaveBeenLastCalledWith([], [{ id: "final" }], '{"kind":"home"}');
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
