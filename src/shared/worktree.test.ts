import { describe, expect, it } from "vitest";
import { parseSshProjectSpec } from "./ssh";
import {
  buildWorktreeLocation,
  sanitizeWorktreeBranchName,
  sanitizeWorktreePathSegment,
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

  it("builds SSH worktree locations on the same host", () => {
    expect(
      buildWorktreeLocation(
        { kind: "ssh", host: "devbox", path: "/home/demo/repo" },
        "/home/demo/.lightcode/worktrees/repo/feature",
      ),
    ).toEqual({
      kind: "ssh",
      host: "devbox",
      path: "/home/demo/.lightcode/worktrees/repo/feature",
    });
  });
});

describe("SSH project specs", () => {
  it("parses host:path and ssh URLs", () => {
    expect(parseSshProjectSpec("devbox:/srv/app")).toEqual({
      kind: "ssh",
      host: "devbox",
      path: "/srv/app",
    });
    expect(parseSshProjectSpec("ssh://demo@example.com/home/demo/app/")).toEqual({
      kind: "ssh",
      host: "demo@example.com",
      path: "/home/demo/app",
    });
  });

  it("rejects unsafe hosts and relative paths", () => {
    expect(parseSshProjectSpec("-oProxyCommand=bad:/srv/app")).toBeNull();
    expect(parseSshProjectSpec("devbox:relative/path")).toBeNull();
  });
});
