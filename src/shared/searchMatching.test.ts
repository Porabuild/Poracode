import { describe, expect, it } from "vitest";
import { createSearchQuery, getSearchMatchRanges, scoreSearchFields } from "./searchMatching";

describe("search matching", () => {
  it("ranks exact names ahead of prefixes, literal substrings, metadata, and abbreviations", () => {
    const query = createSearchQuery("theme");
    const scores = [
      scoreSearchFields([{ text: "Theme", fuzzy: true }], query),
      scoreSearchFields([{ text: "Theme mode", fuzzy: true }], query),
      scoreSearchFields([{ text: "Change theme", fuzzy: true }], query),
      scoreSearchFields([{ text: "Appearance" }, { text: "theme", weight: 0.4 }], query),
      scoreSearchFields([{ text: "The home editor", fuzzy: true }], query),
    ];
    expect(scores.every((score) => score !== null)).toBe(true);
    expect(scores).toEqual([...scores].sort((a, b) => b! - a!));
    expect(new Set(scores).size).toBe(scores.length);
  });

  it("requires every term while allowing reordered words across name and path", () => {
    const fields = [
      { text: "CommandPalette.tsx", fuzzy: true },
      { text: "src/renderer/commands", weight: 0.4 },
    ];
    expect(scoreSearchFields(fields, createSearchQuery("renderer palette"))).not.toBeNull();
    expect(scoreSearchFields(fields, createSearchQuery("palette nonexistent"))).toBeNull();
  });

  it("supports ordered abbreviations on names, without fuzzy matching descriptions", () => {
    expect(
      scoreSearchFields([{ text: "CommandPalette.tsx", fuzzy: true }], createSearchQuery("cmdplt")),
    ).not.toBeNull();
    expect(
      scoreSearchFields([{ text: "CommandPalette.tsx" }], createSearchQuery("cmdplt")),
    ).toBeNull();
    expect(
      scoreSearchFields([{ text: "CommandPalette.tsx", fuzzy: true }], createSearchQuery("pltcmd")),
    ).toBeNull();
  });

  it("matches case and accents and preserves original display offsets", () => {
    const query = createSearchQuery("cafe");
    expect(scoreSearchFields([{ text: "CAFÉ" }], query)).not.toBeNull();
    const text = "🧭 Café settings";
    expect(getSearchMatchRanges(text, query)).toEqual([{ start: 3, end: 7 }]);
    expect(text.slice(3, 7)).toBe("Café");
  });

  it("merges overlapping highlights and exposes abbreviation positions", () => {
    expect(getSearchMatchRanges("CommandPalette", createSearchQuery("command mand"))).toEqual([
      { start: 0, end: 7 },
    ]);
    expect(getSearchMatchRanges("CommandPalette", createSearchQuery("cp"))).toEqual([
      { start: 0, end: 1 },
      { start: 7, end: 8 },
    ]);
  });

  it("treats empty searches as unfiltered and does not highlight them", () => {
    const query = createSearchQuery("  ");
    expect(scoreSearchFields([{ text: "Any name" }], query)).toBe(0);
    expect(getSearchMatchRanges("Any name", query)).toEqual([]);
  });
});
