import { expect, it } from "vitest";
import { reviewGuideExcerpt } from "./reviewGuide";

const diff =
  "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -10,2 +20,2 @@\n-old\n+new\n shared\n";
const excerpt = {
  path: "a.ts",
  side: "RIGHT" as const,
  startLine: 20,
  endLine: 21,
  text: "new\nshared",
};
it("uses the selected file and side's original line numbers", () => {
  expect(reviewGuideExcerpt(diff, excerpt)).toBe("new\nshared");
  expect(reviewGuideExcerpt(diff, { ...excerpt, side: "LEFT", startLine: 10, endLine: 11 })).toBe(
    "old\nshared",
  );
  expect(reviewGuideExcerpt(diff, { ...excerpt, path: "b.ts" })).toBeUndefined();
});
it("refuses missing, noncontiguous, inverted and oversized line ranges", () => {
  for (const range of [
    { startLine: 19, endLine: 21 },
    { startLine: 21, endLine: 20 },
    { startLine: 20, endLine: 220 },
  ])
    expect(reviewGuideExcerpt(diff, { ...excerpt, ...range })).toBeUndefined();
});
it("reads deleted-file excerpts from the old path", () => {
  const deleted =
    "diff --git a/old.ts b/old.ts\n--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-deleted\n";
  expect(
    reviewGuideExcerpt(deleted, {
      path: "old.ts",
      side: "LEFT",
      startLine: 1,
      endLine: 1,
      text: "deleted",
    }),
  ).toBe("deleted");
});
