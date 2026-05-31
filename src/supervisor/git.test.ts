import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WslBridgeClient,
  WslGitExecInput,
  WslGitExecResult,
  WslLocation,
} from "./wsl/bridge/client";

const { execFileMock, mkdirMock, readFileMock, readWslCommandOutputAsync, statMock } = vi.hoisted(
  () => ({
    execFileMock:
      vi.fn<
        (
          cmd: string,
          args: string[],
          opts: unknown,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
        ) => void
      >(),
    mkdirMock: vi.fn<() => Promise<void>>(),
    readFileMock: vi.fn<() => Promise<string | Buffer>>(),
    readWslCommandOutputAsync:
      vi.fn<() => Promise<{ ok: boolean; stdout: string; stderr: string }>>(),
    statMock: vi.fn<() => Promise<{ isFile(): boolean; size: number; mtimeMs: number }>>(),
  }),
);

vi.mock("./agents/base", async () => {
  const actual = await vi.importActual<typeof import("./agents/base")>("./agents/base");
  return {
    ...actual,
    readWslCommandOutputAsync,
  };
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    mkdir: mkdirMock,
    readFile: readFileMock,
    stat: statMock,
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
    const service = new GitService();
    const home = vi.fn<() => Promise<{ home: string }>>(async () => ({ home: "/home/demo" }));
    service.setWslClient({ home } as unknown as WslBridgeClient);

    try {
      const path = await computeDefaultWorktreePath(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/lightcode",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\lightcode",
        },
        "feature/x",
      );

      expect(path).toMatch(
        /^\/home\/demo\/.lightcode\/worktrees\/lightcode-[a-f0-9]{4}\/feature-x$/,
      );
      expect(home).toHaveBeenCalledWith(expect.objectContaining({ distro: "Ubuntu" }));
      expect(readWslCommandOutputAsync).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });

  it("fails when the WSL home directory cannot be resolved", async () => {
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
    ).rejects.toThrow('Unable to resolve home directory for WSL distro "Ubuntu"');
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

  it("resolves default WSL worktree paths through the bridge", async () => {
    const home = vi.fn<() => Promise<{ home: string }>>(async () => ({ home: "/home/demo" }));
    const bridgeMkdir = vi.fn<() => Promise<void>>(async () => undefined);
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async () => ({
      ok: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    }));
    const service = new GitService();
    service.setWslClient({ home, mkdir: bridgeMkdir, gitExec } as unknown as WslBridgeClient);

    try {
      await service.addWorktree(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/lightcode",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\lightcode",
        },
        undefined,
        "feature/x",
        false,
      );

      expect(home).toHaveBeenCalledWith(expect.objectContaining({ distro: "Ubuntu" }));
      expect(readWslCommandOutputAsync).not.toHaveBeenCalled();
      expect(gitExec).toHaveBeenCalledWith(
        expect.objectContaining({ linuxPath: "/home/demo/work/lightcode" }),
        expect.objectContaining({
          args: [
            "worktree",
            "add",
            expect.stringMatching(
              /^\/home\/demo\/.lightcode\/worktrees\/lightcode-[a-f0-9]{4}\/feature-x$/,
            ),
            "feature/x",
          ],
        }),
      );
    } finally {
      service.setWslClient(undefined);
    }
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

  it("requires the WSL bridge for WSL commits", async () => {
    await expect(
      new GitService().commit(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
        },
        "feat(dashboard): add taxonomy filters",
        false,
      ),
    ).rejects.toThrow("WSL bridge unavailable for Git");
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("runs WSL commits through the bridge with login-shell env when available", async () => {
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async () => ({
      ok: true,
      stdout: "[main def5678] feat(dashboard): add taxonomy filters\n",
      stderr: "",
      exitCode: 0,
    }));
    const service = new GitService();
    service.setWslClient({ gitExec } as unknown as WslBridgeClient);
    const location = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/home/demo/work/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
    };
    const message = "feat(dashboard): add taxonomy filters";

    try {
      const result = await service.commit(location, message, false);

      expect(result).toEqual({ hash: "def5678" });
      expect(gitExec).toHaveBeenCalledWith(
        expect.objectContaining({ linuxPath: "/home/demo/work/repo" }),
        expect.objectContaining({
          cwd: "/home/demo/work/repo",
          args: ["commit", "-m", message],
          loginEnv: true,
          timeoutMs: expect.any(Number),
        }),
      );
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });

  it("surfaces bridge stderr for failed WSL commits", async () => {
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async () => ({
      ok: false,
      stdout: "",
      stderr: "pre-commit hook failed",
      exitCode: 1,
      error: "git exited 1",
    }));
    const service = new GitService();
    service.setWslClient({ gitExec } as unknown as WslBridgeClient);

    try {
      await expect(
        service.commit(
          {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/home/demo/work/repo",
            uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
          },
          "feat: test",
          false,
        ),
      ).rejects.toThrow("pre-commit hook failed");
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });
});

