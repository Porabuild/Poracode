import { describe, expect, it } from "vitest";
import { hideWhitespaceChanges } from "./whitespaceDiff";

const HEADER = ["diff --git a/f.ts b/f.ts", "index 111..222 100644", "--- a/f.ts", "+++ b/f.ts"];

function patch(...hunks: string[][]): string {
  return [...HEADER, ...hunks.flat()].join("\n") + "\n";
}

describe("hideWhitespaceChanges", () => {
  it("returns an untouched patch (same string) when no change is whitespace-only", () => {
    const input = patch(["@@ -1,2 +1,2 @@", " keep", "-old", "+new"]);
    const result = hideWhitespaceChanges(input);
    expect(result.patch).toBe(input);
    expect(result.hiddenLines).toBe(0);
    expect(result.remainingChanges).toBe(2);
    expect(result.whitespaceOnly).toBe(false);
  });

  it("returns patches without hunks unchanged", () => {
    const input = "diff --git a/a.png b/a.png\nBinary files a/a.png and b/a.png differ\n";
    expect(hideWhitespaceChanges(input)).toEqual({
      patch: input,
      hiddenLines: 0,
      remainingChanges: 0,
      whitespaceOnly: false,
    });
  });

  it("hides a tabs-versus-spaces pair and reports a whitespace-only file", () => {
    const result = hideWhitespaceChanges(
      patch(["@@ -1,3 +1,3 @@", " a", "-\tconst x = 1;", "+    const x = 1;", " b"]),
    );
    expect(result.whitespaceOnly).toBe(true);
    expect(result.hiddenLines).toBe(2);
    expect(result.remainingChanges).toBe(0);
    expect(result.patch).toBe(HEADER.join("\n") + "\n");
  });

  it("treats CRLF-only differences as whitespace", () => {
    const result = hideWhitespaceChanges(
      patch(["@@ -1,2 +1,2 @@", "-line one\r", "-line two\r", "+line one", "+line two changed"]),
    );
    expect(result.hiddenLines).toBe(2);
    expect(result.remainingChanges).toBe(2);
    expect(result.whitespaceOnly).toBe(false);
    expect(result.patch).toBe(
      patch(["@@ -1,2 +1,2 @@", " line one", "-line two\r", "+line two changed"]),
    );
  });

  it("keeps the new-side text for converted lines and preserves a real insertion", () => {
    const result = hideWhitespaceChanges(
      patch([
        "@@ -10,5 +10,6 @@ function f() {",
        " ctx",
        "-  a();",
        "-  b();",
        "-  c();",
        "+    a();",
        "+    inserted();",
        "+    b();",
        "+    c();",
        " tail",
      ]),
    );
    expect(result.hiddenLines).toBe(6);
    expect(result.remainingChanges).toBe(1);
    expect(result.whitespaceOnly).toBe(false);
    expect(result.patch).toBe(
      patch([
        "@@ -10,5 +10,6 @@ function f() {",
        " ctx",
        "     a();",
        "+    inserted();",
        "     b();",
        "     c();",
        " tail",
      ]),
    );
  });

  it("matches lines that differ only by inner whitespace", () => {
    const result = hideWhitespaceChanges(patch(["@@ -1 +1 @@", "-a  +  b", "+a+b"]));
    expect(result.whitespaceOnly).toBe(true);
  });

  it("does not pair a removed line with an added line in a different change block", () => {
    const input = patch(["@@ -1,3 +1,3 @@", "-same", " between", "+same"]);
    const result = hideWhitespaceChanges(input);
    expect(result.patch).toBe(input);
    expect(result.remainingChanges).toBe(2);
    expect(result.hiddenLines).toBe(0);
  });

  it("drops a whitespace-only hunk and keeps the other with its own start lines", () => {
    const result = hideWhitespaceChanges(
      patch(
        ["@@ -1,2 +1,2 @@", " a", "-  x", "+x"],
        ["@@ -20,3 +20,3 @@ section", " c1", "-old", "+new", " c2"],
      ),
    );
    expect(result.whitespaceOnly).toBe(false);
    expect(result.hiddenLines).toBe(2);
    expect(result.remainingChanges).toBe(2);
    expect(result.patch).toBe(patch(["@@ -20,3 +20,3 @@ section", " c1", "-old", "+new", " c2"]));
  });

  it("recounts a hunk header written with explicit single-line counts", () => {
    const result = hideWhitespaceChanges(
      patch(["@@ -3,1 +3,1 @@", "-  x", "+x"], ["@@ -9,2 +9,2 @@", "-gone", "+kept", " z"]),
    );
    expect(result.patch).toBe(patch(["@@ -9,2 +9,2 @@", "-gone", "+kept", " z"]));
  });

  it("keeps removed lines that have no whitespace-equal partner", () => {
    const result = hideWhitespaceChanges(
      patch(["@@ -5,4 +5,3 @@", " a", "-  keep ", "-gone", "+keep", " z"]),
    );
    expect(result.patch).toBe(patch(["@@ -5,4 +5,3 @@", " a", " keep", "-gone", " z"]));
    expect(result.remainingChanges).toBe(1);
  });

  it("drops the no-newline marker with a converted line and keeps the others", () => {
    const converted = hideWhitespaceChanges(
      patch(["@@ -1 +1 @@", "-x", "\\ No newline at end of file", "+x"]),
    );
    expect(converted.whitespaceOnly).toBe(true);

    const kept = hideWhitespaceChanges(
      patch([
        "@@ -1,3 +1,3 @@",
        "-  a",
        "-b",
        "\\ No newline at end of file",
        "+a",
        "+c",
        "\\ No newline at end of file",
        " z",
      ]),
    );
    expect(kept.patch).toBe(
      patch([
        "@@ -1,3 +1,3 @@",
        " a",
        "-b",
        "\\ No newline at end of file",
        "+c",
        "\\ No newline at end of file",
        " z",
      ]),
    );
  });

  it("never hides a pure insertion, even a blank line", () => {
    const input = patch(["@@ -1,2 +1,3 @@", " a", "+", " b"]);
    const result = hideWhitespaceChanges(input);
    expect(result.patch).toBe(input);
    expect(result.remainingChanges).toBe(1);
    expect(result.whitespaceOnly).toBe(false);
  });

  it("matches in order, so a reordered pair keeps one of its two lines changed", () => {
    const result = hideWhitespaceChanges(patch(["@@ -1,2 +1,2 @@", "-a", "-b", "+b", "+a"]));
    expect(result.hiddenLines).toBe(2);
    expect(result.remainingChanges).toBe(2);
  });

  it("handles a patch that ends without a final newline", () => {
    const input = [...HEADER, "@@ -1 +1 @@", "-  x", "+x"].join("\n");
    const result = hideWhitespaceChanges(input);
    expect(result.whitespaceOnly).toBe(true);
    expect(result.patch).toBe(HEADER.join("\n"));
  });
});
