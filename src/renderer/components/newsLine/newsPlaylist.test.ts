import { describe, expect, it } from "vitest";
import {
  MAX_PLAYLIST_ITEMS,
  PROMOTION_SPACING,
  buildNewsPlaylist,
  seededRandom,
  shuffled,
  type NewsPlaylistEntry,
  type NewsPlaylistSources,
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
  it("leads with a non-promotion, then promotes in the second slot", () => {
    const playlist = buildNewsPlaylist(
      {
        insights: entries("insight", 3),
        changelog: entries("changelog", 3),
        usage: entries("usage", 1),
        tips: entries("tip", 2),
        promotions: entries("promotion", 3),
      },
      seededRandom(1),
    );
    expect(playlist[0]?.kind).not.toBe("promotion");
    expect(playlist[1]?.kind).toBe("promotion");
    // Consecutive non-promotional items still come from different sources.
    const baseKinds = playlist
      .filter((item) => item.kind !== "promotion")
      .slice(0, 4)
      .map((item) => item.kind);
    expect(new Set(baseKinds).size).toBe(baseKinds.length);
  });

  it("keeps promotions spaced after the early one", () => {
    const playlist = buildNewsPlaylist(
      {
        insights: entries("insight", 6),
        changelog: entries("changelog", 6),
        usage: none,
        tips: none,
        promotions: entries("promotion", 3),
      },
      seededRandom(2),
    );
    const promotionIndexes = playlist.flatMap((item, index) =>
      item.kind === "promotion" ? [index] : [],
    );
    expect(promotionIndexes[0]).toBe(1);
    for (const [a, b] of promotionIndexes
      .slice(1)
      .map((index, i) => [promotionIndexes[i]!, index])) {
      expect(b! - a!).toBe(PROMOTION_SPACING + 1);
    }
  });

  it("varies the leading source across visits", () => {
    const sources = {
      insights: entries("insight", 2),
      changelog: entries("changelog", 2),
      usage: none,
      tips: entries("tip", 2),
      promotions: entries("promotion", 1),
    };
    const leadingKinds = new Set(
      Array.from(
        { length: 20 },
        (_, index) => buildNewsPlaylist(sources, seededRandom(index + 1))[0]?.kind,
      ),
    );
    expect(leadingKinds.size).toBeGreaterThan(1);
  });

  it("keeps each source's own priority order", () => {
    const sources: NewsPlaylistSources<NewsPlaylistEntry> = {
      insights: entries("insight", 2),
      changelog: [
        { id: "changelog:newest", kind: "changelog" },
        { id: "changelog:older", kind: "changelog" },
      ],
      announcements: [
        { id: "announcement:weight-5", kind: "announcement" },
        { id: "announcement:weight-1", kind: "announcement" },
      ],
      usage: none,
      tips: entries("tip", 2),
      promotions: none,
    };
    for (let seed = 1; seed <= 20; seed += 1) {
      const playlist = buildNewsPlaylist(sources, seededRandom(seed));
      const idsOf = (kind: NewsPlaylistEntry["kind"]) =>
        playlist.filter((item) => item.kind === kind).map((item) => item.id);
      expect(idsOf("changelog")).toEqual(["changelog:newest", "changelog:older"]);
      expect(idsOf("announcement")).toEqual(["announcement:weight-5", "announcement:weight-1"]);
    }
  });

  it("keeps the rest of the rotation stable when an item is dismissed", () => {
    const sources = {
      insights: entries("insight", 2),
      changelog: entries("changelog", 2),
      usage: none,
      tips: entries("tip", 2),
      promotions: none,
    };
    const full = buildNewsPlaylist(sources, seededRandom(7));
    const trimmed = buildNewsPlaylist({ ...sources, tips: entries("tip", 1) }, seededRandom(7));
    expect(trimmed.map((item) => item.id)).toEqual(
      full.filter((item) => item.id !== "tip:1").map((item) => item.id),
    );
  });

  it("puts a nearly exhausted usage limit first", () => {
    const playlist = buildNewsPlaylist(
      {
        insights: entries("insight", 2),
        changelog: none,
        usage: entries("usage", 1, true),
        tips: none,
        promotions: entries("promotion", 1),
      },
      seededRandom(3),
    );
    expect(playlist[0]?.kind).toBe("usage");
  });

  it("still shows one promotion after a short rotation", () => {
    const playlist = buildNewsPlaylist(
      {
        insights: entries("insight", 1),
        changelog: entries("changelog", 1),
        usage: none,
        tips: none,
        promotions: entries("promotion", 2),
      },
      seededRandom(4),
    );
    expect(playlist).toHaveLength(3);
    expect(playlist[1]?.kind).toBe("promotion");
  });

  it("shows only promotions when there is nothing else", () => {
    const promotions = entries("promotion", 2);
    const playlist = buildNewsPlaylist(
      { insights: none, changelog: none, usage: none, tips: none, promotions },
      seededRandom(5),
    );
    expect(playlist).toHaveLength(2);
    expect(playlist.every((item) => item.kind === "promotion")).toBe(true);
    expect(playlist.map((item) => item.id).toSorted()).toEqual(
      promotions.map((item) => item.id).toSorted(),
    );
  });

  it("caps the rotation length", () => {
    const playlist = buildNewsPlaylist(
      {
        insights: entries("insight", 20),
        changelog: entries("changelog", 20),
        usage: none,
        tips: none,
        promotions: none,
      },
      seededRandom(6),
    );
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