describe("GitService WSL bridge exec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes non-status WSL Git commands through the bridge", async () => {
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async () => ({
      ok: true,
      stdout: "abc123 feat: demo\n",
      stderr: "",
      exitCode: 0,
    }));
    const service = new GitService();
    service.setWslClient({ gitExec } as unknown as WslBridgeClient);

    try {
      const output = await service.getLogRange(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
        },
        "main",
        "HEAD",
      );

      expect(output).toBe("abc123 feat: demo\n");
      expect(gitExec).toHaveBeenCalledWith(
        expect.objectContaining({ distro: "Ubuntu" }),
        expect.objectContaining({
          cwd: "/home/demo/work/repo",
          args: ["log", "--oneline", "main..HEAD"],
          loginEnv: true,
        }),
      );
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });

  it("routes WSL fetch through the bridge when the remote exists", async () => {
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async (_location, input) => {
      if (input.args[0] === "remote") {
        return { ok: true, stdout: "origin\n", stderr: "", exitCode: 0 };
      }
      return { ok: true, stdout: "", stderr: "", exitCode: 0 };
    });
    const service = new GitService();
    service.setWslClient({ gitExec } as unknown as WslBridgeClient);

    try {
      await service.fetch(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
        },
        "origin",
        false,
      );

      expect(gitExec).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ distro: "Ubuntu" }),
        expect.objectContaining({ args: ["remote"], loginEnv: true }),
      );
      expect(gitExec).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ distro: "Ubuntu" }),
        expect.objectContaining({ args: ["fetch", "origin"], loginEnv: true }),
      );
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });

  it("skips WSL fetch when the remote is not configured", async () => {
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async () => ({ ok: true, stdout: "", stderr: "", exitCode: 0 }));
    const service = new GitService();
    service.setWslClient({ gitExec } as unknown as WslBridgeClient);

    try {
      await service.fetch(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
        },
        "origin",
        false,
      );

      expect(gitExec).toHaveBeenCalledTimes(1);
      expect(gitExec).toHaveBeenCalledWith(
        expect.objectContaining({ distro: "Ubuntu" }),
        expect.objectContaining({ args: ["remote"], loginEnv: true }),
      );
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });
});

