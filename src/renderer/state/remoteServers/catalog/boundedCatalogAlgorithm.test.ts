import { describe, expect, it } from "vitest";
import {
  advanceInventoryWalk,
  beginInventoryWalk,
  catalogDeletionCandidates,
  chunkCatalogIds,
} from "./boundedCatalogAlgorithm";

describe("boundedCatalogAlgorithm", () => {
  it("advances a walk, records the page-1 frontier, and completes on a null cursor", () => {
    let walk = beginInventoryWalk({
      kind: "threads",
      attempt: 1,
      knownBefore: ["a", "b"],
      startedSeq: 7,
    });
    const first = advanceInventoryWalk(walk, {
      ids: ["a"],
      nextCursor: "ti1.1",
      frontier: "z9",
    });
    expect(first.status).toBe("advanced");
    if (first.status !== "advanced") throw new Error("expected advanced");
    walk = first.walk;
    expect(walk.frontier).toBe("z9");
    expect(walk.seen.has("a")).toBe(true);

    const second = advanceInventoryWalk(walk, { ids: ["b"], nextCursor: null });
    expect(second.status).toBe("complete");
    if (second.status !== "complete") throw new Error("expected complete");
    expect(second.walk.seen.has("b")).toBe(true);
    expect(second.walk.totalPages).toBe(2);
  });

  it("yields a segment at the page bound without completing the pass", () => {
    const start = beginInventoryWalk({
      kind: "projects",
      attempt: 1,
      knownBefore: [],
      startedSeq: 0,
    });
    const first = advanceInventoryWalk(start, { ids: ["p0"], nextCursor: "pi1.0" }, 2);
    if (first.status !== "advanced") throw new Error("expected an advanced page");
    const second = advanceInventoryWalk(first.walk, { ids: ["p1"], nextCursor: "pi1.1" }, 2);
    if (second.status !== "segment-end") throw new Error("expected a segment end");
    expect(second.walk.pagesInSegment).toBe(2);
    expect(second.walk.seen.size).toBe(2);
  });

  it("reports a repeated cursor as an anomaly instead of looping", () => {
    const walk = {
      ...beginInventoryWalk({ kind: "threads", attempt: 1, knownBefore: [], startedSeq: 0 }),
      cursor: "ti1.same",
    };
    const result = advanceInventoryWalk(walk, { ids: ["a"], nextCursor: "ti1.same" });
    expect(result.status).toBe("cursor-repeat");
  });

  it("deletion candidates exclude seen, protected and live-seq-newer rows", () => {
    const advanced = advanceInventoryWalk(
      beginInventoryWalk({
        kind: "threads",
        attempt: 1,
        knownBefore: ["keep", "gone", "pinned", "live"],
        startedSeq: 10,
      }),
      { ids: ["keep"], nextCursor: null },
    );
    if (advanced.status !== "complete") throw new Error("expected a completed walk");
    const walk = advanced.walk;
    const candidates = catalogDeletionCandidates({
      walk,
      localIds: ["keep", "gone", "pinned", "live", "unknown"],
      protectedIds: ["pinned"],
      liveSeqNewerIds: ["live"],
    });
    expect(candidates).toEqual(["gone"]);
  });

  it("chunks ids into membership batches", () => {
    expect(chunkCatalogIds([], 200)).toEqual([]);
    expect(chunkCatalogIds(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
  });
});
