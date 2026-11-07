import { describe, expect, it } from "vitest";
import { fallbackChatLinkLabel, resolvedChatLinkLabel } from "./chatLinkLabel";

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
