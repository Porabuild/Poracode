import { describe, expect, it } from "vitest";
import {
  buildLineUnifiedDiff,
  countLineChangeStats,
  countUnifiedDiffStats,
  normalizeDiffFilePath,
} from "./lineUnifiedDiff";

describe("countLineChangeStats", () => {
  it("counts only changed lines, not the whole file", () => {
    const oldText = ["line one", "line two", "line three"].join("\n");
    const newText = ["line one", "line TWO", "line three"].join("\n");
    expect(countLineChangeStats(oldText, newText)).toEqual({ added: 1, removed: 1 });
  });

  it("stays minimal for a small edit in a large file (Cursor ACP sends whole-file oldText/newText)", () => {
    const oldLines = Array.from({ length: 5000 }, (_, i) => `const line${i} = ${i};`);
    const newLines = [...oldLines];
    newLines[2500] = "const line2500 = CHANGED;";
    expect(countLineChangeStats(oldLines.join("\n"), newLines.join("\n"))).toEqual({
      added: 1,
      removed: 1,
    });
  });

  it("stays minimal for insertions into a large file", () => {
    const oldLines = Array.from({ length: 4000 }, (_, i) => `line ${i}`);
    const newLines = [
      ...oldLines.slice(0, 1000),
      "inserted a",
      "inserted b",
      ...oldLines.slice(1000),
    ];
    expect(countLineChangeStats(oldLines.join("\n"), newLines.join("\n"))).toEqual({
      added: 2,
      removed: 0,
    });
  });

  it("stays minimal for two distant edits in a large file", () => {
    const oldLines = Array.from({ length: 6000 }, (_, i) => `row ${i}`);
    const newLines = [...oldLines];
    newLines[100] = "row 100 edited";
    newLines[5900] = "row 5900 edited";
    expect(countLineChangeStats(oldLines.join("\n"), newLines.join("\n"))).toEqual({
      added: 2,
      removed: 2,
    });
  });
});

describe("countUnifiedDiffStats", () => {
  it("counts files and changed lines without treating diff headers as changes", () => {
    const diff = [
      "diff --git a/src/one.ts b/src/one.ts",
      "--- a/src/one.ts",
      "+++ b/src/one.ts",
      "@@ -1 +1,2 @@",
      "-old",
      "+new",
      "+added",
      "diff --git a/src/two.ts b/src/two.ts",
      "--- a/src/two.ts",
      "+++ b/src/two.ts",
      "@@ -1 +0,0 @@",
      "-removed",
    ].join("\r\n");

    expect(countUnifiedDiffStats(diff)).toEqual({ files: 2, insertions: 2, deletions: 2 });
  });
});

describe("buildLineUnifiedDiff", () => {
  it("emits a minimal hunk for a single-line edit", () => {
    const diff = buildLineUnifiedDiff("src/foo.ts", "const x = 1;\n", "const x = 2;\n");
    expect(diff).toContain("diff --git a/src/foo.ts b/src/foo.ts");
    expect(diff).toMatch(/^@@ -\d+,?\d* \+\d+,?\d* @@/m);
    const minus = diff
      .split("\n")
      .filter((line) => line.startsWith("-") && !line.startsWith("---"));
    const plus = diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    expect(minus).toHaveLength(1);
    expect(plus).toHaveLength(1);
  });

  it("uses @@ -0,0 for new-file creates so /dev/null is not a fake deletion", () => {
    const diff = buildLineUnifiedDiff(
      "src/supervisor/agents/acpRegistryNpx.ts",
      "",
      ['import { rmSync } from "node:fs";', "export function buildNpxPrefetchArgs() {", "}"].join(
        "\n",
      ),
    );
    expect(diff).toContain("--- /dev/null");
    expect(diff).toContain("@@ -0,0 +1,3 @@");
    const minus = diff
      .split("\n")
      .filter((line) => line.startsWith("-") && !line.startsWith("---"));
    expect(minus).toHaveLength(0);
    expect(
      countLineChangeStats(
        "",
        ['import { rmSync } from "node:fs";', "export function buildNpxPrefetchArgs() {", "}"].join(
          "\n",
        ),
      ),
    ).toEqual({ added: 3, removed: 0 });
  });

  it("emits a single small hunk for a one-line edit in a large file", () => {
    const oldLines = Array.from({ length: 5000 }, (_, i) => `const line${i} = ${i};`);
    const newLines = [...oldLines];
    newLines[2500] = "const line2500 = CHANGED;";
    const diff = buildLineUnifiedDiff("src/big.ts", oldLines.join("\n"), newLines.join("\n"));
    const minus = diff
      .split("\n")
      .filter((line) => line.startsWith("-") && !line.startsWith("---"));
    const plus = diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    expect(minus).toHaveLength(1);
    expect(plus).toHaveLength(1);
    expect(diff).toContain("@@ -2498,7 +2498,7 @@");
  });

  it("normalizes absolute Windows paths for diff headers", () => {
    const diff = buildLineUnifiedDiff(
      String.raw`C:\Users\me\work\poracode\src\foo.ts`,
      "a\n",
      "b\n",
    );
    expect(diff).not.toContain(String.raw`C:\Users`);
    expect(diff).toContain("diff --git a/work/poracode/src/foo.ts");
  });
});

describe("normalizeDiffFilePath", () => {
  it("keeps short relative paths intact", () => {
    expect(normalizeDiffFilePath("src/renderer/App.tsx")).toBe("src/renderer/App.tsx");
  });
});
