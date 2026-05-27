import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileAsyncMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ stdout: string }>>(),
);
const buildAgentCommandMock = vi.hoisted(() =>
  vi.fn<
    (
      location: { kind: "windows"; path: string },
      command: string,
      args: string[],
    ) => { command: string; args: string[] }
  >(),
);
const mkdtempMock = vi.hoisted(() => vi.fn<(prefix: string) => Promise<string>>());
const rmMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());
const writeFileMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());

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
  mkdtemp: mkdtempMock,
  rm: rmMock,
  writeFile: writeFileMock,
}));

vi.mock("./agents/base", () => ({
  buildAgentCommand: buildAgentCommandMock,
}));

import { GitHubService, aggregateChecksStatus } from "./github";

const location = { kind: "windows" as const, path: "C:\\Users\\demo\\repo" };

describe("GitHubService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildAgentCommandMock.mockImplementation((_loc, command, args) => ({
      command,
      args,
    }));
    mkdtempMock.mockImplementation(async (prefix) => `${prefix}abc123`);
    rmMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkGhAvailable", () => {
    it("returns available true when gh --version succeeds", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "gh version 2.50.0\n" });

      const result = await new GitHubService().checkGhAvailable(location);

      expect(result).toEqual({ available: true });
      expect(buildAgentCommandMock).toHaveBeenCalledWith(location, "gh", ["--version"]);
      expect(execFileAsyncMock.mock.calls[0]![2]).toMatchObject({ cwd: location.path });
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

    it("returns the latest PR when multiple PRs match a branch", async () => {
      const prJson = JSON.stringify([
        {
          number: 42,
          url: "https://github.com/owner/repo/pull/42",
          state: "MERGED",
          title: "Old PR",
          baseRefName: "main",
          isDraft: false,
          updatedAt: "2026-04-03T10:00:00Z",
        },
        {
          number: 45,
          url: "https://github.com/owner/repo/pull/45",
          state: "CLOSED",
          title: "Latest PR",
          baseRefName: "main",
          isDraft: false,
          updatedAt: "2026-04-02T10:00:00Z",
        },
      ]);
      execFileAsyncMock.mockResolvedValue({ stdout: prJson });

      const result = await new GitHubService().getPrForBranch(location, "feature/x");

      expect(result?.number).toBe(45);
      expect(result?.state).toBe("closed");
    });

    it("returns null when no PRs match", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "[]" });

      const result = await new GitHubService().getPrForBranch(location, "feature/x");

      expect(result).toBeNull();
    });

    it("returns null when the remote repo doesn't exist on GitHub", async () => {
      execFileAsyncMock.mockRejectedValue(
        new Error(
          "Command failed: gh pr list\nGraphQL: Could not resolve to a Repository with the name 'owner/missing'. (repository)\n",
        ),
      );

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
    it("creates a PR using body-file and returns data from pr view", async () => {
      const viewJson = JSON.stringify({
        number: 50,
        url: "https://github.com/owner/repo/pull/50",
        state: "OPEN",
        title: "My PR",
        baseRefName: "main",
        isDraft: false,
        statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }],
        updatedAt: "2026-04-03T10:00:00Z",
      });
      // First call: pr create, second call: viewer login, third call: pr view.
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo/pull/50\n" })
        .mockResolvedValueOnce({ stdout: "demo\n" })
        .mockResolvedValueOnce({ stdout: viewJson });

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
      expect(result.checksStatus).toBe("SUCCESS");
      expect(mkdtempMock).toHaveBeenCalledTimes(1);
      expect(writeFileMock).toHaveBeenCalledTimes(1);
      expect(rmMock).toHaveBeenCalledTimes(1);
      // First call: pr create
      const createArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(createArgs).toContain("pr");
      expect(createArgs).toContain("create");
      expect(createArgs).toContain("--body-file");
      expect(createArgs).not.toContain("--json");
      const viewCall = buildAgentCommandMock.mock.calls.find((call) =>
        (call[2] as string[]).includes("view"),
      );
      const viewArgs = viewCall![2] as string[];
      expect(viewArgs).toContain("pr");
      expect(viewArgs).toContain("view");
      expect(viewArgs).toContain("--json");
    });

    it("includes --draft flag when isDraft is true", async () => {
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo/pull/51\n" })
        .mockResolvedValueOnce({ stdout: "demo\n" })
        .mockResolvedValueOnce({
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

      const createArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(createArgs).toContain("--draft");
    });

    it("polls briefly when the created PR has no checks yet", async () => {
      vi.useFakeTimers();
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo/pull/52\n" })
        .mockResolvedValueOnce({ stdout: "demo\n" })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            number: 52,
            url: "https://github.com/owner/repo/pull/52",
            state: "OPEN",
            title: "Queued PR",
            baseRefName: "main",
            isDraft: false,
            updatedAt: "2026-04-03T10:00:00Z",
            statusCheckRollup: [],
          }),
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            number: 52,
            url: "https://github.com/owner/repo/pull/52",
            state: "OPEN",
            title: "Queued PR",
            baseRefName: "main",
            isDraft: false,
            updatedAt: "2026-04-03T10:00:05Z",
            statusCheckRollup: [{ status: "QUEUED", conclusion: "" }],
          }),
        });

      const resultPromise = new GitHubService().createPr(
        location,
        "feature/x",
        "main",
        "Queued PR",
        "",
        false,
      );
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      expect(result.checksStatus).toBe("PENDING");
      const viewCalls = buildAgentCommandMock.mock.calls.filter((call) =>
        (call[2] as string[]).includes("view"),
      );
      expect(viewCalls).toHaveLength(2);
    });

    it("cleans up body file even on failure", async () => {
      execFileAsyncMock.mockRejectedValue(new Error("gh pr create failed: some error"));

      await expect(
        new GitHubService().createPr(location, "feature/x", "main", "PR", "", false),
      ).rejects.toThrow("gh pr create failed");

      expect(rmMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("mergePr", () => {
    it("merges with the specified method without deleting branches", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "" });

      await new GitHubService().mergePr(location, 42, "squash");

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toContain("pr");
      expect(ghArgs).toContain("merge");
      expect(ghArgs).toContain("42");
      expect(ghArgs).toContain("--squash");
      expect(ghArgs).not.toContain("--delete-branch");
      expect(ghArgs).not.toContain("--admin");
    });

    it("appends --admin when bypass is requested", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "" });

      await new GitHubService().mergePr(location, 42, "squash", true);

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toContain("--admin");
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

  describe("getPrFiles", () => {
    it("parses files list from gh pr view --json files", async () => {
      execFileAsyncMock.mockResolvedValue({
        stdout: JSON.stringify({
          files: [
            { path: "src/a.ts", additions: 5, deletions: 2 },
            { path: "src/b.ts", additions: 1, deletions: 0 },
          ],
        }),
      });

      const result = await new GitHubService().getPrFiles(location, 42);

      expect(buildAgentCommandMock.mock.calls[0]![2]).toEqual([
        "pr",
        "view",
        "42",
        "--json",
        "files",
      ]);
      expect(result.files).toEqual([
        { path: "src/a.ts", additions: 5, deletions: 2 },
        { path: "src/b.ts", additions: 1, deletions: 0 },
      ]);
    });
  });

  describe("getPrDiff", () => {
    it("returns raw diff stdout", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "diff --git a/x b/x\n" });

      const result = await new GitHubService().getPrDiff(location, 42);

      expect(buildAgentCommandMock.mock.calls[0]![2]).toEqual(["pr", "diff", "42"]);
      expect(result.diff).toBe("diff --git a/x b/x\n");
    });
  });

  describe("submitPrReview", () => {
    it("approves without a body file when body is empty", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "" });

      await new GitHubService().submitPrReview(location, 42, "approve", "");

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toEqual(["pr", "review", "42", "--approve"]);
      expect(writeFileMock).not.toHaveBeenCalled();
    });

    it("submits a comment review with body via --body-file", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "" });

      await new GitHubService().submitPrReview(location, 42, "comment", "Looks good");

      expect(writeFileMock).toHaveBeenCalledTimes(1);
      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs[0]).toBe("pr");
      expect(ghArgs[1]).toBe("review");
      expect(ghArgs[2]).toBe("42");
      expect(ghArgs[3]).toBe("--comment");
      expect(ghArgs[4]).toBe("--body-file");
      expect(rmMock).toHaveBeenCalledTimes(1);
    });

    it("rejects request-changes with empty body", async () => {
      await expect(
        new GitHubService().submitPrReview(location, 42, "request-changes", "   "),
      ).rejects.toThrow(/required/i);
      expect(execFileAsyncMock).not.toHaveBeenCalled();
    });
  });

  describe("aggregateChecksStatus", () => {
    it("returns FAILURE when any check run failed", () => {
      expect(
        aggregateChecksStatus([
          { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
          { name: "e2e", status: "COMPLETED", conclusion: "FAILURE" },
          { name: "coverage", status: "COMPLETED", conclusion: "SUCCESS" },
        ]),
      ).toBe("FAILURE");
    });

    it("returns FAILURE when a status context errored", () => {
      expect(
        aggregateChecksStatus([
          { context: "Vercel", state: "ERROR" },
          { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
        ]),
      ).toBe("FAILURE");
    });

    it("returns FAILURE for timed-out / cancelled / action-required", () => {
      for (const conclusion of ["TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]) {
        expect(aggregateChecksStatus([{ name: "x", status: "COMPLETED", conclusion }])).toBe(
          "FAILURE",
        );
      }
    });

    it("returns PENDING when checks are still in progress", () => {
      expect(
        aggregateChecksStatus([
          { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
          { name: "build", status: "IN_PROGRESS", conclusion: null },
        ]),
      ).toBe("PENDING");
    });

    it("returns PENDING for status contexts in pending state", () => {
      expect(
        aggregateChecksStatus([
          { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
          { context: "Vercel", state: "PENDING" },
        ]),
      ).toBe("PENDING");
    });

    it("returns SUCCESS when all checks pass (incl. NEUTRAL/SKIPPED)", () => {
      expect(
        aggregateChecksStatus([
          { name: "a", status: "COMPLETED", conclusion: "SUCCESS" },
          { name: "b", status: "COMPLETED", conclusion: "NEUTRAL" },
          { name: "c", status: "COMPLETED", conclusion: "SKIPPED" },
          { context: "Vercel", state: "SUCCESS" },
        ]),
      ).toBe("SUCCESS");
    });

    it("returns undefined for empty / missing rollups", () => {
      expect(aggregateChecksStatus([])).toBeUndefined();
      expect(aggregateChecksStatus(undefined)).toBeUndefined();
      expect(aggregateChecksStatus(null)).toBeUndefined();
      expect(aggregateChecksStatus("FAILURE")).toBeUndefined();
    });
  });

  describe("getPrForBranch with rollup", () => {
    it("aggregates statusCheckRollup to FAILURE when any check failed", async () => {
      const prJson = JSON.stringify([
        {
          number: 609,
          url: "https://github.com/owner/repo/pull/609",
          state: "OPEN",
          title: "PR with failing E2E",
          baseRefName: "main",
          isDraft: false,
          updatedAt: "2026-04-30T16:27:32Z",
          statusCheckRollup: [
            { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
            { name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS" },
            { name: "E2E Tests", status: "COMPLETED", conclusion: "FAILURE" },
            { name: "typecheck", status: "COMPLETED", conclusion: "SUCCESS" },
            { name: "Coverage Report", status: "COMPLETED", conclusion: "SUCCESS" },
          ],
        },
      ]);
      execFileAsyncMock.mockResolvedValue({ stdout: prJson });

      const result = await new GitHubService().getPrForBranch(location, "feature/x");

      expect(result?.checksStatus).toBe("FAILURE");
    });

    it("requests statusCheckRollup in --json fields", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "[]" });

      await new GitHubService().getPrForBranch(location, "feature/x");

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      const jsonIdx = ghArgs.indexOf("--json");
      expect(jsonIdx).toBeGreaterThan(-1);
      expect(ghArgs[jsonIdx + 1]).toContain("statusCheckRollup");
    });

    it("fetches enough branch PRs to choose the latest one locally", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "[]" });

      await new GitHubService().getPrForBranch(location, "feature/x");

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toContain("20");
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
