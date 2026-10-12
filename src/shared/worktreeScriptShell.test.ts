import { describe, expect, it } from "vitest";
import { worktreeScriptShellId } from "./worktreeScriptShell";

describe("worktreeScriptShellId", () => {
  it("matches a windows path to its folded slash form", () => {
    const fromNative = worktreeScriptShellId("project-1", "C:\\Worktrees\\Fix\\", true);
    const fromSlashes = worktreeScriptShellId("project-1", "c:/worktrees/fix", true);
    expect(fromNative).toBe(fromSlashes);
    expect(fromNative.startsWith("shell:worktree-setup:")).toBe(true);
  });

  it("keeps posix paths case-sensitive", () => {
    expect(worktreeScriptShellId("project-1", "/Repo/Fix", false)).not.toBe(
      worktreeScriptShellId("project-1", "/repo/fix", false),
    );
  });
});
