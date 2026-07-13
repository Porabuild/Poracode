import { describe, expect, it } from "vitest";
import { prepareInlineDiffParts, splitUnifiedDiffFiles } from "./InlineDiffView";

describe("InlineDiffView", () => {
  it("splits multi-file unified diffs into per-file chunks", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-oldA",
      "+newA",
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1 +1 @@",
      "-oldB",
      "+newB",
      "",
    ].join("\n");

    const chunks = splitUnifiedDiffFiles(diff);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("diff --git a/src/a.ts b/src/a.ts");
    expect(chunks[0]).toContain("+newA");
    expect(chunks[0]).not.toContain("src/b.ts");
    expect(chunks[1]).toContain("diff --git a/src/b.ts b/src/b.ts");
    expect(chunks[1]).toContain("+newB");
  });

  it("keeps non-git diff text as a single chunk", () => {
    const diff = ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1 +1 @@", "-old", "+new"].join("\n");

    expect(splitUnifiedDiffFiles(diff)).toEqual([diff]);
  });

  it("merges repeated same-file chunks and normalizes absolute OpenCode paths", () => {
    const absolutePath =
      "/Users/serhiivecherenko/work/poracode/src/renderer/components/thread/threadErrorState.ts";
    const diff = [
      `diff --git a/${absolutePath} b/${absolutePath}`,
      `--- a/${absolutePath}`,
      `+++ b/${absolutePath}`,
      "@@ -1 +1 @@",
      "-const first = false;",
      "+const first = true;",
      `diff --git a/${absolutePath} b/${absolutePath}`,
      `--- a/${absolutePath}`,
      `+++ b/${absolutePath}`,
      "@@ -20 +20 @@",
      "-const second = false;",
      "+const second = true;",
      "",
    ].join("\n");

    const parts = prepareInlineDiffParts(diff, absolutePath);

    expect(parts).toHaveLength(1);
    expect(parts[0]?.displayPath).toBe("renderer/components/thread/threadErrorState.ts");
    expect(parts[0]?.diff).toContain("@@ -1 +1 @@");
    expect(parts[0]?.diff).toContain("@@ -20 +20 @@");
    expect(parts[0]?.diff).not.toContain("a//Users");
  });
});
