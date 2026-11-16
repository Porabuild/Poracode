import { describe, expect, it } from "vitest";
import {
  fallbackChatLinkLabel,
  resolvedChatLinkLabel,
  shouldResolveChatLinkTitle,
} from "./chatLinkLabel";

describe("fallbackChatLinkLabel", () => {
  it.each([
    ["https://yieldmo.atlassian.net/browse/SIT-2296", "SIT-2296"],
    ["https://github.com/Porabuild/Poracode", "Porabuild/Poracode"],
    ["https://github.com/Porabuild/Poracode/pull/42", "#42 · Porabuild/Poracode"],
    ["https://github.com/Porabuild/Poracode/issues/42", "#42 · Porabuild/Poracode"],
    [
      "https://github.com/Porabuild/Poracode/commit/0123456789abcdef0123456789abcdef01234567",
      "Porabuild/Poracode@0123456",
    ],
    ["https://gitlab.com/group/project/-/merge_requests/42", "!42 · group/project"],
    ["https://linear.app/team/issue/ENG-123/a-ticket-title", "ENG-123"],
    ["https://example.test/docs/getting-started", "Getting started"],
    ["https://example.test/", "example.test"],
  ])("formats %s", (href, expected) => {
    expect(fallbackChatLinkLabel(href)).toBe(expected);
  });
});

describe("resolvedChatLinkLabel", () => {
  it("puts a GitHub PR number before its cleaned page title", () => {
    expect(
      resolvedChatLinkLabel(
        "Add beautiful link previews by dev · Pull Request #42 · Porabuild/Poracode",
        "https://github.com/Porabuild/Poracode/pull/42",
      ),
    ).toBe("#42 · Add beautiful link previews");
  });

  it("puts a GitHub issue number before its cleaned page title", () => {
    expect(
      resolvedChatLinkLabel(
        "Improve chat links · Issue #43 · Porabuild/Poracode",
        "https://github.com/Porabuild/Poracode/issues/43",
      ),
    ).toBe("#43 · Improve chat links");
  });

  it.each([
    [
      "only the trailing PR author",
      "fix: sort threads by date by dev · Pull Request #44 · Porabuild/Poracode",
      "https://github.com/Porabuild/Poracode/pull/44",
      "#44 · fix: sort threads by date",
    ],
    [
      "nothing from an issue title that ends in a by-phrase",
      "Crash when sorting by date · Issue #45 · Porabuild/Poracode",
      "https://github.com/Porabuild/Poracode/issues/45",
      "#45 · Crash when sorting by date",
    ],
    [
      "the pull request suffix of an issue URL that redirected to a PR",
      "Assess client coverage by dev · Pull Request #46 · Porabuild/Poracode",
      "https://github.com/Porabuild/Poracode/issues/46",
      "#46 · Assess client coverage",
    ],
    [
      "a canonical repository name that differs from the URL",
      "Reduce release staging time by dev · Pull Request #47 · Porabuild/Poracode",
      "https://github.com/porabuild/poracode/pull/47",
      "#47 · Reduce release staging time",
    ],
    [
      "a renamed repository",
      "Plan custom element attributes · Issue #48 · react/react",
      "https://github.com/facebook/react/issues/48",
      "#48 · Plan custom element attributes",
    ],
    [
      "the document title site suffix",
      "Improve chat links · Issue #49 · Porabuild/Poracode · GitHub",
      "https://github.com/Porabuild/Poracode/issues/49",
      "#49 · Improve chat links",
    ],
  ])("strips %s from a GitHub title", (_case, title, href, expected) => {
    expect(resolvedChatLinkLabel(title, href)).toBe(expected);
  });

  it("uses other informative page titles unchanged", () => {
    expect(resolvedChatLinkLabel("Poracode documentation", "https://example.test/docs")).toBe(
      "Poracode documentation",
    );
  });

  it("falls back when the page title is missing or too generic", () => {
    expect(resolvedChatLinkLabel(null, "https://yieldmo.atlassian.net/browse/SIT-2296")).toBe(
      "SIT-2296",
    );
    expect(resolvedChatLinkLabel("Jira", "https://yieldmo.atlassian.net/browse/SIT-2296")).toBe(
      "SIT-2296",
    );
  });
});

describe("shouldResolveChatLinkTitle", () => {
  const pr = "https://github.com/Porabuild/Poracode/pull/42";

  it.each([
    [` ${pr} `, pr],
    ["#42", pr],
    ["PR #42", pr],
    ["pr#42", pr],
    ["Pull request #42", pr],
    ["Issue #42", "https://github.com/Porabuild/Poracode/issues/42"],
    ["Poracode#42", pr],
    ["porabuild/poracode#42", pr],
    ["prettier#42", "https://github.com/prettier/prettier/pull/42"],
    ["prisma/prisma#42", "https://github.com/prisma/prisma/issues/42"],
    ["PR prisma/prisma#42", "https://github.com/prisma/prisma/pull/42"],
  ])("resolves the title for the bare reference %j", (label, href) => {
    expect(shouldResolveChatLinkTitle(label, href)).toBe(true);
  });

  it.each([
    ["Documentation", pr],
    ["#43", pr],
    ["the fix in #42", pr],
    ["other/repo#42", pr],
    ["#42", "https://example.test/pull/42"],
    ["SIT-2296", "https://yieldmo.atlassian.net/browse/SIT-2296"],
  ])("keeps the author's label %j", (label, href) => {
    expect(shouldResolveChatLinkTitle(label, href)).toBe(false);
  });
});
