import { describe, expect, it } from "vitest";
import { sanitizeWorktreeBranchName, sanitizeWorktreePathSegment } from "./worktree";

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
