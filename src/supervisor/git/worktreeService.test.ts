import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  execGit: vi.fn<(location: unknown, args: string[], options?: unknown) => Promise<string>>(),
  computeDefaultWorktreePath: vi.fn<(location: unknown, branch: string) => Promise<string>>(),
  ensureWorktreeParentExists: vi.fn<() => Promise<void>>(),
}));

vi.mock("./exec", async () => {
  const actual = await vi.importActual<typeof import("./exec")>("./exec");
  return {
    ...actual,
    execGit: mocks.execGit,
    computeDefaultWorktreePath: mocks.computeDefaultWorktreePath,
    ensureWorktreeParentExists: mocks.ensureWorktreeParentExists,
  };
});

import { GIT_NETWORK_TIMEOUT } from "./exec";
import { GitWorktreeService, isValidGitBranchName } from "./worktreeService";

const location: ProjectLocation = {
  kind: "posix",
  path: "/repo",
};

describe("GitWorktreeService pull", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execGit.mockResolvedValue("");
    mocks.computeDefaultWorktreePath.mockImplementation(
      async (_location, branch) => `/worktrees/${branch.replaceAll("/", "-")}`,
    );
    mocks.ensureWorktreeParentExists.mockResolvedValue(undefined);
  });

  it("uses an explicit merge strategy for regular pulls", async () => {
    await new GitWorktreeService().pull(location, "origin");

    expect(mocks.execGit).toHaveBeenCalledWith(location, ["pull", "--no-rebase", "origin"], {
      timeout: GIT_NETWORK_TIMEOUT,
    });
  });

  it("uses an explicit rebase strategy for rebase pulls", async () => {
    await new GitWorktreeService().pullRebase(location, "upstream");

    expect(mocks.execGit).toHaveBeenCalledWith(location, ["pull", "--rebase", "upstream"], {
      timeout: GIT_NETWORK_TIMEOUT,
    });
  });
});

describe("GitWorktreeService branch validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["feature/valid", "poracode/candidate-1", "release/v1.2.3"])(
    "accepts a valid branch name: %s",
    (branch) => {
      expect(isValidGitBranchName(branch)).toBe(true);
    },
  );

  it.each(["", "@", "HEAD", "-candidate", "candidate..one", "candidate.lock", "bad\u0000ref"])(
    "rejects an invalid branch name locally: %s",
    (branch) => {
      expect(isValidGitBranchName(branch)).toBe(false);
    },
  );

  it("does not invoke Git while resolving an invalid stale branch owner", async () => {
    const service = new GitWorktreeService();

    await expect(service.getWorktreeOwner(location, "candidate..invalid")).resolves.toEqual({
      ownerToken: null,
    });
    expect(mocks.execGit).not.toHaveBeenCalled();
  });

  it("probes a missing valid branch without Git's fatal show-ref diagnostic", async () => {
    mocks.execGit.mockResolvedValue("");

    await expect(serviceOwner("candidate/missing")).resolves.toBeNull();
    expect(mocks.execGit).toHaveBeenCalledWith(
      location,
      ["rev-parse", "--verify", "--quiet", "refs/heads/candidate/missing"],
      { acceptedExitCodes: [1] },
    );
  });

  it("recognizes an existing branch while probing without diagnostics", async () => {
    mocks.execGit.mockImplementation(async (_location, args) => {
      if (args[0] === "rev-parse") return `${"a".repeat(40)}\n`;
      if (args[0] === "reflog") return "poracode experiment owner experiment-1\n";
      return "";
    });

    await expect(serviceOwner("candidate/existing")).resolves.toBe("experiment-1");
    expect(mocks.execGit).toHaveBeenCalledWith(
      location,
      ["rev-parse", "--verify", "--quiet", "refs/heads/candidate/existing"],
      { acceptedExitCodes: [1] },
    );
  });
});

async function serviceOwner(branch: string): Promise<string | null> {
  const result = await new GitWorktreeService().getWorktreeOwner(location, branch);
  return result.ownerToken;
}

