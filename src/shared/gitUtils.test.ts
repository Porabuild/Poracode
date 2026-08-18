import { describe, it, expect } from "vitest";
import type { GitBranchInfo } from "./contracts/git";
import { branchNameFromRemoteRef, LOCK_FILES, isLockFile } from "./gitUtils";

function local(name: string): GitBranchInfo {
  return { name, current: false, commit: "abc", isRemote: false };
}

function remote(name: string, remoteName = "origin"): GitBranchInfo {
  return { name, current: false, commit: "def", isRemote: true, remote: remoteName };
}

describe("LOCK_FILES", () => {
  it("contains common lock files", () => {
    expect(LOCK_FILES).toContain("pnpm-lock.yaml");
    expect(LOCK_FILES).toContain("package-lock.json");
    expect(LOCK_FILES).toContain("yarn.lock");
    expect(LOCK_FILES).toContain("Cargo.lock");
    expect(LOCK_FILES).toContain("go.sum");
  });
});

describe("isLockFile", () => {
  it("returns true for a bare lock file name", () => {
    expect(isLockFile("pnpm-lock.yaml")).toBe(true);
  });

  it("returns true for a lock file with a path prefix", () => {
    expect(isLockFile("packages/foo/package-lock.json")).toBe(true);
  });

  it("returns true for windows-style path", () => {
    expect(isLockFile("C:\\project\\yarn.lock")).toBe(true);
  });

  it("returns false for a regular file", () => {
    expect(isLockFile("src/index.ts")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLockFile("")).toBe(false);
  });

  it("returns false for a file that contains lock in the name but is not a lock file", () => {
    expect(isLockFile("lockfile-parser.ts")).toBe(false);
  });

  it("returns true for bun.lockb", () => {
    expect(isLockFile("bun.lockb")).toBe(true);
  });

  it("returns true for Gemfile.lock", () => {
    expect(isLockFile("path/to/Gemfile.lock")).toBe(true);
  });
});

describe("branchNameFromRemoteRef", () => {
  it("parses fully-qualified remote refs without branch metadata", () => {
    expect(branchNameFromRemoteRef("refs/remotes/origin/master")).toBe("master");
    expect(branchNameFromRemoteRef("refs/remotes/upstream/release/x")).toBe("release/x");
  });

  it("uses branch metadata to identify short remote refs", () => {
    expect(branchNameFromRemoteRef("origin/master", [remote("master")])).toBe("master");
    expect(branchNameFromRemoteRef("upstream/release/x", [remote("release/x", "upstream")])).toBe(
      "release/x",
    );
  });

  it("preserves local slash branches and unknown refs", () => {
    expect(branchNameFromRemoteRef("feature/x", [local("feature/x")])).toBe("feature/x");
    expect(branchNameFromRemoteRef("upstream/release/x", [])).toBe("upstream/release/x");
  });

  it("prefers an exact local branch when local and remote names collide", () => {
    const branches = [local("origin/release/x"), remote("release/x")];
    expect(branchNameFromRemoteRef("origin/release/x", branches)).toBe("origin/release/x");
  });
});
