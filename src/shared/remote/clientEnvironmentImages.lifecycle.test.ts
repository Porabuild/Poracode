import { describe, expect, it, vi } from "vitest";
import {
  ENVIRONMENT_IMAGE_MAX_CONCURRENT_FETCHES,
  RemoteEnvironmentImageCache,
  environmentLocalImageKey,
  type RemoteEnvironmentImageBytes,
} from "./clientEnvironmentImages";

interface FetchCall {
  readonly requestPath: string;
  readonly signal: AbortSignal;
  resolve: (bytes: Uint8Array, contentType?: string) => void;
  reject: (error: unknown) => void;
}

function cacheHarness(
  options: {
    readonly maxEntries?: number;
    readonly maxBytes?: number;
    readonly retryWindowMs?: number;
    readonly maxConcurrentFetches?: number;
  } = {},
) {
  const fetches: FetchCall[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const cache = new RemoteEnvironmentImageCache({
    fetchBytes: (requestPath, signal) =>
      new Promise<RemoteEnvironmentImageBytes>((resolve, reject) => {
        fetches.push({
          requestPath,
          signal,
          resolve: (bytes, contentType = "image/png") => resolve({ bytes, contentType }),
          reject,
        });
      }),
    createObjectUrl: () => {
      const url = `blob:${created.length + 1}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: (url) => {
      revoked.push(url);
    },
    ...options,
  });
  return { cache, fetches, created, revoked };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("RemoteEnvironmentImageCache lifecycle", () => {
  it("keeps getSnapshot identity stable and never starts work from a pure read", async () => {
    const harness = cacheHarness();
    const key = environmentLocalImageKey("/tmp/a.png");

    expect(harness.cache.resolutionForImageKey(key)).toBe(harness.cache.resolutionForImageKey(key));
    expect(harness.fetches).toHaveLength(0);

    const pending = harness.cache.localImageResolution("/tmp/a.png");
    expect(pending).toMatchObject({ key, url: "", pending: true });
    expect(harness.cache.resolutionForImageKey(key)).toBe(pending);
    expect(harness.cache.resolutionForImageKey(key)).toBe(pending);
    expect(harness.fetches).toHaveLength(1);

    harness.fetches[0]?.resolve(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() =>
      expect(harness.cache.resolutionForImageKey(key)).toMatchObject({
        key,
        url: "blob:1",
        pending: false,
      }),
    );
    const ready = harness.cache.resolutionForImageKey(key);
    expect(harness.cache.resolutionForImageKey(key)).toBe(ready);
    expect(harness.cache.resolutionForImageKey(key)).toBe(ready);
    expect(harness.fetches).toHaveLength(1);
  });

  it("bounds concurrent fetches and starts queued keys in FIFO order", async () => {
    const harness = cacheHarness({ maxConcurrentFetches: 1 });
    harness.cache.localImageResolution("/tmp/a.png");
    harness.cache.localImageResolution("/tmp/b.png");
    harness.cache.localImageResolution("/tmp/c.png");

    expect(harness.fetches.map((call) => call.requestPath)).toEqual([
      "/api/files/image?path=%2Ftmp%2Fa.png",
    ]);
    expect(
      harness.cache.resolutionForImageKey(environmentLocalImageKey("/tmp/b.png")),
    ).toMatchObject({
      pending: true,
    });

    harness.fetches[0]?.resolve(new Uint8Array([1]));
    await vi.waitFor(() => expect(harness.fetches).toHaveLength(2));
    expect(harness.fetches[1]?.requestPath).toBe("/api/files/image?path=%2Ftmp%2Fb.png");

    harness.fetches[1]?.resolve(new Uint8Array([2]));
    await vi.waitFor(() => expect(harness.fetches).toHaveLength(3));
    expect(harness.fetches[2]?.requestPath).toBe("/api/files/image?path=%2Ftmp%2Fc.png");
    expect(harness.created).toEqual(["blob:1", "blob:2"]);
  });

  it("evicts the least-recently-used entry, not the least-recently inserted", async () => {
    const harness = cacheHarness({ maxEntries: 2 });
    const pathA = "/tmp/a.png";
    const pathB = "/tmp/b.png";
    harness.cache.localImageResolution(pathA);
    harness.cache.localImageResolution(pathB);
    harness.fetches[0]?.resolve(new Uint8Array([1]));
    harness.fetches[1]?.resolve(new Uint8Array([2]));
    await vi.waitFor(() => expect(harness.cache.localImageUrl(pathB)).toBe(`blob:2`));

    // Touch A after B was loaded: A is now the most-recently-used.
    expect(harness.cache.localImageUrl(pathA)).toBe("blob:1");
    harness.cache.localImageResolution("/tmp/c.png");
    harness.fetches[2]?.resolve(new Uint8Array([3]));
    await vi.waitFor(() => expect(harness.cache.localImageUrl("/tmp/c.png")).toBe("blob:3"));

    expect(harness.revoked).toEqual(["blob:2"]);
    expect(harness.cache.localImageUrl(pathA)).toBe("blob:1");
    expect(harness.cache.localImageUrl(pathB)).toBe("");
  });

  it("latches an eviction so a visible key cannot drive a blind refetch loop", async () => {
    vi.useFakeTimers();
    try {
      const harness = cacheHarness({ maxEntries: 1, retryWindowMs: 1_000 });
      const pathA = "/tmp/a.png";
      const pathB = "/tmp/b.png";
      harness.cache.localImageResolution(pathA);
      harness.fetches[0]?.resolve(new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.cache.localImageUrl(pathA)).toBe("blob:1");

      const ticks: string[] = [];
      const keyA = environmentLocalImageKey(pathA);
      harness.cache.subscribeImageKey(keyA, () => ticks.push("tick"));

      harness.cache.localImageResolution(pathB);
      expect(harness.revoked).toEqual(["blob:1"]);
      expect(ticks).toEqual(["tick"]);

      // Inside the latch window the evicted key is a no-op: no refetch.
      expect(harness.cache.localImageResolution(pathA).url).toBe("");
      expect(harness.fetches).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(ticks).toEqual(["tick", "tick"]);
      expect(harness.cache.localImageResolution(pathA).pending).toBe(true);
      expect(harness.fetches).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("latches an image larger than the aggregate budget permanently", async () => {
    const harness = cacheHarness({ maxBytes: 4 });
    const path = "/tmp/huge.png";
    const key = environmentLocalImageKey(path);
    const ticks: string[] = [];
    harness.cache.subscribeImageKey(key, () => ticks.push("tick"));

    expect(harness.cache.localImageResolution(path).pending).toBe(true);
    harness.fetches[0]?.resolve(new Uint8Array(10));
    await vi.waitFor(() => expect(ticks).toEqual(["tick"]));

    expect(harness.created).toEqual([]);
    expect(harness.cache.resolutionForImageKey(key)).toMatchObject({ url: "", pending: false });
    // Repeated requests never refetch a blob that can never fit.
    expect(harness.cache.localImageResolution(path).url).toBe("");
    expect(harness.cache.localImageResolution(path).url).toBe("");
    expect(harness.fetches).toHaveLength(1);
  });

  it("aborts the queued work when a generation is replaced by eviction", async () => {
    const harness = cacheHarness({ maxEntries: 1, maxConcurrentFetches: 1 });
    harness.cache.localImageResolution("/tmp/a.png");
    harness.cache.localImageResolution("/tmp/b.png");
    // Entry-bound pressure evicted the older in-flight generation; the queued
    // key is promoted and the stale completion must be dropped.
    expect(harness.fetches).toHaveLength(2);
    expect(harness.fetches[0]?.signal.aborted).toBe(true);

    const keyB = environmentLocalImageKey("/tmp/b.png");
    expect(harness.cache.resolutionForImageKey(keyB)).toMatchObject({ pending: true });
    harness.fetches[0]?.resolve(new Uint8Array([1]));
    await flush();
    expect(harness.created).toEqual([]);
    expect(harness.fetches).toHaveLength(2);
  });

  it("uses the documented default concurrency bound", () => {
    expect(ENVIRONMENT_IMAGE_MAX_CONCURRENT_FETCHES).toBe(4);
  });
});
