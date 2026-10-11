import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCachedImagePreview,
  getImagePreviewRetentionSnapshot,
  imagePreviewKey,
  resetImagePreviews,
  scheduleImagePreview,
  setImagePreviewGenerator,
  type ImagePreviewGenerator,
} from "./imagePreview";

const flush = () => new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));
const source = () => ({ data: Buffer.from([1, 2, 3]), mime: "image/png" });
const sourceBytes = 3;
const preview = "data:image/jpeg;base64,AAA";
type PreviewDecode = Parameters<typeof scheduleImagePreview>[2];

function decoderFor(encoded: string) {
  return () => ({ data: Buffer.from(encoded, "utf8"), mime: "image/png" });
}

async function drainBurst(): Promise<void> {
  for (let i = 0; i < 40; i += 1) await flush();
}

function expectWorkReleased(): void {
  expect(getImagePreviewRetentionSnapshot()).toMatchObject({
    pendingCount: 0,
    activeCount: 0,
    retainedCount: 0,
    retainedBytes: 0,
  });
}

afterEach(() => {
  resetImagePreviews();
});

describe("image previews", () => {
  it("does nothing without a generator, so a headless host simply has none", async () => {
    const key = imagePreviewKey("t", "i", ["images", 0]);
    const decode = vi.fn<PreviewDecode>(source);
    expect(scheduleImagePreview(key, sourceBytes, decode)).toBe(false);
    await flush();
    expect(decode).not.toHaveBeenCalled();
    expectWorkReleased();
    expect(getCachedImagePreview(key)).toBeUndefined();
  });

  it("generates off the critical path and caches the result", async () => {
    setImagePreviewGenerator(() => "data:image/jpeg;base64,AAA");
    const key = imagePreviewKey("t", "i", ["images", 0]);
    scheduleImagePreview(key, sourceBytes, source);
    // Deliberately not available synchronously: the decode must not block the
    // response that asked for it.
    expect(getCachedImagePreview(key)).toBeUndefined();
    await flush();
    expect(getCachedImagePreview(key)).toBe("data:image/jpeg;base64,AAA");
  });

  it("generates once per image no matter how often it is projected", async () => {
    const generator = vi.fn<() => string>(() => "data:image/jpeg;base64,AAA");
    setImagePreviewGenerator(generator);
    const key = imagePreviewKey("t", "i", ["images", 0]);
    scheduleImagePreview(key, sourceBytes, source);
    scheduleImagePreview(key, sourceBytes, source);
    await flush();
    scheduleImagePreview(key, sourceBytes, source);
    await flush();
    expect(generator).toHaveBeenCalledTimes(1);
  });

  it("keys previews per image location", async () => {
    setImagePreviewGenerator(({ mime }) => `data:image/jpeg;base64,${mime.length}`);
    const a = imagePreviewKey("t", "i", ["images", 0]);
    const b = imagePreviewKey("t", "i", ["images", 1]);
    expect(a).not.toBe(b);
    scheduleImagePreview(a, sourceBytes, source);
    scheduleImagePreview(b, sourceBytes, source);
    await flush();
    expect(getCachedImagePreview(a)).toBeDefined();
    expect(getCachedImagePreview(b)).toBeDefined();
  });

  it("survives a generator that throws on a malformed image", async () => {
    setImagePreviewGenerator(() => {
      throw new Error("corrupt");
    });
    const key = imagePreviewKey("t", "i", ["images", 0]);
    expect(() => scheduleImagePreview(key, sourceBytes, source)).not.toThrow();
    await flush();
    expect(getCachedImagePreview(key)).toBeUndefined();
  });

  it("skips an image whose bytes cannot be decoded", async () => {
    const generator = vi.fn<() => string>(() => "data:image/jpeg;base64,AAA");
    setImagePreviewGenerator(generator);
    const key = imagePreviewKey("t", "i", ["images", 0]);
    scheduleImagePreview(key, sourceBytes, () => null);
    await flush();
    expect(generator).not.toHaveBeenCalled();
    expect(getCachedImagePreview(key)).toBeUndefined();
  });

  it("drains a burst without losing any entry", async () => {
    setImagePreviewGenerator(() => "data:image/jpeg;base64,AAA");
    const keys = Array.from({ length: 25 }, (_, i) => imagePreviewKey("t", `i${i}`, ["images", 0]));
    for (const key of keys) expect(scheduleImagePreview(key, sourceBytes, source)).toBe(true);
    for (let i = 0; i < 60; i += 1) await flush();
    expect(keys.every((key) => getCachedImagePreview(key) !== undefined)).toBe(true);
    expectWorkReleased();
  });
});

