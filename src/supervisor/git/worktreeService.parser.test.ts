/**
 * Pure-parser tests for the worktree/branch list parsers. These functions
 * interpret raw `git branch --format` and `git worktree list --porcelain`
 * output — a format change in upstream git or a quoting regression would
 * silently truncate or scramble the result handed to the renderer.
 */

import { describe, expect, it } from "vitest";
import {
  buildBranchListArgs,
  parseBranchListOutput,
  parseWorktreeListOutput,
} from "./worktreeService";

describe("buildBranchListArgs", () => {
  it("emits format + sort flags and omits -a when includeRemote=false", () => {
    expect(buildBranchListArgs(false)).toEqual([
      "branch",
      "--format=%(refname)\t%(objectname)\t%(HEAD)",
      "--sort=-HEAD",
    ]);
  });

  it("appends -a when includeRemote=true", () => {
    expect(buildBranchListArgs(true)).toContain("-a");
  });
});

describe("parseBranchListOutput", () => {
  it("returns empty result for empty output", () => {
    expect(parseBranchListOutput("")).toEqual({ current: "", branches: [] });
    expect(parseBranchListOutput("   \n  ")).toEqual({ current: "", branches: [] });
  });

  it("strips refs/heads/ prefix and marks the current branch", () => {
    const output = ["refs/heads/main\tabc123\t*", "refs/heads/feature/x\tdef456\t"].join("\n");

    const result = parseBranchListOutput(output);
    expect(result.current).toBe("main");
    expect(result.branches).toEqual([
      { name: "main", current: true, commit: "abc123", isRemote: false },
      { name: "feature/x", current: false, commit: "def456", isRemote: false },
    ]);
  });

  it("classifies refs/remotes/* as remote branches and records the remote name", () => {
    const output = [
      "refs/remotes/origin/main\tabc123\t",
      "refs/remotes/upstream/release/v2\tdef456\t",
    ].join("\n");

    const result = parseBranchListOutput(output);
    expect(result.branches).toEqual([
      { name: "main", current: false, commit: "abc123", isRemote: true, remote: "origin" },
      {
        name: "release/v2",
        current: false,
        commit: "def456",
        isRemote: true,
        remote: "upstream",
      },
    ]);
  });

  it("skips refs/remotes/<remote>/HEAD pseudorefs", () => {
    const output = [
      "refs/remotes/origin/HEAD\tabc123\t",
      "refs/remotes/origin/main\tabc123\t",
    ].join("\n");

    const result = parseBranchListOutput(output);
    expect(result.branches.map((b) => b.name)).toEqual(["main"]);
  });

  it("tolerates missing commit field", () => {
    const result = parseBranchListOutput("refs/heads/orphan\t\t");
    expect(result.branches[0]).toEqual({
      name: "orphan",
      current: false,
      commit: "",
      isRemote: false,
    });
  });
});

describe("parseWorktreeListOutput", () => {
  it("returns empty list for empty input", () => {
    expect(parseWorktreeListOutput("", "posix")).toEqual({ worktrees: [] });
  });

  it("parses a single worktree block and flags it as isMain", () => {
    const raw = ["worktree /repos/proj", "HEAD abc123", "branch refs/heads/main", ""].join("\n");
    const result = parseWorktreeListOutput(raw, "posix");
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0]).toMatchObject({
      branch: "main",
      commit: "abc123",
      isMain: true,
    });
  });

  it("only flags the first block as isMain in multi-worktree output", () => {
    const raw = [
      "worktree /repos/proj",
      "HEAD aaa",
      "branch refs/heads/main",
      "",
      "worktree /repos/proj-feature",
      "HEAD bbb",
      "branch refs/heads/feature/x",
      "",
      "worktree /repos/proj-detached",
      "HEAD ccc",
      "detached",
    ].join("\n");

    const result = parseWorktreeListOutput(raw, "posix");
    expect(result.worktrees.map((w) => w.isMain)).toEqual([true, false, false]);
    expect(result.worktrees[2]!.branch).toBe(""); // detached HEAD
    expect(result.worktrees[2]!.commit).toBe("ccc");
  });

  it("keeps WSL Linux paths verbatim", () => {
    const raw = ["worktree /home/u/proj", "HEAD aaa", "branch refs/heads/main", ""].join("\n");
    const result = parseWorktreeListOutput(raw, "wsl");
    expect(result.worktrees[0]!.path).toBe("/home/u/proj");
  });

  it("normalizes Windows paths via win32 normalize", () => {
    const raw = ["worktree C:/repos/proj/.", "HEAD aaa", "branch refs/heads/main", ""].join("\n");
    const result = parseWorktreeListOutput(raw, "windows");
    // win32.normalize collapses the trailing `/.`
    expect(result.worktrees[0]!.path).toBe("C:\\repos\\proj");
  });

  it("keeps a non-refs/heads branch ref verbatim", () => {
    const raw = ["worktree /repos/proj", "HEAD aaa", "branch refs/tags/v1.0", ""].join("\n");
    const result = parseWorktreeListOutput(raw, "posix");
    expect(result.worktrees[0]!.branch).toBe("refs/tags/v1.0");
  });

  it("tolerates CRLF line endings (Windows git output)", () => {
    const raw = [
      "worktree C:/repos/proj",
      "HEAD aaa",
      "branch refs/heads/main",
      "",
      "worktree C:/repos/proj-feature",
      "HEAD bbb",
      "branch refs/heads/feature",
      "",
    ].join("\r\n");

    const result = parseWorktreeListOutput(raw, "windows");
    expect(result.worktrees).toHaveLength(2);
  });

  it("ignores a block that has no `worktree` line", () => {
    const raw = [
      "HEAD aaa",
      "branch refs/heads/orphan",
      "",
      "worktree /repos/proj",
      "HEAD bbb",
      "branch refs/heads/main",
    ].join("\n");
    const result = parseWorktreeListOutput(raw, "posix");
    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0]!.branch).toBe("main");
  });
});
