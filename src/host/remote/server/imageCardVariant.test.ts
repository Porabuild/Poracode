import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCardVariant, setImageCardVariantGenerator } from "./imageCardVariant";

const big = (fill = 1) => ({ mime: "image/png", data: Buffer.alloc(200 * 1024, fill) });

afterEach(() => setImageCardVariantGenerator(null));

describe("resolveCardVariant", () => {
  it("serves full bytes without a generator, and for passthrough formats and small images", async () => {
    const full = big();
    expect(await resolveCardVariant(full)).toBe(full);
    const calls = vi.fn<() => null>(() => null);
    setImageCardVariantGenerator(calls);
    const svg = { mime: "image/svg+xml", data: Buffer.alloc(200 * 1024, 1) };
    expect(await resolveCardVariant(svg)).toBe(svg);
    const gif = { mime: "image/gif", data: Buffer.alloc(200 * 1024, 1) };
    expect(await resolveCardVariant(gif)).toBe(gif);
    const small = { mime: "image/png", data: Buffer.alloc(1024, 1) };
    expect(await resolveCardVariant(small)).toBe(small);
    expect(calls).not.toHaveBeenCalled();
  });

  it("generates once per source content and caches by hash", async () => {
    const variant = { mime: "image/webp", data: Buffer.alloc(10 * 1024, 7) };
    const calls = vi.fn<() => typeof variant>(() => variant);
    setImageCardVariantGenerator(calls);
    const first = await resolveCardVariant(big(1));
    const second = await resolveCardVariant(big(1));
    expect(first).toEqual(variant);
    expect(second).toBe(variant);
    expect(calls).toHaveBeenCalledTimes(1);
    // Different source bytes are a different entry.
    await resolveCardVariant(big(2));
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it("single-flights concurrent generation for the same source", async () => {
    const held = Promise.withResolvers<{ mime: string; data: Buffer }>();
    const calls = vi.fn<() => Promise<{ mime: string; data: Buffer }>>(() => held.promise);
    setImageCardVariantGenerator(calls);
    const pending = [resolveCardVariant(big(3)), resolveCardVariant(big(3))];
    held.resolve({ mime: "image/webp", data: Buffer.alloc(8 * 1024, 9) });
    const [a, b] = await Promise.all(pending);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(a!.mime).toBe("image/webp");
    expect(b).toBe(a);
  });

  it("falls back to full bytes when generation fails or does not shrink", async () => {
    setImageCardVariantGenerator(() => {
      throw new Error("corrupt");
    });
    const full = big(4);
    expect(await resolveCardVariant(full)).toBe(full);
    setImageCardVariantGenerator(() => ({ mime: "image/webp", data: Buffer.alloc(300 * 1024, 1) }));
    expect(await resolveCardVariant(big(5))).toEqual(big(5));
  });

  it("falls back at the active-job bound and retries after jobs settle", async () => {
    const held = Promise.withResolvers<{ mime: string; data: Buffer }>();
    const calls = vi.fn<() => typeof held.promise>(() => held.promise);
    setImageCardVariantGenerator(calls);
    const pending = Array.from({ length: 4 }, (_, i) => resolveCardVariant(big(i)));
    await Promise.resolve();
    setImageCardVariantGenerator(calls);
    const overflow = big(9);
    expect(await resolveCardVariant(overflow)).toBe(overflow);
    expect(calls).toHaveBeenCalledTimes(4);
    held.resolve({ mime: "image/webp", data: Buffer.alloc(1024) });
    await Promise.all(pending);
    await resolveCardVariant(overflow);
    expect(calls).toHaveBeenCalledTimes(5);
  });

  it("bounds retained source bytes even below the active-job limit", async () => {
    const held = Promise.withResolvers<{ mime: string; data: Buffer }>();
    const calls = vi.fn<() => typeof held.promise>(() => held.promise);
    setImageCardVariantGenerator(calls);
    const pending = resolveCardVariant({ mime: "image/png", data: Buffer.alloc(24 * 1024 * 1024) });
    const overflow = { mime: "image/png", data: Buffer.alloc(9 * 1024 * 1024, 1) };
    expect(await resolveCardVariant(overflow)).toBe(overflow);
    expect(calls).toHaveBeenCalledTimes(1);
    held.resolve({ mime: "image/webp", data: Buffer.alloc(1024) });
    await pending;
  });

  it("keeps old work charged and prevents publication or flight deletion after reset", async () => {
    const old = Promise.withResolvers<{ mime: string; data: Buffer }>();
    setImageCardVariantGenerator(() => old.promise);
    const full = big(3);
    const oldWork = resolveCardVariant(full);
    await Promise.resolve();
    const current = Promise.withResolvers<{ mime: string; data: Buffer }>();
    const calls = vi.fn<() => typeof current.promise>(() => current.promise);
    setImageCardVariantGenerator(calls);
    const currentWork = resolveCardVariant(full);
    old.resolve({ mime: "image/webp", data: Buffer.alloc(1024, 1) });
    expect(await oldWork).toBe(full);
    const joined = resolveCardVariant(full);
    await Promise.resolve();
    expect(calls).toHaveBeenCalledTimes(1);
    const variant = { mime: "image/webp", data: Buffer.alloc(1024, 2) };
    current.resolve(variant);
    expect(await currentWork).toBe(variant);
    expect(await joined).toBe(variant);
    expect(await resolveCardVariant(full)).toBe(variant);
  });
});
