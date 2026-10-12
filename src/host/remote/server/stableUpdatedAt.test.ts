import { beforeEach, describe, expect, it } from "vitest";
import { resetStableUpdatedAt, withStableUpdatedAt } from "./stableUpdatedAt";

describe("withStableUpdatedAt", () => {
  beforeEach(() => {
    resetStableUpdatedAt();
  });

  it("reuses the previous timestamp while content is unchanged", () => {
    let tick = 0;
    const now = () => `2026-01-01T00:00:0${tick++}.000Z`;
    const first = withStableUpdatedAt("shell", { threads: [1, 2] }, now);
    const second = withStableUpdatedAt("shell", { threads: [1, 2] }, now);
    expect(second.updatedAt).toBe(first.updatedAt);
    // Byte-identical serialization is what makes a content ETag revalidate.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("advances the timestamp when content changes", () => {
    let tick = 0;
    const now = () => `2026-01-01T00:00:0${tick++}.000Z`;
    const first = withStableUpdatedAt("shell", { threads: [1] }, now);
    const second = withStableUpdatedAt("shell", { threads: [1, 2] }, now);
    expect(second.updatedAt).not.toBe(first.updatedAt);
  });

  it("tracks keys independently so one thread does not evict another's identity", () => {
    let tick = 0;
    const now = () => `2026-01-01T00:00:0${tick++}.000Z`;
    const a1 = withStableUpdatedAt("thread:a", { items: 1 }, now);
    withStableUpdatedAt("thread:b", { items: 2 }, now);
    const a2 = withStableUpdatedAt("thread:a", { items: 1 }, now);
    expect(a2.updatedAt).toBe(a1.updatedAt);
  });

  it("preserves the payload fields alongside the timestamp", () => {
    const result = withStableUpdatedAt("shell", { threads: [1], seq: 4 });
    expect(result).toMatchObject({ threads: [1], seq: 4 });
    expect(typeof result.updatedAt).toBe("string");
  });

  it("bounds how many keys it remembers", () => {
    const now = () => "2026-01-01T00:00:00.000Z";
    for (let i = 0; i < 200; i += 1) {
      withStableUpdatedAt(`thread:${i}`, { i }, now);
    }
    // The oldest entries were evicted, so an early key is treated as new again.
    let called = false;
    withStableUpdatedAt("thread:0", { i: 0 }, () => {
      called = true;
      return "2026-02-02T00:00:00.000Z";
    });
    expect(called).toBe(true);
  });
});
