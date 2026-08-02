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
const primeProjectShellEnvMock = vi.hoisted(() =>
  vi.fn<(cwd: string) => Promise<Record<string, string> | undefined>>(),
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
  primeProjectShellEnv: primeProjectShellEnvMock,
}));

import {
  GitHubService,
  aggregateChecksStatus,
  mapGitHubApiRepo,
  parseGhAuthAccounts,
} from "./github";
import { mapGitHubActionsRun, mapGitHubActionsWorkflow, mapStatusCheck } from "./githubMappers";
import { resolveClonedProjectPath } from "./git/exec";

const location = { kind: "windows" as const, path: "C:\\Users\\demo\\repo" };
const posixLocation = { kind: "posix" as const, path: "/Users/demo/repo" };
const wslLocation = {
  kind: "wsl" as const,
  distro: "Ubuntu",
  linuxPath: "/home/demo/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
};

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
    primeProjectShellEnvMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkGhAvailable", () => {
    it("returns available true when gh --version succeeds", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "gh version 2.50.0\n" });

      const result = await new GitHubService().checkGhAvailable(location);

      expect(result).toEqual({ available: true });
      expect(buildAgentCommandMock).toHaveBeenCalledWith(
        location,
        "gh",
        ["--version"],
        undefined,
        undefined,
      );
      expect(execFileAsyncMock.mock.calls[0]![2]).toMatchObject({ cwd: location.path });
    });

    it("returns available false when gh is not found", async () => {
      execFileAsyncMock.mockRejectedValue(new Error("ENOENT"));

      const result = await new GitHubService().checkGhAvailable(location);

      expect(result).toEqual({ available: false });
    });

    it("does not inherit GH_REPO when running a project-scoped gh command", async () => {
      const prior = process.env.GH_REPO;
      process.env.GH_REPO = "ambient/override";
      execFileAsyncMock.mockResolvedValue({ stdout: "gh version 2.50.0\n" });

      await new GitHubService().checkGhAvailable(location);

      const options = execFileAsyncMock.mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv };
      expect(options.env?.GH_REPO).toBeUndefined();
      if (prior === undefined) delete process.env.GH_REPO;
      else process.env.GH_REPO = prior;
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

    it("routes WSL PR lookup through the bridge process batch", async () => {
      const processBatch = vi.fn<
        () => Promise<{
          results: { ok: boolean; stdout: string; stderr: string; exitCode: number }[];
        }>
      >(async () => ({
        results: [
          {
            ok: true,
            stdout: JSON.stringify([
              {
                number: 42,
                url: "https://github.com/owner/repo/pull/42",
                state: "OPEN",
                title: "Add feature",
                baseRefName: "main",
                isDraft: false,
                updatedAt: "2026-04-03T10:00:00Z",
              },
            ]),
            stderr: "",
            exitCode: 0,
          },
          { ok: true, stdout: "demo\n", stderr: "", exitCode: 0 },
        ],
      }));
      const service = new GitHubService();
      service.setWslClient({ processBatch } as never);

      const result = await service.getPrForBranch(wslLocation, "feature/x");

      expect(result?.number).toBe(42);
      expect(execFileAsyncMock).not.toHaveBeenCalled();
      expect(processBatch).toHaveBeenCalledWith(wslLocation, {
        timeoutMs: 30_000,
        commands: [
          {
            command: "gh",
            cwd: "/home/demo/repo",
            args: [
              "pr",
              "list",
              "--head",
              "feature/x",
              "--state",
              "all",
              "--limit",
              "20",
              "--json",
              expect.stringContaining("statusCheckRollup"),
            ],
            loginEnv: true,
            env: { GH_REPO: "" },
          },
          {
            command: "gh",
            cwd: "/home/demo/repo",
            args: ["api", "user", "--jq", ".login"],
            loginEnv: true,
            env: { GH_REPO: "" },
          },
        ],
      });
    });
  });

  describe("listPrs", () => {
    it("keys PRs by head branch and maps PR data", async () => {
      const prJson = JSON.stringify([
        {
          number: 42,
          headRefName: "feature/x",
          url: "https://github.com/owner/repo/pull/42",
          state: "OPEN",
          title: "Add feature",
          baseRefName: "main",
          isDraft: false,
          updatedAt: "2026-04-03T10:00:00Z",
        },
        {
          number: 43,
          headRefName: "feature/y",
          url: "https://github.com/owner/repo/pull/43",
          state: "MERGED",
          title: "Other",
          baseRefName: "main",
          isDraft: false,
          updatedAt: "2026-04-02T10:00:00Z",
        },
      ]);
      execFileAsyncMock.mockResolvedValue({ stdout: prJson });

      const result = await new GitHubService().listPrs(location);

      const ghArgs = buildAgentCommandMock.mock.calls[0]![2] as string[];
      expect(ghArgs).toEqual([
        "pr",
        "list",
        "--state",
        "all",
        "--limit",
        "100",
        "--json",
        expect.stringContaining("headRefName"),
      ]);
      expect(result["feature/x"]).toMatchObject({ number: 42, state: "open" });
      expect(result["feature/y"]).toMatchObject({ number: 43, state: "merged" });
    });

    it("keeps the latest PR per branch", async () => {
      const prJson = JSON.stringify([
        {
          number: 10,
          headRefName: "feature/x",
          url: "u",
          state: "CLOSED",
          title: "old",
          baseRefName: "main",
          isDraft: false,
          updatedAt: "2026-04-01T10:00:00Z",
        },
        {
          number: 12,
          headRefName: "feature/x",
          url: "u",
          state: "OPEN",
          title: "new",
          baseRefName: "main",
          isDraft: false,
          updatedAt: "2026-04-02T10:00:00Z",
        },
      ]);
      execFileAsyncMock.mockResolvedValue({ stdout: prJson });

      const result = await new GitHubService().listPrs(location);

      expect(Object.keys(result)).toEqual(["feature/x"]);
      expect(result["feature/x"]).toMatchObject({ number: 12, state: "open" });
    });

    it("returns an empty map when no PRs exist", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "[]" });

      const result = await new GitHubService().listPrs(location);

      expect(result).toEqual({});
    });

    it("returns an empty map when the remote repo doesn't exist on GitHub", async () => {
      execFileAsyncMock.mockRejectedValue(
        new Error("GraphQL: Could not resolve to a Repository with the name 'owner/missing'."),
      );

      const result = await new GitHubService().listPrs(location);

      expect(result).toEqual({});
    });

    it.each([
      "failed to run git: fatal: not a git repository (or any parent): .git",
      "no repository configured for this command",
    ])("returns an empty map for a non-repository project: %s", async (message) => {
      execFileAsyncMock.mockRejectedValue(new Error(message));

      await expect(new GitHubService().listPrs(location)).resolves.toEqual({});
    });

    it("does not hide unrelated gh failures", async () => {
      execFileAsyncMock.mockRejectedValue(new Error("GraphQL: API rate limit exceeded"));

      await expect(new GitHubService().listPrs(location)).rejects.toThrow(
        "gh pr list failed: GraphQL: API rate limit exceeded",
      );
    });

    it("bypasses login shells so OSC 1337 startup output cannot contaminate JSON", async () => {
      buildAgentCommandMock.mockReturnValue({
        command: "/bin/zsh",
        args: ["-l", "-i", "-c", "\u001b]1337;RemoteHost=test\u0007"],
      });
      execFileAsyncMock.mockResolvedValue({ stdout: "[]" });

      await new GitHubService().listPrs(location);

      expect(execFileAsyncMock.mock.calls[0]?.[0]).toBe("gh");
      expect(execFileAsyncMock.mock.calls[0]?.[1]).toEqual(
        expect.arrayContaining(["pr", "list", "--json"]),
      );
    });

    it("captures the login-shell PATH before directly running machine-readable gh", async () => {
      let primed = false;
      primeProjectShellEnvMock.mockImplementation(async () => {
        primed = true;
        return { PATH: "/opt/homebrew/bin:/usr/bin:/bin" };
      });
      buildAgentCommandMock.mockImplementation((_location, command, args) => ({
        command: "/bin/zsh",
        args: ["-l", "-i", "-c", command, ...args],
        ...(primed ? { env: { PATH: "/opt/homebrew/bin:/usr/bin:/bin" } } : {}),
      }));
      execFileAsyncMock.mockResolvedValue({ stdout: "[]" });

      await new GitHubService().listPrs(posixLocation);

      expect(primeProjectShellEnvMock).toHaveBeenCalledWith(posixLocation.path);
      expect(execFileAsyncMock).toHaveBeenCalledWith(
        "gh",
        expect.arrayContaining(["pr", "list", "--json"]),
        expect.objectContaining({
          env: expect.objectContaining({ PATH: "/opt/homebrew/bin:/usr/bin:/bin" }),
        }),
      );
    });
  });

  describe("listPullRequests", () => {
    it("returns overlay-ready rows scoped to the native runtime account", async () => {
      execFileAsyncMock.mockImplementation(async (...args: unknown[]) => {
        const ghArgs = args[1] as string[];
        if (ghArgs[0] === "api") return { stdout: "WindowsUser\n" };
        return {
          stdout: JSON.stringify([
            {
              number: 42,
              headRefName: "feature/review",
              url: "https://github.com/owner/repo/pull/42",
              state: "OPEN",
              title: "Review me",
              baseRefName: "main",
              isDraft: false,
              author: { login: "OtherUser", avatarUrl: "https://avatars.example/other" },
              additions: 12,
              deletions: 3,
              reviewRequests: [{ login: "windowsuser" }],
              updatedAt: "2026-07-13T10:00:00Z",
            },
            {
              number: 41,
              headRefName: "feature/authored",
              url: "https://github.com/owner/repo/pull/41",
              state: "OPEN",
              title: "My PR",
              baseRefName: "main",
              isDraft: false,
              author: { login: "WINDOWSUSER" },
              additions: 5,
              deletions: 1,
              reviewRequests: [],
              updatedAt: "2026-07-12T10:00:00Z",
            },
          ]),
        };
      });

      const result = await new GitHubService().listPullRequests(location);

      expect(result.viewerLogin).toBe("WindowsUser");
      expect(result.pullRequests).toEqual([
        expect.objectContaining({
          headBranch: "feature/review",
          repository: "owner/repo",
          additions: 12,
          deletions: 3,
          reviewRequested: true,
          author: { login: "OtherUser", avatarUrl: "https://avatars.example/other" },
          pr: expect.objectContaining({ number: 42, viewerDidAuthor: false }),
        }),
        expect.objectContaining({
          headBranch: "feature/authored",
          reviewRequested: false,
          pr: expect.objectContaining({ number: 41, viewerDidAuthor: true }),
        }),
      ]);
      const listCall = buildAgentCommandMock.mock.calls.find(
        (call) => (call[2] as string[])[0] === "pr",
      );
      expect(listCall?.[2]).toEqual([
        "pr",
        "list",
        "--state",
        "open",
        "--limit",
        "1000",
        "--json",
        expect.stringContaining("reviewRequests"),
      ]);
    });

    it("refreshes the native viewer identity on each global list load", async () => {
      let viewerRequest = 0;
      execFileAsyncMock.mockImplementation(async (...args: unknown[]) => {
        const ghArgs = args[1] as string[];
        if (ghArgs[0] === "api") {
          viewerRequest += 1;
          return { stdout: viewerRequest === 1 ? "FirstUser\n" : "SecondUser\n" };
        }
        return {
          stdout: JSON.stringify([
            {
              number: 42,
              headRefName: "feature/authored",
              url: "https://github.com/owner/repo/pull/42",
              state: "OPEN",
              title: "Authored PR",
              baseRefName: "main",
              isDraft: false,
              author: { login: "SecondUser" },
              additions: 1,
              deletions: 0,
              reviewRequests: [],
              updatedAt: "2026-07-13T10:00:00Z",
            },
          ]),
        };
      });
      const service = new GitHubService();

      const first = await service.listPullRequests(location);
      const second = await service.listPullRequests(location);

      expect(first.viewerLogin).toBe("FirstUser");
      expect(first.pullRequests[0]?.pr.viewerDidAuthor).toBe(false);
      expect(second.viewerLogin).toBe("SecondUser");
      expect(second.pullRequests[0]?.pr.viewerDidAuthor).toBe(true);
      expect(viewerRequest).toBe(2);
    });

    it("runs both list and viewer lookup inside the WSL project runtime", async () => {
      const processBatch = vi.fn<
        () => Promise<{
          results: { ok: boolean; stdout: string; stderr: string; exitCode: number }[];
        }>
      >(async () => ({
        results: [
          {
            ok: true,
            stdout: JSON.stringify([
              {
                number: 9,
                headRefName: "wsl/pr",
                url: "https://github.com/wsl-owner/repo/pull/9",
                state: "OPEN",
                title: "WSL PR",
                baseRefName: "main",
                isDraft: false,
                author: { login: "review-author" },
                additions: 2,
                deletions: 4,
                reviewRequests: [{ login: "WslAccount" }],
                updatedAt: "2026-07-13T11:00:00Z",
              },
            ]),
            stderr: "",
            exitCode: 0,
          },
          { ok: true, stdout: "WslAccount\n", stderr: "", exitCode: 0 },
        ],
      }));
      const service = new GitHubService();
      service.setWslClient({ processBatch } as never);

      const result = await service.listPullRequests(wslLocation);

      expect(result).toMatchObject({
        viewerLogin: "WslAccount",
        pullRequests: [
          {
            headBranch: "wsl/pr",
            repository: "wsl-owner/repo",
            reviewRequested: true,
          },
        ],
      });
      expect(execFileAsyncMock).not.toHaveBeenCalled();
      expect(processBatch).toHaveBeenCalledWith(wslLocation, {
        timeoutMs: 30_000,
        commands: [
          expect.objectContaining({
            command: "gh",
            cwd: "/home/demo/repo",
            args: expect.arrayContaining(["pr", "list", "open"]),
            loginEnv: true,
            env: { GH_REPO: "" },
          }),
          {
            command: "gh",
            cwd: "/home/demo/repo",
            args: ["api", "user", "--jq", ".login"],
            loginEnv: true,
            env: { GH_REPO: "" },
          },
        ],
      });
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
        statusCheckRollup: [{ status: "QUEUED", conclusion: "" }],
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
      expect(result.checksStatus).toBe("PENDING");
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

    it("creates a WSL PR using a bridge-staged body file", async () => {
      type ProcessResult = { ok: boolean; stdout: string; stderr: string; exitCode: number };
      const processExec = vi.fn<
        (location: unknown, input: { command: string; args: string[] }) => Promise<ProcessResult>
      >(async (_location, input) => {
        const args = input.args;
        if (input.command === "mktemp") {
          return { ok: true, stdout: "/tmp/poracode-pr-body-abc123\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "pr" && args[1] === "create") {
          return {
            ok: true,
            stdout: "https://github.com/owner/repo/pull/50\n",
            stderr: "",
            exitCode: 0,
          };
        }
        if (args[0] === "pr" && args[1] === "view") {
          return {
            ok: true,
            stdout: JSON.stringify({
              number: 50,
              url: "https://github.com/owner/repo/pull/50",
              state: "OPEN",
              title: "My PR",
              baseRefName: "main",
              isDraft: false,
              statusCheckRollup: [{ status: "QUEUED", conclusion: "" }],
              updatedAt: "2026-04-03T10:00:00Z",
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        return { ok: true, stdout: "demo\n", stderr: "", exitCode: 0 };
      });
      const processBatch = vi.fn<() => Promise<{ results: ProcessResult[] }>>(async () => ({
        results: [
          {
            ok: true,
            stdout: JSON.stringify([
              {
                number: 50,
                url: "https://github.com/owner/repo/pull/50",
                state: "OPEN",
                title: "My PR",
                baseRefName: "main",
                isDraft: false,
                updatedAt: "2026-04-03T10:00:00Z",
              },
            ]),
            stderr: "",
            exitCode: 0,
          },
        ],
      }));
      const writeNewFile = vi.fn<() => Promise<{ mtimeMs: number; size: number }>>(async () => ({
        mtimeMs: 1,
        size: 16,
      }));
      const rm = vi.fn<() => Promise<void>>(async () => undefined);
      const service = new GitHubService();
      service.setWslClient({ processExec, processBatch, writeNewFile, rm } as never);

      await service.createPr(wslLocation, "feature/x", "main", "My PR", "Some description", false);

      expect(writeNewFile).toHaveBeenCalledWith(
        { ...wslLocation, linuxPath: "/tmp" },
        "/tmp/poracode-pr-body-abc123/body.md",
        Buffer.from("Some description", "utf8"),
      );
      const createCall = processExec.mock.calls.find(([, input]) => {
        const args = input.args;
        return input.command === "gh" && args[0] === "pr" && args[1] === "create";
      });
      const createArgs = createCall![1].args;
      expect(createArgs).toContain("--body-file");
      expect(createArgs).toContain("/tmp/poracode-pr-body-abc123/body.md");
      expect(createArgs).not.toContain("--body");
      expect(rm).toHaveBeenCalledWith(
        { ...wslLocation, linuxPath: "/tmp" },
        "/tmp/poracode-pr-body-abc123",
        { recursive: true, force: true },
      );
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
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await resultPromise;

      expect(result.checksStatus).toBe("PENDING");
      const viewCalls = buildAgentCommandMock.mock.calls.filter((call) =>
        (call[2] as string[]).includes("view"),
      );
      expect(viewCalls).toHaveLength(2);
    });

    it("keeps polling when the created PR initially reports success", async () => {
      vi.useFakeTimers();
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo/pull/53\n" })
        .mockResolvedValueOnce({ stdout: "demo\n" })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            number: 53,
            url: "https://github.com/owner/repo/pull/53",
            state: "OPEN",
            title: "Early Success PR",
            baseRefName: "main",
            isDraft: false,
            updatedAt: "2026-04-03T10:00:00Z",
            statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }],
          }),
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            number: 53,
            url: "https://github.com/owner/repo/pull/53",
            state: "OPEN",
            title: "Early Success PR",
            baseRefName: "main",
            isDraft: false,
            updatedAt: "2026-04-03T10:00:01Z",
            statusCheckRollup: [
              { status: "COMPLETED", conclusion: "SUCCESS" },
              { status: "IN_PROGRESS", conclusion: "" },
            ],
          }),
        });

      const resultPromise = new GitHubService().createPr(
        location,
        "feature/x",
        "main",
        "Early Success PR",
        "",
        false,
      );
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await resultPromise;

      expect(result.checksStatus).toBe("PENDING");
      const viewCalls = buildAgentCommandMock.mock.calls.filter((call) =>
        (call[2] as string[]).includes("view"),
      );
      expect(viewCalls).toHaveLength(2);
    });

    it("stops polling when the created PR stays successful", async () => {
      vi.useFakeTimers();
      const successfulPrJson = JSON.stringify({
        number: 54,
        url: "https://github.com/owner/repo/pull/54",
        state: "OPEN",
        title: "Successful PR",
        baseRefName: "main",
        isDraft: false,
        updatedAt: "2026-04-03T10:00:00Z",
        statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }],
      });
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo/pull/54\n" })
        .mockResolvedValueOnce({ stdout: "demo\n" })
        .mockResolvedValueOnce({ stdout: successfulPrJson })
        .mockResolvedValueOnce({ stdout: successfulPrJson })
        .mockResolvedValueOnce({ stdout: successfulPrJson })
        .mockResolvedValueOnce({ stdout: successfulPrJson });

      const resultPromise = new GitHubService().createPr(
        location,
        "feature/x",
        "main",
        "Successful PR",
        "",
        false,
      );
      await vi.advanceTimersByTimeAsync(15_000);
      const result = await resultPromise;

      expect(result.checksStatus).toBe("SUCCESS");
      const viewCalls = buildAgentCommandMock.mock.calls.filter((call) =>
        (call[2] as string[]).includes("view"),
      );
      expect(viewCalls).toHaveLength(4);
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
      expect(execFileAsyncMock.mock.calls[0]?.[2]).toMatchObject({
        maxBuffer: 50 * 1024 * 1024,
      });
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

  describe("mapStatusCheck", () => {
    it("preserves check run timestamps", () => {
      expect(
        mapStatusCheck({
          name: "Typecheck",
          status: "COMPLETED",
          conclusion: "SUCCESS",
          startedAt: "2026-07-13T11:25:03Z",
          completedAt: "2026-07-13T11:25:49Z",
        }),
      ).toEqual({
        name: "Typecheck",
        state: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-07-13T11:25:03Z",
        completedAt: "2026-07-13T11:25:49Z",
      });
    });

    it("preserves a status context start time without inventing a completion time", () => {
      expect(
        mapStatusCheck({
          context: "Vercel",
          state: "SUCCESS",
          startedAt: "2026-07-13T11:25:28Z",
          completedAt: null,
        }),
      ).toEqual({
        name: "Vercel",
        state: "SUCCESS",
        conclusion: "",
        startedAt: "2026-07-13T11:25:28Z",
      });
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
    it("maps gh check buckets into canonical pass, fail, and pending results", async () => {
      const checksJson = JSON.stringify([
        {
          name: "CI",
          state: "SUCCESS",
          bucket: "pass",
          link: "https://github.com/owner/repo/actions/runs/1",
          workflow: "CI",
          startedAt: "2026-07-27T10:00:00Z",
          completedAt: "2026-07-27T10:01:00Z",
        },
        { name: "Lint", state: "FAILURE", bucket: "fail" },
        { name: "Build", state: "IN_PROGRESS", bucket: "pending" },
        { name: "Queued", state: "QUEUED", bucket: "pending" },
      ]);
      execFileAsyncMock.mockResolvedValue({ stdout: checksJson });

      const result = await new GitHubService().getPrChecks(location, "feature/x");

      expect(result.checks).toEqual([
        {
          name: "CI",
          state: "COMPLETED",
          conclusion: "SUCCESS",
          url: "https://github.com/owner/repo/actions/runs/1",
          workflowName: "CI",
          startedAt: "2026-07-27T10:00:00Z",
          completedAt: "2026-07-27T10:01:00Z",
        },
        { name: "Lint", state: "COMPLETED", conclusion: "FAILURE" },
        { name: "Build", state: "IN_PROGRESS", conclusion: "" },
        { name: "Queued", state: "QUEUED", conclusion: "" },
      ]);

      const args = execFileAsyncMock.mock.calls[0]?.[1] as string[];
      expect(args).toEqual([
        "pr",
        "checks",
        "feature/x",
        "--json",
        "name,state,bucket,link,startedAt,completedAt,workflow",
      ]);
      expect(args.join(",")).not.toContain("conclusion");
    });

    it("maps cancelled and skipped buckets to completed outcomes", async () => {
      execFileAsyncMock.mockResolvedValue({
        stdout: JSON.stringify([
          { name: "Cancelled", state: "CANCELLED", bucket: "cancel" },
          { name: "Skipped", state: "SKIPPED", bucket: "skipping" },
        ]),
      });

      const result = await new GitHubService().getPrChecks(location, "feature/x");

      expect(result.checks).toEqual([
        { name: "Cancelled", state: "COMPLETED", conclusion: "CANCELLED" },
        { name: "Skipped", state: "COMPLETED", conclusion: "SKIPPED" },
      ]);
    });

    it("parses pending check JSON returned with gh exit code 8", async () => {
      const pendingJson = JSON.stringify([{ name: "Build", state: "PENDING", bucket: "pending" }]);
      execFileAsyncMock.mockRejectedValue(
        Object.assign(new Error("Command failed with exit code 8"), {
          code: 8,
          stdout: pendingJson,
        }),
      );

      const result = await new GitHubService().getPrChecks(location, "feature/x");

      expect(result.checks).toEqual([{ name: "Build", state: "PENDING", conclusion: "" }]);
    });

    it("returns empty checks when gh returns empty array", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "[]" });

      const result = await new GitHubService().getPrChecks(location, "feature/x");

      expect(result.checks).toEqual([]);
    });

    it("keeps unsupported gh field failures observable", async () => {
      execFileAsyncMock.mockRejectedValue(new Error("Unknown JSON field: futureField"));

      await expect(new GitHubService().getPrChecks(location, "feature/x")).rejects.toThrow(
        "gh pr checks failed: Unknown JSON field: futureField",
      );
    });
  });

  describe("GitHub Actions", () => {
    it("lists workflows for the project repository", async () => {
      execFileAsyncMock.mockResolvedValue({
        stdout: JSON.stringify([
          { id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" },
        ]),
      });

      const result = await new GitHubService().listWorkflows(location);

      expect(result.workflows).toEqual([
        { id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" },
      ]);
      expect(execFileAsyncMock.mock.calls[0]![1]).toEqual([
        "workflow",
        "list",
        "--all",
        "--limit",
        "100",
        "--json",
        "id,name,path,state",
      ]);
    });

    it("lists recent workflow runs", async () => {
      execFileAsyncMock.mockResolvedValue({
        stdout: JSON.stringify([
          {
            databaseId: 501,
            workflowDatabaseId: 11,
            workflowName: "CI",
            name: "CI",
            number: 7,
            displayTitle: "Test changes",
            event: "push",
            headBranch: "main",
            headSha: "abc123",
            status: "in_progress",
            conclusion: "",
            createdAt: "2026-07-25T10:00:00Z",
            startedAt: "2026-07-25T10:00:01Z",
            updatedAt: "2026-07-25T10:00:02Z",
            url: "https://github.com/owner/repo/actions/runs/501",
          },
        ]),
      });

      const result = await new GitHubService().listWorkflowRuns(location, 11);

      expect(result.runs[0]).toMatchObject({
        id: 501,
        workflowId: 11,
        workflowName: "CI",
        attempt: 1,
        status: "in_progress",
        jobs: [],
      });
      expect(execFileAsyncMock.mock.calls[0]![1]).toEqual(
        expect.arrayContaining(["run", "list", "--workflow", "11"]),
      );
    });

    it("loads a workflow definition from the selected ref", async () => {
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "main\n" }).mockResolvedValueOnce({
        stdout: `
name: Release
on:
  workflow_dispatch:
    inputs:
      version:
        required: true
        type: string
`,
      });

      const result = await new GitHubService().getWorkflowDefinition(location, 11, "release");

      expect(result.definition).toEqual({
        workflowId: 11,
        ref: "release",
        defaultBranch: "main",
        dispatchable: true,
        triggers: ["workflow_dispatch"],
        inputs: [
          {
            name: "version",
            description: "",
            required: true,
            type: "string",
            options: [],
          },
        ],
      });
      expect(execFileAsyncMock.mock.calls[1]![1]).toEqual([
        "workflow",
        "view",
        "11",
        "--yaml",
        "--ref",
        "release",
      ]);
    });

    it("uses the default branch when loading a workflow definition without a ref", async () => {
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "main\n" }).mockResolvedValueOnce({
        stdout: "name: CI\non: push\n",
      });

      await new GitHubService().getWorkflowDefinition(location, 11);

      expect(execFileAsyncMock.mock.calls[1]![1]).toEqual([
        "workflow",
        "view",
        "11",
        "--yaml",
        "--ref",
        "main",
      ]);
    });

    it("treats dynamic workflows without a repository file as non-dispatchable", async () => {
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: "main\n" })
        .mockRejectedValueOnce(new Error("could not find workflow file dependabot-updates"));

      const result = await new GitHubService().getWorkflowDefinition(location, 44);

      expect(result.definition).toEqual({
        workflowId: 44,
        ref: "main",
        defaultBranch: "main",
        dispatchable: false,
        triggers: [],
        inputs: [],
      });
    });

    it("loads jobs and steps for one workflow run", async () => {
      execFileAsyncMock.mockResolvedValue({
        stdout: JSON.stringify({
          databaseId: 501,
          workflowDatabaseId: 11,
          workflowName: "CI",
          name: "CI",
          number: 7,
          displayTitle: "Test changes",
          status: "in_progress",
          jobs: [
            {
              databaseId: 9001,
              name: "Typecheck",
              status: "in_progress",
              conclusion: "",
              steps: [
                {
                  number: 1,
                  name: "Checkout",
                  status: "completed",
                  conclusion: "success",
                },
                {
                  number: 2,
                  name: "Typecheck",
                  status: "in_progress",
                  conclusion: "",
                },
              ],
            },
          ],
        }),
      });

      const result = await new GitHubService().getWorkflowRun(location, 501);

      expect(result.run.jobs[0]).toMatchObject({
        id: 9001,
        name: "Typecheck",
        status: "in_progress",
        steps: [
          { number: 1, name: "Checkout", status: "completed", conclusion: "success" },
          { number: 2, name: "Typecheck", status: "in_progress", conclusion: "" },
        ],
      });
      expect(execFileAsyncMock.mock.calls[0]![1]).toContain("501");
    });

    it("dispatches a workflow with an optional ref and inputs", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "" });

      await new GitHubService().dispatchWorkflow(location, 11, "release", {
        channel: "nightly",
        dry_run: "true",
      });

      expect(execFileAsyncMock.mock.calls[0]![1]).toEqual([
        "workflow",
        "run",
        "11",
        "--ref",
        "release",
        "--raw-field",
        "channel=nightly",
        "--raw-field",
        "dry_run=true",
      ]);
    });

    it("reruns, cancels, and deletes workflow runs", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: "" });
      const service = new GitHubService();

      await service.rerunWorkflowRun(location, 501, false);
      await service.rerunWorkflowRun(location, 501, true);
      await service.cancelWorkflowRun(location, 501);
      await service.deleteWorkflowRun(location, 501);

      expect(execFileAsyncMock.mock.calls[0]![1]).toEqual(["run", "rerun", "501"]);
      expect(execFileAsyncMock.mock.calls[1]![1]).toEqual(["run", "rerun", "501", "--failed"]);
      expect(execFileAsyncMock.mock.calls[2]![1]).toEqual(["run", "cancel", "501"]);
      expect(execFileAsyncMock.mock.calls[3]![1]).toEqual(["run", "delete", "501"]);
    });
  });

  describe("getPrReviewThreads", () => {
    it("returns inline comments grouped by review-thread resolution state", async () => {
      execFileAsyncMock.mockResolvedValue({
        stdout:
          '{"id":"thread-1","isResolved":false,"isOutdated":false,"path":"src/app.ts","line":42,"comments":{"nodes":[{"id":"comment-99","author":{"login":"reviewer","avatarUrl":"https://example.com/a.png"},"body":"Please handle null.","createdAt":"2026-07-25T00:00:00Z","url":"https://github.com/o/r/pull/1#discussion_r99"}]}}\n',
      });

      const result = await new GitHubService().getPrReviewThreads(location, 1);

      expect(result.comments).toEqual([
        {
          id: "comment-99",
          author: { login: "reviewer", avatarUrl: "https://example.com/a.png" },
          body: "Please handle null.",
          createdAt: "2026-07-25T00:00:00Z",
          url: "https://github.com/o/r/pull/1#discussion_r99",
        },
      ]);
      expect(result.threads).toEqual([
        {
          id: "thread-1",
          isResolved: false,
          isOutdated: false,
          path: "src/app.ts",
          line: 42,
          comments: result.comments,
        },
      ]);
      const args = buildAgentCommandMock.mock.calls[0]?.[2] as string[];
      expect(args).toContain("graphql");
      expect(args).toContain("owner={owner}");
      expect(args).toContain("name={repo}");
      expect(args).toContain("number=1");
      expect(args.find((arg) => arg.startsWith("query="))).toContain("reviewThreads");
    });
  });

  describe("listAccounts", () => {
    const AUTH_STATUS = [
      "github.com",
      "  ✓ Logged in to github.com account SDSLeon (keyring)",
      "  - Active account: true",
      "",
      "  ✓ Logged in to github.com account ym-svecherenko (keyring)",
      "  - Active account: false",
      "",
    ].join("\n");

    it("parses signed-in accounts and the active flag", async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: AUTH_STATUS });

      const result = await new GitHubService().listAccounts(location);

      expect(result.accounts).toEqual([
        { host: "github.com", login: "SDSLeon", active: true },
        { host: "github.com", login: "ym-svecherenko", active: false },
      ]);
    });

    it("returns an empty list when gh is signed out", async () => {
      execFileAsyncMock.mockRejectedValue(Object.assign(new Error("exit 1"), { stdout: "" }));

      const result = await new GitHubService().listAccounts(location);

      expect(result.accounts).toEqual([]);
    });

    it("still parses accounts when gh exits non-zero but printed them", async () => {
      execFileAsyncMock.mockRejectedValue(
        Object.assign(new Error("exit 1"), { stdout: AUTH_STATUS }),
      );

      const result = await new GitHubService().listAccounts(location);

      expect(result.accounts).toHaveLength(2);
    });
  });

  describe("listRepos", () => {
    it("scopes to the account token and maps the repositories", async () => {
      const reposJson = JSON.stringify([
        {
          full_name: "yieldmo/web-sdk",
          name: "web-sdk",
          owner: { login: "yieldmo" },
          description: "SDK",
          private: true,
          fork: false,
          ssh_url: "git@github.com:yieldmo/web-sdk.git",
          clone_url: "https://github.com/yieldmo/web-sdk.git",
          pushed_at: "2026-06-01T00:00:00Z",
        },
      ]);
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: "gho_token123\n" })
        .mockResolvedValueOnce({ stdout: reposJson });

      const result = await new GitHubService().listRepos(location, {
        host: "github.com",
        login: "ym-svecherenko",
      });

      expect(result.repos).toEqual([
        {
          nameWithOwner: "yieldmo/web-sdk",
          owner: "yieldmo",
          name: "web-sdk",
          description: "SDK",
          isPrivate: true,
          isFork: false,
          sshUrl: "git@github.com:yieldmo/web-sdk.git",
          httpsUrl: "https://github.com/yieldmo/web-sdk.git",
          pushedAt: "2026-06-01T00:00:00Z",
        },
      ]);
      expect(execFileAsyncMock.mock.calls[0]![1]).toEqual([
        "auth",
        "token",
        "--hostname",
        "github.com",
        "--user",
        "ym-svecherenko",
      ]);
      const apiArgs = execFileAsyncMock.mock.calls[1]![1] as string[];
      expect(apiArgs[0]).toBe("api");
      expect(apiArgs[1]).toContain("user/repos");
    });

    it("throws (instead of falling back to the active account) when the account token is unavailable", async () => {
      // `gh auth token --user X` fails → no token to scope with.
      execFileAsyncMock.mockRejectedValueOnce(new Error("no token"));

      await expect(
        new GitHubService().listRepos(location, { host: "github.com", login: "ghost" }),
      ).rejects.toThrow(/ghost/);
      // We must not have proceeded to `gh api user/repos` under the active account.
      expect(execFileAsyncMock).toHaveBeenCalledTimes(1);
    });

    it("dedupes and stops fetching after a short page", async () => {
      const page = (names: string[]) =>
        JSON.stringify(names.map((n) => ({ full_name: n, name: n.split("/")[1] })));
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: "tok\n" })
        .mockResolvedValueOnce({ stdout: page(["a/one", "a/two", "a/one"]) });

      const result = await new GitHubService().listRepos(location, {
        host: "github.com",
        login: "a",
      });

      expect(result.repos.map((r) => r.nameWithOwner)).toEqual(["a/one", "a/two"]);
      // auth token + one page; a short page means no further requests.
      expect(execFileAsyncMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("cloneRepo", () => {
    it("clones via gh repo clone and returns the joined path", async () => {
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: "gho_token\n" })
        .mockResolvedValueOnce({ stdout: "" });

      const result = await new GitHubService().cloneRepo(location, "myrepo", "owner/myrepo", {
        host: "github.com",
        login: "SDSLeon",
      });

      expect(result).toEqual({ path: "C:\\Users\\demo\\repo\\myrepo" });
      expect(execFileAsyncMock.mock.calls[1]![1]).toEqual([
        "repo",
        "clone",
        "owner/myrepo",
        "myrepo",
      ]);
    });
  });
});

