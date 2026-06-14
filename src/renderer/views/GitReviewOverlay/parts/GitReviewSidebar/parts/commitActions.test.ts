import { describe, expect, it } from "vitest";
import { getAvailableCommitActions, resolvePrimaryCommitAction } from "./commitActions";

describe("getAvailableCommitActions", () => {
  it("offers only Commit with no remote", () => {
    expect(getAvailableCommitActions({ hasRemote: false, canCreatePr: false })).toEqual(["commit"]);
  });

  it("adds Commit & Push once a remote exists", () => {
    expect(getAvailableCommitActions({ hasRemote: true, canCreatePr: false })).toEqual([
      "commit",
      "commit-push",
    ]);
  });

  it("adds Commit & Create PR when a PR can be opened", () => {
    expect(getAvailableCommitActions({ hasRemote: true, canCreatePr: true })).toEqual([
      "commit",
      "commit-push",
      "commit-push-pr",
    ]);
  });
});

describe("resolvePrimaryCommitAction", () => {
  it("keeps the sticky default when it's available", () => {
    expect(
      resolvePrimaryCommitAction("commit-push-pr", { hasRemote: true, canCreatePr: true }),
    ).toBe("commit-push-pr");
  });

  it("falls back to Commit & Push when the PR target disappears", () => {
    // Sticky preference is commit-push-pr, but there's no PR target right now —
    // degrade to push without forgetting the user's choice.
    expect(
      resolvePrimaryCommitAction("commit-push-pr", { hasRemote: true, canCreatePr: false }),
    ).toBe("commit-push");
  });

  it("falls back to Commit when there's no remote at all", () => {
    expect(
      resolvePrimaryCommitAction("commit-push", { hasRemote: false, canCreatePr: false }),
    ).toBe("commit");
    expect(
      resolvePrimaryCommitAction("commit-push-pr", { hasRemote: false, canCreatePr: false }),
    ).toBe("commit");
  });

  it("honours a plain Commit preference even when more is available", () => {
    expect(resolvePrimaryCommitAction("commit", { hasRemote: true, canCreatePr: true })).toBe(
      "commit",
    );
  });
});
