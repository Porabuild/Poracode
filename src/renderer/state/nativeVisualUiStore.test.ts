import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeVisualTableView, NativeVisualUiEntry } from "./nativeVisualUiStore";

let store: typeof import("./nativeVisualUiStore");

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  store = await import("./nativeVisualUiStore");
});

function entry(hostId = "host-a", threadId = "thread") {
  return { hostId, threadId, inputs: [["seats", 30]] as [string, number][], zoom: 125 };
}

describe("native visual device-local UI state v2", () => {
  it("restores exact-source inputs/zoom and separates hosts, items, fence positions and revisions", async () => {
    const key = store.nativeVisualUiKey("host-a", "thread", "item", 0, "source");
    store.useNativeVisualUiStore.getState().put(key, entry());
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.get(key)).toEqual(entry());
    for (const other of [
      store.nativeVisualUiKey("host-b", "thread", "item", 0, "source"),
      store.nativeVisualUiKey("host-a", "thread", "item-2", 0, "source"),
      store.nativeVisualUiKey("host-a", "thread", "item", 1, "source"),
      store.nativeVisualUiKey("host-a", "thread", "item", 0, "changed source"),
    ])
      expect(store.useNativeVisualUiStore.getState().entries.has(other)).toBe(false);
    expect(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)).not.toContain("changed source");
  });

  it("keeps unknown host interactions memory-only", async () => {
    const key = store.nativeVisualUiKey(undefined, "thread", "item", 0, "source");
    store.useNativeVisualUiStore
      .getState()
      .put(key, { threadId: "thread", inputs: [["seats", 30]], zoom: 100 });
    expect(store.useNativeVisualUiStore.getState().entries.has(key)).toBe(true);
    expect(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)).not.toContain("seats");
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.size).toBe(0);
  });

  it("never overwrites future document bytes, including a newer write from another tab", async () => {
    const future = '{ "version": 3, "entries": [], "future": {"keep":"exact bytes"} }';
    localStorage.setItem(store.NATIVE_VISUAL_UI_KEY, future);
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.size).toBe(0);
    const key = store.nativeVisualUiKey("host-a", "thread", "item", 0, "source");
    store.useNativeVisualUiStore.getState().put(key, entry());
    store.useNativeVisualUiStore.getState().forgetThread("host-a", "thread");
    expect(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)).toBe(future);
  });

  it("limits state to 128 records and retains recently reopened entries", () => {
    const state = store.useNativeVisualUiStore.getState();
    const key = (index: number) =>
      store.nativeVisualUiKey("host-a", "thread", `item-${index}`, 0, "source");
    for (let index = 0; index < 128; index++) state.put(key(index), entry());
    state.touch(key(0));
    state.put(key(128), entry());
    expect(store.useNativeVisualUiStore.getState().entries.size).toBe(128);
    expect(store.useNativeVisualUiStore.getState().entries.has(key(0))).toBe(true);
    expect(store.useNativeVisualUiStore.getState().entries.has(key(1))).toBe(false);
  });

  it("rejects stored identity mismatches and invalid values rather than merging host state", async () => {
    const key = store.nativeVisualUiKey("host-a", "thread", "item", 0, "source");
    localStorage.setItem(
      store.NATIVE_VISUAL_UI_KEY,
      JSON.stringify({
        version: store.NATIVE_VISUAL_UI_VERSION,
        entries: [[key, entry("host-b")]],
      }),
    );
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.size).toBe(0);
    localStorage.setItem(
      store.NATIVE_VISUAL_UI_KEY,
      JSON.stringify({
        version: store.NATIVE_VISUAL_UI_VERSION,
        entries: [[key, { ...entry(), zoom: 201 }]],
      }),
    );
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.size).toBe(0);
  });

  it("forgets only the confirmed host/thread, never same-numbered foreign threads", () => {
    const a = store.nativeVisualUiKey("host-a", "thread", "item", 0, "source");
    const b = store.nativeVisualUiKey("host-b", "thread", "item", 0, "source");
    const c = store.nativeVisualUiKey("host-a", "other-thread", "item", 0, "source");
    store.useNativeVisualUiStore.getState().put(a, entry());
    store.useNativeVisualUiStore.getState().put(b, entry("host-b"));
    store.useNativeVisualUiStore.getState().put(c, entry("host-a", "other-thread"));
    store.useNativeVisualUiStore.getState().forgetThread("host-a", "thread");
    expect([...store.useNativeVisualUiStore.getState().entries.keys()]).toEqual([b, c]);
  });

  it("migrates v1 identity/input/zoom losslessly without writing or deleting the legacy slot", async () => {
    const key = store.nativeVisualUiKey("host-a", "thread", "item", 0, "source");
    const identity = JSON.parse(key) as unknown[];
    const legacyKey = JSON.stringify([1, ...identity.slice(1)]);
    const previous = {
      ...entry(),
      inputs: [
        ["fraction", 0.0001],
        ["large", -999999999999.875],
      ] as [string, number][],
    };
    const original = JSON.stringify({ version: 1, entries: [[legacyKey, previous]] }, null, 2);
    localStorage.setItem(store.LEGACY_NATIVE_VISUAL_UI_KEY, original);
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.get(key)).toEqual(previous);
    expect(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)).toBeNull();
    expect(localStorage.getItem(store.LEGACY_NATIVE_VISUAL_UI_KEY)).toBe(original);
    const updated: NativeVisualUiEntry = {
      ...previous,
      zoom: 150,
      checked: [["0/first", true]] as [string, boolean][],
      tabs: [["1", "details"]] as [string, string][],
      charts: [["1/details/0", { hiddenSeries: [1], point: 2, showTable: true }]],
      tables: [["1/details/0", { query: "Scale", sort: { column: 1, direction: "descending" } }]],
    };
    store.useNativeVisualUiStore.getState().put(key, updated);
    expect(JSON.parse(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)!)).toMatchObject({
      version: 2,
      entries: [[key, updated]],
    });
    expect(localStorage.getItem(store.LEGACY_NATIVE_VISUAL_UI_KEY)).toBe(original);
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.get(key)).toEqual(updated);
    store.useNativeVisualUiStore.getState().forgetThread("host-a", "thread");
    expect(JSON.parse(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)!)).toEqual({
      version: 2,
      entries: [],
    });
    expect(localStorage.getItem(store.LEGACY_NATIVE_VISUAL_UI_KEY)).toBe(original);
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.size).toBe(0);
  });

  it.each(["legacy", "current"] as const)(
    "fences put/touch/forget when the %s slot gets unknown bytes from another tab",
    (slot) => {
      const first = store.nativeVisualUiKey("host-a", "first", "item", 0, "source");
      const second = store.nativeVisualUiKey("host-a", "second", "item", 0, "source");
      store.useNativeVisualUiStore.getState().put(first, entry("host-a", "first"));
      store.useNativeVisualUiStore.getState().put(second, entry("host-a", "second"));
      const storageKey =
        slot === "legacy" ? store.LEGACY_NATIVE_VISUAL_UI_KEY : store.NATIVE_VISUAL_UI_KEY;
      const future = `{ "version": ${slot === "legacy" ? 2 : 3}, "entries": [], "future":true }`;
      localStorage.setItem(storageKey, future);
      const old = localStorage.getItem(store.LEGACY_NATIVE_VISUAL_UI_KEY);
      const current = localStorage.getItem(store.NATIVE_VISUAL_UI_KEY);
      store.useNativeVisualUiStore.getState().touch(first);
      store.useNativeVisualUiStore
        .getState()
        .put(second, { ...entry("host-a", "second"), zoom: 200 });
      store.useNativeVisualUiStore.getState().forgetThread("host-a", "first");
      expect(localStorage.getItem(store.LEGACY_NATIVE_VISUAL_UI_KEY)).toBe(old);
      expect(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)).toBe(current);
    },
  );

  it("never resurrects valid legacy state behind a future current document", async () => {
    const key = store.nativeVisualUiKey("host-a", "thread", "item", 0, "source");
    const identity = JSON.parse(key) as unknown[];
    const legacyKey = JSON.stringify([1, ...identity.slice(1)]);
    const legacy = JSON.stringify({ version: 1, entries: [[legacyKey, entry()]] }, null, 2);
    const future = '{ "version": 3, "entries": [], "future": "preserve exact bytes" }';
    localStorage.setItem(store.LEGACY_NATIVE_VISUAL_UI_KEY, legacy);
    localStorage.setItem(store.NATIVE_VISUAL_UI_KEY, future);
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.size).toBe(0);
    store.useNativeVisualUiStore.getState().put(key, entry());
    store.useNativeVisualUiStore.getState().forgetThread("host-a", "thread");
    expect(localStorage.getItem(store.LEGACY_NATIVE_VISUAL_UI_KEY)).toBe(legacy);
    expect(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)).toBe(future);
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.size).toBe(0);
  });

  it("retains selections for all six legal tab containers across reload", async () => {
    const key = store.nativeVisualUiKey("host-a", "thread", "item", 0, "source");
    const tabs: [string, string][] = Array.from({ length: 6 }, (_, index) => [
      String(index),
      "overview",
    ]);
    const state = { ...entry(), tabs };
    store.useNativeVisualUiStore.getState().put(key, state);
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.get(key)).toEqual(state);
  });

  it("bounds persisted UTF-8 bytes as richer interactions grow and retains the newest entry", () => {
    const tables = Array.from(
      { length: 12 },
      (_, index) => [String(index), { query: "界".repeat(200) }] as [string, NativeVisualTableView],
    );
    for (let index = 0; index < 40; index++)
      store.useNativeVisualUiStore
        .getState()
        .put(store.nativeVisualUiKey("host-a", "thread", `item-${index}`, 0, "source"), {
          ...entry(),
          tables,
        });
    expect(
      new TextEncoder().encode(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)!).length,
    ).toBeLessThanOrEqual(256 * 1024);
    expect(store.useNativeVisualUiStore.getState().entries.size).toBeLessThan(40);
    expect(
      store.useNativeVisualUiStore
        .getState()
        .entries.has(store.nativeVisualUiKey("host-a", "thread", "item-39", 0, "source")),
    ).toBe(true);
  });

  it.each([
    { checked: Array.from({ length: 65 }, () => ["0/item", true]) },
    { checked: [["0/item", "true"]] },
    { tabs: Array.from({ length: 7 }, () => ["0", "tab"]) },
    { tabs: [["0", "path/to/tab"]] },
    { charts: [["0", { hiddenSeries: [4], point: 0, showTable: false }]] },
    { charts: [["0", { hiddenSeries: [], point: 100, showTable: false }]] },
    { tables: [["0", { query: "x".repeat(201) }]] },
    { tables: [["0", { query: "", sort: { column: 8, direction: "ascending" } }]] },
    { tables: [["0", { query: "", action: "run()" }]] },
  ])("rejects unbounded or unknown stored interaction shapes: %j", async (extra) => {
    const key = store.nativeVisualUiKey("host-a", "thread", "item", 0, "source");
    const raw = JSON.stringify({ version: 2, entries: [[key, { ...entry(), ...extra }]] });
    localStorage.setItem(store.NATIVE_VISUAL_UI_KEY, raw);
    vi.resetModules();
    store = await import("./nativeVisualUiStore");
    expect(store.useNativeVisualUiStore.getState().entries.size).toBe(0);
    store.useNativeVisualUiStore.getState().put(key, entry());
    expect(localStorage.getItem(store.NATIVE_VISUAL_UI_KEY)).toBe(raw);
  });
});
