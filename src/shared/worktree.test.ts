import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "./contracts";
import {
  resolveWorktreePlacement,
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
      root: "C:\\src\\repo\\.lightcode\\worktrees",
      omitRepoDir: true,
    });
    expect(resolveWorktreePlacement(settings, undefined, wsl)).toEqual({
      root: "/home/me/repo/.lightcode/worktrees",
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
      root: "/home/me/repo/.lightcode/worktrees",
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