describe("preview admission and retention", () => {
  it("bounds pending plus active work at 32 while a slow generator is blocked", async () => {
    const held = Promise.withResolvers<string | null>();
    const generator = vi.fn<ImagePreviewGenerator>(() => held.promise);
    setImagePreviewGenerator(generator);
    const inputs = Array.from({ length: 100 }, (_, i) => `${"A".repeat(64 * 1024)}${i}`);
    const decodes = inputs.map((input) => vi.fn<PreviewDecode>(decoderFor(input)));
    const costs = inputs.map(
      (input, i) => Buffer.byteLength(input, "utf8") + Buffer.byteLength(`k${i}`),
    );
    expect(scheduleImagePreview("k0", Buffer.byteLength(inputs[0]!), decodes[0]!)).toBe(true);
    await flush();
    for (let i = 1; i < inputs.length; i += 1) {
      expect(scheduleImagePreview(`k${i}`, Buffer.byteLength(inputs[i]!), decodes[i]!)).toBe(
        i < 32,
      );
    }
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      activeCount: 1,
      pendingCount: 31,
      retainedCount: 32,
      retainedBytes: costs.slice(0, 32).reduce((sum, cost) => sum + cost, 0),
    });
    expect(generator).toHaveBeenCalledTimes(1);
    expect(decodes.slice(1).every((decode) => decode.mock.calls.length === 0)).toBe(true);
    held.resolve(preview);
    await drainBurst();
    expect(generator).toHaveBeenCalledTimes(32);
    expect(decodes.slice(32).every((decode) => decode.mock.calls.length === 0)).toBe(true);
    expectWorkReleased();
    expect(scheduleImagePreview("k32", Buffer.byteLength(inputs[32]!), decodes[32]!)).toBe(true);
    await flush();
    expect(getCachedImagePreview("k32")).toBe(preview);
    expectWorkReleased();
  });

  it("bounds the aggregate encoded source and key bytes while active work is blocked", async () => {
    const held = Promise.withResolvers<string | null>();
    const generator = vi.fn<ImagePreviewGenerator>(() => held.promise);
    setImagePreviewGenerator(generator);
    const encoded = "A".repeat(1024 * 1024);
    const decode = vi.fn<PreviewDecode>(decoderFor(encoded));
    for (let i = 0; i < 50; i += 1) {
      expect(scheduleImagePreview(`k${i}`, Buffer.byteLength(encoded), decode)).toBe(i < 7);
    }
    await flush();
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      activeCount: 1,
      pendingCount: 6,
      retainedCount: 7,
      retainedBytes: 7 * (1024 * 1024 + 2),
    });
    expect(decode).toHaveBeenCalledTimes(1);
    held.resolve(null);
    await drainBurst();
    expect(decode).toHaveBeenCalledTimes(7);
    expectWorkReleased();
    expect(scheduleImagePreview("retry", Buffer.byteLength(encoded), decode)).toBe(true);
    await flush();
    expectWorkReleased();
  });

  it("charges an exact 8 MiB encoded input/key boundary through reset until settlement", async () => {
    const key = "é";
    const encoded = "A".repeat(8 * 1024 * 1024 - Buffer.byteLength(key));
    const held = Promise.withResolvers<string | null>();
    setImagePreviewGenerator(() => held.promise);
    expect(scheduleImagePreview(key, Buffer.byteLength(encoded), decoderFor(encoded))).toBe(true);
    await flush();
    expect(getImagePreviewRetentionSnapshot().retainedBytes).toBe(8 * 1024 * 1024);
    resetImagePreviews();
    const successor = vi.fn<ImagePreviewGenerator>(() => preview);
    setImagePreviewGenerator(successor);
    const decode = vi.fn<PreviewDecode>(source);
    expect(scheduleImagePreview("next", sourceBytes, decode)).toBe(false);
    expect(scheduleImagePreview(key, Buffer.byteLength(encoded), decoderFor(encoded))).toBe(false);
    await flush();
    expect(successor).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      activeCount: 1,
      retainedCount: 1,
      retainedBytes: 8 * 1024 * 1024,
    });
    held.resolve(preview);
    await flush();
    expect(getCachedImagePreview(key)).toBeUndefined();
    expectWorkReleased();
    expect(scheduleImagePreview("next", sourceBytes, decode)).toBe(true);
    await flush();
    expect(getCachedImagePreview("next")).toBe(preview);
    expectWorkReleased();
  });

  it("rejects invalid costs and keys before retaining or decoding anything", async () => {
    const generator = vi.fn<ImagePreviewGenerator>(() => preview);
    setImagePreviewGenerator(generator);
    const decode = vi.fn<PreviewDecode>(source);
    const invalidCosts: unknown[] = [
      undefined,
      null,
      "3",
      3n,
      {},
      NaN,
      Infinity,
      -Infinity,
      -1,
      0,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      8 * 1024 * 1024 + 1,
    ];
    for (const cost of invalidCosts) {
      expect(scheduleImagePreview("key", cost as number, decode)).toBe(false);
    }
    const invalidKeys: unknown[] = [
      undefined,
      null,
      3,
      {},
      Symbol(),
      "",
      "A".repeat(4097),
      "é".repeat(2049),
    ];
    for (const key of invalidKeys) {
      expect(scheduleImagePreview(key as string, sourceBytes, decode)).toBe(false);
    }
    // The source alone fits, but its retained key also has to fit.
    expect(scheduleImagePreview("key", 8 * 1024 * 1024, decode)).toBe(false);
    await flush();
    expect(generator).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expectWorkReleased();
  });

  it("keeps duplicate keys reserved until active generation settles", async () => {
    const held = Promise.withResolvers<string | null>();
    const generator = vi.fn<ImagePreviewGenerator>(() => held.promise);
    setImagePreviewGenerator(generator);
    expect(scheduleImagePreview("key", sourceBytes, source)).toBe(true);
    await flush();
    const duplicate = vi.fn<PreviewDecode>(source);
    for (let i = 0; i < 50; i += 1) {
      expect(scheduleImagePreview("key", sourceBytes, duplicate)).toBe(false);
    }
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      retainedCount: 1,
      retainedBytes: sourceBytes + 3,
    });
    held.resolve(null);
    await flush();
    expect(duplicate).not.toHaveBeenCalled();
    expect(generator).toHaveBeenCalledTimes(1);
    expectWorkReleased();
    expect(scheduleImagePreview("key", sourceBytes, source)).toBe(true);
    await flush();
    expect(generator).toHaveBeenCalledTimes(2);
    expectWorkReleased();
  });

  it.each([
    "null decode",
    "throwing decode",
    "null preview",
    "throwing generator",
    "rejected generator",
  ])("releases the exact job cost after a %s and resumes the queue", async (failure) => {
    const generator = vi.fn<ImagePreviewGenerator>(({ data }) => {
      if (data[0] !== 0) return preview;
      if (failure === "throwing generator") throw new Error("corrupt");
      if (failure === "rejected generator") return Promise.reject(new Error("corrupt"));
      return null;
    });
    setImagePreviewGenerator(generator);
    const key = "clé";
    const decode = vi.fn<PreviewDecode>(() => {
      if (failure === "throwing decode") throw new Error("corrupt");
      return failure === "null decode" ? null : { data: Buffer.from([0, 2, 3]), mime: "image/png" };
    });
    expect(scheduleImagePreview(key, sourceBytes, decode)).toBe(true);
    expect(getImagePreviewRetentionSnapshot().retainedBytes).toBe(
      sourceBytes + Buffer.byteLength(key),
    );
    expect(scheduleImagePreview("following", sourceBytes, source)).toBe(true);
    await drainBurst();
    expectWorkReleased();
    expect(getCachedImagePreview(key)).toBeUndefined();
    expect(getCachedImagePreview("following")).toBe(preview);
    expect(scheduleImagePreview(key, sourceBytes, source)).toBe(true);
    await flush();
    expect(getCachedImagePreview(key)).toBe(preview);
    expectWorkReleased();
  });
});

