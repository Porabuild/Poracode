import { describe, expect, it } from "vitest";
import { readDiffSummary, readFileChangePath, readStringField } from "./fileChangeSummary";

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

describe("readDiffSummary", () => {
  it("reads Cursor SDK EditSuccess linesAdded/linesRemoved when diffString is absent", () => {
    expect(readDiffSummary({ linesAdded: 4, linesRemoved: 2 })).toEqual({ added: 4, removed: 2 });
    expect(readDiffSummary({ linesAdded: 3 })).toEqual({ added: 3, removed: 0 });
    expect(readDiffSummary({ linesRemoved: 5 })).toEqual({ added: 0, removed: 5 });
    expect(readDiffSummary({ linesAdded: -1, linesRemoved: 2 })).toBeUndefined();
  });

  it("reads Cursor SDK WriteSuccess linesCreated and WriteArgs fileText", () => {
    expect(readDiffSummary({ path: "src/a.ts", linesCreated: 7, fileSize: 120 })).toEqual({
      added: 7,
      removed: 0,
    });
    expect(readDiffSummary({ path: "src/a.ts", fileText: "line 1\nline 2\n" })).toEqual({
      added: 2,
      removed: 0,
    });
  });

  it("computes exact line stats for replacement edits, multi-edits, and patchContent", () => {
    expect(
      readDiffSummary({
        path: "src/a.ts",
        oldText: "keep\nold\n",
        newText: "keep\nnew\nextra\n",
      }),
    ).toEqual({ added: 2, removed: 1 });
    expect(
      readDiffSummary({
        path: "src/a.ts",
        edits: [
          { oldText: "a\n", newText: "b\n" },
          { old_string: "c\n", new_string: "c\nd\n" },
        ],
      }),
    ).toEqual({ added: 2, removed: 1 });
    expect(
      readDiffSummary({
        path: "src/a.ts",
        patchContent: "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-old\n+new\n*** End Patch",
      }),
    ).toEqual({ added: 1, removed: 1 });
    expect(
      readFileChangePath({
        patchContent: "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-old\n+new\n*** End Patch",
      }),
    ).toBe("src/a.ts");
  });
});
