import { describe, expect, it } from "vitest";
import {
  NEWS_FEED_VERSION,
  isAllowedNewsUrl,
  parseNewsFeed,
  pickLocalized,
  selectNewsFeedItems,
  type NewsFeedContext,
} from "./newsFeed";

const context: NewsFeedContext = {
  now: Date.parse("2026-11-10T12:00:00Z"),
  appVersion: "1.8.2",
  platform: "win32",
  locale: "de",
  isFeatureUsed: () => false,
};

function feed(items: unknown[], extra: Record<string, unknown> = {}) {
  return { version: NEWS_FEED_VERSION, items, ...extra };
}

const valid = {
  id: "wsl-guide",
  kind: "announcement",
  text: { en: "New guide: run agents in WSL", de: "Neuer Leitfaden: Agenten in WSL" },
  action: { type: "url", url: "https://poracode.com/docs/wsl", label: { en: "Read" } },
};

describe("parseNewsFeed", () => {
  it("drops invalid items one by one and keeps the rest", () => {
    const parsed = parseNewsFeed(
      feed([
        valid,
        { ...valid, id: "Bad Id" },
        { ...valid, id: "no-english", text: { de: "Nur Deutsch" } },
        { ...valid, id: "too-long", text: { en: "x".repeat(141) } },
        { ...valid, id: "both", template: { name: "good-first-issues", count: 3 } },
        { ...valid, id: "future-kind", kind: "poll" },
        {
          ...valid,
          id: "unknown-template",
          text: undefined,
          template: { name: "weather", count: 1 },
        },
        { ...valid, id: "evil-link", action: { type: "url", url: "https://evil.example/x" } },
        { ...valid, id: "script", action: { type: "url", url: "javascript:alert(1)" } },
        { ...valid, id: "unknown-feature", action: { type: "feature", feature: "teleport" } },
        valid,
      ]),
    );
    expect(parsed?.items.map((item) => item.id)).toEqual(["wsl-guide"]);
  });

  it("refuses a feed from a future format version instead of guessing", () => {
    expect(parseNewsFeed(feed([valid], { version: NEWS_FEED_VERSION + 1 }))).toBeNull();
    expect(parseNewsFeed({ items: [valid] })).toBeNull();
  });

  it("keeps unknown fields harmless so newer feeds still parse", () => {
    const parsed = parseNewsFeed(feed([{ ...valid, audience: "beta" }], { campaign: "fall" }));
    expect(parsed?.items).toHaveLength(1);
  });

  it("strips control characters and collapses whitespace in text", () => {
    const parsed = parseNewsFeed(feed([{ ...valid, text: { en: "Line\u0000 one\n\n two" } }]));
    expect(parsed?.items[0]?.text?.en).toBe("Line one two");
  });
});

describe("isAllowedNewsUrl", () => {
  it("allows HTTPS links to Poracode, X, and the Porabuild GitHub org only", () => {
    expect(isAllowedNewsUrl("https://poracode.com/changelog")).toBe(true);
    expect(isAllowedNewsUrl("https://x.com/poracode")).toBe(true);
    expect(isAllowedNewsUrl("https://github.com/Porabuild/Poracode/issues")).toBe(true);
    expect(isAllowedNewsUrl("https://github.com/someone-else/repo")).toBe(false);
    expect(isAllowedNewsUrl("http://poracode.com/")).toBe(false);
    expect(isAllowedNewsUrl("https://user:pass@poracode.com/")).toBe(false);
    expect(isAllowedNewsUrl("https://poracode.com.evil.example/")).toBe(false);
  });
});

describe("selectNewsFeedItems", () => {
  const parse = (items: unknown[], extra?: Record<string, unknown>) =>
    parseNewsFeed(feed(items, extra));

  it("shows nothing while the feed is paused", () => {
    expect(selectNewsFeedItems(parse([valid], { paused: true }), context)).toEqual([]);
  });

  it("respects dates, app versions, and platforms", () => {
    const selected = selectNewsFeedItems(
      parse([
        { ...valid, id: "not-yet", start: "2026-11-11" },
        { ...valid, id: "expired", end: "2026-11-01" },
        { ...valid, id: "needs-newer", minAppVersion: "1.9.0" },
        { ...valid, id: "too-new", maxAppVersion: "1.8.1" },
        { ...valid, id: "mac-only", platforms: ["darwin"] },
        { ...valid, id: "live", start: "2026-11-01", end: "2026-11-30", platforms: ["win32"] },
      ]),
      context,
    );
    expect(selected.map((item) => item.id)).toEqual(["live"]);
  });

  it("targets features by use and fails closed for unknown features", () => {
    const used = new Set(["crews"]);
    const selected = selectNewsFeedItems(
      parse([
        { ...valid, id: "try-crews", unlessUsed: ["crews"] },
        { ...valid, id: "crew-tips", onlyIfUsed: ["crews"] },
        { ...valid, id: "try-schedules", unlessUsed: ["schedules"] },
        { ...valid, id: "unknown", unlessUsed: ["teleport"] },
      ]),
      { ...context, isFeatureUsed: (id) => used.has(id) },
    );
    expect(selected.map((item) => item.id)).toEqual(["crew-tips", "try-schedules"]);
  });

  it("resolves the user's language and orders by weight", () => {
    const selected = selectNewsFeedItems(
      parse([
        { ...valid, id: "low" },
        { ...valid, id: "high", weight: 3, text: { en: "Hello", "pt-br": "Olá" } },
      ]),
      { ...context, locale: "pt-BR" },
    );
    expect(selected.map((item) => item.id)).toEqual(["high", "low"]);
    expect(selected[0]?.content).toEqual({ text: "Olá" });
    expect(selected[1]?.content).toEqual({ text: "New guide: run agents in WSL" });
    expect(selected[1]?.actionLabel).toBe("Read");
  });
});

describe("pickLocalized", () => {
  it("falls back from region to language to English", () => {
    const map = { en: "Hi", de: "Hallo", "zh-cn": "你好" };
    expect(pickLocalized(map, "de-AT")).toBe("Hallo");
    expect(pickLocalized(map, "zh-CN")).toBe("你好");
    expect(pickLocalized(map, "fr")).toBe("Hi");
  });
});
