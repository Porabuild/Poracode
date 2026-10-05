import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClientEnvironmentImageBlobPool,
  type EnvironmentImageBlobResource,
} from "./clientEnvironmentImageBlobPool";
import {
  RemoteEnvironmentImageCache,
  environmentImageRefKey,
  environmentLocalImageKey,
  type RemoteEnvironmentImageBytes,
  type RemoteEnvironmentImageCacheOptions,
} from "./clientEnvironmentImages";
import { deferred, imageRef } from "./clientEnvironments.testSupport";

interface FetchCall {
  readonly requestPath: string;
  readonly signal: AbortSignal;
  readonly resolve: (bytes: Uint8Array, contentType?: string) => void;
  readonly reject: (error: unknown) => void;
}

const caches = new Set<RemoteEnvironmentImageCache>();
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const cache of caches) cache.dispose();
  caches.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function harness(options: Partial<RemoteEnvironmentImageCacheOptions> = {}) {
  const fetches: FetchCall[] = [];
  const created: string[] = [];
  const blobs: Blob[] = [];
  const revoked: string[] = [];
  let outstanding = 0;
  let peakOutstanding = 0;
  const cache = new RemoteEnvironmentImageCache({
    fetchBytes: (requestPath, signal) => {
      outstanding += 1;
      peakOutstanding = Math.max(peakOutstanding, outstanding);
      return new Promise<RemoteEnvironmentImageBytes>((resolve, reject) => {
        fetches.push({
          requestPath,
          signal,
          resolve: (bytes, contentType = "image/png") => resolve({ bytes, contentType }),
          reject,
        });
      }).finally(() => {
        outstanding -= 1;
      });
    },
    createObjectUrl: (blob) => {
      const url = `blob:${created.length + 1}`;
      created.push(url);
      blobs.push(blob);
      return url;
    },
    revokeObjectUrl: (url) => revoked.push(url),
    ...options,
  });
  caches.add(cache);
  const snapshot = (path: string) => cache.resolutionForImageKey(environmentLocalImageKey(path));
  const ready = async (path: string, bytes: Uint8Array, contentType = "image/png") => {
    cache.localImageResolution(path);
    const call = fetches.at(-1);
    expect(call?.requestPath).toBe(`/api/files/image?${new URLSearchParams({ path })}`);
    call?.resolve(bytes, contentType);
    await vi.waitFor(() => expect(snapshot(path).url).not.toBe(""), { interval: 5 });
    return snapshot(path).url;
  };
  return {
    cache,
    fetches,
    created,
    blobs,
    revoked,
    snapshot,
    ready,
    outstanding: () => outstanding,
    peakOutstanding: () => peakOutstanding,
  };
}

/** Hold exactly one bounded read without introducing an unrelated host task. */
function holdComparisonRead() {
  const read = deferred<ArrayBuffer>();
  const slice = vi.spyOn(Blob.prototype, "slice").mockImplementationOnce(() => {
    return { arrayBuffer: () => read.promise } as Blob;
  });
  return { read, slice };
}

