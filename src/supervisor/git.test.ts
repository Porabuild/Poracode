import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, mkdirMock, readWslCommandOutputAsync, rmMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  readWslCommandOutputAsync: vi.fn(),
  rmMock: vi.fn(),
}));

vi.mock("./agents/base", () => ({
  getWslCommand: () => "wsl.exe",
  readWslCommandOutputAsync,
  resolveWslShellPathAsync: vi.fn().mockResolvedValue("/bin/bash"),
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    mkdir: mkdirMock,
    rm: rmMock,
  };
});

// Mock execFile (used by execGit internally via promisify(execFile))
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: execFileMock,
  };
});

import { computeDefaultWorktreePath, GitService, parseRemoteUrl } from "./git";

/** Helper to set up execFile mock for git commands. */
function mockGitCommands(handler: (args: string[]) => { stdout?: string; error?: Error }) {
  execFileMock.mockImplementation(
    (
      _cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      const result = handler(args);
      if (result.error) {
        callback(result.error, { stdout: "", stderr: result.error.message });
      } else {
        callback(null, { stdout: result.stdout ?? "", stderr: "" });
      }
    },
  );
}

describe("computeDefaultWorktreePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.skipIf(process.platform !== "win32")(
    "stores Windows worktrees under the user home .lightcode root",
    async () => {
      const path = await computeDefaultWorktreePath(
        {
          kind: "windows",
          path: "C:\\Users\\demo\\work\\lightcode",
        },
        "feature/x",
      );

      expect(path).toMatch(
        new RegExp(
          `^${join(homedir(), ".lightcode", "worktrees").replace(/\\/g, "\\\\")}\\\\lightcode-[a-f0-9]{4}\\\\feature-x$`,
        ),
      );
    },
  );

  it.skipIf(process.platform !== "win32")(
    "separates same-named repos by hashing the canonical project path",
    async () => {
      const first = await computeDefaultWorktreePath(
        {
          kind: "windows",
          path: "C:\\Users\\demo\\work\\lightcode",
        },
        "feature/x",
      );
      const second = await computeDefaultWorktreePath(
        {
          kind: "windows",
          path: "D:\\src\\lightcode",
        },
        "feature/x",
      );

      expect(first).not.toBe(second);
      expect(first).toContain(`${join(".lightcode", "worktrees")}\\lightcode-`);
      expect(second).toContain(`${join(".lightcode", "worktrees")}\\lightcode-`);
    },
  );

  it("stores WSL worktrees under the distro home .lightcode root", async () => {
    readWslCommandOutputAsync.mockResolvedValue({
      ok: true,
      stdout: "/home/demo",
      stderr: "",
    });

    const path = await computeDefaultWorktreePath(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/work/lightcode",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\lightcode",
      },
      "feature/x",
    );

    expect(path).toMatch(/^\/home\/demo\/.lightcode\/worktrees\/lightcode-[a-f0-9]{4}\/feature-x$/);
    expect(readWslCommandOutputAsync).toHaveBeenCalledWith("Ubuntu", "sh", [
      "-lc",
      'printf %s "$HOME"',
    ]);
  });

  it("fails when the WSL home directory cannot be resolved", async () => {
    readWslCommandOutputAsync.mockResolvedValue({
      ok: false,
      stdout: "",
      stderr: "lookup failed",
    });

    await expect(
      computeDefaultWorktreePath(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/lightcode",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\lightcode",
        },
        "feature/x",
      ),
    ).rejects.toThrow('Unable to resolve home directory for WSL distro "Ubuntu".');
  });
});

describe("GitService.addWorktree", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\lightcode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
  });

  it("stores the current branch as the source when no explicit start point is provided", async () => {
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "master\n" };
      if (args[0] === "config") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().addWorktree(
      location,
      "C:\\Users\\demo\\.lightcode\\worktrees\\lightcode-12345678\\lightcode-brave-heron",
      "lightcode/brave-heron",
      true,
    );

    const configCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        (call[1] as string[])[0] === "config" &&
        (call[1] as string[]).includes("branch.lightcode/brave-heron.lightcodeSource"),
    );
    expect(configCall).toBeDefined();
    expect(configCall![1]).toContain("master");
  });
});

