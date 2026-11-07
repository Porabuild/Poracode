import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reconcileClientDraftWindows,
  registerClientDraftWindow,
  registerClientDraftCloseFlusher,
  resetClientDraftWindowForTest,
  WINDOW_LEASE_PREFIX,
} from "./clientDraftWindows";

afterEach(async () => {
  await resetClientDraftWindowForTest();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("client window lifetime custody", () => {
  it("reaps a crashed window only when its browser lifetime lock is available", async () => {
    const held = new Set<string>(["poracode.client-draft.window.live"]);
    const request = vi.fn<
      (name: string, options: unknown, run?: (lock: Lock | null) => unknown) => Promise<unknown>
    >((name, options, run) => {
      const callback =
        typeof options === "function" ? (options as (lock: Lock | null) => unknown) : run!;
      if (held.has(name)) return Promise.resolve(callback(null));
      held.add(name);
      return Promise.resolve(callback({ name, mode: "exclusive" } as Lock)).finally(() =>
        held.delete(name),
      );
    });
    vi.stubGlobal("navigator", { locks: { request } });
    const marker = (id: string) =>
      JSON.stringify({ formatVersion: 1, lockName: "poracode.client-draft.window." + id });
    localStorage.setItem(WINDOW_LEASE_PREFIX + "crashed", marker("crashed"));
    localStorage.setItem(WINDOW_LEASE_PREFIX + "live", marker("live"));
    localStorage.setItem(WINDOW_LEASE_PREFIX + "legacy", "active");
    const future = JSON.stringify({ formatVersion: 99, lockName: "future" });
    localStorage.setItem(WINDOW_LEASE_PREFIX + "future", future);
    expect(await reconcileClientDraftWindows()).toBe(true);
    expect(localStorage.getItem(WINDOW_LEASE_PREFIX + "crashed")).toBeNull();
    expect(localStorage.getItem(WINDOW_LEASE_PREFIX + "live")).toBe(marker("live"));
    expect(localStorage.getItem(WINDOW_LEASE_PREFIX + "legacy")).toBe("active");
    expect(localStorage.getItem(WINDOW_LEASE_PREFIX + "future")).toBe(future);
  });
});

it("keeps newly saved bytes under custody while a second window waits for its lock", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  let deferNext = false;
  let grant!: () => void;
  const held = new Set<string>();
  const request = vi.fn<
    (name: string, options: unknown, callback?: (lock: Lock | null) => unknown) => Promise<unknown>
  >((name, options, callback) => {
    const run =
      typeof options === "function" ? (options as (lock: Lock | null) => unknown) : callback!;
    if (typeof options !== "function")
      return Promise.resolve(run(held.has(name) ? null : ({ name, mode: "exclusive" } as Lock)));
    const acquire = () => {
      held.add(name);
      return Promise.resolve(run({ name, mode: "exclusive" } as Lock)).finally(() =>
        held.delete(name),
      );
    };
    if (!deferNext) return acquire();
    deferNext = false;
    return new Promise((resolve) => {
      grant = () => resolve(acquire());
    });
  });
  vi.stubGlobal("navigator", { locks: { request } });
  const windowsA = await import("./clientDraftWindows");
  const assetsA = await import("./clientDraftAssets");
  const dbA = await import("./clientDraftDb");
  windowsA.registerClientDraftWindow();
  vi.resetModules();
  const windowsB = await import("./clientDraftWindows");
  const assetsB = await import("./clientDraftAssets");
  const dbB = await import("./clientDraftDb");
  deferNext = true;
  const file = assetsB.stageClientDraftAsset(
    new Blob(["owned bytes"], { type: "image/png" }),
    "image.png",
  );
  const release = assetsB.retainClientDraftAsset(file.path);
  try {
    await file.saved;
    expect(grant).toBeTypeOf("function");
    expect(windowsA.ownsOnlyActiveDraftWindow()).toBe(false);
    expect(await assetsA.reclaimClientDraftAssets([file.path], new Set())).toEqual([]);
    expect(await (await assetsB.readClientDraftAsset(file.path)).blob.text()).toBe("owned bytes");
  } finally {
    grant();
    release();
    await windowsB.resetClientDraftWindowForTest();
    await windowsA.resetClientDraftWindowForTest();
    assetsA.resetClientDraftAssetsForTest();
    assetsB.resetClientDraftAssetsForTest();
    await dbA.closeDraftDatabaseForTest();
    await dbB.closeDraftDatabaseForTest();
  }
});

it("journals and retires custody in one pagehide callback", () => {
  registerClientDraftWindow();
  const marker = Array.from({ length: localStorage.length }, (_value, index) =>
    localStorage.key(index),
  ).find((name) => name?.startsWith(WINDOW_LEASE_PREFIX))!;
  let protectedDuringJournal = false;
  const unregister = registerClientDraftCloseFlusher(() => {
    protectedDuringJournal = localStorage.getItem(marker) !== null;
    localStorage.setItem("fixture-close-journal", "saved");
  });
  let laterListenerSawProtectedRelease = false;
  window.addEventListener(
    "pagehide",
    () => {
      laterListenerSawProtectedRelease =
        localStorage.getItem(marker) === null &&
        localStorage.getItem("fixture-close-journal") === "saved";
    },
    { once: true },
  );
  window.dispatchEvent(new Event("pagehide"));
  expect(protectedDuringJournal).toBe(true);
  expect(laterListenerSawProtectedRelease).toBe(true);
  expect(localStorage.getItem(marker)).toBeNull();
  expect(localStorage.getItem("fixture-close-journal")).toBe("saved");
  unregister();
});
