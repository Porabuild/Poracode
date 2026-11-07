import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reconcileClientDraftWindows,
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
