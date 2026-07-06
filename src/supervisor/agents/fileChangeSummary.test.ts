import { describe, expect, it } from "vitest";
import { readStringField } from "./fileChangeSummary";

/**
 * Pins the single cross-provider `readStringField` semantic. Historically each
 * provider mapper carried its own variant (codex returned raw/untrimmed values
 * and kept empty strings; acp kept surrounding whitespace). The consolidated
 * rule is: trimmed, blank-as-absent, first matching key wins.
 */
describe("readStringField", () => {
  it("returns the value of the first key holding a non-blank string", () => {
    expect(readStringField({ a: "x", b: "y" }, "a", "b")).toBe("x");
    expect(readStringField({ b: "y" }, "a", "b")).toBe("y");
  });

  it("trims surrounding whitespace (including codex cwd/path fields, which were previously untrimmed)", () => {
    expect(readStringField({ cwd: "  /repo/src  " }, "cwd")).toBe("/repo/src");
  });

  it("treats empty and whitespace-only strings as absent, falling through to later keys", () => {
    expect(readStringField({ a: "", b: "y" }, "a", "b")).toBe("y");
    expect(readStringField({ a: "   ", b: "y" }, "a", "b")).toBe("y");
    expect(readStringField({ a: "" }, "a")).toBeUndefined();
  });

  it("skips non-string values instead of coercing them", () => {
    expect(readStringField({ a: 5, b: true, c: "ok" }, "a", "b", "c")).toBe("ok");
    expect(readStringField({ a: null }, "a")).toBeUndefined();
  });

  it("returns undefined for missing keys and non-record input", () => {
    expect(readStringField({}, "a")).toBeUndefined();
    expect(readStringField(undefined, "a")).toBeUndefined();
    expect(readStringField(null, "a")).toBeUndefined();
    expect(readStringField("a string", "a")).toBeUndefined();
    expect(readStringField(42, "a")).toBeUndefined();
  });

  it("preserves interior whitespace (only the edges are trimmed)", () => {
    expect(readStringField({ command: "  git commit -m 'x'  " }, "command")).toBe(
      "git commit -m 'x'",
    );
  });
});
