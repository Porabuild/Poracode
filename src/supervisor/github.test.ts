import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileAsyncMock = vi.hoisted(() => vi.fn());
const buildAgentCommandMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const unlinkMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => {
  const { promisify } = require("node:util") as typeof import("node:util");
  const mockExecFile = (...args: unknown[]) => {
    // promisify wraps execFile; intercept the promisified version
    const cb = args[args.length - 1];
    if (typeof cb === "function") {
      return execFileAsyncMock(...args);
    }
    return execFileAsyncMock(...args);
  };
  // Make promisify(execFile) resolve to our mock
  return {
    execFile: Object.assign(mockExecFile, {
      [promisify.custom]: execFileAsyncMock,
    }),
  };
});

vi.mock("node:fs/promises", () => ({
  writeFile: writeFileMock,
  unlink: unlinkMock,
}));

vi.mock("./agents/base", () => ({
  buildAgentCommand: buildAgentCommandMock,
}));

import { GitHubService } from "./github";

const location = { kind: "windows" as const, path: "C:\\Users\\demo\\repo" };

describe("GitHubService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildAgentCommandMock.mockImplementation((_loc, command, args) => ({
      command,
      args,
    }));
    writeFileMock.mockResolvedValue(undefined);
    unlinkMock.mockResolvedValue(undefined);
  });

  describe("checkGhAvailable", () => {
    it("returns available true when gh --version succeeds", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "gh version 2.50.0\n" });

      const result = await new GitHubService().checkGhAvailable(location);

      expect(result).toEqual({ available: true });
      expect(buildAgentCommandMock).toHaveBeenCalledWith(location, "gh", ["--version"]);
    });

    it("returns available false when gh is not found", async () => {
      execFileAsyncMock.mockRejectedValue(new Error("ENOENT"));

      const result = await new GitHubService().checkGhAvailable(location);

      expect(result).toEqual({ available: false });
    });
  });

  describe("getPrForBranch", () => {
    it("returns PR data when a matching PR exists", async () => {
      const prJson = JSON.stringify([
        {
          number: 42,
          url: "https://github.com/owner/repo/pull/42",
          state: "OPEN",
          title: "Add feature",
          baseRefName: "main",
          isDraft: false,
          reviewDecision: "APPROVED",
          updatedAt: "2026-04-03T10:00:00Z",
        },
      ]);
      execFileAsyncMock.mockResolvedValue({ stdout: prJson });

      const result = await new GitHubService().getPrForBranch(location, "feature/x");

      expect(result).toEqual({
        number: 42,
        state: "open",
        title: "Add feature",
        url: "https://github.com/owner/repo/pull/42",
        baseBranch: "main",
        isDraft: false,
        reviewDecision: "APPROVED",
        updatedAt: "2026-04-03T10:00:00Z",
      });
    });

    it("returns null when no PRs match", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "[]" });

      const result = await new GitHubService().getPrForBranch(location, "feature/x");

      expect(result).toBeNull();
    });

    it("maps draft PRs to draft state", async () => {
      const prJson = JSON.stringify([
        {
          number: 43,
          url: "https://github.com/owner/repo/pull/43",
          state: "OPEN",
          title: "WIP",
          baseRefName: "main",
          isDraft: true,
          updatedAt: "2026-04-03T10:00:00Z",
        },
      ]);
      execFileAsyncMock.mockResolvedValue({ stdout: prJson });

      const result = await new GitHubService().getPrForBranch(location, "feature/wip");

      expect(result?.state).toBe("draft");
      expect(result?.isDraft).toBe(true);
    });

    it("maps merged PRs to merged state", async () => {
      const prJson = JSON.stringify([
        {
          number: 44,
          url: "https://github.com/owner/repo/pull/44",
          state: "MERGED",
          title: "Done",
          baseRefName: "main",
          isDraft: false,
          updatedAt: "2026-04-03T10:00:00Z",
        },
      ]);
      execFileAsyncMock.mockResolvedValue({ stdout: prJson });

      const result = await new GitHubService().getPrForBranch(location, "feature/done");

      expect(result?.state).toBe("merged");
    });

    it("throws a classified error on auth failure", async () => {
      execFileAsyncMock.mockRejectedValue(new Error("not logged in to any GitHub hosts"));

      await expect(new GitHubService().getPrForBranch(location, "feature/x")).rejects.toThrow(
        "GitHub CLI is not authenticated",
      );
    });

    it("throws a classified error when gh is not installed", async () => {
      execFileAsyncMock.mockRejectedValue(new Error("ENOENT: command not found"));

      await expect(new GitHubService().getPrForBranch(location, "feature/x")).rejects.toThrow(
        "GitHub CLI (gh) is not installed",
      );
    });
  });

  describe("createPr", () => {
    it("creates a PR using body-file and returns data", async () => {
      const prJson = JSON.stringify({
        number: 50,
        url: "https://github.com/owner/repo/pull/50",
        state: "OPEN",
        title: "My PR",
        baseRefName: "main",
        isDraft: false,
        updatedAt: "2026-04-03T10:00:00Z",
      });
      execFileAsyncMock.mockResolvedValue({ stdout: prJson });

      const result = await new GitHubService().createPr(
        location,
        "feature/x",
        "main",
        "My PR",
        "Some description",
        false,
      );

      expect(result.number).toBe(50);
      expect(result.state).toBe("open");
      expect(writeFileMock).toHaveBeenCalledTimes(1);
      expect(unlinkMock).toHaveBeenCalledTimes(1);
      // Verify buildAgentCommand was called with pr create args
      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toContain("pr");
      expect(ghArgs).toContain("create");
      expect(ghArgs).toContain("--body-file");
    });

    it("includes --draft flag when isDraft is true", async () => {
      execFileAsyncMock.mockResolvedValue({
        stdout: JSON.stringify({
          number: 51,
          url: "https://github.com/owner/repo/pull/51",
          state: "OPEN",
          title: "Draft PR",
          baseRefName: "main",
          isDraft: true,
          updatedAt: "2026-04-03T10:00:00Z",
        }),
      });

      await new GitHubService().createPr(location, "feature/x", "main", "Draft PR", "", true);

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toContain("--draft");
    });

    it("cleans up body file even on failure", async () => {
      execFileAsyncMock.mockRejectedValue(new Error("gh pr create failed: some error"));

      await expect(
        new GitHubService().createPr(location, "feature/x", "main", "PR", "", false),
      ).rejects.toThrow("gh pr create failed");

      expect(unlinkMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("mergePr", () => {
    it("merges with the specified method and deletes branch", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "" });

      await new GitHubService().mergePr(location, 42, "squash");

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toContain("pr");
      expect(ghArgs).toContain("merge");
      expect(ghArgs).toContain("42");
      expect(ghArgs).toContain("--squash");
      expect(ghArgs).toContain("--delete-branch");
    });
  });

  describe("closePr", () => {
    it("closes the specified PR", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "" });

      await new GitHubService().closePr(location, 42);

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toEqual(["pr", "close", "42"]);
    });
  });

  describe("reopenPr", () => {
    it("reopens the specified PR", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "" });

      await new GitHubService().reopenPr(location, 42);

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toEqual(["pr", "reopen", "42"]);
    });
  });

  describe("getPrChecks", () => {
    it("returns parsed check results", async () => {
      const checksJson = JSON.stringify([
        { name: "CI", state: "completed", conclusion: "success" },
        { name: "Lint", state: "completed", conclusion: "failure" },
      ]);
      execFileAsyncMock.mockResolvedValue({ stdout: checksJson });

      const result = await new GitHubService().getPrChecks(location, "feature/x");

      expect(result.checks).toEqual([
        { name: "CI", state: "completed", conclusion: "success" },
        { name: "Lint", state: "completed", conclusion: "failure" },
      ]);
    });

    it("returns empty checks when gh returns empty array", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "[]" });

      const result = await new GitHubService().getPrChecks(location, "feature/x");

      expect(result.checks).toEqual([]);
    });
  });
});
