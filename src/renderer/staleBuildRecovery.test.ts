import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStaleBuildChunkError,
  isStaleBuildReloadPending,
  reloadForStaleBuild,
  resetStaleBuildRecoveryForTest,
} from "./staleBuildRecovery";

const chunkError = new TypeError(
  "Failed to fetch dynamically imported module: https://app.test/assets/ItemMarkdownInner-old.js",
);

describe("stale build recovery", () => {
  const reload = vi.fn<() => void>();

  beforeEach(() => {
    window.sessionStorage.clear();
    resetStaleBuildRecoveryForTest(reload);
  });
  afterEach(() => {
    reload.mockReset();
    vi.useRealTimers();
    Reflect.deleteProperty(window, "poracodeHost");
  });

  it("recognizes each engine's failed chunk import", () => {
    expect(isStaleBuildChunkError(chunkError)).toBe(true);
    expect(
      isStaleBuildChunkError(new TypeError("error loading dynamically imported module: x")),
    ).toBe(true);
    expect(isStaleBuildChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleBuildChunkError(new Error("Unable to preload CSS for /assets/a.css"))).toBe(true);
    expect(isStaleBuildChunkError(new Error("render failed"))).toBe(false);
  });

  it("reloads once for a missing chunk and keeps reporting the reload as pending", () => {
    expect(reloadForStaleBuild(chunkError)).toBe(true);
    expect(reloadForStaleBuild(chunkError)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(isStaleBuildReloadPending()).toBe(true);
  });

  it("lets a second chunk failure soon after a reload reach the crash screen", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    expect(reloadForStaleBuild(chunkError)).toBe(true);

    // The reloaded page starts with fresh module state but the same tab session.
    resetStaleBuildRecoveryForTest(reload);
    vi.setSystemTime(1_000_000 + 30_000);
    expect(reloadForStaleBuild(chunkError)).toBe(false);

    vi.setSystemTime(1_000_000 + 61_000);
    expect(reloadForStaleBuild(chunkError)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("leaves other errors and the Electron renderer to the crash screen", () => {
    expect(reloadForStaleBuild(new Error("render failed"))).toBe(false);
    Object.assign(window, { poracodeHost: {} });
    expect(reloadForStaleBuild(chunkError)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
