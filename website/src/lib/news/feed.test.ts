import { describe, expect, it } from "vitest";
import { parseNewsFeed } from "../../../../src/shared/newsFeed";
import handWritten from "./items.json";
import { buildNewsFeed, goodFirstIssuesItem, starMilestoneItem } from "./feed";

const now = new Date("2026-11-10T12:00:00Z");

describe("website news feed", () => {
  it("publishes only items the app accepts", () => {
    const document = buildNewsFeed({ stars: 1_050, goodFirstIssues: 12 }, now);
    const parsed = parseNewsFeed(document);
    expect(parsed).not.toBeNull();
    // Every hand-written and derived item must survive the app's validator.
    expect(parsed?.items).toHaveLength(document.items.length);
    expect(parsed?.items.length).toBe((handWritten.items as unknown[]).length + 2);
  });

  it("celebrates a star milestone only shortly after passing it", () => {
    expect(starMilestoneItem(1_050)).toMatchObject({
      id: "github-stars-1000",
      template: { name: "github-stars-milestone", count: 1_000 },
    });
    expect(starMilestoneItem(1_200)).toBeNull();
    expect(starMilestoneItem(80)).toBeNull();
    expect(starMilestoneItem(null)).toBeNull();
  });

  it("mentions good first issues with a monthly id so they return after closing", () => {
    expect(goodFirstIssuesItem(3, now)).toMatchObject({
      id: "good-first-issues-2026-11",
      template: { name: "good-first-issues", count: 3 },
    });
    expect(goodFirstIssuesItem(0, now)).toBeNull();
    expect(goodFirstIssuesItem(null, now)).toBeNull();
  });

  it("still serves hand-written items when GitHub is unavailable", () => {
    const document = buildNewsFeed({ stars: null, goodFirstIssues: null }, now);
    expect(document.items).toHaveLength((handWritten.items as unknown[]).length);
    expect(document.version).toBe(1);
  });
});
