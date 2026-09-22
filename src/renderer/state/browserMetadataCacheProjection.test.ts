import { describe, expect, it } from "vitest";
import {
  MAX_BROWSER_METADATA_RECORD_BYTES,
  estimateCacheValueBytes,
  projectBoundedCacheValue,
} from "./browserMetadataCacheProjection";

interface ThreadRow {
  id: string;
  title: string;
  filler: string;
}

interface AppValue {
  state: {
    projects: Array<{ id: string; name: string }>;
    threads: ThreadRow[];
    view: { kind: "thread"; panes: string[] };
    groupLayouts: Record<string, unknown>;
  };
  version: number;
}

function appValue(threadCount: number, fillerLength = 0): AppValue {
  return {
    state: {
      projects: [{ id: "project-1", name: "Project" }],
      threads: Array.from({ length: threadCount }, (_, index) => ({
        id: `thread-${index}`,
        title: `Thread ${index}`,
        filler: "x".repeat(fillerLength),
      })),
      view: { kind: "thread", panes: [`thread-${threadCount - 1}`] },
      groupLayouts: { group: 1 },
    },
    version: 5,
  };
}

describe("browser metadata cache projection", () => {
  it("estimates size from the object graph without serializing it", () => {
    const small = estimateCacheValueBytes(appValue(1, 10));
    const large = estimateCacheValueBytes(appValue(10, 10));
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
    // Root-reference caching keeps repeated estimates of an unchanged snapshot cheap.
    expect(estimateCacheValueBytes(appValue(1, 10))).toBe(small);
  });

  it("reuses measured substructure sizes when a new root shares them", () => {
    let walks = 0;
    const heavyThread = new Proxy(
      { id: "thread-heavy", filler: "x".repeat(128) },
      {
        ownKeys: (target) => {
          walks += 1;
          return Reflect.ownKeys(target);
        },
      },
    );
    estimateCacheValueBytes({ state: { threads: [heavyThread] } });
    expect(walks).toBeGreaterThan(0);
    const walksAfterFirstRoot = walks;

    const second = estimateCacheValueBytes({
      state: { threads: [heavyThread], view: { kind: "home" } },
    });
    expect(second).toBeGreaterThan(0);
    expect(walks).toBe(walksAfterFirstRoot);
  });

  it("keeps the 8 MiB per-record cap", () => {
    expect(MAX_BROWSER_METADATA_RECORD_BYTES).toBe(8 * 1024 * 1024);
  });

  it("keeps a snapshot under the cap unchanged", () => {
    const value = appValue(3);
    const projection = projectBoundedCacheValue(value, 64 * 1024);
    expect(projection.kind).toBe("unchanged");
    if (projection.kind !== "unchanged") throw new Error("expected unchanged");
    expect(projection.value).toBe(value);
  });

  it("drops the oldest threads while preserving projects, view, group layouts, and pinned panes", () => {
    const value = appValue(40, 200);
    const projection = projectBoundedCacheValue(value, 2048);
    expect(projection.kind).toBe("truncated");
    if (projection.kind !== "truncated") throw new Error("expected truncated");
    expect(projection.droppedThreadCount).toBeGreaterThan(0);
    expect(projection.bytes).toBeLessThanOrEqual(2048);

    const state = (projection.value as { state: Record<string, unknown> }).state;
    expect(state.projects).toEqual([{ id: "project-1", name: "Project" }]);
    expect(state.view).toEqual({ kind: "thread", panes: ["thread-39"] });
    expect(state.groupLayouts).toEqual({ group: 1 });
    const threads = state.threads as Array<{ id: string }>;
    expect(threads.some((thread) => thread.id === "thread-39")).toBe(true);
    expect(threads.length).toBeLessThan(40);
    // Kept threads stay in original (newest-first) order.
    const originalIds = value.state.threads.map((thread) => thread.id);
    const keptIds = threads.map((thread) => thread.id);
    expect(keptIds).toEqual(originalIds.filter((id) => keptIds.includes(id)));
  });

  it("reports oversized when nothing can be dropped under the cap", () => {
    const value = {
      state: {
        projects: [],
        view: { kind: "home" },
        groupLayouts: {},
        blob: "x".repeat(4096),
      },
      version: 5,
    };
    const projection = projectBoundedCacheValue(value, 256);
    expect(projection.kind).toBe("oversized");
  });

  it("pins keep-alive panes, pane layout leaves, and saved group layout panes", () => {
    const threads = Array.from({ length: 40 }, (_, index) => ({
      id: `thread-${index}`,
      filler: "x".repeat(200),
    }));
    const value = {
      state: {
        projects: [{ id: "project-1", name: "Project" }],
        threads,
        view: {
          kind: "thread" as const,
          panes: ["thread-39"] as [string, ...string[]],
          paneLayout: {
            kind: "split" as const,
            axis: "vertical" as const,
            children: [
              { kind: "leaf" as const, paneId: "thread-39" },
              { kind: "leaf" as const, paneId: "thread-7" },
            ],
          },
        },
        keepAlivePaneIds: ["thread-2"],
        groupLayouts: { "group-a": { panes: ["thread-5"] } },
      },
      version: 5,
    };
    const projection = projectBoundedCacheValue(value, 4096);
    expect(projection.kind).toBe("truncated");
    if (projection.kind !== "truncated") throw new Error("expected truncated");
    const state = (projection.value as { state: Record<string, unknown> }).state;
    const keptIds = (state.threads as Array<{ id: string }>).map((thread) => thread.id);
    expect(keptIds).toEqual(
      expect.arrayContaining(["thread-39", "thread-7", "thread-2", "thread-5"]),
    );
    expect(keptIds.length).toBeLessThan(threads.length);
    expect(state.keepAlivePaneIds).toEqual(["thread-2"]);
    expect(state.groupLayouts).toEqual({ "group-a": { panes: ["thread-5"] } });
  });

  it("reports oversized when pinned panes alone exceed the cap", () => {
    const value = {
      state: {
        projects: [],
        threads: [{ id: "pinned", filler: "x".repeat(4096) }],
        view: { kind: "thread", panes: ["pinned"] },
        groupLayouts: {},
      },
      version: 5,
    };
    const projection = projectBoundedCacheValue(value, 256);
    expect(projection.kind).toBe("oversized");
  });
});
