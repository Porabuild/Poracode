import { describe, expect, it } from "vitest";
import {
  extractAcpAddedFileText,
  extractAcpDiffResultPart,
  extractAcpDiffSummary,
  extractAcpPatchTargetPath,
  extractAcpResultPart,
  extractReadFileResultPart,
} from "./acpToolPayload";

const FILE_DIFF = [
  "diff --git a/src/foo.ts b/src/foo.ts",
  "--- a/src/foo.ts",
  "+++ b/src/foo.ts",
  "@@ -1 +1 @@",
  "-old",
  "+new",
  "",
].join("\n");

describe("acpToolPayload", () => {
  it("marks unified diff results as diff output", () => {
    const payload = { result: { detailedContent: FILE_DIFF } };

    expect(extractAcpResultPart(payload)).toEqual({ text: FILE_DIFF, language: "diff" });
    expect(extractAcpDiffResultPart(payload)).toEqual({ text: FILE_DIFF, language: "diff" });
  });

  it("keeps non-diff results out of the diff-only file-change body", () => {
    expect(extractAcpDiffResultPart({ result: { content: "done" } })).toEqual({
      text: "",
      language: "plain",
    });
  });

  it("synthesizes a unified diff from replacement-style edit args", () => {
    expect(
      extractAcpDiffResultPart({
        path: "src/foo.ts",
        args: { filePath: "src/foo.ts", oldString: "old\nvalue", newString: "new\nvalue" },
        result: { content: "Edit applied successfully." },
      }),
    ).toEqual({
      text: [
        "diff --git a/src/foo.ts b/src/foo.ts",
        "--- a/src/foo.ts",
        "+++ b/src/foo.ts",
        "@@ -1,2 +1,2 @@",
        "-old",
        "-value",
        "+new",
        "+value",
        "",
      ].join("\n"),
      language: "diff",
    });
  });

  it("synthesizes insertion diffs from snake_case edit args", () => {
    const part = extractAcpDiffResultPart({
      path: "src/foo.ts",
      args: { file_path: "src/foo.ts", old_string: "", new_string: "added\nline" },
    });

    expect(part.language).toBe("diff");
    expect(part.text).toContain("@@ -0,0 +1,2 @@");
    expect(part.text).toContain("+added");
    expect(part.text).toContain("+line");
  });

  it("reconstructs apply_patch add-file content for absolute plan paths", () => {
    const planPath =
      "/Users/serhiivecherenko/.copilot/session-state/d8992383-f6b2-4ee2-a017-d59315f53dc1/plan.md";
    const payload = {
      args: [
        "*** Begin Patch",
        `*** Add File: ${planPath}`,
        "+Problem:",
        "+- show plan previews for apply_patch creates",
        "+",
        "+Approach:",
        "+- render add-file contents from patch args",
        "*** End Patch",
      ].join("\n"),
    };

    expect(extractAcpAddedFileText(payload, planPath)).toBe(
      [
        "Problem:",
        "- show plan previews for apply_patch creates",
        "",
        "Approach:",
        "- render add-file contents from patch args",
        "",
      ].join("\n"),
    );
  });

  describe("extractReadFileResultPart", () => {
    it("unwraps OpenCode read output and highlights from the wrapper path", () => {
      const result = [
        "<path>src/foo.ts</path>",
        "<type>file</type>",
        "<content>",
        "1: export const x = 1;",
        "2: export const y = 2;",
        "</content>",
      ].join("\n");

      expect(extractReadFileResultPart({ kind: "read", result })).toEqual({
        text: "export const x = 1;\nexport const y = 2;",
        language: "typescript",
      });
    });

    it("falls back to args.filePath when the wrapper has no <path> tag", () => {
      const result = ["<content>", "1: print('hi')", "</content>"].join("\n");

      expect(
        extractReadFileResultPart({
          kind: "read",
          args: { filePath: "scripts/run.py" },
          result,
        }),
      ).toEqual({
        text: "print('hi')",
        language: "python",
      });
    });

    it("strips line-number prefixes on unwrapped read output", () => {
      expect(
        extractReadFileResultPart({
          kind: "read",
          path: "src/foo.tsx",
          result: "1: const a = 1;\n2: const b = 2;",
        }),
      ).toEqual({
        text: "const a = 1;\nconst b = 2;",
        language: "tsx",
      });
    });

    it("leaves text alone when fewer than half the lines look line-numbered", () => {
      const result = "no numbers here\n1: only one prefixed";
      expect(extractReadFileResultPart({ kind: "read", path: "notes.md", result })).toEqual({
        text: result,
        language: "markdown",
      });
    });

    it("falls back to plain when no path is available", () => {
      expect(extractReadFileResultPart({ kind: "read", result: "plain output" })).toEqual({
        text: "plain output",
        language: "plain",
      });
    });
  });

  it("prefers OpenCode's metadata.changes diff over synthesizing from oldString/newString", () => {
    const metadataDiff = [
      "@@ -1,3 +1,3 @@",
      " context above",
      "-before",
      "+after",
      " context below",
      "",
    ].join("\n");

    const payload = {
      path: "src/foo.ts",
      args: { file_path: "src/foo.ts", old_string: "before", new_string: "after" },
      result: "Success. Updated the following files:\nM src/foo.ts",
      metadata: {
        changes: [{ path: "src/foo.ts", kind: { type: "update" }, diff: metadataDiff }],
      },
    };

    const part = extractAcpDiffResultPart(payload);
    expect(part.language).toBe("diff");
    expect(part.text).toContain(" context above");
    expect(part.text).toContain(" context below");
    expect(part.text).toContain("-before");
    expect(part.text).toContain("+after");
  });

  it("synthesizes diffs and summaries from apply_patch patchText args", () => {
    const payload = {
      args: {
        patchText: [
          "*** Begin Patch",
          "*** Update File: src/foo.ts",
          "@@",
          "-old",
          "+new",
          "*** End Patch",
        ].join("\n"),
      },
    };

    expect(extractAcpPatchTargetPath(payload)).toBe("src/foo.ts");
    expect(extractAcpDiffSummary(payload)).toEqual({ added: 1, removed: 1 });
    expect(extractAcpDiffResultPart(payload)).toEqual({
      text: [
        "diff --git a/src/foo.ts b/src/foo.ts",
        "--- a/src/foo.ts",
        "+++ b/src/foo.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "",
      ].join("\n"),
      language: "diff",
    });
  });

  it("prefers normalized metadata changes over range-less apply_patch text", () => {
    const patch = [
      "Index: /Users/serhiivecherenko/work/site-search-ui/README.md",
      "===================================================================",
      "--- /Users/serhiivecherenko/work/site-search-ui/README.md",
      "+++ /Users/serhiivecherenko/work/site-search-ui/README.md",
      "@@ -1,7 +1,7 @@",
      "-Preact-based embeddable widget that renders AI-powered, streaming search answers.",
      "+Preact-based embeddable search widget that renders AI-powered, streaming answers.",
      "@@ -24,9 +24,9 @@",
      "-The simplest integration uses a single script tag with query parameters:",
      "+The simplest integration uses one script tag with query parameters:",
      "@@ -201,5 +201,5 @@",
      "-Common env vars are described in `AGENTS.md`.",
      "+Common environment variables are described in `AGENTS.md`.",
      "",
    ].join("\n");
    const payload = {
      path: "/Users/serhiivecherenko/work/site-search-ui/README.md",
      args: {
        patchText: [
          "*** Begin Patch",
          "*** Update File: /Users/serhiivecherenko/work/site-search-ui/README.md",
          "@@",
          "-Preact-based embeddable widget that renders AI-powered, streaming search answers.",
          "+Preact-based embeddable search widget that renders AI-powered, streaming answers.",
          "@@",
          "-The simplest integration uses a single script tag with query parameters:",
          "+The simplest integration uses one script tag with query parameters:",
          "@@",
          "-Common env vars are described in `AGENTS.md`.",
          "+Common environment variables are described in `AGENTS.md`.",
          "*** End Patch",
        ].join("\n"),
      },
      metadata: {
        changes: [
          {
            path: "README.md",
            kind: { type: "update", move_path: null },
            diff: patch,
          },
        ],
      },
    };

    const part = extractAcpDiffResultPart(payload);

    expect(part.language).toBe("diff");
    expect(part.text).toContain("diff --git a/README.md b/README.md");
    expect(part.text).toContain("@@ -1,7 +1,7 @@");
    expect(part.text).toContain("@@ -24,9 +24,9 @@");
    expect(part.text).toContain("@@ -201,5 +201,5 @@");
    expect(part.text).not.toContain("@@ -1 +1 @@");
    expect(extractAcpDiffSummary(payload)).toEqual({ added: 3, removed: 3 });
  });
});
