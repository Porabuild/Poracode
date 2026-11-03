import { describe, expect, it } from "vitest";
import {
  MAX_PLAYLIST_ITEMS,
  PROMOTION_SPACING,
  buildNewsPlaylist,
  seededRandom,
  shuffled,
  type NewsPlaylistEntry,
} from "./newsPlaylist";

function entries(
  kind: NewsPlaylistEntry["kind"],
  count: number,
  urgent = false,
): NewsPlaylistEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${kind}:${index}`,
    kind,
    ...(urgent ? { urgent } : {}),
  }));
}

const none: NewsPlaylistEntry[] = [];

describe("buildNewsPlaylist", () => {
  it("alternates sources and places promotions in the middle, never first", () => {
    const playlist = buildNewsPlaylist({
      insights: entries("insight", 3),
      changelog: entries("changelog", 3),
      usage: entries("usage", 1),
      tips: entries("tip", 2),
      promotions: entries("promotion", 3),
    });
    expect(playlist[0]?.kind).toBe("insight");
    expect(playlist.slice(0, 4).map((item) => item.kind)).toEqual([
      "insight",
      "changelog",
      "tip",
      "usage",
    ]);
    const promotionIndexes = playlist.flatMap((item, index) =>
      item.kind === "promotion" ? [index] : [],
    );
    expect(promotionIndexes[0]).toBe(PROMOTION_SPACING);
    for (const [a, b] of promotionIndexes
      .slice(1)
      .map((index, i) => [promotionIndexes[i]!, index])) {
      expect(b! - a!).toBe(PROMOTION_SPACING + 1);
    }
  });

  it("puts a nearly exhausted usage limit first", () => {
    const playlist = buildNewsPlaylist({
      insights: entries("insight", 2),
      changelog: none,
      usage: entries("usage", 1, true),
      tips: none,
      promotions: entries("promotion", 1),
    });
    expect(playlist[0]?.kind).toBe("usage");
  });

  it("still shows one promotion after a short rotation", () => {
    const playlist = buildNewsPlaylist({
      insights: entries("insight", 1),
      changelog: entries("changelog", 1),
      usage: none,
      tips: none,
      promotions: entries("promotion", 2),
    });
    expect(playlist.map((item) => item.kind)).toEqual(["insight", "changelog", "promotion"]);
  });

  it("shows only promotions when there is nothing else", () => {
    const promotions = entries("promotion", 2);
    expect(
      buildNewsPlaylist({ insights: none, changelog: none, usage: none, tips: none, promotions }),
    ).toEqual(promotions);
  });

  it("caps the rotation length", () => {
    const playlist = buildNewsPlaylist({
      insights: entries("insight", 20),
      changelog: entries("changelog", 20),
      usage: none,
      tips: none,
      promotions: none,
    });
    expect(playlist).toHaveLength(MAX_PLAYLIST_ITEMS);
  });
});

describe("seeded shuffling", () => {
  it("is stable for one seed and varies across seeds", () => {
    const items = Array.from({ length: 8 }, (_, index) => index);
    expect(shuffled(items, seededRandom(42))).toEqual(shuffled(items, seededRandom(42)));
    expect(shuffled(items, seededRandom(42))).not.toEqual(shuffled(items, seededRandom(7)));
    expect(shuffled(items, seededRandom(42)).toSorted((a, b) => a - b)).toEqual(items);
  });
});
