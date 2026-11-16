import { describe, expect, it } from "vitest";
import {
  MAX_PLAYLIST_ITEMS,
  NEWS_BATCH_SIZE,
  PROMOTION_SPACING,
  buildNewsPlaylist,
  createInitialNewsStream,
  seededRandom,
  shuffled,
  syncNewsStream,
  targetNewsCountForIndex,
  type NewsPlaylistEntry,
  type NewsPlaylistSources,
  type NewsResolvedSlot,
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

describe("syncNewsStream (infinite 5-by-5 batching)", () => {
  it("starts with 5 items and prepares 5 more when reaching item 4 of each batch", () => {
    expect(targetNewsCountForIndex(0)).toBe(NEWS_BATCH_SIZE);
    expect(targetNewsCountForIndex(2)).toBe(NEWS_BATCH_SIZE);
    expect(targetNewsCountForIndex(3)).toBe(NEWS_BATCH_SIZE * 2);
    expect(targetNewsCountForIndex(4)).toBe(NEWS_BATCH_SIZE * 2);
    expect(targetNewsCountForIndex(8)).toBe(NEWS_BATCH_SIZE * 3);

    const sources: NewsPlaylistSources<NewsPlaylistEntry> = {
      insights: Array.from({ length: 8 }, (_, i) => ({
        id: `insight:${i}`,
        kind: "insight",
        category: `cat-${i % 3}`,
        subject: `subj-${i}`,
      })),
      changelog: entries("changelog", 4),
      discovery: entries("discovery", 4),
      usage: [],
      tips: entries("tip", 3),
      promotions: entries("promotion", 2),
    };

    const initial = syncNewsStream(createInitialNewsStream(11), sources, {
      targetCount: targetNewsCountForIndex(0),
      viewedThroughIndex: 0,
    });
    expect(initial.items).toHaveLength(5);
    expect(initial.items[1]?.kind).toBe("promotion");

    // Reaching item 4 (index 3) prepares 5 more items (10 total) while preserving batch 1.
    const second = syncNewsStream(initial.stream, sources, {
      targetCount: targetNewsCountForIndex(3),
      viewedThroughIndex: 3,
    });
    expect(second.items).toHaveLength(10);
    expect(second.entries.slice(0, 5).map((e) => e.slotKey)).toEqual(
      initial.entries.slice(0, 5).map((e) => e.slotKey),
    );

    // Reaching item 9 (index 8) prepares 5 more items (15 total).
    const third = syncNewsStream(second.stream, sources, {
      targetCount: targetNewsCountForIndex(8),
      viewedThroughIndex: 8,
    });
    expect(third.items).toHaveLength(15);

    // Every batch of 5 avoids duplicating non-promotional items while unseen ones remain.
    const batch0NonPromo = third.items
      .slice(0, 5)
      .filter((i) => i.kind !== "promotion")
      .map((i) => i.id);
    const batch1NonPromo = third.items
      .slice(5, 10)
      .filter((i) => i.kind !== "promotion")
      .map((i) => i.id);
    expect(new Set([...batch0NonPromo, ...batch1NonPromo]).size).toBe(
      batch0NonPromo.length + batch1NonPromo.length,
    );

    // Promotions repeat across batches with distinct slotKeys.
    const promoSlots = third.entries.filter((e) => e.item.kind === "promotion");
    expect(promoSlots.length).toBeGreaterThanOrEqual(3);
    expect(new Set(promoSlots.map((s) => s.slotKey)).size).toBe(promoSlots.length);
  });

  it("keeps repeating promotions infinitely even after all promotions have been shown", () => {
    const sources: NewsPlaylistSources<NewsPlaylistEntry> = {
      insights: entries("insight", 10),
      changelog: entries("changelog", 5),
      usage: [],
      tips: entries("tip", 5),
      promotions: [{ id: "promotion:only-one", kind: "promotion" }],
    };

    let state = createInitialNewsStream(42);
    let lastEntries: NewsResolvedSlot<NewsPlaylistEntry>[] = [];
    for (const idx of [0, 3, 8, 13, 18, 23]) {
      const res = syncNewsStream(state, sources, {
        targetCount: targetNewsCountForIndex(idx),
        viewedThroughIndex: idx,
      });
      state = res.stream;
      lastEntries = res.entries;
    }

    expect(lastEntries).toHaveLength(30);
    // Even with a single active promotion, it repeats across batches (one per 5-item batch).
    const promoCount = lastEntries.filter((e) => e.item.kind === "promotion").length;
    expect(promoCount).toBeGreaterThanOrEqual(5);
    expect(new Set(lastEntries.map((e) => e.slotKey)).size).toBe(30);
  });
});
