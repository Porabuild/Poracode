import { afterEach, expect, it, vi } from "vitest";
import {
  ENVIRONMENT_IMAGE_CACHE_MAX_ENTRIES,
  RemoteEnvironmentImageCache,
  environmentImageRefKey,
  environmentLocalImageKey,
  type RemoteEnvironmentImageCacheOptions,
} from "./clientEnvironmentImages";
import type { RemoteImageRefValue } from "./imageRef";
import { createImageCacheHarness } from "./clientEnvironmentImages.testSupport";

const caches = new Set<RemoteEnvironmentImageCache>();
afterEach(() => {
  for (const cache of caches) cache.dispose();
  caches.clear();
});

function harness(options: Partial<RemoteEnvironmentImageCacheOptions> = {}) {
  const { cache, fetches, revoked } = createImageCacheHarness(options);
  caches.add(cache);
  const resolve = (index: number, values: number[]) => {
    fetches[index]!.resolve(new Uint8Array(values));
  };
  const snapshot = (path: string) => cache.resolutionForImageKey(environmentLocalImageKey(path));
  return { cache, fetches, revoked, resolve, snapshot };
}

it("bounds a 76-reference gallery burst without aborting or evicting mounted images", async () => {
  const h = harness();
  // Previous-release reference shape: scheduling needs no new host metadata.
  const refs: RemoteImageRefValue[] = Array.from({ length: 76 }, (_, index) => ({
    threadId: "long-thread",
    itemId: `image-${index}`,
    path: ["images", 0],
    mime: "image/png",
    bytes: 100,
    width: 800,
    height: 600,
  }));
  const visibleKey = environmentImageRefKey(refs[0]!);
  h.cache.subscribeImageKey(visibleKey, () => undefined);
  for (const ref of refs) h.cache.imageRefResolution(ref, "background");
  expect(h.fetches).toHaveLength(4);
  expect(h.fetches.every((fetch) => !fetch.signal.aborted)).toBe(true);

  for (let index = 0; index < ENVIRONMENT_IMAGE_CACHE_MAX_ENTRIES; index++) {
    await vi.waitFor(() => expect(h.fetches[index]).toBeDefined());
    h.resolve(index, [index]);
  }
  await vi.waitFor(() =>
    expect(h.cache.resolutionForImageKey(environmentImageRefKey(refs[63]!)).url).not.toBe(""),
  );
  expect(h.cache.resolutionForImageKey(visibleKey).url).toBe("blob:1");
  expect(h.revoked).toEqual([]);
  expect(h.fetches).toHaveLength(64);

  // Scroll to a coordinate the speculative pass could not admit. It loads
  // immediately, evicting an off-screen coordinate rather than the mounted one.
  const next = refs[75]!;
  h.cache.subscribeImageKey(environmentImageRefKey(next), () => undefined);
  h.cache.imageRefResolution(next);
  await vi.waitFor(() => expect(h.fetches).toHaveLength(65));
  h.resolve(64, [75]);
  await vi.waitFor(() =>
    expect(h.cache.resolutionForImageKey(environmentImageRefKey(next)).url).not.toBe(""),
  );
  expect(h.cache.resolutionForImageKey(visibleKey).url).toBe("blob:1");
  for (const ref of refs) h.cache.imageRefResolution(ref, "background");
  expect(h.fetches).toHaveLength(65);
  expect(h.fetches.every((fetch) => !fetch.signal.aborted)).toBe(true);
});

it("promotes a mounted image ahead of the gallery queue", async () => {
  const h = harness({ maxConcurrentFetches: 1 });
  for (const path of ["/a", "/b", "/c"]) h.cache.localImageResolution(path, "background");
  h.cache.subscribeImageKey(environmentLocalImageKey("/c"), () => undefined);
  h.cache.localImageResolution("/c");
  h.resolve(0, [1]);
  await vi.waitFor(() => expect(h.fetches).toHaveLength(2));
  expect(h.fetches[1]!.requestPath).toContain("path=%2Fc");
  h.resolve(1, [2]);
  await vi.waitFor(() => expect(h.fetches).toHaveLength(3));
  expect(h.fetches[2]!.requestPath).toContain("path=%2Fb");
});

it("drops an over-budget prefetch and lets a mounted consumer retry it without the eviction delay", async () => {
  const h = harness({ maxBytes: 5 });
  h.cache.subscribeImageKey(environmentLocalImageKey("/visible"), () => undefined);
  h.cache.localImageResolution("/visible");
  h.resolve(0, [1, 2]);
  await vi.waitFor(() => expect(h.snapshot("/visible").url).toBe("blob:1"));
  h.cache.localImageResolution("/background", "background");
  h.resolve(1, [3, 4, 5, 6]);
  await vi.waitFor(() => expect(h.revoked).toEqual(["blob:2"]));
  expect(h.snapshot("/visible").url).toBe("blob:1");
  h.cache.localImageResolution("/background", "background");
  expect(h.fetches).toHaveLength(2);
  h.cache.subscribeImageKey(environmentLocalImageKey("/background"), () => undefined);
  h.cache.localImageResolution("/background");
  await vi.waitFor(() => expect(h.fetches).toHaveLength(3));
  h.resolve(2, [3, 4, 5]);
  await vi.waitFor(() => expect(h.snapshot("/background").url).toBe("blob:3"));
  expect(h.snapshot("/visible").url).toBe("blob:1");
});

it("keeps the failure backoff when a failed prefetch becomes visible", async () => {
  const h = harness();
  h.cache.localImageResolution("/failed", "background");
  h.fetches[0]!.reject(new Error("offline"));
  await vi.waitFor(() => expect(h.snapshot("/failed").pending).toBe(false));
  h.cache.subscribeImageKey(environmentLocalImageKey("/failed"), () => undefined);
  h.cache.localImageResolution("/failed");
  expect(h.fetches).toHaveLength(1);
});

it("protects an active download when foreground demand replaces a queued prefetch", async () => {
  const h = harness({ maxEntries: 2, maxConcurrentFetches: 1 });
  h.cache.subscribeImageKey(environmentLocalImageKey("/visible"), () => undefined);
  h.cache.localImageResolution("/visible");
  h.cache.localImageResolution("/queued", "background");
  h.cache.localImageResolution("/excess", "background");
  h.cache.localImageResolution("/next");
  expect(h.fetches).toHaveLength(1);
  expect(h.fetches[0]!.signal.aborted).toBe(false);
  h.resolve(0, [1]);
  await vi.waitFor(() => expect(h.fetches).toHaveLength(2));
  expect(h.fetches[1]!.requestPath).toContain("path=%2Fnext");
  expect(h.snapshot("/visible").url).toBe("blob:1");
});

it("releases foreground priority after the last mounted consumer leaves", async () => {
  const h = harness({ maxEntries: 2 });
  const key = environmentLocalImageKey("/visible");
  const leaveFirst = h.cache.subscribeImageKey(key, () => undefined);
  const leaveLast = h.cache.subscribeImageKey(key, () => undefined);
  h.cache.subscribeImageKey(key, () => undefined, "background");
  h.cache.localImageResolution("/visible");
  h.cache.localImageResolution("/gallery", "background");
  h.resolve(0, [1]);
  h.resolve(1, [2]);
  await vi.waitFor(() => expect(h.snapshot("/gallery").url).not.toBe(""));
  leaveFirst();
  h.cache.localImageResolution("/next");
  expect(h.snapshot("/visible").url).toBe("blob:1");
  leaveLast();
  h.cache.localImageResolution("/last");
  expect(h.snapshot("/visible").url).toBe("");
  expect(h.revoked).toContain("blob:1");
});