describe("GitService.revert", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\lightcode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks out tracked files", async () => {
    mockGitCommands((args) => {
      if (args[0] === "status") return { stdout: "1 .M N... 100644 100644 100644 a b README.md" };
      return { stdout: "" };
    });

    await new GitService().revert(location, "README.md");

    const checkoutCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("checkout"),
    );
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall![1]).toContain("README.md");
  });

  it("cleans untracked files instead of checking them out", async () => {
    mockGitCommands((args) => {
      if (args[0] === "status") return { stdout: "? README.md" };
      return { stdout: "" };
    });

    await new GitService().revert(location, "README.md");

    const cleanCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("clean"),
    );
    expect(cleanCall).toBeDefined();
    expect(cleanCall![1]).toContain("README.md");
  });

  it("reverts unstaged renames by removing the new path and restoring the old one", async () => {
    mockGitCommands((args) => {
      if (args[0] === "status")
        return {
          stdout: "2 .R N... 100644 100644 100644 a b R100 docs/new-name.md\tdocs/old-name.md",
        };
      return { stdout: "" };
    });

    await new GitService().revert(location, "docs/new-name.md");

    const cleanCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("clean"),
    );
    expect(cleanCall).toBeDefined();
    expect(cleanCall![1]).toContain("docs/new-name.md");

    const checkoutCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("checkout"),
    );
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall![1]).toContain("docs/old-name.md");
  });
});

describe("GitService.commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs WSL commits through the login shell so multiline messages stay quoted", async () => {
    mockGitCommands((args) => {
      if (args[0] === "-d") {
        return { stdout: "[main abc1234] feat(dashboard): add taxonomy filters\n" };
      }
      return { stdout: "" };
    });

    const result = await new GitService().commit(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/work/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
      },
      "feat(dashboard): add taxonomy filters\n\n- New `/api/taxonomy-values` endpoint",
      false,
    );

    expect(result).toEqual({ hash: "abc1234" });
    expect(execFileMock).toHaveBeenCalledWith(
      "wsl.exe",
      expect.arrayContaining([
        "-d",
        "Ubuntu",
        "--cd",
        "/home/demo/work/repo",
        "--",
        "/bin/bash",
        "-l",
        "-i",
        "-c",
        expect.stringContaining("`/api/taxonomy-values`"),
      ]),
      expect.objectContaining({
        env: expect.objectContaining({ GIT_OPTIONAL_LOCKS: "0" }),
        windowsHide: true,
      }),
      expect.any(Function),
    );
  });
});

describe("GitService.getStatus", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\lightcode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes Windows-style git paths before returning status", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") return { stdout: "true\n" };
      if (args[0] === "status") {
        return {
          stdout: [
            "# branch.oid abc123",
            "# branch.head feature/worktree",
            "1 M. N... 100644 100644 100644 a b src\\staged.ts",
            "2 .R N... 100644 100644 100644 a b R100 docs\\renamed-new.md\tdocs\\renamed-old.md",
          ].join("\n"),
        };
      }
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "diff") return { stdout: "" };
      return { stdout: "" };
    });

    const result = await new GitService().getStatus(location);

    expect(result.staged[0]?.path).toBe("src/staged.ts");
    expect(result.unstaged[0]?.path).toBe("docs/renamed-new.md");
    expect(result.unstaged[0]?.oldPath).toBe("docs/renamed-old.md");
  });

  it("reports mergeInProgress when unmerged entries exist", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") return { stdout: "true\n" };
      if (args[0] === "status") {
        return {
          stdout: [
            "# branch.oid abc123",
            "# branch.head feature-a",
            "u UU N... 100644 100644 100644 100644 a b c src/file.ts",
          ].join("\n"),
        };
      }
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "diff") return { stdout: "" };
      return { stdout: "" };
    });

    const result = await new GitService().getStatus(location);

    expect(result.mergeInProgress).toBe(true);
    expect(result.conflictFiles).toEqual(["src/file.ts"]);
  });

  it("does not report mergeInProgress when no unmerged entries exist", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") return { stdout: "true\n" };
      if (args[0] === "status") {
        return {
          stdout: ["# branch.oid abc123", "# branch.head main"].join("\n"),
        };
      }
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "diff") return { stdout: "" };
      return { stdout: "" };
    });

    const result = await new GitService().getStatus(location);

    expect(result.mergeInProgress).toBeUndefined();
    expect(result.conflictFiles).toBeUndefined();
  });

  it("includes remoteInfo when origin has a GitHub remote URL", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") return { stdout: "true\n" };
      if (args[0] === "status") {
        return {
          stdout: [
            "# branch.oid abc123",
            "# branch.head main",
            "# branch.upstream origin/main",
            "# branch.ab +0 -0",
          ].join("\n"),
        };
      }
      if (args[0] === "remote")
        return {
          stdout:
            "origin\thttps://github.com/owner/repo.git (fetch)\norigin\thttps://github.com/owner/repo.git (push)\n",
        };
      if (args[0] === "diff") return { stdout: "" };
      return { stdout: "" };
    });

    const result = await new GitService().getStatus(location);

    expect(result.remoteInfo).toEqual({
      url: "https://github.com/owner/repo.git",
      platform: "github",
      owner: "owner",
      repo: "repo",
    });
  });

  it("returns remoteInfo null when no remotes exist", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") return { stdout: "true\n" };
      if (args[0] === "status") {
        return {
          stdout: ["# branch.oid abc123", "# branch.head main"].join("\n"),
        };
      }
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "diff") return { stdout: "" };
      return { stdout: "" };
    });

    const result = await new GitService().getStatus(location);

    expect(result.remoteInfo).toBeNull();
  });
});