describe("preview worker lifecycle", () => {
  it.each([
    "reset",
    "replacement",
    "uninstall",
    "reset with rejection",
    "replacement with rejection",
  ])(
    "%s clears queued closures and ready cache but fences and serializes active work",
    async (change) => {
      const oldResult = Promise.withResolvers<string | null>();
      const newResult = Promise.withResolvers<string | null>();
      let concurrent = 0;
      let peak = 0;
      const oldGenerator = vi.fn<ImagePreviewGenerator>(async ({ mime }) => {
        if (mime === "image/gif") return preview;
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        try {
          return await oldResult.promise;
        } finally {
          concurrent -= 1;
        }
      });
      const successor = vi.fn<ImagePreviewGenerator>(async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        try {
          return await newResult.promise;
        } finally {
          concurrent -= 1;
        }
      });
      setImagePreviewGenerator(oldGenerator);
      scheduleImagePreview("ready", sourceBytes, () => ({ ...source(), mime: "image/gif" }));
      await flush();
      expect(getCachedImagePreview("ready")).toBe(preview);
      scheduleImagePreview("active", sourceBytes, source);
      const cancelled = vi.fn<PreviewDecode>(source);
      scheduleImagePreview("cancelled", sourceBytes, cancelled);
      await flush();
      expect(getImagePreviewRetentionSnapshot()).toMatchObject({ activeCount: 1, pendingCount: 1 });

      if (change.startsWith("reset")) resetImagePreviews();
      if (change === "uninstall") setImagePreviewGenerator(null);
      setImagePreviewGenerator(successor);
      expect(getImagePreviewRetentionSnapshot()).toEqual({
        cachedCount: 0,
        cachedBytes: 0,
        pendingCount: 0,
        activeCount: 1,
        retainedCount: 1,
        retainedBytes: sourceBytes + Buffer.byteLength("active"),
      });
      expect(scheduleImagePreview("active", sourceBytes, source)).toBe(false);
      const nextDecode = vi.fn<PreviewDecode>(source);
      expect(scheduleImagePreview("next", sourceBytes, nextDecode)).toBe(true);
      await flush();
      expect(nextDecode).not.toHaveBeenCalled();
      expect(successor).not.toHaveBeenCalled();
      expect(cancelled).not.toHaveBeenCalled();

      if (change.includes("rejection")) oldResult.reject(new Error("retired generator"));
      else oldResult.resolve("stale");
      await flush();
      expect(getCachedImagePreview("active")).toBeUndefined();
      expect(getImagePreviewRetentionSnapshot()).toMatchObject({
        activeCount: 1,
        pendingCount: 0,
        retainedCount: 1,
        retainedBytes: sourceBytes + Buffer.byteLength("next"),
      });
      expect(successor).toHaveBeenCalledTimes(1);
      expect(scheduleImagePreview("active", sourceBytes, source)).toBe(true);
      newResult.resolve(preview);
      await drainBurst();
      expect(getCachedImagePreview("active")).toBe(preview);
      expect(getCachedImagePreview("next")).toBe(preview);
      expect(getCachedImagePreview("cancelled")).toBeUndefined();
      expect(cancelled).not.toHaveBeenCalled();
      expect(oldGenerator).toHaveBeenCalledTimes(2);
      expect(successor).toHaveBeenCalledTimes(2);
      expect(peak).toBe(1);
      expect(concurrent).toBe(0);
      expectWorkReleased();
    },
  );

  it("reuses a deferred immediate safely when reset and new admission happen before it runs", async () => {
    const oldGenerator = vi.fn<ImagePreviewGenerator>(() => "stale");
    const oldDecode = vi.fn<PreviewDecode>(source);
    setImagePreviewGenerator(oldGenerator);
    scheduleImagePreview("old", sourceBytes, oldDecode);
    resetImagePreviews();
    const held = Promise.withResolvers<string | null>();
    const successor = vi.fn<ImagePreviewGenerator>(() => held.promise);
    setImagePreviewGenerator(successor);
    expect(scheduleImagePreview("first", sourceBytes, source)).toBe(true);
    expect(scheduleImagePreview("second", sourceBytes, source)).toBe(true);
    await flush();
    expect(oldDecode).not.toHaveBeenCalled();
    expect(oldGenerator).not.toHaveBeenCalled();
    expect(successor).toHaveBeenCalledTimes(1);
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      activeCount: 1,
      pendingCount: 1,
      retainedCount: 2,
    });
    held.resolve(preview);
    await drainBurst();
    expect(successor).toHaveBeenCalledTimes(2);
    expect(getCachedImagePreview("old")).toBeUndefined();
    expect(getCachedImagePreview("first")).toBe(preview);
    expect(getCachedImagePreview("second")).toBe(preview);
    expectWorkReleased();
  });

  it("preserves legitimate cache and queued work when the identical generator is installed", async () => {
    const generator = vi.fn<ImagePreviewGenerator>(() => preview);
    setImagePreviewGenerator(generator);
    scheduleImagePreview("ready", sourceBytes, source);
    await flush();
    scheduleImagePreview("pending", sourceBytes, source);
    const before = getImagePreviewRetentionSnapshot();
    setImagePreviewGenerator(generator);
    expect(getImagePreviewRetentionSnapshot()).toEqual(before);
    expect(getCachedImagePreview("ready")).toBe(preview);
    await flush();
    expect(getCachedImagePreview("pending")).toBe(preview);
    expect(generator).toHaveBeenCalledTimes(2);
    expectWorkReleased();
  });

  it("does not invoke an old generator if decoding replaces it", async () => {
    const oldGenerator = vi.fn<ImagePreviewGenerator>(() => "stale");
    const successor = vi.fn<ImagePreviewGenerator>(() => preview);
    setImagePreviewGenerator(oldGenerator);
    scheduleImagePreview("old", sourceBytes, () => {
      setImagePreviewGenerator(successor);
      scheduleImagePreview("next", sourceBytes, source);
      return source();
    });
    await drainBurst();
    expect(oldGenerator).not.toHaveBeenCalled();
    expect(getCachedImagePreview("old")).toBeUndefined();
    expect(getCachedImagePreview("next")).toBe(preview);
    expectWorkReleased();
  });
});

