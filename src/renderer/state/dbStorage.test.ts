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
      version: 4,
    });
    await storage.setItem("poracode-app-v2", {
      state: { projects, threads, view, groupLayouts },
      version: 4,
    });

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(1);

    await storage.setItem("poracode-app-v2", {
      state: { projects, threads: [...threads], view, groupLayouts },
      version: 4,
    });

    expect(bridge.dbSyncAll).toHaveBeenCalledTimes(2);
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
      version: 4,
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
      version: 4,
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