describe("parseGhAuthAccounts", () => {
  it("returns an empty list for empty output", () => {
    expect(parseGhAuthAccounts("")).toEqual([]);
  });

  it("marks only the active account", () => {
    const out = [
      "  ✓ Logged in to github.com account alice (keyring)",
      "  - Active account: false",
      "  ✓ Logged in to ghe.example.com account bob (oauth_token)",
      "  - Active account: true",
    ].join("\n");

    expect(parseGhAuthAccounts(out)).toEqual([
      { host: "github.com", login: "alice", active: false },
      { host: "ghe.example.com", login: "bob", active: true },
    ]);
  });
});

describe("mapGitHubApiRepo", () => {
  it("falls back to full_name when owner/name fields are missing", () => {
    expect(mapGitHubApiRepo({ full_name: "octo/repo" })).toEqual({
      nameWithOwner: "octo/repo",
      owner: "octo",
      name: "repo",
      description: "",
      isPrivate: false,
      isFork: false,
      sshUrl: "",
      httpsUrl: "",
      pushedAt: "",
    });
  });

  it("returns null without a full_name", () => {
    expect(mapGitHubApiRepo({})).toBeNull();
    expect(mapGitHubApiRepo(null)).toBeNull();
  });
});

describe("GitHub Actions mappers", () => {
  it("rejects workflows without an id or name", () => {
    expect(mapGitHubActionsWorkflow({ id: 1 })).toBeNull();
    expect(mapGitHubActionsWorkflow({ name: "CI" })).toBeNull();
  });

  it("ignores malformed jobs and steps", () => {
    expect(
      mapGitHubActionsRun({
        databaseId: 1,
        jobs: [{ databaseId: 2, name: "Build", steps: [{ number: 1, name: "Compile" }, {}] }, {}],
      }),
    ).toMatchObject({
      id: 1,
      jobs: [
        {
          id: 2,
          name: "Build",
          steps: [{ number: 1, name: "Compile" }],
        },
      ],
    });
  });
});

describe("resolveClonedProjectPath", () => {
  it("joins posix parents with /", () => {
    expect(resolveClonedProjectPath({ kind: "posix", path: "/home/me/code" }, "repo")).toBe(
      "/home/me/code/repo",
    );
  });

  it("joins windows parents with \\", () => {
    expect(resolveClonedProjectPath({ kind: "windows", path: "C:\\Users\\me\\code" }, "repo")).toBe(
      "C:\\Users\\me\\code\\repo",
    );
  });

  it("joins WSL parents onto the UNC path", () => {
    expect(
      resolveClonedProjectPath(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/code",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\code",
        },
        "repo",
      ),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\code\\repo");
  });
});
