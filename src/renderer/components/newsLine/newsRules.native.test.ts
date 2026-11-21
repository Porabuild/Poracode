import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profileCoreStatsSchema } from "@/shared/contracts/profileResults";
import { changelogHighlightPool, pickChangelogHighlights } from "@/shared/changelogHighlights";
import { buildInsightFacts } from "./newsFacts";
import { buildNewsPlaylist, seededRandom, shuffled } from "./newsPlaylist";

const fixture = JSON.parse(
  readFileSync("protocol/remote/v3/fixtures/client-news-rules.json", "utf8"),
);

describe("native news rules share PWA vectors", () => {
  it("pins personal thresholds, rounding and week ordering to validated profile stats", () => {
    for (const sample of fixture.stats) {
      profileCoreStatsSchema.parse(sample.input);
      expect(buildInsightFacts(sample.input)).toEqual(sample.expected);
    }
  });
  it("pins random draws and shuffled visits", () => {
    for (const sample of fixture.randomCases) {
      const random = seededRandom(sample.seed);
      expect(sample.values.map(() => random())).toEqual(sample.values);
      expect(shuffled(["a", "b", "c", "d", "e"], seededRandom(sample.seed))).toEqual(
        sample.shuffled,
      );
    }
  });
  it("pins source ranking, urgent limits and infrequent promotions", () => {
    for (const sample of fixture.playlists) {
      expect(
        buildNewsPlaylist(sample.sources, seededRandom(sample.seed)).map((entry) => entry.id),
      ).toEqual(sample.expected);
    }
  });
  it("pins unicode highlight identity, priority and retirement", () => {
    const sample = fixture.highlights;
    const pool = changelogHighlightPool(sample.releases, sample.currentVersion);
    expect(pool).toEqual(sample.expectedPool);
    for (const pick of sample.cases) {
      expect(
        pickChangelogHighlights(pool, pick.history, 3, seededRandom(pick.seed)).map(
          (item) => item.id,
        ),
      ).toEqual(pick.expected);
    }
  });
});
