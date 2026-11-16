import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISCOVERABLE_FEATURE_IDS } from "./featureDiscovery";
import { isAllowedNewsUrl, parseNewsFeed, selectNewsFeedItems } from "./newsFeed";
const fixture = JSON.parse(
  readFileSync("protocol/remote/v3/fixtures/client-news-feed.json", "utf8"),
);
describe("native public news feed vectors", () => {
  it("keeps envelope, individual-item rejection and duplicate policy aligned", () => {
    expect(fixture.knownFeatures).toEqual(DISCOVERABLE_FEATURE_IDS);
    expect(parseNewsFeed(JSON.parse(fixture.rawDocument))?.items.map((i) => i.id)).toEqual(
      fixture.expectedIDs,
    );
    for (const raw of fixture.unusableDocuments) expect(parseNewsFeed(JSON.parse(raw))).toBeNull();
  });
  it("keeps date, version, platform, locale and feature conditions aligned", () => {
    const feed = parseNewsFeed(JSON.parse(fixture.rawDocument));
    for (const sample of fixture.selections) {
      const { context } = sample;
      expect(
        selectNewsFeedItems(feed, {
          now: context.now,
          appVersion: context.version,
          platform: context.platform,
          locale: context.locale,
          isFeatureUsed: (id) => context.used[id],
        }),
      ).toEqual(sample.expected);
    }
  });
  it("keeps external actions on the shared HTTPS allowlist", () => {
    for (const sample of fixture.urls) expect(isAllowedNewsUrl(sample.url)).toBe(sample.allowed);
  });
});
