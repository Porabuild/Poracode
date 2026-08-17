// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { GitBranchInfo } from "@/shared/contracts";
import {
  isCurrentCheckoutRef,
  localBranchNameFromRef,
  resolveWorktreeOriginRef,
} from "./worktreeBaseRef";

function local(name: string): GitBranchInfo {
  return { name, current: name === "master", commit: "abc", isRemote: false };
}

function remote(name: string, remoteName = "origin"): GitBranchInfo {
  return { name, current: false, commit: "def", isRemote: true, remote: remoteName };
}

describe("localBranchNameFromRef", () => {
  it("strips a known origin prefix even without a branch list", () => {
    expect(localBranchNameFromRef("origin/master")).toBe("master");
    expect(localBranchNameFromRef("origin/feature/x")).toBe("feature/x");
  });

  it("uses the remote field when the listed remote is not origin", () => {
    expect(localBranchNameFromRef("upstream/release", [remote("release", "upstream")])).toBe(
      "release",
    );
  });

  it("leaves a local name unchanged", () => {
    expect(localBranchNameFromRef("master", [local("master")])).toBe("master");
  });
});

describe("resolveWorktreeOriginRef", () => {
  it("keeps an already-qualified remote ref", () => {
    expect(resolveWorktreeOriginRef("origin/master", [local("master"), remote("master")])).toBe(
      "origin/master",
    );
  });

  it("maps a local name to its tracking ref", () => {
    expect(
      resolveWorktreeOriginRef("master", [local("master"), remote("master")], "origin/master"),
    ).toBe("origin/master");
  });

  it("maps a local name to origin even without status.tracking when the remote exists", () => {
    expect(resolveWorktreeOriginRef("feature/x", [local("feature/x"), remote("feature/x")])).toBe(
      "origin/feature/x",
    );
  });

  it("uses tracking when the branch list has not loaded yet", () => {
    expect(resolveWorktreeOriginRef("master", [], "origin/master")).toBe("origin/master");
  });

  it("falls back to the local name when no remote counterpart exists", () => {
    expect(resolveWorktreeOriginRef("wip", [local("wip")])).toBe("wip");
  });

  it("prefers a non-origin remote when that is the only match", () => {
    expect(
      resolveWorktreeOriginRef("release", [local("release"), remote("release", "upstream")]),
    ).toBe("upstream/release");
  });
});

describe("isCurrentCheckoutRef", () => {
  it("matches the local checkout or its tracking ref", () => {
    expect(isCurrentCheckoutRef("master", "master", "origin/master")).toBe(true);
    expect(isCurrentCheckoutRef("origin/master", "master", "origin/master")).toBe(true);
    expect(isCurrentCheckoutRef("develop", "master", "origin/master")).toBe(false);
  });
});
