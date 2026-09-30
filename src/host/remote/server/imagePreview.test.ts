import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCachedImagePreview,
  imagePreviewKey,
  resetImagePreviews,
  scheduleImagePreview,
  setImagePreviewGenerator,
} from "./imagePreview";

const flush = () => new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));
const source = () => ({ data: Buffer.from([1, 2, 3]), mime: "image/png" });

afterEach(() => {
  resetImagePreviews();
});

describe("image previews", () => {
  it("does nothing without a generator, so a headless host simply has none", async () => {
    const key = imagePreviewKey("t", "i", ["images", 0]);
    scheduleImagePreview(key, source);
    await flush();
    expect(getCachedImagePreview(key)).toBeUndefined();
  });

  it("generates off the critical path and caches the result", async () => {
    setImagePreviewGenerator(() => "data:image/jpeg;base64,AAA");
    const key = imagePreviewKey("t", "i", ["images", 0]);
    scheduleImagePreview(key, source);
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
    scheduleImagePreview(key, source);
    scheduleImagePreview(key, source);
    await flush();
    scheduleImagePreview(key, source);
    await flush();
    expect(generator).toHaveBeenCalledTimes(1);
  });

  it("keys previews per image location", async () => {
    setImagePreviewGenerator(({ mime }) => `data:image/jpeg;base64,${mime.length}`);
    const a = imagePreviewKey("t", "i", ["images", 0]);
    const b = imagePreviewKey("t", "i", ["images", 1]);
    expect(a).not.toBe(b);
    scheduleImagePreview(a, source);
    scheduleImagePreview(b, source);
    await flush();
    expect(getCachedImagePreview(a)).toBeDefined();
    expect(getCachedImagePreview(b)).toBeDefined();
  });

  it("survives a generator that throws on a malformed image", async () => {
    setImagePreviewGenerator(() => {
      throw new Error("corrupt");
    });
    const key = imagePreviewKey("t", "i", ["images", 0]);
    expect(() => scheduleImagePreview(key, source)).not.toThrow();
    await flush();
    expect(getCachedImagePreview(key)).toBeUndefined();
  });

  it("skips an image whose bytes cannot be decoded", async () => {
    const generator = vi.fn<() => string>(() => "data:image/jpeg;base64,AAA");
    setImagePreviewGenerator(generator);
    const key = imagePreviewKey("t", "i", ["images", 0]);
    scheduleImagePreview(key, () => null);
    await flush();
    expect(generator).not.toHaveBeenCalled();
    expect(getCachedImagePreview(key)).toBeUndefined();
  });

  it("drains a burst without losing any entry", async () => {
    setImagePreviewGenerator(() => "data:image/jpeg;base64,AAA");
    const keys = Array.from({ length: 25 }, (_, i) => imagePreviewKey("t", `i${i}`, ["images", 0]));
    for (const key of keys) scheduleImagePreview(key, source);
    for (let i = 0; i < 60; i += 1) await flush();
    expect(keys.every((key) => getCachedImagePreview(key) !== undefined)).toBe(true);
  });
});