describe("GitService.pullFromSource", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\worktree",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fast-forwards when HEAD is ancestor of source branch", async () => {
    mockGitCommands((args) => {
      if (args[0] === "merge-base") return { stdout: "" };
      if (args[0] === "merge") return { stdout: "" };
      return { stdout: "" };
    });

    const result = await new GitService().pullFromSource(location, "main");

    expect(result).toEqual({ merged: true, fastForward: true });
    const mergeCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("merge"),
    );
    expect(mergeCall![1]).toContain("--ff-only");
  });

  it("uses --no-ff when fast-forward is not possible", async () => {
    mockGitCommands((args) => {
      if (args[0] === "merge-base") return { error: new Error("not ancestor") };
      if (args[0] === "merge") return { stdout: "" };
      return { stdout: "" };
    });

    const result = await new GitService().pullFromSource(location, "main");

    expect(result).toEqual({ merged: true, fastForward: false });
    const mergeCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("merge"),
    );
    expect(mergeCall![1]).toContain("--no-ff");
  });

  it("returns conflicting: true without aborting when merge has conflicts", async () => {
    mockGitCommands((args) => {
      if (args[0] === "merge-base") return { error: new Error("not ancestor") };
      if (args[0] === "merge")
        return {
          error: new Error("git merge failed: CONFLICT (content): Merge conflict in src/file.ts"),
        };
      return { stdout: "" };
    });

    const result = await new GitService().pullFromSource(location, "main");

    expect(result.merged).toBe(false);
    expect(result.conflicting).toBe(true);
    expect(result.conflictFiles).toEqual(["src/file.ts"]);
  });
});

describe("GitService.mergeToSource (non-FF path)", () => {
  const repoLocation = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\repo",
  };
  const worktreeLocation = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\worktree",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitCommands((args) => {
      if (args[0] === "merge-base") return { error: new Error("not ancestor") };
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "checkout") return { stdout: "" };
      if (args[0] === "merge") return { stdout: "" };
      if (args[0] === "rev-parse") return { stdout: "abc123\n" };
      if (args[0] === "worktree" && args[1] === "remove") return { stdout: "" };
      return { stdout: "" };
    });
  });

  it("passes --no-ff flag in the non-fast-forward merge path", async () => {
    await new GitService().mergeToSource(repoLocation, worktreeLocation, "feature", "main");

    const mergeCalls = execFileMock.mock.calls.filter(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("merge"),
    );
    expect(mergeCalls.length).toBeGreaterThan(0);
    const mergeArgs = mergeCalls[0]![1] as string[];
    expect(mergeArgs).toContain("--no-ff");
    expect(mergeArgs).toContain("feature");
  });
});

describe("GitService.mergeToSource (source branch checked out elsewhere)", () => {
  const repoLocation = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\repo",
  };
  const worktreeLocation = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\worktree",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges in the checked-out source worktree instead of creating another checkout of that branch", async () => {
    mockGitCommands((args) => {
      if (args[0] === "merge-base") return { error: new Error("not ancestor") };
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: [
            "worktree C:/Users/demo/work/repo",
            "HEAD abc123",
            "branch refs/heads/master",
            "",
            "worktree C:/Users/demo/work/worktree",
            "HEAD def456",
            "branch refs/heads/feature",
            "",
          ].join("\n"),
        };
      }
      if (args[0] === "status" && args[1] === "--porcelain") return { stdout: "" };
      if (args[0] === "merge") return { stdout: "" };
      if (args[0] === "rev-parse") return { stdout: "abc123\n" };
      return { stdout: "" };
    });

    const result = await new GitService().mergeToSource(
      repoLocation,
      worktreeLocation,
      "feature",
      "master",
    );

    expect(result).toEqual({
      merged: true,
      fastForward: false,
      newSourceCommit: "abc123",
    });

    const worktreeAddCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        (call[1] as string[])[0] === "worktree" &&
        (call[1] as string[])[1] === "add",
    );
    expect(worktreeAddCall).toBeUndefined();

    const mergeCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        (call[1] as string[])[0] === "merge" &&
        (call[2] as { cwd?: string }).cwd === repoLocation.path,
    );
    expect(mergeCall).toBeDefined();
  });

  it("fails with a clear error when the checked-out source worktree has local changes", async () => {
    mockGitCommands((args) => {
      if (args[0] === "merge-base") return { error: new Error("not ancestor") };
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: [
            "worktree C:/Users/demo/work/repo",
            "HEAD abc123",
            "branch refs/heads/master",
            "",
            "worktree C:/Users/demo/work/worktree",
            "HEAD def456",
            "branch refs/heads/feature",
            "",
          ].join("\n"),
        };
      }
      if (args[0] === "status" && args[1] === "--porcelain") return { stdout: " M README.md\n" };
      return { stdout: "" };
    });

    const result = await new GitService().mergeToSource(
      repoLocation,
      worktreeLocation,
      "feature",
      "master",
    );

    expect(result.merged).toBe(false);
    expect(result.error).toContain("has uncommitted changes");

    const mergeCall = execFileMock.mock.calls.find(
      (call: unknown[]) => Array.isArray(call[1]) && (call[1] as string[])[0] === "merge",
    );
    expect(mergeCall).toBeUndefined();
  });
});