describe("authenticated image resource identity", () => {
  it("shares across independently fetched thread/item/path coordinates without ref metadata identity", async () => {
    const h = harness();
    const refs = [
      imageRef({ threadId: "thread-a", itemId: "item-a", bytes: 999_999, mime: "image/jpeg" }),
      imageRef({ threadId: "thread-b", itemId: "item-b", bytes: 0, path: ["result", 1] }),
      imageRef({ threadId: "thread-a", itemId: "item-a", path: ["images", 1] }),
    ];
    for (const ref of refs) {
      expect(h.cache.imageRefResolution(ref)).toMatchObject({ url: "", pending: true });
      h.fetches.at(-1)?.resolve(new Uint8Array([1, 2, 3]));
      await vi.waitFor(() =>
        expect(h.cache.resolutionForImageKey(environmentImageRefKey(ref)).url).toBe("blob:1"),
      );
    }
    expect(await h.ready("/equal.png", new Uint8Array([1, 2, 3]))).toBe("blob:1");
    expect(h.fetches).toHaveLength(4);
    expect(new Set(h.fetches.map((call) => call.requestPath)).size).toBe(4);
    expect(h.created).toEqual(["blob:1"]);
    h.cache.dispose();
    h.cache.dispose();
    expect(h.revoked).toEqual(["blob:1"]);
  });

  it("uses normalized response MIME, preserving parameter distinctions", async () => {
    const h = harness();
    const bytes = new Uint8Array([1, 2]);
    expect(await h.ready("/a", bytes, "IMAGE/PNG; X=Y")).toBe("blob:1");
    expect(await h.ready("/b", bytes, "image/png; x=y")).toBe("blob:1");
    expect(await h.ready("/c", bytes, "image/png")).toBe("blob:2");
    expect(await h.ready("/d", bytes, "image/png; x=z")).toBe("blob:3");
    expect(await h.ready("/e", bytes, "image/jpeg")).toBe("blob:4");
    expect(await h.ready("/f", bytes, "image/\u0100")).toBe("blob:5");
    expect(await h.ready("/g", bytes, "")).toBe("blob:5");
    expect(h.blobs.map((blob) => blob.type)).toEqual([
      "image/png; x=y",
      "image/png",
      "image/png; x=z",
      "image/jpeg",
      "",
    ]);
  });

  it("compares only nonzero-offset view bytes and detects an equal-length last-byte difference", async () => {
    const h = harness();
    const a = new Uint8Array([99, 1, 2, 3, 88]).subarray(1, 4);
    const b = new Uint8Array([77, 66, 1, 2, 3, 55]).subarray(2, 5);
    const c = new Uint8Array([77, 1, 2, 4, 66]).subarray(1, 4);
    expect(await h.ready("/a", a)).toBe("blob:1");
    expect(await h.ready("/b", b)).toBe("blob:1");
    expect(await h.ready("/c", c)).toBe("blob:2");
    expect(new Uint8Array(await h.blobs[0]!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(h.blobs.map((blob) => blob.size)).toEqual([3, 3]);
  });

  it("preserves safe Blob creation for SharedArrayBuffer-backed injected views", async () => {
    const h = harness();
    const backing = new Uint8Array(new SharedArrayBuffer(5));
    backing.set([99, 1, 2, 3, 88]);
    expect(await h.ready("/shared", backing.subarray(1, 4))).toBe("blob:1");
    backing[2] = 9;
    expect(await h.ready("/array", new Uint8Array([1, 2, 3]))).toBe("blob:1");
    expect(new Uint8Array(await h.blobs[0]!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("shares empty responses only within the same effective MIME bucket", async () => {
    const h = harness({ maxBytes: 0 });
    expect(await h.ready("/a", new Uint8Array())).toBe("blob:1");
    expect(await h.ready("/b", new Uint8Array())).toBe("blob:1");
    expect(await h.ready("/c", new Uint8Array(), "image/jpeg")).toBe("blob:2");
    expect(h.revoked).toEqual([]);
  });

  it("does no candidate read for a first resource or a different MIME/actual size, without WebCrypto", async () => {
    vi.stubGlobal("crypto", {});
    const slice = vi.spyOn(Blob.prototype, "slice");
    const h = harness();
    await h.ready("/a", new Uint8Array([1, 2]));
    await h.ready("/b", new Uint8Array([1, 2]), "image/jpeg");
    await h.ready("/c", new Uint8Array([1, 2, 3]));
    expect(slice).not.toHaveBeenCalled();
    expect(await h.ready("/d", new Uint8Array([1, 2]))).toBe("blob:1");
    expect(h.created).toHaveLength(3);
  });

  it("serializes simultaneous equal completions into one resource", async () => {
    const h = harness();
    for (const path of ["/a", "/b", "/c", "/d"]) h.cache.localImageResolution(path);
    for (const call of h.fetches) call.resolve(new Uint8Array([4, 5, 6]));
    await vi.waitFor(() => {
      for (const path of ["/a", "/b", "/c", "/d"]) expect(h.snapshot(path).url).toBe("blob:1");
    });
    expect(h.created).toEqual(["blob:1"]);
    expect(h.fetches).toHaveLength(4);
  });

  it("never shares a URL or authorization between cache instances, including identical endpoints", async () => {
    const a = harness();
    const b = harness();
    const bytes = new Uint8Array([1, 2]);
    await a.ready("/same", bytes);
    b.cache.localImageResolution("/same");
    expect(b.snapshot("/same")).toMatchObject({ url: "", pending: true });
    expect(a.created).toHaveLength(1);
    expect(b.created).toHaveLength(0);
    b.fetches[0]?.resolve(bytes);
    await vi.waitFor(() => expect(b.snapshot("/same").url).toBe("blob:1"));
    expect(b.created).toHaveLength(1);
    expect(a.blobs[0]).not.toBe(b.blobs[0]);
    a.cache.dispose();
    expect(a.revoked).toEqual(["blob:1"]);
    expect(b.revoked).toEqual([]);
    expect(b.snapshot("/same").url).toBe("blob:1");
  });
});

describe("image resource ownership and budgets", () => {
  it("charges duplicate aliases once and evicts every older alias before releasing its bytes", async () => {
    const h = harness({ maxBytes: 6 });
    const ticks: string[] = [];
    for (const path of ["/a", "/b", "/c"]) {
      expect(await h.ready(path, new Uint8Array(6).fill(1))).toBe("blob:1");
      h.cache.subscribeImageKey(environmentLocalImageKey(path), () => ticks.push(path));
    }
    expect(h.created).toEqual(["blob:1"]);
    expect(h.revoked).toEqual([]);
    expect(await h.ready("/d", new Uint8Array(6).fill(2))).toBe("blob:2");
    expect(ticks).toEqual(["/a", "/b", "/c"]);
    expect(h.revoked).toEqual(["blob:1"]);
    for (const path of ["/a", "/b", "/c"]) {
      expect(h.cache.localImageResolution(path)).toMatchObject({ url: "", pending: false });
    }
    expect(h.fetches).toHaveLength(4);
    h.cache.dispose();
    h.cache.dispose();
    expect(h.revoked).toEqual(["blob:1", "blob:2"]);
  });

  it("keeps aliases within the coordinate LRU/count bound and pure reads do not reorder them", async () => {
    const h = harness({ maxEntries: 2 });
    await h.ready("/a", new Uint8Array([1]));
    await h.ready("/b", new Uint8Array([1]));
    const ticks: string[] = [];
    h.cache.subscribeImageKey(environmentLocalImageKey("/a"), () => ticks.push("a"));
    // The subscription touches A; a snapshot of B must leave B oldest.
    const b = h.snapshot("/b");
    expect(h.snapshot("/b")).toBe(b);
    h.cache.localImageResolution("/c");
    expect(h.snapshot("/b").url).toBe("");
    expect(h.snapshot("/a").url).toBe("blob:1");
    expect(h.revoked).toEqual([]);
    h.fetches[2]?.resolve(new Uint8Array([2]));
    await vi.waitFor(() => expect(h.snapshot("/c").url).toBe("blob:2"));
    h.cache.localImageResolution("/d");
    expect(ticks).toEqual(["a"]);
    expect(h.revoked).toEqual(["blob:1"]);
    expect(h.snapshot("/a").url).toBe("");
    expect(h.snapshot("/c").url).toBe("blob:2");
  });

  it("refuses actual bytes over budget before any Blob allocation and preserves oversized count starvation", async () => {
    const NativeBlob = Blob;
    const allocations: number[] = [];
    vi.stubGlobal(
      "Blob",
      class extends NativeBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          allocations.push(this.size);
        }
      },
    );
    const h = harness({ maxEntries: 2, maxBytes: 1 });
    for (const path of ["/a", "/b"]) {
      h.cache.localImageResolution(path);
      h.fetches.at(-1)?.resolve(new Uint8Array(2));
      await vi.waitFor(() => expect(h.snapshot(path).pending).toBe(false));
    }
    h.cache.localImageResolution("/c");
    expect(h.fetches).toHaveLength(2);
    expect(h.snapshot("/c")).toMatchObject({ url: "", pending: false });
    for (const path of ["/a", "/b"]) {
      expect(h.cache.localImageResolution(path)).toMatchObject({ url: "", pending: false });
    }
    expect(allocations).toEqual([]);
    expect(h.created).toEqual([]);
  });

  it("reauthenticates a failed coordinate on retry before allowing verified reuse", async () => {
    vi.useFakeTimers();
    const h = harness({ retryWindowMs: 1_000 });
    h.cache.localImageResolution("/a");
    h.fetches[0]?.resolve(new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(0);
    const ticks: string[] = [];
    h.cache.subscribeImageKey(environmentLocalImageKey("/b"), () => ticks.push("b"));
    h.cache.localImageResolution("/b");
    h.fetches[1]?.reject(new Error("403"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.snapshot("/b")).toMatchObject({ url: "", pending: false });
    expect(h.cache.localImageResolution("/b").url).toBe("");
    expect(h.fetches).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ticks).toEqual(["b", "b"]);
    expect(h.cache.localImageResolution("/b")).toMatchObject({ url: "", pending: true });
    expect(h.fetches).toHaveLength(3);
    h.fetches[2]?.resolve(new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.snapshot("/b").url).toBe("blob:1");
    expect(ticks).toEqual(["b", "b", "b"]);
    expect(h.created).toEqual(["blob:1"]);
    h.cache.dispose();
  });

  it("queues a lapsed failure retry when the actual job limit is occupied", async () => {
    vi.useFakeTimers();
    const h = harness({ retryWindowMs: 1_000, maxConcurrentFetches: 1 });
    h.cache.localImageResolution("/a");
    h.fetches[0]?.reject(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    h.cache.localImageResolution("/b");
    // Advance the clock without running the failure timer: exercise the
    // explicit retry path, including clearing that timer while A is queued.
    vi.setSystemTime(Date.now() + 1_001);
    expect(h.cache.localImageResolution("/a")).toMatchObject({ url: "", pending: true });
    expect(h.fetches).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.snapshot("/a").pending).toBe(true);
    h.fetches[1]?.resolve(new Uint8Array([2]));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetches).toHaveLength(3);
    expect(h.fetches[2]?.requestPath).toContain("path=%2Fa");
    expect(h.peakOutstanding()).toBe(1);
    h.cache.dispose();
  });
});

describe("image admission cancellation and failures", () => {
  it.each([3, 6])(
    "preserves independent availability after candidate read failure with budget %s",
    async (maxBytes) => {
      const h = harness({ maxBytes });
      await h.ready("/a", new Uint8Array([1, 2, 3]));
      vi.spyOn(Blob.prototype, "slice").mockImplementationOnce(() => {
        return { arrayBuffer: () => Promise.reject(new Error("unreadable candidate")) } as Blob;
      });
      expect(await h.ready("/b", new Uint8Array([1, 2, 3]))).toBe("blob:2");
      expect(h.snapshot("/a").url).toBe(maxBytes === 3 ? "" : "blob:1");
      expect(h.revoked).toEqual(maxBytes === 3 ? ["blob:1"] : []);
      expect(await h.ready("/c", new Uint8Array([1, 2, 3]))).toBe(
        maxBytes === 3 ? "blob:2" : "blob:1",
      );
      expect(h.created).toHaveLength(2);
    },
  );

  it("does not attach a matching resource whose last owner was evicted during a read", async () => {
    const h = harness({ maxEntries: 2 });
    await h.ready("/a", new Uint8Array([1, 2, 3]));
    const held = holdComparisonRead();
    h.cache.localImageResolution("/b");
    h.fetches[1]?.resolve(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() => expect(held.slice).toHaveBeenCalledOnce());
    h.cache.localImageResolution("/c");
    expect(h.revoked).toEqual(["blob:1"]);
    expect(h.snapshot("/b")).toMatchObject({ url: "", pending: true });
    held.read.resolve(new Uint8Array([1, 2, 3]).buffer);
    await vi.waitFor(() => expect(h.snapshot("/b").url).toBe("blob:2"));
    expect(h.created).toEqual(["blob:1", "blob:2"]);
    expect(h.revoked).toEqual(["blob:1"]);
  });

  it("fences an evicted comparison generation and reserves its slot through read settlement and retry", async () => {
    const h = harness({ maxEntries: 2, maxConcurrentFetches: 1 });
    await h.ready("/a", new Uint8Array([1, 2, 3]));
    const held = holdComparisonRead();
    const ticks: string[] = [];
    h.cache.subscribeImageKey(environmentLocalImageKey("/b"), () => ticks.push("b"));
    const old = h.cache.localImageResolution("/b");
    h.fetches[1]?.resolve(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() => expect(held.slice).toHaveBeenCalledOnce());
    h.cache.localImageResolution("/a");
    h.cache.localImageResolution("/c");
    expect(h.fetches[1]?.signal.aborted).toBe(true);
    const replacement = h.cache.localImageResolution("/b");
    expect(replacement).not.toBe(old);
    expect(replacement).toMatchObject({ url: "", pending: true });
    expect(h.fetches).toHaveLength(2);
    held.read.resolve(new Uint8Array([1, 2, 3]).buffer);
    await vi.waitFor(() => expect(h.fetches).toHaveLength(3));
    expect(h.created).toEqual(["blob:1"]);
    expect(ticks).toEqual(["b"]);
    expect(h.fetches[2]?.requestPath).toContain("path=%2Fc");
    h.fetches[2]?.resolve(new Uint8Array([9]));
    await vi.waitFor(() => expect(h.fetches).toHaveLength(4));
    h.fetches[3]?.resolve(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() => expect(h.snapshot("/b").url).toBe("blob:3"));
    expect(ticks).toEqual(["b", "b"]);
    expect(h.revoked).toEqual(["blob:1"]);
  });

  it("drops dispose-time comparison results without URLs, owners, or notifications", async () => {
    const h = harness();
    await h.ready("/a", new Uint8Array([1, 2, 3]));
    const held = holdComparisonRead();
    const tick = vi.fn<() => void>();
    h.cache.subscribeImageKey(environmentLocalImageKey("/b"), tick);
    h.cache.localImageResolution("/b");
    h.fetches[1]?.resolve(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() => expect(held.slice).toHaveBeenCalledOnce());
    h.cache.dispose();
    expect(h.fetches[1]?.signal.aborted).toBe(true);
    expect(h.revoked).toEqual(["blob:1"]);
    held.read.resolve(new Uint8Array([1, 2, 3]).buffer);
    await flush();
    expect(h.created).toEqual(["blob:1"]);
    expect(h.snapshot("/b")).toMatchObject({ url: "", pending: false });
    expect(tick).not.toHaveBeenCalled();
  });

  it("bounds actual unsettled abort-ignoring fetches during repeated count eviction", async () => {
    const h = harness({ maxEntries: 1 });
    for (let index = 0; index < 20; index += 1) h.cache.localImageResolution(`/image-${index}`);
    expect(h.fetches).toHaveLength(4);
    expect(h.outstanding()).toBe(4);
    expect(h.fetches.every((call) => call.signal.aborted)).toBe(true);
    expect(h.snapshot("/image-19")).toMatchObject({ url: "", pending: true });
    h.fetches[0]?.resolve(new Uint8Array([1]));
    await vi.waitFor(() => expect(h.fetches).toHaveLength(5));
    expect(h.fetches[4]?.requestPath).toContain("path=%2Fimage-19");
    expect(h.outstanding()).toBe(4);
    expect(h.peakOutstanding()).toBe(4);
    for (const call of h.fetches.slice(1, 4)) call.resolve(new Uint8Array([1]));
    await flush();
    expect(h.created).toEqual([]);
    h.fetches[4]?.resolve(new Uint8Array([1]));
    await vi.waitFor(() => expect(h.snapshot("/image-19").url).toBe("blob:1"));
    expect(h.peakOutstanding()).toBe(4);
  });

  it("counts completed fetches waiting for serialized admission as occupied job slots", async () => {
    const h = harness({ maxConcurrentFetches: 2 });
    await h.ready("/a", new Uint8Array([1, 2, 3]));
    const held = holdComparisonRead();
    for (const path of ["/b", "/c"]) h.cache.localImageResolution(path);
    h.fetches[1]?.resolve(new Uint8Array([1, 2, 3]));
    h.fetches[2]?.resolve(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() => expect(held.slice).toHaveBeenCalledOnce());
    h.cache.localImageResolution("/d");
    expect(h.outstanding()).toBe(0);
    expect(h.fetches).toHaveLength(3);
    expect(h.snapshot("/b").pending).toBe(true);
    expect(h.snapshot("/c").pending).toBe(true);
    held.read.resolve(new Uint8Array([1, 2, 3]).buffer);
    await vi.waitFor(() => expect(h.fetches).toHaveLength(4));
    await vi.waitFor(() => expect(h.snapshot("/c").url).toBe("blob:1"));
    expect(h.created).toEqual(["blob:1"]);
  });

  it("cancels an evicted admission waiter without bypassing the still-active comparison", async () => {
    const h = harness({ maxEntries: 3, maxConcurrentFetches: 2 });
    const payload = new Uint8Array([1, 2, 3]);
    await h.ready("/a", payload);
    const held = holdComparisonRead();
    for (const path of ["/b", "/c"]) h.cache.localImageResolution(path);
    h.fetches[1]?.resolve(payload);
    h.fetches[2]?.resolve(payload);
    await vi.waitFor(() => expect(held.slice).toHaveBeenCalledOnce());
    h.cache.localImageResolution("/a");
    h.cache.localImageResolution("/b");
    h.cache.localImageResolution("/d");
    expect(h.fetches[2]?.signal.aborted).toBe(true);
    await vi.waitFor(() => expect(h.fetches).toHaveLength(4));
    h.fetches[3]?.resolve(payload);
    await flush();
    expect(h.snapshot("/c")).toMatchObject({ url: "", pending: false });
    expect(h.snapshot("/b")).toMatchObject({ url: "", pending: true });
    expect(h.snapshot("/d")).toMatchObject({ url: "", pending: true });
    expect(held.slice).toHaveBeenCalledOnce();
    expect(h.created).toEqual(["blob:1"]);
    held.read.resolve(payload.slice().buffer);
    await vi.waitFor(() => expect(h.snapshot("/d").url).toBe("blob:1"));
    expect(h.snapshot("/b").url).toBe("blob:1");
    expect(h.created).toEqual(["blob:1"]);
  });

  it("latches createObjectUrl errors and frees the job for queued work", async () => {
    let creations = 0;
    const h = harness({
      maxConcurrentFetches: 1,
      createObjectUrl: () => {
        creations += 1;
        if (creations === 1) throw new Error("URL allocation failed");
        return "blob:working";
      },
    });
    h.cache.localImageResolution("/a");
    h.cache.localImageResolution("/b");
    h.fetches[0]?.resolve(new Uint8Array([1]));
    await vi.waitFor(() => expect(h.fetches).toHaveLength(2));
    expect(h.snapshot("/a")).toMatchObject({ url: "", pending: false });
    expect(h.cache.localImageResolution("/a").url).toBe("");
    h.fetches[1]?.resolve(new Uint8Array([1]));
    await vi.waitFor(() => expect(h.snapshot("/b").url).toBe("blob:working"));
    expect(creations).toBe(2);
    expect(h.fetches).toHaveLength(2);
  });

  it("revokes a URL returned after reentrant creation-time disposal exactly once", async () => {
    let cache!: RemoteEnvironmentImageCache;
    const h = harness({
      createObjectUrl: () => {
        cache.dispose();
        return "blob:late";
      },
    });
    cache = h.cache;
    const tick = vi.fn<() => void>();
    cache.subscribeImageKey(environmentLocalImageKey("/a"), tick);
    cache.localImageResolution("/a");
    h.fetches[0]?.resolve(new Uint8Array([1]));
    await vi.waitFor(() => expect(h.revoked).toEqual(["blob:late"]));
    cache.dispose();
    expect(h.revoked).toEqual(["blob:late"]);
    expect(tick).not.toHaveBeenCalled();
    expect(h.snapshot("/a")).toMatchObject({ url: "", pending: false });
  });

  it("does not latch or start queued work when a create hook disposes and then throws", async () => {
    vi.useFakeTimers();
    let cache!: RemoteEnvironmentImageCache;
    const h = harness({
      maxConcurrentFetches: 1,
      createObjectUrl: () => {
        cache.dispose();
        throw new Error("allocation failed during retirement");
      },
    });
    cache = h.cache;
    cache.localImageResolution("/a");
    cache.localImageResolution("/b");
    h.fetches[0]?.resolve(new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetches).toHaveLength(1);
    expect(h.revoked).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.snapshot("/a")).toMatchObject({ url: "", pending: false });
    expect(h.snapshot("/b")).toMatchObject({ url: "", pending: false });
  });

  it("retires bookkeeping before a reentrant revoke hook and leaves no disposal-time retry timer", async () => {
    vi.useFakeTimers();
    const revoked: string[] = [];
    let cache!: RemoteEnvironmentImageCache;
    const h = harness({
      maxEntries: 1,
      revokeObjectUrl: (url) => {
        revoked.push(url);
        cache.dispose();
      },
    });
    cache = h.cache;
    cache.localImageResolution("/a");
    h.fetches[0]?.resolve(new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(0);
    cache.localImageResolution("/b");
    expect(revoked).toEqual(["blob:1"]);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.fetches).toHaveLength(1);
    cache.dispose();
    expect(revoked).toEqual(["blob:1"]);
  });
});

describe("bounded Blob comparison scheduling and retention", () => {
  it("does not release a resource through another cache's pool", async () => {
    const revokedA: string[] = [];
    const revokedB: string[] = [];
    const a = new ClientEnvironmentImageBlobPool(
      () => "blob:a",
      (url) => revokedA.push(url),
    );
    const b = new ClientEnvironmentImageBlobPool(
      () => "blob:b",
      (url) => revokedB.push(url),
    );
    const signal = new AbortController().signal;
    let resourceA!: EnvironmentImageBlobResource;
    let resourceB!: EnvironmentImageBlobResource;
    await a.admit(
      new Uint8Array([1]),
      "image/png",
      signal,
      () => true,
      (resource) => {
        resourceA = resource;
      },
    );
    await b.admit(
      new Uint8Array([1]),
      "image/png",
      signal,
      () => true,
      (resource) => {
        resourceB = resource;
      },
    );
    b.release(resourceA);
    a.release(resourceB);
    expect(a.totalBytes).toBe(1);
    expect(b.totalBytes).toBe(1);
    expect(resourceA.owners).toBe(1);
    expect(resourceB.owners).toBe(1);
    expect(revokedA).toEqual([]);
    expect(revokedB).toEqual([]);
    a.dispose();
    b.dispose();
    a.release(resourceA);
    b.release(resourceB);
    expect(a.totalBytes).toBe(0);
    expect(b.totalBytes).toBe(0);
    expect(revokedA).toEqual(["blob:a"]);
    expect(revokedB).toEqual(["blob:b"]);
  });

  it("yields a real host task after 256 KiB, uses at most 64 KiB slices, and detects a late mismatch", async () => {
    const h = harness();
    const payload = new Uint8Array(600 * 1024).fill(7);
    await h.ready("/a", payload);
    // Already-resolved reads ensure incidental Blob I/O cannot provide the
    // task yield. A frozen clock exercises the explicit byte quantum.
    vi.spyOn(performance, "now").mockReturnValue(0);
    const slice = vi.spyOn(Blob.prototype, "slice").mockImplementation((start = 0, end = 0) => {
      return { arrayBuffer: () => Promise.resolve(payload.slice(start, end).buffer) } as Blob;
    });
    h.cache.localImageResolution("/b");
    const hostTask = deferred<{ pending: boolean; reads: number }>();
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      hostTask.resolve({ pending: h.snapshot("/b").pending, reads: slice.mock.calls.length });
      channel.port1.close();
      channel.port2.close();
    };
    channel.port2.postMessage(null);
    h.fetches[1]?.resolve(payload);
    expect(await hostTask.promise).toEqual({ pending: true, reads: 4 });
    await vi.waitFor(() => expect(h.snapshot("/b").url).toBe("blob:1"));
    expect(slice).toHaveBeenCalledTimes(10);
    for (const [start, end] of slice.mock.calls)
      expect(end! - start!).toBeLessThanOrEqual(64 * 1024);
    slice.mockClear();
    const changed = payload.slice();
    changed[changed.length - 1] = 8;
    expect(await h.ready("/c", changed)).toBe("blob:2");
    expect(slice).toHaveBeenCalledTimes(10);
    expect(h.created).toEqual(["blob:1", "blob:2"]);
  });

  it("stops at the first byte mismatch without an unnecessary task yield or subsequent read", async () => {
    const h = harness();
    const payload = new Uint8Array(600 * 1024).fill(7);
    await h.ready("/a", payload);
    vi.spyOn(performance, "now").mockReturnValue(0);
    const NativeChannel = MessageChannel;
    let tasks = 0;
    vi.stubGlobal(
      "MessageChannel",
      class extends NativeChannel {
        constructor() {
          super();
          tasks += 1;
        }
      },
    );
    const slice = vi.spyOn(Blob.prototype, "slice").mockImplementation((start = 0, end = 0) => {
      return { arrayBuffer: () => Promise.resolve(payload.slice(start, end).buffer) } as Blob;
    });
    const changed = payload.slice();
    changed[0] = 8;
    expect(await h.ready("/b", changed)).toBe("blob:2");
    expect(slice).toHaveBeenCalledOnce();
    expect(tasks).toBe(0);
  });

  it("uses the two-millisecond target after a chunk and cancels the scheduled host task on dispose", async () => {
    const h = harness();
    const payload = new Uint8Array(512 * 1024).fill(7);
    await h.ready("/a", payload);
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(3);
    const close = vi.fn<() => void>();
    const posted = vi.fn<() => void>();
    vi.stubGlobal(
      "MessageChannel",
      class {
        port1 = { onmessage: null as (() => void) | null, close };
        port2 = { postMessage: posted, close };
      },
    );
    const slice = vi.spyOn(Blob.prototype, "slice").mockImplementation((start = 0, end = 0) => {
      return { arrayBuffer: () => Promise.resolve(payload.slice(start, end).buffer) } as Blob;
    });
    h.cache.localImageResolution("/b");
    h.fetches[1]?.resolve(payload);
    await vi.waitFor(() => expect(posted).toHaveBeenCalledOnce());
    expect(slice).toHaveBeenCalledOnce();
    expect(h.snapshot("/b").pending).toBe(true);
    h.cache.dispose();
    await flush();
    expect(close).toHaveBeenCalledTimes(2);
    expect(slice).toHaveBeenCalledOnce();
    expect(h.created).toEqual(["blob:1"]);
    expect(h.revoked).toEqual(["blob:1"]);
  });

  it("bounds a serialized candidate scan by the unique pool bytes present at admission", async () => {
    const h = harness({ maxBytes: 3 * 128 * 1024 });
    const payloads = [0, 1, 2].map((last) => {
      const payload = new Uint8Array(128 * 1024).fill(7);
      payload[payload.length - 1] = last;
      return payload;
    });
    for (const [index, payload] of payloads.entries()) await h.ready(`/image-${index}`, payload);
    expect(h.created).toHaveLength(3);
    vi.spyOn(performance, "now").mockReturnValue(0);
    const slice = vi.spyOn(Blob.prototype, "slice");
    expect(await h.ready("/equal-last", payloads[2]!)).toBe("blob:3");
    const readBytes = slice.mock.calls.reduce((sum, [start, end]) => sum + end! - start!, 0);
    expect(readBytes).toBe(3 * 128 * 1024);
    expect(slice).toHaveBeenCalledTimes(6);
    expect(h.created).toHaveLength(3);
    expect(h.revoked).toEqual([]);
  });

  it("keeps a retired comparison-pinned Blob charged until its outstanding read settles", async () => {
    const revoked: string[] = [];
    let creations = 0;
    const pool = new ClientEnvironmentImageBlobPool(
      () => `blob:pool-${++creations}`,
      (url) => revoked.push(url),
    );
    const signal = new AbortController().signal;
    const payload = new Uint8Array([1, 2, 3]);
    let first!: EnvironmentImageBlobResource;
    await pool.admit(
      payload,
      "image/png",
      signal,
      () => true,
      (resource) => {
        first = resource;
      },
    );
    const held = holdComparisonRead();
    let second!: EnvironmentImageBlobResource;
    const admission = pool.admit(
      payload,
      "image/png",
      signal,
      () => true,
      (resource) => {
        second = resource;
      },
    );
    await vi.waitFor(() => expect(held.slice).toHaveBeenCalledOnce());
    pool.release(first);
    pool.release(first);
    expect(revoked).toEqual(["blob:pool-1"]);
    expect(pool.totalBytes).toBe(3);
    held.read.resolve(payload.slice().buffer);
    await admission;
    expect(second.url).toBe("blob:pool-2");
    expect(pool.totalBytes).toBe(3);
    pool.release(second);
    expect(pool.totalBytes).toBe(0);
    expect(revoked).toEqual(["blob:pool-1", "blob:pool-2"]);
    // No ownerless warm entry survives: a later successful admission is fresh.
    await pool.admit(
      payload,
      "image/png",
      signal,
      () => true,
      (resource) => {
        second = resource;
      },
    );
    expect(second.url).toBe("blob:pool-3");
    pool.release(second);
    pool.dispose();
    expect(pool.totalBytes).toBe(0);
  });

  it("cancels queued admission promptly on dispose while retaining the actually unsettled read", async () => {
    const revoked: string[] = [];
    let creations = 0;
    const pool = new ClientEnvironmentImageBlobPool(
      () => `blob:pool-${++creations}`,
      (url) => revoked.push(url),
    );
    const signal = new AbortController().signal;
    const payload = new Uint8Array([1]);
    let first!: EnvironmentImageBlobResource;
    await pool.admit(
      payload,
      "image/png",
      signal,
      () => true,
      (resource) => {
        first = resource;
      },
    );
    const held = holdComparisonRead();
    const publish = vi.fn<(resource: EnvironmentImageBlobResource) => void>();
    let activeSettled = false;
    const active = pool
      .admit(payload, "image/png", signal, () => true, publish)
      .finally(() => {
        activeSettled = true;
      });
    await vi.waitFor(() => expect(held.slice).toHaveBeenCalledOnce());
    const queued = pool.admit(payload, "image/png", signal, () => true, publish);
    pool.dispose();
    pool.release(first);
    await queued;
    expect(activeSettled).toBe(false);
    expect(pool.totalBytes).toBe(1);
    expect(revoked).toEqual(["blob:pool-1"]);
    held.read.resolve(payload.slice().buffer);
    await active;
    expect(pool.totalBytes).toBe(0);
    expect(creations).toBe(1);
    expect(publish).not.toHaveBeenCalled();
  });
});