describe("GitService.getDiff", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\lightcode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to a normal diff for conflict files", async () => {
    const combinedDiff = [
      "diff --cc src/file.ts",
      "index bde0dab,65bea25..0000000",
      "--- a/src/file.ts",
      "+++ b/src/file.ts",
      "@@@ -1,4 -1,4 +1,8 @@@",
    ].join("\n");
    const headDiff = [
      "diff --git a/src/file.ts b/src/file.ts",
      "index bde0dab..6de04f5 100644",
      "--- a/src/file.ts",
      "+++ b/src/file.ts",
      "@@ -1,4 +1,8 @@",
    ].join("\n");

    mockGitCommands((args) => {
      if (args[0] === "diff" && args[1] === "--" && args[2] === "src/file.ts") {
        return { stdout: combinedDiff };
      }
      if (args[0] === "diff" && args[1] === "HEAD") {
        return { stdout: headDiff };
      }
      return { stdout: "" };
    });

    const result = await new GitService().getDiff(location, "src/file.ts", false);

    expect(result.diff).toBe(headDiff);
    expect(execFileMock.mock.calls.some((call) => (call[1] as string[]).includes("HEAD"))).toBe(
      true,
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
    expect(result.conflictFiles).toEqual([
      { path: "src/file.ts", status: "U", staged: false, insertions: 0, deletions: 0 },
    ]);
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
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

  it("routes WSL status snapshots through the bridge when available", async () => {
    const gitBatch = vi.fn<
      (
        location: WslLocation,
        input: { commands: WslGitExecInput[]; timeoutMs?: number },
      ) => Promise<{ results: WslGitExecResult[] }>
    >(async () => ({
      results: [
        { ok: true, stdout: "true\n", stderr: "", exitCode: 0 },
        {
          ok: true,
          stdout: ["# branch.oid abc123", "# branch.head main", "# branch.ab +0 -0"].join("\n"),
          stderr: "",
          exitCode: 0,
        },
        { ok: true, stdout: "", stderr: "", exitCode: 0 },
        { ok: true, stdout: "", stderr: "", exitCode: 0 },
        { ok: true, stdout: "", stderr: "", exitCode: 0 },
      ],
    }));
    const service = new GitService();
    service.setWslClient({ gitBatch } as unknown as WslBridgeClient);

    try {
      const result = await service.getStatus({
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/work/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
      });

      expect(result.branch).toBe("main");
      expect(gitBatch).toHaveBeenCalledWith(
        expect.objectContaining({ linuxPath: "/home/demo/work/repo" }),
        expect.objectContaining({
          commands: expect.arrayContaining([
            expect.objectContaining({
              cwd: "/home/demo/work/repo",
              args: ["status", "--porcelain=v2", "-b"],
            }),
          ]),
        }),
      );
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });

  it("routes WSL project snapshots and gh availability through the bridge", async () => {
    const gitBatch = vi.fn<
      (
        location: WslLocation,
        input: { commands: WslGitExecInput[]; timeoutMs?: number },
      ) => Promise<{ results: WslGitExecResult[] }>
    >(async () => ({
      results: [
        { ok: true, stdout: "true\n", stderr: "", exitCode: 0 },
        { ok: true, stdout: "# branch.head main\n# branch.ab +0 -0\n", stderr: "", exitCode: 0 },
        { ok: true, stdout: "", stderr: "", exitCode: 0 },
        { ok: true, stdout: "", stderr: "", exitCode: 0 },
        { ok: true, stdout: "", stderr: "", exitCode: 0 },
        { ok: true, stdout: "refs/heads/main\tabc123\t*\n", stderr: "", exitCode: 0 },
        {
          ok: true,
          stdout: "worktree /home/demo/work/repo\nHEAD abc123\nbranch refs/heads/main\n\n",
          stderr: "",
          exitCode: 0,
        },
      ],
    }));
    const ghVersion = vi.fn<
      (
        location: WslLocation,
        input: Pick<WslGitExecInput, "cwd" | "loginEnv" | "timeoutMs">,
      ) => Promise<WslGitExecResult>
    >(async () => ({ ok: true, stdout: "gh version 2.0.0\n", stderr: "", exitCode: 0 }));
    const service = new GitService();
    service.setWslClient({ gitBatch, ghVersion } as unknown as WslBridgeClient);

    try {
      const snapshot = await service.batchedWslProjectSnapshot(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
        },
        true,
      );

      expect(snapshot.status?.branch).toBe("main");
      expect(snapshot.branches?.current).toBe("main");
      expect(snapshot.worktrees?.[0]?.path).toBe("/home/demo/work/repo");
      expect(snapshot.ghAvailable).toBe(true);
      expect(ghVersion).toHaveBeenCalledWith(expect.objectContaining({ distro: "Ubuntu" }), {
        cwd: "/home/demo/work/repo",
        loginEnv: true,
        timeoutMs: 10_000,
      });
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
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
      if (args[0] === "remote") return { stdout: "origin\n" };
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
    expect(mergeCall![1]).toContain("origin/main");
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) =>
          Array.isArray(c[1]) && (c[1] as string[]).join(" ") === "fetch origin --prune",
      ),
    ).toBe(true);
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

  it("does not merge a stale source branch when fetch fails", async () => {
    mockGitCommands((args) => {
      if (args[0] === "remote") return { stdout: "origin\n" };
      if (args[0] === "fetch") return { error: new Error("fetch failed") };
      return { stdout: "" };
    });

    await expect(new GitService().pullFromSource(location, "main")).rejects.toThrow("fetch failed");
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "merge",
      ),
    ).toBe(false);
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

  it("asks the renderer to confirm stashing before pulling with local changes", async () => {
    mockGitCommands((args) => {
      if (args[0] === "status") return { stdout: " M src/file.ts\n" };
      return { stdout: "" };
    });

    const result = await new GitService().pullFromSource(location, "main");

    expect(result).toMatchObject({ merged: false, fastForward: false, needsStash: true });
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[])[0] === "merge",
      ),
    ).toBe(false);
  });

  it("stashes local changes, pulls from source, and reapplies the stash when requested", async () => {
    mockGitCommands((args) => {
      if (args[0] === "status") return { stdout: " M src/file.ts\n" };
      return { stdout: "" };
    });

    const result = await new GitService().pullFromSource(location, "main", true);

    expect(result).toEqual({ merged: true, fastForward: true });
    const commands = execFileMock.mock.calls.map((c: unknown[]) => (c[1] as string[]).join(" "));
    expect(commands).toContain("stash push -u -m Lightcode: before pull from main");
    expect(commands).toContain("merge --ff-only origin/main");
    expect(commands).toContain("stash pop");
  });

  it("reports conflicts from re-applying stashed local changes", async () => {
    mockGitCommands((args) => {
      if (args[0] === "status") return { stdout: " M src/file.ts\n" };
      if (args[0] === "stash" && args[1] === "pop") {
        return { error: new Error("CONFLICT (content): Merge conflict in src/file.ts") };
      }
      return { stdout: "" };
    });

    const result = await new GitService().pullFromSource(location, "main", true);

    expect(result).toMatchObject({
      merged: false,
      fastForward: true,
      conflicting: true,
      reapplyConflicting: true,
      conflictFiles: ["src/file.ts"],
    });
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
      if (args[0] === "remote") return { stdout: "origin\n" };
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
    const revListCall = execFileMock.mock.calls.find(
      (call: unknown[]) => Array.isArray(call[1]) && (call[1] as string[])[0] === "rev-list",
    );
    expect(revListCall![1]).toContain("origin/master...lightcode/brave-heron");
  });
});

