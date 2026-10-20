import { expect, it } from "vitest";
import { splitUnifiedDiff, viewedFingerprint } from "./reviewDiff";

it("preserves the previous patch boundaries and existing viewed fingerprints", () => {
  const first = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new";
  const last = "diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-before\n+after\n";
  const patches = splitUnifiedDiff(first + "\n" + last);
  expect(patches.get("a.ts")).toBe(first);
  expect(patches.get("b.ts")).toBe(last);
  expect(viewedFingerprint(patches.get("a.ts"), { additions: 1, deletions: 1 })).toBe(
    viewedFingerprint(first, { additions: 1, deletions: 1 }),
  );
});

it("keys text patches by path when Git tab-terminates headers for names with spaces", () => {
  const patch =
    "diff --git a/my file.txt b/my file.txt\n--- a/my file.txt\t\n+++ b/my file.txt\t\n@@ -1 +1 @@\n-old\n+new\n";
  expect(splitUnifiedDiff(patch).get("my file.txt")).toBe(patch);
});

it("keeps deleted and binary files under their real paths", () => {
  const deleted =
    "diff --git a/old.ts b/old.ts\n--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n";
  expect([...splitUnifiedDiff(deleted).keys()]).toEqual(["old.ts"]);
  for (const path of ["image.png", "image with spaces.png", "image b/with spaces.png"]) {
    const binary = `diff --git a/${path} b/${path}\nindex abc..def 100644\nBinary files a/${path} and b/${path} differ\n`;
    expect(splitUnifiedDiff(binary).get(path)).toBe(binary);
  }
});

it("decodes C-quoted paths once, including UTF-8 octal bytes and literal quote characters", () => {
  const quoted =
    'diff --git "a/\\321\\204.txt" "b/\\321\\204.txt"\n--- "a/\\321\\204.txt"\n+++ "b/\\321\\204.txt"\n@@ -1 +1 @@\n-old\n+new\n';
  expect([...splitUnifiedDiff(quoted).keys()]).toEqual(["ф.txt"]);
  const literal =
    'diff --git "a/\\"file\\"" "b/\\"file\\""\n--- "a/\\"file\\""\n+++ "b/\\"file\\""\n@@ -1 +1 @@\n-old\n+new\n';
  expect([...splitUnifiedDiff(literal).keys()]).toEqual(['"file"']);
});

it("uses the new path of a binary rename and retains empty and malformed inputs safely", () => {
  const renamed =
    "diff --git a/old.png b/new.png\nsimilarity index 100%\nrename from old.png\nrename to new.png\n";
  expect(splitUnifiedDiff(renamed).get("new.png")).toBe(renamed);
  expect(splitUnifiedDiff("").size).toBe(0);
  expect(splitUnifiedDiff("unavailable diff").size).toBe(0);
});