describe("GitWorktreeService experiment batches", () => {
  const baseCommit = "a".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.computeDefaultWorktreePath.mockImplementation(
      async (_location, branch) => `/worktrees/${branch.replaceAll("/", "-")}`,
    );
    mocks.ensureWorktreeParentExists.mockResolvedValue(undefined);
  });

  it("bounds parallel creation and returns candidates in request order", async () => {
    const pending: Array<() => void> = [];
    let activeCreates = 0;
    let peakCreates = 0;
    mocks.execGit.mockImplementation(async (_location, args) => {
      if (args[0] === "show-ref") return baseCommit;
      if (args[0] === "rev-parse") return `${baseCommit}\n`;
      if (args[0] === "worktree" && args[1] === "add") {
        activeCreates += 1;
        peakCreates = Math.max(peakCreates, activeCreates);
        return new Promise<string>((resolve) => {
          pending.push(() => {
            activeCreates -= 1;
            resolve("");
          });
        });
      }
      return "";
    });
    const candidates = Array.from({ length: 4 }, (_, index) => ({
      threadId: `thread-${index + 1}`,
      branch: `poracode/candidate-${index + 1}`,
      ownerToken: `experiment:thread-${index + 1}`,
    }));

    const creating = new GitWorktreeService().addOwnedWorktreesBatch({
      projectLocation: location,
      sourceBranch: "main",
      baseCommit,
      candidates,
    });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(peakCreates).toBe(2);
    pending.shift()!();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending.shift()!();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending.splice(0).forEach((resolve) => resolve());

    const result = await creating;
    expect(peakCreates).toBe(2);
    expect(result.candidates.map((candidate) => candidate.threadId)).toEqual(
      candidates.map((candidate) => candidate.threadId),
    );
    expect(result.candidates.every((candidate) => candidate.path && !candidate.error)).toBe(true);
  });

  it("lists once while removing an owned batch", async () => {
    mocks.execGit.mockImplementation(async (_location, args) => {
      if (args.slice(0, 3).join(" ") === "worktree list --porcelain") {
        return [
          "worktree /repo",
          `HEAD ${baseCommit}`,
          "branch refs/heads/main",
          "",
          "worktree /worktrees/one",
          `HEAD ${baseCommit}`,
          "branch refs/heads/poracode/one",
          "",
          "worktree /worktrees/two",
          `HEAD ${baseCommit}`,
          "branch refs/heads/poracode/two",
          "",
        ].join("\n");
      }
      if (args[0] === "show-ref") return baseCommit;
      if (args[0] === "config" && args[1] === "--get") {
        return args[2]!.includes("one") ? "owner-one\n" : "owner-two\n";
      }
      return "";
    });

    const result = await new GitWorktreeService().removeOwnedWorktreesBatch({
      projectLocation: location,
      candidates: [
        {
          threadId: "thread-one",
          branch: "poracode/one",
          ownerToken: "owner-one",
          worktreePath: "/worktrees/one",
        },
        {
          threadId: "thread-two",
          branch: "poracode/two",
          ownerToken: "owner-two",
          worktreePath: "/worktrees/two",
        },
      ],
    });

    expect(result.candidates.map((candidate) => candidate.threadId)).toEqual([
      "thread-one",
      "thread-two",
    ]);
    expect(
      mocks.execGit.mock.calls.filter(([, args]) => args.join(" ") === "worktree list --porcelain"),
    ).toHaveLength(1);
    expect(
      mocks.execGit.mock.calls.filter(([, args]) => args[0] === "worktree" && args[1] === "remove"),
    ).toHaveLength(2);
  });

  it("does not prepare a worktree whose owner token no longer matches", async () => {
    mocks.execGit.mockImplementation(async (_location, args) => {
      if (args.slice(0, 3).join(" ") === "worktree list --porcelain") {
        return [
          "worktree /repo",
          `HEAD ${baseCommit}`,
          "branch refs/heads/main",
          "",
          "worktree /worktrees/one",
          `HEAD ${baseCommit}`,
          "branch refs/heads/poracode/one",
          "",
        ].join("\n");
      }
      if (args[0] === "show-ref") return baseCommit;
      if (args[0] === "config" && args[1] === "--get") return "different-owner\n";
      return "";
    });
    const prepare = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const result = await new GitWorktreeService().removeOwnedWorktreesBatch(
      {
        projectLocation: location,
        candidates: [
          {
            threadId: "thread-one",
            branch: "poracode/one",
            ownerToken: "owner-one",
            worktreePath: "/worktrees/one",
          },
        ],
      },
      prepare,
    );

    expect(prepare).toHaveBeenCalledWith([]);
    expect(result.candidates[0]?.error).toBeTruthy();
    expect(
      mocks.execGit.mock.calls.some(([, args]) => args[0] === "worktree" && args[1] === "remove"),
    ).toBe(false);
  });
});
