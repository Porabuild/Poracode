import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as { id: string }[] }));
vi.mock("node:fs", () => ({ existsSync: () => true }));
vi.mock("../../runtime/sqliteRead", () => ({
  withReadonlyDb: async (_path: string, fn: (db: unknown) => unknown) =>
    fn({ prepare: () => ({ all: () => state.rows }) }),
}));
vi.mock("../base", () => ({
  createKnownSessionRef: (providerSessionId: string) => ({ providerSessionId }),
  watchSessionPaths: () => () => {},
}));
import { createDevinSessionDiscovery } from "./sessionFiles";
const location = { kind: "posix" as const, path: "/project" };

describe("Devin terminal session discovery", () => {
  it("returns only a newly created ID and releases snapshots after discovery", async () => {
    const discovery = createDevinSessionDiscovery();
    state.rows = [{ id: "old" }];
    const stop = discovery.prepare(location);
    await discovery.ready(location);
    state.rows.push({ id: "new" });
    expect(await discovery.discover(location)).toEqual({ providerSessionId: "new" });
    stop?.();
    expect(await discovery.discover(location)).toBeUndefined();
  });
  it("refuses overlapping same-folder launches even when the second snapshot sees the first ID", async () => {
    const discovery = createDevinSessionDiscovery();
    state.rows = [];
    const stopFirst = discovery.prepare(location);
    await discovery.ready(location);
    state.rows.push({ id: "first" });
    const stopSecond = discovery.prepare(location);
    await discovery.ready(location);
    state.rows.push({ id: "second" });
    expect(await discovery.discover(location)).toBeUndefined();
    stopFirst?.();
    expect(await discovery.discover(location)).toBeUndefined();
    stopSecond?.();
    discovery.prepare(location);
    await discovery.ready(location);
    state.rows.push({ id: "third" });
    expect(await discovery.discover(location)).toEqual({ providerSessionId: "third" });
  });
  it("releases canceled launches before any watcher attaches", async () => {
    const discovery = createDevinSessionDiscovery();
    state.rows = [];
    const cancel = discovery.prepare(location);
    await discovery.ready(location);
    cancel?.();
    discovery.prepare(location);
    await discovery.ready(location);
    state.rows = [{ id: "after-cancellation" }];
    expect(await discovery.discover(location)).toEqual({ providerSessionId: "after-cancellation" });
  });
  it("refuses ambiguous IDs without reading provider transcripts", async () => {
    const discovery = createDevinSessionDiscovery();
    state.rows = [];
    discovery.prepare(location);
    await discovery.ready(location);
    state.rows = [{ id: "one" }, { id: "two" }];
    expect(await discovery.discover(location)).toBeUndefined();
  });
});
