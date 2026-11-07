import { describe, expect, it } from "vitest";
import type { ChangelogRelease } from "./changelog";
import { parseChangelogDocument } from "./changelog";
import {
  HIGHLIGHT_MAX_SHOWINGS,
  changelogHighlightPool,
  highlightHeadline,
  highlightId,
  parseHighlightHistory,
  pickChangelogHighlights,
  recordHighlightShown,
  retireHighlight,
  type HighlightHistory,
} from "./changelogHighlights";

function release(version: string, changes: ChangelogRelease["changes"]): ChangelogRelease {
  return { version, date: "2026-10-01", title: `Release ${version}`, summary: "Summary.", changes };
}

const releases: ChangelogRelease[] = [
  release("1.9.0", [{ kind: "added", text: "Unreleased feature." }]),
  release("1.8.2", [
    { kind: "fixed", label: "Chat", text: "Fixed a chat bug." },
    { kind: "improved", label: "Models", text: "Better model defaults." },
    { kind: "added", label: "Themes", text: "Custom themes." },
  ]),
  release("1.8.1", [
    { kind: "added", label: "Import", text: "Import sessions." },
    { kind: "fixed", text: "Fixed a crash." },
  ]),
  release("1.8.0", [{ kind: "added", text: "Older feature." }]),
  release("1.7.0", [{ kind: "added", text: "Outside the window." }]),
];

const empty: HighlightHistory = { shown: {}, retired: [] };
const fixedRandom = () => 0.5;

describe("changelogHighlightPool", () => {
  it("covers the three newest releases at or below the running version", () => {
    const pool = changelogHighlightPool(releases, "1.8.2");
    expect(new Set(pool.map((highlight) => highlight.version))).toEqual(
      new Set(["1.8.2", "1.8.1", "1.8.0"]),
    );
    expect(pool.find((highlight) => highlight.change.text === "Custom themes.")).toMatchObject({
      position: 3,
      total: 3,
    });
  });

  it("keys highlights by content so reordering a release keeps their history", () => {
    const change = { kind: "added" as const, label: "Themes", text: "Custom themes." };
    expect(highlightId("1.8.2", change)).toBe(highlightId("1.8.2", { ...change }));
    expect(highlightId("1.8.2", change)).not.toBe(highlightId("1.8.1", change));
    expect(highlightId("1.8.2", change)).not.toBe(
      highlightId("1.8.2", { ...change, text: "Custom themes!" }),
    );
  });
});

describe("pickChangelogHighlights", () => {
  const pool = changelogHighlightPool(releases, "1.8.2");

  it("leads with the newest release, new features before improvements before fixes", () => {
    const picked = pickChangelogHighlights(pool, empty, 4, fixedRandom).map(
      (highlight) => highlight.change.text,
    );
    expect(picked).toEqual([
      "Custom themes.",
      "Better model defaults.",
      "Fixed a chat bug.",
      "Import sessions.",
    ]);
  });

  it("shows different points on the next visit instead of repeating the same ones", () => {
    const first = pickChangelogHighlights(pool, empty, 3, fixedRandom);
    const ids = new Set(pool.map((highlight) => highlight.id));
    let history = empty;
    for (const highlight of first) history = recordHighlightShown(history, highlight.id, ids);
    const second = pickChangelogHighlights(pool, history, 3, fixedRandom);
    expect(second.some((highlight) => first.includes(highlight))).toBe(false);
  });

  it("rotates through every point before any repeats, then retires them", () => {
    const ids = new Set(pool.map((highlight) => highlight.id));
    let history = empty;
    const seen: string[] = [];
    for (let visit = 0; visit < 20; visit++) {
      const [next] = pickChangelogHighlights(pool, history, 1, fixedRandom);
      if (!next) break;
      seen.push(next.id);
      history = recordHighlightShown(history, next.id, ids);
    }
    expect(new Set(seen.slice(0, pool.length)).size).toBe(pool.length);
    expect(seen).toHaveLength(pool.length * HIGHLIGHT_MAX_SHOWINGS);
  });

  it("skips retired points", () => {
    const top = pickChangelogHighlights(pool, empty, 1, fixedRandom)[0]!;
    const retired = retireHighlight(empty, top.id);
    expect(pickChangelogHighlights(pool, retired, 10, fixedRandom).map((h) => h.id)).not.toContain(
      top.id,
    );
  });

  it("breaks ties with the visit's random source so equal points vary", () => {
    const ties = changelogHighlightPool(
      [
        release("2.0.0", [
          { kind: "added", text: "A." },
          { kind: "added", text: "B." },
          { kind: "added", text: "C." },
        ]),
      ],
      "2.0.0",
    );
    const values = [0.9, 0.1, 0.5];
    let call = 0;
    const picked = pickChangelogHighlights(ties, empty, 3, () => values[call++ % 3]!);
    expect(picked.map((highlight) => highlight.change.text)).toEqual(["B.", "C.", "A."]);
  });
});

describe("highlight history storage", () => {
  it("prunes points that left the pool so storage stays bounded", () => {
    const history = recordHighlightShown(
      { shown: { stale: 2, keep: 1 }, retired: ["stale", "keep"] },
      "keep",
      new Set(["keep"]),
    );
    expect(history).toEqual({ shown: { keep: 2 }, retired: ["keep"] });
  });

  it("starts fresh from malformed storage", () => {
    expect(parseHighlightHistory("not json")).toEqual(empty);
    expect(parseHighlightHistory('{"shown":{"a":"x","b":2},"retired":[1,"c"]}')).toEqual({
      shown: { b: 2 },
      retired: ["c"],
    });
  });
});

describe("changelog headline compatibility", () => {
  it("falls back to the full sentence when a release predates headlines", () => {
    expect(highlightHeadline({ kind: "added", text: "Full sentence." })).toBe("Full sentence.");
    expect(highlightHeadline({ kind: "added", text: "Full.", headline: "Short" })).toBe("Short");
  });

  it("parses documents with and without headlines", () => {
    const doc = {
      releases: [
        release("1.8.2", [
          { kind: "added", text: "With headline.", headline: "Short" } as never,
          { kind: "fixed", text: "Without headline." },
        ]),
      ],
    };
    const parsed = parseChangelogDocument(doc);
    expect(parsed?.[0]?.changes[0]?.headline).toBe("Short");
    expect(parsed?.[0]?.changes[1]?.headline).toBeUndefined();
  });
});