describe("GitService.getWorktreeSourceBranch", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\lightcode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers a missing source branch from the main worktree branch", async () => {
    mockGitCommands((args) => {
      if (args[0] === "config" && args[1] === "--get") {
        return { error: new Error("not found") };
      }
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: [
            "worktree C:/Users/demo/work/lightcode",
            "HEAD abc123",
            "branch refs/heads/master",
            "",
            "worktree C:/Users/demo/.lightcode/worktrees/lightcode-12345678/lightcode-brave-heron",
            "HEAD def456",
            "branch refs/heads/lightcode/brave-heron",
            "",
          ].join("\n"),
        };
      }
      if (args[0] === "merge-base") return { stdout: "base123\n" };
      if (args[0] === "config") return { stdout: "" };
      if (args[0] === "rev-list") return { stdout: "1\t1\n" };
      return { stdout: "" };
    });

    const result = await new GitService().getWorktreeSourceBranch(
      location,
      "lightcode/brave-heron",
    );

    expect(result).toEqual({
      sourceBranch: "master",
      commitsAhead: 1,
      sourceAhead: 1,
    });

    const configCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        (call[1] as string[])[0] === "config" &&
        (call[1] as string[])[1] !== "--get" &&
        (call[1] as string[]).includes("branch.lightcode/brave-heron.lightcodeSource"),
    );
    expect(configCall).toBeDefined();
    expect(configCall![1]).toContain("master");
  });
});

describe("GitService.removeWorktree", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\repo",
  };
  const worktreePath = "C:\\Users\\demo\\.lightcode\\worktrees\\repo-12345678\\feature-x";

  beforeEach(() => {
    vi.clearAllMocks();
    rmMock.mockResolvedValue(undefined);
  });

  it("removes residual directories when git already detached the worktree", async () => {
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "remove") {
        return {
          error: new Error(`fatal: failed to delete '${worktreePath}': Directory not empty`),
        };
      }
      if (args[0] === "worktree" && args[1] === "list") {
        return { stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\n` };
      }
      return { stdout: "" };
    });

    await new GitService().removeWorktree(location, worktreePath, true);

    expect(rmMock).toHaveBeenCalledWith(worktreePath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 150,
    });
  });

  it("rethrows when git still reports the worktree as attached", async () => {
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "remove") {
        return {
          error: new Error(`fatal: failed to delete '${worktreePath}': Directory not empty`),
        };
      }
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${worktreePath.replace(/\\/g, "/")}\nHEAD def456\nbranch refs/heads/feature-x\n\n`,
        };
      }
      return { stdout: "" };
    });

    await expect(new GitService().removeWorktree(location, worktreePath, true)).rejects.toThrow(
      "failed to delete",
    );
    expect(rmMock).not.toHaveBeenCalled();
  });
});

