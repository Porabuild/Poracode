import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  clearImageBytesCache,
  getCachedImageBytes,
  IMAGE_BYTES_CACHE_IDLE_TTL_MS,
  IMAGE_BYTES_CACHE_MAX_BYTES,
  IMAGE_BYTES_CACHE_MAX_ENTRIES,
  ImageBytesCache,
  putCachedImageBytes,
} from "./imageBytesCache";

const image = (bytes: number[], mime = "image/png") => ({ mime, data: Buffer.from(bytes) });

function harness() {
  let revision = 0;
  let connection: object | null = {};
  const cache = new ImageBytesCache(
    3,
    10,
    () => revision,
    () => connection,
  );
  return {
    cache,
    bumpRevision: () => {
      revision += 1;
    },
    swapConnection: () => {
      connection = {};
    },
    dropConnection: () => {
      connection = null;
    },
  };
}

describe("ImageBytesCache", () => {
  it("serves put bytes and drops them when the thread revision moves (rebase)", () => {
    const { cache, bumpRevision } = harness();
    cache.put("t", "i", ["images", 0], image([1, 2, 3]));
    expect(cache.get("t", "i", ["images", 0])?.data).toEqual(Buffer.from([1, 2, 3]));
    bumpRevision();
    expect(cache.get("t", "i", ["images", 0])).toBeNull();
    expect(cache.size).toBe(0);
  });

  it("never aliases entries across database handles or without one", () => {
    const { cache, swapConnection, dropConnection } = harness();
    cache.put("t", "i", ["images", 0], image([1]));
    swapConnection();
    expect(cache.get("t", "i", ["images", 0])).toBeNull();
    cache.put("t", "i", ["images", 0], image([2]));
    dropConnection();
    expect(cache.get("t", "i", ["images", 0])).toBeNull();
    cache.put("t", "i", ["images", 0], image([3]));
    expect(cache.size).toBe(1);
    expect(cache.get("t", "i", ["images", 0])).toBeNull();
  });

  it("invalidates per item, or the whole thread on all", () => {
    const { cache } = harness();
    cache.put("t", "a", ["images", 0], image([1]));
    cache.put("t", "b", ["images", 0], image([2]));
    cache.put("u", "a", ["images", 0], image([3]));
    cache.invalidate("t", new Set(["a"]));
    expect(cache.get("t", "a", ["images", 0])).toBeNull();
    expect(cache.get("t", "b", ["images", 0])?.data).toEqual(Buffer.from([2]));
    cache.invalidate("t", "all");
    expect(cache.get("t", "b", ["images", 0])).toBeNull();
    expect(cache.get("u", "a", ["images", 0])?.data).toEqual(Buffer.from([3]));
  });

  it("evicts least recently used entries past the entry and byte caps", () => {
    const { cache } = harness();
    cache.put("t", "a", ["images", 0], image([1, 1, 1, 1]));
    cache.put("t", "b", ["images", 0], image([2, 2, 2, 2]));
    cache.put("t", "c", ["images", 0], image([3, 3, 3, 3]));
    // Byte cap is 10: only the two newest 4-byte images fit.
    expect(cache.get("t", "a", ["images", 0])).toBeNull();
    expect(cache.size).toBe(2);
    expect(cache.bytes).toBe(8);
    // An image larger than the whole budget is never admitted.
    cache.put("t", "big", ["images", 0], image(new Array(11).fill(9)));
    expect(cache.get("t", "big", ["images", 0])).toBeNull();
    // Touching b makes c the eviction candidate for the next admission.
    expect(cache.get("t", "b", ["images", 0])).not.toBeNull();
    cache.put("t", "d", ["images", 0], image([4, 4, 4, 4]));
    expect(cache.get("t", "c", ["images", 0])).toBeNull();
    expect(cache.get("t", "b", ["images", 0])).not.toBeNull();
  });

  it("caps defaults at 64 entries / 24 MiB with a 2-minute idle TTL", () => {
    expect(IMAGE_BYTES_CACHE_MAX_ENTRIES).toBe(64);
    expect(IMAGE_BYTES_CACHE_MAX_BYTES).toBe(24 * 1024 * 1024);
    expect(IMAGE_BYTES_CACHE_IDLE_TTL_MS).toBe(2 * 60_000);
  });

  it("evicts idle entries on get, put, and periodic sweeps while refreshing TTL on LRU hits", () => {
    let nowMs = 1_000;
    const connection = {};
    const cache = new ImageBytesCache(
      10,
      1_024,
      () => 0,
      () => connection,
      {
        idleTtlMs: 10_000,
        sweepIntervalMs: 0,
        now: () => nowMs,
      },
    );

    cache.put("t", "a", ["images", 0], image([1, 2, 3]));
    cache.put("t", "b", ["images", 0], image([4, 5, 6]));

    nowMs = 6_000;
    // Touching 'a' refreshes its idle clock; 'b' stays at t=1_000.
    expect(cache.get("t", "a", ["images", 0])?.data).toEqual(Buffer.from([1, 2, 3]));

    nowMs = 11_000;
    // 'b' is now 10_000 ms idle and expires on read; 'a' is only 5_000 ms idle.
    expect(cache.get("t", "b", ["images", 0])).toBeNull();
    expect(cache.get("t", "a", ["images", 0])?.data).toEqual(Buffer.from([1, 2, 3]));
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(3);

    nowMs = 21_500;
    // Putting a new entry sweeps expired 'a' before accounting capacity.
    cache.put("t", "c", ["images", 0], image([7, 8]));
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(2);
    expect(cache.get("t", "a", ["images", 0])).toBeNull();
    expect(cache.get("t", "c", ["images", 0])?.data).toEqual(Buffer.from([7, 8]));

    nowMs = 32_000;
    expect(cache.evictExpired(nowMs)).toBe(1);
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });

  it("runs an unref'd background sweep timer while populated and stops it once empty", () => {
    vi.useFakeTimers();
    try {
      const connection = {};
      const cache = new ImageBytesCache(
        10,
        1_024,
        () => 0,
        () => connection,
        {
          idleTtlMs: 10_000,
          sweepIntervalMs: 5_000,
          now: () => Date.now(),
        },
      );

      cache.put("t", "a", ["images", 0], image([9, 9, 9]));
      expect(cache.size).toBe(1);
      expect(vi.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(5_000);
      expect(cache.size).toBe(1);

      vi.advanceTimersByTime(5_000);
      expect(cache.size).toBe(0);
      expect(cache.bytes).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.skipIf(!sqliteAvailable)(
    "clears the shared image bytes cache immediately when closeDatabase runs",
    () => {
      const previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
      if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
      mkdirSync("tmp", { recursive: true });
      const dir = mkdtempSync(join("tmp", "image-cache-db-close-"));
      try {
        initDatabase(join(dir, "state.sqlite"));
        putCachedImageBytes("t", "item-1", ["images", 0], image([1, 2, 3, 4]));
        expect(getCachedImageBytes("t", "item-1", ["images", 0])?.data).toEqual(
          Buffer.from([1, 2, 3, 4]),
        );
        closeDatabase();
        expect(getCachedImageBytes("t", "item-1", ["images", 0])).toBeNull();
      } finally {
        clearImageBytesCache();
        closeDatabase();
        rmSync(dir, { recursive: true, force: true });
        if (previousBinding === undefined)
          delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
        else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
      }
    },
  );
});
