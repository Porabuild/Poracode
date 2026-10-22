import { describe, expect, it } from "vitest";
import { ImageBytesCache } from "./imageBytesCache";

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
});