describe("GitService.deleteBranch", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\repo",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("force-deletes a worktree branch that is merged into its configured source branch", async () => {
    let softDeleteAttempted = false;
    mockGitCommands((args) => {
      if (args[0] === "branch" && args[1] === "-d") {
        softDeleteAttempted = true;
        return { error: new Error("error: The branch 'feature/x' is not fully merged.") };
      }
      if (args[0] === "branch" && args[1] === "-D") return { stdout: "" };
      if (args[0] === "config") return { stdout: "main\n" };
      if (args[0] === "merge-base") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().deleteBranch(location, "feature/x", false);

    expect(softDeleteAttempted).toBe(true);
    const forceDeleteCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("-D"),
    );
    expect(forceDeleteCall).toBeDefined();
  });

  it("prunes stale worktree metadata before retrying a force delete", async () => {
    let forceDeleteAttempts = 0;
    mockGitCommands((args) => {
      if (args[0] === "branch" && args[1] === "-d") {
        return { error: new Error("error: The branch 'feature/x' is not fully merged.") };
      }
      if (args[0] === "branch" && args[1] === "-D") {
        forceDeleteAttempts += 1;
        if (forceDeleteAttempts === 1) {
          return {
            error: new Error(
              "fatal: cannot delete branch 'feature/x' used by worktree at 'C:/Users/demo/worktrees/feature-x'",
            ),
          };
        }
        return { stdout: "" };
      }
      if (args[0] === "config") return { stdout: "main\n" };
      if (args[0] === "merge-base") return { stdout: "" };
      if (args[0] === "worktree" && args[1] === "prune") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().deleteBranch(location, "feature/x", false);

    expect(forceDeleteAttempts).toBe(2);
    const pruneCall = execFileMock.mock.calls.find(
      (c: unknown[]) =>
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === "worktree" &&
        (c[1] as string[])[1] === "prune",
    );
    expect(pruneCall).toBeDefined();
  });

  it("preserves the not-fully-merged failure when the branch is not merged into its source branch", async () => {
    mockGitCommands((args) => {
      if (args[0] === "branch")
        return { error: new Error("error: The branch 'feature/x' is not fully merged.") };
      if (args[0] === "config") return { stdout: "main\n" };
      if (args[0] === "merge-base") return { error: new Error("not ancestor") };
      return { stdout: "" };
    });

    await expect(new GitService().deleteBranch(location, "feature/x", false)).rejects.toThrow(
      "not fully merged",
    );
  });
});

describe("GitService.abortMerge", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\worktree",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs git merge --abort", async () => {
    mockGitCommands(() => ({ stdout: "" }));

    await new GitService().abortMerge(location);

    const mergeCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("merge"),
    );
    expect(mergeCall).toBeDefined();
    expect(mergeCall![1]).toContain("--abort");
  });
});

describe("parseRemoteUrl", () => {
  it("parses GitHub HTTPS URLs", () => {
    const result = parseRemoteUrl("https://github.com/owner/repo.git");
    expect(result).toEqual({
      url: "https://github.com/owner/repo.git",
      platform: "github",
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses GitHub HTTPS URLs without .git suffix", () => {
    const result = parseRemoteUrl("https://github.com/owner/repo");
    expect(result).toEqual({
      url: "https://github.com/owner/repo",
      platform: "github",
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses GitHub SSH URLs", () => {
    const result = parseRemoteUrl("git@github.com:owner/repo.git");
    expect(result).toEqual({
      url: "git@github.com:owner/repo.git",
      platform: "github",
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses GitHub SSH URLs without .git suffix", () => {
    const result = parseRemoteUrl("git@github.com:owner/repo");
    expect(result).toEqual({
      url: "git@github.com:owner/repo",
      platform: "github",
      owner: "owner",
      repo: "repo",
    });
  });

  it("detects GitHub Enterprise by hostname", () => {
    const result = parseRemoteUrl("https://github.mycompany.com/team/project.git");
    expect(result).toEqual({
      url: "https://github.mycompany.com/team/project.git",
      platform: "github",
      owner: "team",
      repo: "project",
    });
  });

  it("detects GitLab remotes", () => {
    const result = parseRemoteUrl("https://gitlab.com/org/project.git");
    expect(result?.platform).toBe("gitlab");
    expect(result?.owner).toBe("org");
    expect(result?.repo).toBe("project");
  });

  it("detects Bitbucket remotes", () => {
    const result = parseRemoteUrl("git@bitbucket.org:team/repo.git");
    expect(result?.platform).toBe("bitbucket");
    expect(result?.owner).toBe("team");
    expect(result?.repo).toBe("repo");
  });

  it("marks unknown hosts", () => {
    const result = parseRemoteUrl("https://git.example.com/org/project.git");
    expect(result?.platform).toBe("unknown");
    expect(result?.owner).toBe("org");
    expect(result?.repo).toBe("project");
  });

  it("returns null for malformed URLs", () => {
    expect(parseRemoteUrl("")).toBeNull();
    expect(parseRemoteUrl("not-a-url")).toBeNull();
    expect(parseRemoteUrl("ftp://example.com/repo")).toBeNull();
  });
});
