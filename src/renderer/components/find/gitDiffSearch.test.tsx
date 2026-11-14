import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiffFile, DiffView } from "@git-diff-view/react";
import {
  gitDiffSearchLines,
  readGitDiffSearchLines,
  type GitDiffSearchEntry,
} from "./gitDiffSearch";

const patch =
  "--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n context\n-old needle\n+new needle\n tail\n";
const entry: GitDiffSearchEntry = {
  filePath: "file.ts",
  staged: false,
  rawDiff: patch,
  tooLarge: false,
  oldName: "file.ts",
  deletions: 1,
};
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        font: "",
        measureText: (text: string) => ({ width: text.length * 8 }),
      }) as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Git diff search index", () => {
  it.each([
    [1, false],
    [1, true],
    [4, false],
  ] as const)(
    "resolves patch matches against the real diff DOM (mode %s, wrap %s)",
    async (mode, wrap) => {
      const model = DiffFile.createInstance({
        oldFile: { fileName: "file.ts", content: "context\nold needle\ntail\n" },
        newFile: { fileName: "file.ts", content: "context\nnew needle\ntail\n" },
        hunks: [patch],
      });
      model.initRaw();
      model.buildSplitDiffLines();
      model.buildUnifiedDiffLines();
      const { container, unmount } = render(
        <div>
          <span data-diff-file-name>file.ts</span>
          <DiffView
            diffFile={model}
            diffViewMode={mode}
            diffViewWrap={wrap}
            diffViewHighlight={false}
          />
        </div>,
      );
      await waitFor(() =>
        expect(
          container.querySelectorAll(
            "td.diff-line-content, td.diff-line-old-content, td.diff-line-new-content",
          ).length,
        ).toBeGreaterThan(0),
      );
      const indexed = gitDiffSearchLines(entry, mode);
      for (const line of indexed) {
        expect(container.querySelector(line.selector)?.textContent).toBe(line.text);
      }
      const actual = readGitDiffSearchLines(container)!;
      expect(actual).toHaveLength(indexed.length);
      expect(actual.filter((line) => line.text.includes("needle"))).toHaveLength(2);
      for (const line of indexed) expect(actual).toContainEqual(line);
      unmount();
      model.clear();
    },
  );
  it("tracks both sides and multiple hunk offsets without indexing metadata", () => {
    const lines = gitDiffSearchLines(
      {
        ...entry,
        rawDiff: `${patch}@@ -20 +30 @@ metadata needle\n-x\n+y\n\\ No newline at end of file\n`,
      },
      4,
    );
    expect(lines.some((line) => line.text.includes("metadata"))).toBe(false);
    expect(lines.at(-2)?.selector).toContain('data-line-old-num="20"');
    expect(lines.at(-1)?.selector).toContain('data-line-new-num="30"');
  });
  it("retains expanded text after a body unmounts and invalidates it for a new revision", () => {
    const section = document.createElement("div");
    section.innerHTML =
      '<span data-diff-file-name>file.ts</span><table><tbody><tr><td class="diff-line-new-num"><span data-line-num="20">20</span></td><td class="diff-line-new-content"><span class="diff-line-content-raw">expanded context</span></td></tr></tbody></table>';
    const lines = readGitDiffSearchLines(section, "revision-1");
    expect(lines?.at(-1)?.text).toBe("expanded context");
    section.querySelector("table")!.remove();
    expect(readGitDiffSearchLines(section, "revision-1")).toBe(lines);
    expect(readGitDiffSearchLines(section, "revision-2")).toBeNull();
  });
  it("uses unified selectors for new files and only the filename for oversized files", () => {
    const added = gitDiffSearchLines(
      { ...entry, oldName: "/dev/null", deletions: 0, rawDiff: "@@ -0,0 +1 @@\n+created\n" },
      1,
    );
    expect(added[1]?.selector).toContain('data-line-new-num="1"');
    expect(gitDiffSearchLines({ ...entry, tooLarge: true }, 1)).toEqual([
      { selector: "[data-diff-file-name]", text: "file.ts" },
    ]);
  });
});
