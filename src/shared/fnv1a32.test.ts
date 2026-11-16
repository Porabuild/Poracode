import { describe, expect, it } from "vitest";
import { fnv1a32 } from "./fnv1a32";

describe("fnv1a32", () => {
  it.each([
    ["", 2166136261],
    ["hello", 1335831723],
    ["😀", 3409036472],
    ["a\0b", 284404690],
  ] as const)("preserves the previous UTF-16 hash for %j", (text, expected) => {
    expect(fnv1a32(text)).toBe(expected);
  });
});
