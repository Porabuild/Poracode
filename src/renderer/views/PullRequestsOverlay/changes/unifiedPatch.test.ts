import { describe, expect, it } from "vitest";
import { PATCH_A, PATCH_B, COMMIT_DIFF } from "./changesFixtures";
import {
  parsePatch,
  patchKind,
  patchRows,
  patchStats,
  snippetAround,
  visibleLines,
} from "./unifiedPatch";

describe("unified patch reading", () => {
  it("numbers every hunk line on its own side", () => {
    expect(patchRows(PATCH_A)).toEqual([
      { kind: " ", oldLine: 1, newLine: 1, text: "const a = 1;" },
      { kind: "-", oldLine: 2, newLine: null, text: "const b = 2;" },
      { kind: "+", oldLine: null, newLine: 2, text: "const b = 3;" },
      { kind: " ", oldLine: 3, newLine: 3, text: "const c = 4;" },
      { kind: " ", oldLine: 4, newLine: 4, text: "const d = 5;" },
    ]);
  });

  it("knows which lines each side shows", () => {
    const visible = visibleLines(patchRows(PATCH_B));
    expect([...visible.new]).toEqual([10, 11, 12, 13]);
    expect([...visible.old]).toEqual([10, 11]);
  });

  it("counts additions and deletions", () => {
    expect(patchStats(PATCH_A)).toEqual({ additions: 1, deletions: 1 });
    expect(patchStats(COMMIT_DIFF)).toEqual({ additions: 2, deletions: 0 });
  });

  it("classifies the patch", () => {
    expect(patchKind(PATCH_A)).toBe("modified");
    expect(patchKind(COMMIT_DIFF)).toBe("added");
    expect(patchKind("diff --git a/x b/x\ndeleted file mode 100644\n")).toBe("deleted");
    expect(patchKind("diff --git a/x b/y\nrename from x\nrename to y\n")).toBe("renamed");
    expect(patchKind("diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n")).toBe(
      "binary",
    );
  });

  it("quotes the lines around a target on the requested side", () => {
    expect(snippetAround(PATCH_A, "RIGHT", 2, 1)).toBe(
      "-const b = 2;\n+const b = 3;\n const c = 4;",
    );
    expect(snippetAround(PATCH_A, "LEFT", 2, 1)).toBe(
      " const a = 1;\n-const b = 2;\n+const b = 3;",
    );
    expect(snippetAround(PATCH_A, "RIGHT", 99)).toBe("");
  });

  it("keeps the no-newline marker with its line and bounds hunks by their counts", () => {
    const parsed = parsePatch(
      ["--- a/f", "+++ b/f", "@@ -1 +1 @@", "-a", "\\ No newline at end of file", "+b", ""].join(
        "\n",
      ),
    );
    expect(parsed.hunks[0]?.lines).toEqual([
      { kind: "-", text: "a", noEol: true },
      { kind: "+", text: "b", noEol: false },
    ]);
    expect(parsed.tail).toEqual([""]);
  });
});