describe("GitService.push", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\repo",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the current branch when setting upstream without an explicit branch", async () => {
    mockGitCommands((args) => {
      if (args[0] === "branch" && args[1] === "--show-current") {
        return { stdout: "ad_sdk\n" };
      }
      return { stdout: "" };
    });

    await new GitService().push(location, "origin", undefined, true);

    const pushCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        (call[1] as string[])[0] === "push" &&
        (call[1] as string[]).includes("--set-upstream"),
    );
    expect(pushCall).toBeDefined();
    expect(pushCall![1]).toEqual(
      expect.arrayContaining(["push", "--set-upstream", "origin", "ad_sdk"]),
    );
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
  });

  it("removes worktrees with Git's double-force form", async () => {
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${worktreePath.replace(/\\/g, "/")}\nHEAD def456\nbranch refs/heads/feature-x\n\n`,
        };
      }
      return { stdout: "" };
    });

    await new GitService().removeWorktree(location, worktreePath, true);

    const removeCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        (call[1] as string[])[0] === "worktree" &&
        (call[1] as string[])[1] === "remove",
    );
    expect(removeCall?.[1]).toEqual(["worktree", "remove", "--force", "--force", worktreePath]);
  });

  it("prunes when Git removed worktree metadata but reported a remove error", async () => {
    let listCalls = 0;
    let pruneCalls = 0;
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "remove") {
        return {
          error: new Error(
            `fatal: validation failed, cannot remove working tree: '${worktreePath}/.git' does not exist`,
          ),
        };
      }
      if (args[0] === "worktree" && args[1] === "prune") {
        pruneCalls++;
        return { stdout: "" };
      }
      if (args[0] === "worktree" && args[1] === "list") {
        listCalls++;
        if (listCalls === 1) {
          return {
            stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${worktreePath.replace(/\\/g, "/")}\nHEAD def456\nbranch refs/heads/feature-x\n\n`,
          };
        }
        return { stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\n` };
      }
      return { stdout: "" };
    });

    await new GitService().removeWorktree(location, worktreePath, true);

    expect(pruneCalls).toBe(1);
  });

  it("prunes when the worktree is already unregistered", async () => {
    let removeCalls = 0;
    let pruneCalls = 0;
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "remove") {
        removeCalls++;
        return { stdout: "" };
      }
      if (args[0] === "worktree" && args[1] === "prune") {
        pruneCalls++;
        return { stdout: "" };
      }
      if (args[0] === "worktree" && args[1] === "list") {
        return { stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\n` };
      }
      return { stdout: "" };
    });

    await new GitService().removeWorktree(location, worktreePath, true);

    expect(removeCalls).toBe(0);
    expect(pruneCalls).toBe(1);
  });

  it("throws when prune does not remove the worktree registration", async () => {
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
  });

  it("does not remove residual WSL worktree directories through the bridge", async () => {
    const wslLocation = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/home/demo/work/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
    };
    const wslWorktreePath = "/home/demo/.lightcode/worktrees/repo/feature-x";
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async (_location, input) => {
      if (input.args[0] === "worktree" && input.args[1] === "remove") {
        return {
          ok: false,
          stdout: "",
          stderr: `fatal: failed to delete '${wslWorktreePath}': Directory not empty`,
          exitCode: 1,
        };
      }
      if (input.args[0] === "worktree" && input.args[1] === "list") {
        return {
          ok: true,
          stdout: "worktree /home/demo/work/repo\nHEAD abc123\nbranch refs/heads/main\n\n",
          stderr: "",
          exitCode: 0,
        };
      }
      return { ok: true, stdout: "", stderr: "", exitCode: 0 };
    });
    const bridgeRm = vi.fn<() => Promise<void>>(async () => undefined);
    const service = new GitService();
    service.setWslClient({ gitExec, rm: bridgeRm } as unknown as WslBridgeClient);

    try {
      await service.removeWorktree(wslLocation, wslWorktreePath, true);

      expect(bridgeRm).not.toHaveBeenCalled();
      expect(readWslCommandOutputAsync).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
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

  it("force-deletes a branch with -D when force is requested", async () => {
    let forceDeleteAttempted = false;
    mockGitCommands((args) => {
      if (args[0] === "branch" && args[1] === "-D") {
        forceDeleteAttempted = true;
        return { stdout: "" };
      }
      return { stdout: "" };
    });

    await new GitService().deleteBranch(location, "feature/x", true);

    expect(forceDeleteAttempted).toBe(true);
    const softDeleteCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("-d"),
    );
    expect(softDeleteCall).toBeUndefined();
  });

  it("prunes stale worktree metadata before retrying a force delete", async () => {
    let forceDeleteAttempts = 0;
    mockGitCommands((args) => {
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
      if (args[0] === "worktree" && args[1] === "prune") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().deleteBranch(location, "feature/x", true);

    expect(forceDeleteAttempts).toBe(2);
    const pruneCall = execFileMock.mock.calls.find(
      (c: unknown[]) =>
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === "worktree" &&
        (c[1] as string[])[1] === "prune",
    );
    expect(pruneCall).toBeDefined();
  });

  it("surfaces the not-fully-merged failure on a soft delete without escalating", async () => {
    mockGitCommands((args) => {
      if (args[0] === "branch" && args[1] === "-d") {
        return { error: new Error("error: The branch 'feature/x' is not fully merged.") };
      }
      return { stdout: "" };
    });

    await expect(new GitService().deleteBranch(location, "feature/x", false)).rejects.toThrow(
      "not fully merged",
    );
    const forceDeleteCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes("-D"),
    );
    expect(forceDeleteCall).toBeUndefined();
  });
});

