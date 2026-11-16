import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "./contracts";
import {
  resolveWorktreePlacement,
  resolveRegisteredWorktree,
  sanitizeWorktreeBranchName,
  sanitizeWorktreePathSegment,
  type WorktreePlacementSettings,
} from "./worktree";

describe("worktree helpers", () => {
  it("sanitizes branch names into stable directory segments", () => {
    expect(sanitizeWorktreeBranchName("origin/feature/test")).toBe("feature-test");
    expect(sanitizeWorktreeBranchName("feat: windows + wsl")).toBe("feat-windows-wsl");
  });

  it("falls back to a default branch segment when input becomes empty", () => {
    expect(sanitizeWorktreeBranchName("////")).toBe("worktree");
  });

  it("sanitizes arbitrary path segments", () => {
    expect(sanitizeWorktreePathSegment("My Repo")).toBe("My-Repo");
    expect(sanitizeWorktreePathSegment("...repo///name...")).toBe("repo-name");
  });

  it("falls back to a default path segment when input becomes empty", () => {
    expect(sanitizeWorktreePathSegment("   ")).toBe("project");
  });
});

describe("resolveRegisteredWorktree", () => {
  const worktree = { path: "/repo/wt", branch: "new-branch", commit: "abc123", isMain: false };

  it("does not guess between multiple registrations on the saved branch", () => {
    const duplicate = { ...worktree, path: "/repo/another-wt" };
    expect(
      resolveRegisteredWorktree([worktree, duplicate], "/repo/old-wt", worktree.branch, false),
    ).toBeUndefined();
    expect(
      resolveRegisteredWorktree([worktree, duplicate], worktree.path, worktree.branch, false),
    ).toBe(worktree);
  });

  it("follows the path when the old branch is now checked out elsewhere", () => {
    expect(
      resolveRegisteredWorktree(
        [{ ...worktree, path: "/repo/other-wt", branch: "old-branch" }, worktree],
        worktree.path,
        "old-branch",
        false,
      ),
    ).toBe(worktree);
  });

  it("normalizes Windows paths but preserves case-sensitive paths", () => {
    const windows = { ...worktree, path: "C:/Repo/wt" };
    expect(resolveRegisteredWorktree([windows], "c:\\repo\\WT\\", undefined, true)).toBe(windows);
    expect(resolveRegisteredWorktree([worktree], "/repo/WT", undefined, false)).toBeUndefined();
  });

  it("does not follow an ambiguous detached branch or a branch in the main worktree", () => {
    expect(
      resolveRegisteredWorktree(
        [{ ...worktree, branch: "detached" }],
        "/old-wt",
        "detached",
        false,
      ),
    ).toBeUndefined();
    expect(
      resolveRegisteredWorktree([{ ...worktree, isMain: true }], "/old-wt", worktree.branch, false),
    ).toBeUndefined();
  });
});

describe("resolveWorktreePlacement", () => {
  const windows: ProjectLocation = { kind: "windows", path: "C:\\src\\repo" };
  const posix: ProjectLocation = { kind: "posix", path: "/home/me/repo" };
  const wsl: ProjectLocation = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/me/repo",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
  };

  const globalDefault: WorktreePlacementSettings = {
    worktreeStorageMode: "global",
    worktreeBasePath: "",
    wslWorktreeBasePath: "",
  };

  it("uses the built-in default (no root) for global mode with no base", () => {
    expect(resolveWorktreePlacement(globalDefault, undefined, windows)).toEqual({
      omitRepoDir: false,
    });
  });

  it("uses the native custom base for native projects in global mode", () => {
    const settings = { ...globalDefault, worktreeBasePath: "D:\\worktrees" };
    expect(resolveWorktreePlacement(settings, undefined, windows)).toEqual({
      root: "D:\\worktrees",
      omitRepoDir: false,
    });
  });

  it("uses the WSL base only for WSL projects", () => {
    const settings = {
      ...globalDefault,
      worktreeBasePath: "D:\\worktrees",
      wslWorktreeBasePath: "/mnt/wt",
    };
    expect(resolveWorktreePlacement(settings, undefined, wsl)).toEqual({
      root: "/mnt/wt",
      omitRepoDir: false,
    });
    // A native project ignores the WSL base.
    expect(resolveWorktreePlacement(settings, undefined, posix)).toEqual({
      root: "D:\\worktrees",
      omitRepoDir: false,
    });
  });

  it("nests under the project for project-relative global mode", () => {
    const settings: WorktreePlacementSettings = {
      ...globalDefault,
      worktreeStorageMode: "project-relative",
    };
    expect(resolveWorktreePlacement(settings, undefined, windows)).toEqual({
      root: "C:\\src\\repo\\.poracode\\worktrees",
      omitRepoDir: true,
    });
    expect(resolveWorktreePlacement(settings, undefined, wsl)).toEqual({
      root: "/home/me/repo/.poracode/worktrees",
      omitRepoDir: true,
    });
  });

  it("lets a per-project override beat the global setting", () => {
    // Global is project-relative, but the project pins a custom global base.
    const settings: WorktreePlacementSettings = {
      ...globalDefault,
      worktreeStorageMode: "project-relative",
    };
    expect(
      resolveWorktreePlacement(settings, { mode: "global", basePath: "E:\\custom" }, windows),
    ).toEqual({ root: "E:\\custom", omitRepoDir: false });

    // Global is plain, but the project forces project-relative.
    expect(resolveWorktreePlacement(globalDefault, { mode: "project-relative" }, posix)).toEqual({
      root: "/home/me/repo/.poracode/worktrees",
      omitRepoDir: true,
    });
  });

  it("uses the global base when a project pins global mode without a custom base", () => {
    const settings: WorktreePlacementSettings = {
      ...globalDefault,
      worktreeStorageMode: "project-relative",
      worktreeBasePath: "D:\\global-worktrees",
    };
    expect(resolveWorktreePlacement(settings, { mode: "global" }, windows)).toEqual({
      root: "D:\\global-worktrees",
      omitRepoDir: false,
    });
  });
});
