import { describe, expect, it } from "vitest";
import { compareUnicodeCodePoints, sortByUnicodeCodePoints } from "./unicodeOrder";

describe("unicode code-point ordering", () => {
  it("is locale-independent and uses full code points", () => {
    expect(compareUnicodeCodePoints("A", "a")).toBeLessThan(0);
    expect(compareUnicodeCodePoints("a", "A")).toBeGreaterThan(0);
    expect(sortByUnicodeCodePoints(["thread-steer-set", "thread-send", "Thread"])).toEqual([
      "Thread",
      "thread-send",
      "thread-steer-set",
    ]);
    expect(compareUnicodeCodePoints("😀", "😁")).toBeLessThan(0);
    expect(compareUnicodeCodePoints("😀a", "😀b")).toBeLessThan(0);
  });
});