describe("GitService.deleteRemoteBranch", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\repo",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the remote branch and removes the local remote-tracking ref", async () => {
    mockGitCommands(() => ({ stdout: "" }));

    await new GitService().deleteRemoteBranch(location, "origin", "feature/x");

    expect(execFileMock.mock.calls.map((call) => call[1])).toEqual([
      ["push", "origin", "--delete", "feature/x"],
      ["update-ref", "-d", "refs/remotes/origin/feature/x"],
    ]);
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

describe("GitService.getStatus", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\lightcode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    statMock.mockResolvedValue({
      isFile: () => true,
      size: 12,
      mtimeMs: 100,
    });
    readFileMock.mockResolvedValue("line-1\nline-2");
  });

  it("expands untracked entries via git ls-files instead of directory recursion", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") return { stdout: "true\n" };
      if (args[0] === "status")
        return {
          stdout: ["# branch.head main", "# branch.ab +0 -0", "? src"].join("\n"),
        };
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "diff") return { stdout: "" };
      if (args[0] === "ls-files") return { stdout: "src/a.ts\0src/b.ts\0" };
      return { stdout: "" };
    });

    const status = await new GitService().getStatus(location);

    expect(status.unstaged).toEqual([
      expect.objectContaining({ path: "src/a.ts", status: "?", insertions: 2, deletions: 0 }),
      expect.objectContaining({ path: "src/b.ts", status: "?", insertions: 2, deletions: 0 }),
    ]);
    expect(readFileMock).toHaveBeenCalledTimes(2);
  });

  it("reuses cached untracked file stats when size and mtime are unchanged", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") return { stdout: "true\n" };
      if (args[0] === "status")
        return {
          stdout: ["# branch.head main", "# branch.ab +0 -0", "? src"].join("\n"),
        };
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "diff") return { stdout: "" };
      if (args[0] === "ls-files") return { stdout: "src/a.ts\0" };
      return { stdout: "" };
    });

    const service = new GitService();
    await service.getStatus(location);
    await service.getStatus(location);

    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it("does not count binary untracked files as inserted text lines", async () => {
    readFileMock.mockResolvedValue(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    );

    mockGitCommands((args) => {
      if (args[0] === "rev-parse") return { stdout: "true\n" };
      if (args[0] === "status")
        return {
          stdout: [
            "# branch.head main",
            "# branch.ab +0 -0",
            "? website/public/hero-screenshot.png",
          ].join("\n"),
        };
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "diff") return { stdout: "" };
      if (args[0] === "ls-files") return { stdout: "website/public/hero-screenshot.png\0" };
      return { stdout: "" };
    });

    const status = await new GitService().getStatus(location);

    expect(status.unstaged).toEqual([
      expect.objectContaining({
        path: "website/public/hero-screenshot.png",
        status: "?",
        insertions: 0,
        deletions: 0,
      }),
    ]);
    expect(status.totalInsertions).toBe(0);
  });

  it("refreshes cached untracked file stats when file metadata changes", async () => {
    statMock
      .mockResolvedValueOnce({
        isFile: () => true,
        size: 12,
        mtimeMs: 100,
      })
      .mockResolvedValueOnce({
        isFile: () => true,
        size: 14,
        mtimeMs: 200,
      });

    mockGitCommands((args) => {
      if (args[0] === "rev-parse") return { stdout: "true\n" };
      if (args[0] === "status")
        return {
          stdout: ["# branch.head main", "# branch.ab +0 -0", "? src"].join("\n"),
        };
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "diff") return { stdout: "" };
      if (args[0] === "ls-files") return { stdout: "src/a.ts\0" };
      return { stdout: "" };
    });

    const service = new GitService();
    await service.getStatus(location);
    await service.getStatus(location);

    expect(readFileMock).toHaveBeenCalledTimes(2);
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