describe("preview cache bounds", () => {
  it.each(["A".repeat(4097), "é".repeat(2049)])(
    "refuses an oversized encoded preview",
    async (oversized) => {
      setImagePreviewGenerator(() => oversized);
      expect(scheduleImagePreview("key", sourceBytes, source)).toBe(true);
      await flush();
      expect(getCachedImagePreview("key")).toBeUndefined();
      expect(getImagePreviewRetentionSnapshot()).toMatchObject({ cachedCount: 0, cachedBytes: 0 });
      expectWorkReleased();
      setImagePreviewGenerator(() => preview);
      expect(scheduleImagePreview("key", sourceBytes, source)).toBe(true);
      await flush();
      expect(getCachedImagePreview("key")).toBe(preview);
    },
  );

  it("accepts 4 KiB UTF-8 keys and previews and evicts by their aggregate LRU cost", async () => {
    const output = "é".repeat(2048);
    setImagePreviewGenerator(() => output);
    const key = (i: number) => `${String(i).padStart(4, "0")}${"é".repeat(2046)}`;
    for (let i = 0; i < 128; i += 1) {
      expect(scheduleImagePreview(key(i), sourceBytes, source)).toBe(true);
      await flush();
    }
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      cachedCount: 128,
      cachedBytes: 1024 * 1024,
    });
    expect(getCachedImagePreview(key(0))).toBe(output);
    scheduleImagePreview(key(128), sourceBytes, source);
    await flush();
    expect(getCachedImagePreview(key(1))).toBeUndefined();
    expect(getCachedImagePreview(key(0))).toBe(output);
    expect(getCachedImagePreview(key(128))).toBe(output);
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      cachedCount: 128,
      cachedBytes: 1024 * 1024,
    });
    expectWorkReleased();
    resetImagePreviews();
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({ cachedCount: 0, cachedBytes: 0 });
  });

  it("retains the existing 512-entry count bound for tiny previews", async () => {
    setImagePreviewGenerator(() => preview);
    for (let i = 0; i < 513; i += 1) {
      expect(scheduleImagePreview(`key-${i}`, sourceBytes, source)).toBe(true);
      await flush();
    }
    expect(getCachedImagePreview("key-0")).toBeUndefined();
    expect(getCachedImagePreview("key-512")).toBe(preview);
    expect(getImagePreviewRetentionSnapshot().cachedCount).toBe(512);
    expect(getImagePreviewRetentionSnapshot().cachedBytes).toBeLessThan(1024 * 1024);
    expectWorkReleased();
  });
});
