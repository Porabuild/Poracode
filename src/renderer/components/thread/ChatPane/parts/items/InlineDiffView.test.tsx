import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { InlineDiffView, prepareInlineDiffParts, splitUnifiedDiffFiles } from "./InlineDiffView";

vi.mock("@git-diff-view/react", async (importOriginal) => {
  const { createElement } = await import("react");
  return {
    ...(await importOriginal<typeof import("@git-diff-view/react")>()),
    DiffView: () => createElement("div", { "data-testid": "diff-view" }),
  };
});

vi.mock("@/renderer/views/GitReviewOverlay/parts/diffBuildClient", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/renderer/views/GitReviewOverlay/parts/diffBuildClient")
  >()),
  useDiffTheme: () => "dark" as const,
}));

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

  it("opts chat diffs into the compact line-number gutter at any width", async () => {
    const diffText = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "",
    ].join("\n");

    render(
      <AppProvider>
        <InlineDiffView diffText={diffText} filePath="src/a.ts" />
      </AppProvider>,
    );

    const diffView = await screen.findByTestId("diff-view");
    expect(diffView.closest(".poracode-compact-diff-gutter")).not.toBeNull();
  });
});
