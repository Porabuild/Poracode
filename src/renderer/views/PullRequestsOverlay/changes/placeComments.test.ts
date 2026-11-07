import { describe, expect, it } from "vitest";
import { PATCH_A, PATCH_B, thread } from "./changesFixtures";
import { placeComments } from "./placeComments";
import type { ReviewDraftComment } from "./prReviewDraftStore";
import { patchRows, visibleLines } from "./unifiedPatch";

const visible = visibleLines(patchRows(PATCH_A));
const base: ReviewDraftComment = {
  id: "d1",
  path: "src/a.ts",
  side: "RIGHT",
  line: 2,
  body: "note",
  headSha: "head",
};

describe("placeComments", () => {
  it("puts a thread on the new side of its line and a draft on its own side", () => {
    const placed = placeComments(
      visible,
      [thread({ line: 3 })],
      [base, { ...base, id: "d2", side: "LEFT", line: 2 }],
      "head",
    );
    expect(placed.extendData.newFile["3"]?.data.threads).toHaveLength(1);
    expect(placed.extendData.newFile["2"]?.data.drafts.map((d) => d.id)).toEqual(["d1"]);
    expect(placed.extendData.oldFile["2"]?.data.drafts.map((d) => d.id)).toEqual(["d2"]);
    expect(placed.unplacedThreads).toEqual([]);
    expect(placed.unplacedDrafts).toEqual([]);
  });

  it("puts a thread anchored on the old side on the old line, not on the new line", () => {
    const placed = placeComments(
      visible,
      [thread({ id: "removed", line: 2, side: "LEFT" }), thread({ id: "added", line: 2 })],
      [],
      "head",
    );
    expect(placed.extendData.oldFile["2"]?.data.threads.map((t) => t.id)).toEqual(["removed"]);
    expect(placed.extendData.newFile["2"]?.data.threads.map((t) => t.id)).toEqual(["added"]);
    expect(placed.unplacedThreads).toEqual([]);
  });

  it("treats an explicit new side and an unknown side like an absent one", () => {
    const placed = placeComments(
      visible,
      [
        thread({ id: "right", line: 3, side: "RIGHT" }),
        thread({ id: "future", line: 4, side: "a-side-from-the-future" }),
      ],
      [],
      "head",
    );
    expect(placed.extendData.oldFile).toEqual({});
    expect(placed.extendData.newFile["3"]?.data.threads.map((t) => t.id)).toEqual(["right"]);
    expect(placed.extendData.newFile["4"]?.data.threads.map((t) => t.id)).toEqual(["future"]);
  });

  it("lists a thread whose line is only visible on the other side", () => {
    // PATCH_B adds lines 12 and 13, so the old file ends at 11.
    const shown = visibleLines(patchRows(PATCH_B));
    const placed = placeComments(
      shown,
      [
        thread({ id: "old-only", line: 13, side: "LEFT" }),
        thread({ id: "new-only", line: 13 }),
        thread({ id: "context", line: 11, side: "LEFT" }),
      ],
      [],
      "head",
    );
    expect(placed.unplacedThreads.map((t) => t.id)).toEqual(["old-only"]);
    expect(placed.extendData.newFile["13"]?.data.threads.map((t) => t.id)).toEqual(["new-only"]);
    expect(placed.extendData.oldFile["11"]?.data.threads.map((t) => t.id)).toEqual(["context"]);
  });

  it("lists comments whose line is not shown, and drafts from another head", () => {
    const placed = placeComments(
      visible,
      [thread({ line: 40 }), { id: "no-line", isResolved: false, isOutdated: false, comments: [] }],
      [
        { ...base, id: "old", headSha: "other" },
        { ...base, id: "gone", line: 40 },
      ],
      "head",
    );
    expect(placed.unplacedThreads.map((t) => t.id)).toEqual(["thread-1", "no-line"]);
    expect(placed.unplacedDrafts.map((d) => d.id)).toEqual(["old", "gone"]);
    expect(placed.extendData).toEqual({ oldFile: {}, newFile: {} });
  });
});
