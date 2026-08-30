import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WslBridgeClient,
  WslGitExecInput,
  WslGitExecResult,
  WslLocation,
} from "./wsl/bridge/client";

const { execFileMock, mkdirMock, readFileMock, readWslCommandOutputAsync, rmMock, statMock } =
  vi.hoisted(() => ({
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
    rmMock: vi.fn<() => Promise<void>>(),
    statMock: vi.fn<() => Promise<{ isFile(): boolean; size: number; mtimeMs: number }>>(),
  }));

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
    rm: rmMock,
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
import {
  gitAddWorktreePayloadSchema,
  gitDeleteBranchPayloadSchema,
  gitMergeToSourcePayloadSchema,
  gitRemoveWorktreePayloadSchema,
} from "@/shared/contracts";

// Every git invocation is prefixed with `-c core.quotepath=false` (see
// withQuotePathDisabled in git/exec.ts) so non-ASCII paths print as raw UTF-8.
const GIT_QUOTEPATH_PREFIX = ["-c", "core.quotepath=false"];

/** Strip the leading `-c core.quotepath=false` pair from a recorded arg array. */
function gitSubcommandArgs(args: string[]): string[] {
  return args[0] === "-c" && args[1] === "core.quotepath=false" ? args.slice(2) : args;
}

/** Helper to set up execFile mock for git commands. */
function mockGitCommands(handler: (args: string[]) => { stdout?: string; error?: Error }) {
  execFileMock.mockImplementation(
    (
      _cmd: string,
      rawArgs: string[],
      _opts: unknown,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      const args = gitSubcommandArgs(rawArgs);
      const result = handler(args);
      if (result.error) {
        callback(result.error, { stdout: "", stderr: result.error.message });
      } else {
        callback(null, { stdout: result.stdout ?? "", stderr: "" });
      }
    },
  );
}

describe("git worktree contract validation", () => {
  const projectLocation = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\repo",
  };
  const frozenCommit = "a".repeat(40);

  it("requires complete frozen-source metadata", () => {
    const payload = {
      projectLocation,
      branch: "poracode/candidate",
      createBranch: true,
      startPoint: frozenCommit,
      sourceBranch: "main",
      ownerToken: "experiment-1",
    };

    expect(gitAddWorktreePayloadSchema.safeParse(payload).success).toBe(true);
    expect(gitAddWorktreePayloadSchema.safeParse({ ...payload, createBranch: false }).success).toBe(
      false,
    );
    expect(gitAddWorktreePayloadSchema.safeParse({ ...payload, branch: undefined }).success).toBe(
      false,
    );
    expect(gitAddWorktreePayloadSchema.safeParse({ ...payload, startPoint: "main" }).success).toBe(
      false,
    );
    expect(
      gitAddWorktreePayloadSchema.safeParse({ ...payload, sourceBranch: undefined }).success,
    ).toBe(false);
  });

  it("requires branch-scoped ownership expectations", () => {
    expect(
      gitRemoveWorktreePayloadSchema.safeParse({
        projectLocation,
        path: "C:\\repo\\candidate",
        expectedOwnerToken: "experiment-1:candidate-1",
      }).success,
    ).toBe(false);
    expect(
      gitDeleteBranchPayloadSchema.safeParse({
        projectLocation,
        branch: "candidate",
        remote: "origin",
        expectedOwnerToken: "experiment-1:candidate-1",
      }).success,
    ).toBe(false);
  });

  it("accepts only full commit hashes for an expected merge commit", () => {
    const payload = {
      projectLocation,
      worktreeLocation: projectLocation,
      worktreeBranch: "feature",
      sourceBranch: "main",
    };

    expect(gitMergeToSourcePayloadSchema.safeParse(payload).success).toBe(true);
    expect(
      gitMergeToSourcePayloadSchema.safeParse({
        ...payload,
        expectedWorktreeCommit: frozenCommit,
      }).success,
    ).toBe(true);
    expect(
      gitMergeToSourcePayloadSchema.safeParse({
        ...payload,
        expectedWorktreeCommit: "b".repeat(64),
      }).success,
    ).toBe(true);
    expect(
      gitMergeToSourcePayloadSchema.safeParse({
        ...payload,
        expectedWorktreeCommit: "abc123",
      }).success,
    ).toBe(false);
  });
});

describe("computeDefaultWorktreePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.skipIf(process.platform !== "win32")(
    "stores Windows worktrees under the user home .poracode root",
    async () => {
      const path = await computeDefaultWorktreePath(
        {
          kind: "windows",
          path: "C:\\Users\\demo\\work\\poracode",
        },
        "feature/x",
      );

      expect(path).toMatch(
        new RegExp(
          `^${join(homedir(), ".poracode", "worktrees").replace(/\\/g, "\\\\")}\\\\poracode-[a-f0-9]{4}\\\\feature-x$`,
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
          path: "C:\\Users\\demo\\work\\poracode",
        },
        "feature/x",
      );
      const second = await computeDefaultWorktreePath(
        {
          kind: "windows",
          path: "D:\\src\\poracode",
        },
        "feature/x",
      );

      expect(first).not.toBe(second);
      expect(first).toContain(`${join(".poracode", "worktrees")}\\poracode-`);
      expect(second).toContain(`${join(".poracode", "worktrees")}\\poracode-`);
    },
  );

  it("places worktrees under a custom root, keeping the repo-hash segment", async () => {
    const root = join(homedir(), "custom-worktrees");
    const path = await computeDefaultWorktreePath(
      { kind: process.platform === "win32" ? "windows" : "posix", path: join(homedir(), "repo") },
      "feature/x",
      { root },
    );
    expect(path.startsWith(root)).toBe(true);
    expect(path).toMatch(/[/\\][^/\\]+-[a-f0-9]{4}[/\\]feature-x$/);
  });

  it("omits the repo-hash segment for project-relative placement", async () => {
    const root = join(homedir(), "repo", ".poracode", "worktrees");
    const path = await computeDefaultWorktreePath(
      { kind: process.platform === "win32" ? "windows" : "posix", path: join(homedir(), "repo") },
      "feature/x",
      { root, omitRepoDir: true },
    );
    expect(path).toBe(join(root, "feature-x"));
  });

  it("stores WSL worktrees under the distro home .poracode root", async () => {
    const service = new GitService();
    const home = vi.fn<() => Promise<{ home: string }>>(async () => ({ home: "/home/demo" }));
    service.setWslClient({ home } as unknown as WslBridgeClient);

    try {
      const path = await computeDefaultWorktreePath(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/poracode",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\poracode",
        },
        "feature/x",
      );

      expect(path).toMatch(/^\/home\/demo\/.poracode\/worktrees\/poracode-[a-f0-9]{4}\/feature-x$/);
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
          linuxPath: "/home/demo/work/poracode",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\poracode",
        },
        "feature/x",
      ),
    ).rejects.toThrow('Unable to resolve home directory for WSL distro "Ubuntu"');
  });
});

describe("GitService.addWorktree", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\poracode",
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
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron",
      "poracode/brave-heron",
      true,
    );

    const configCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        gitSubcommandArgs(call[1] as string[])[0] === "config" &&
        gitSubcommandArgs(call[1] as string[]).includes(
          "branch.poracode/brave-heron.poracodeSource",
        ),
    );
    expect(configCall).toBeDefined();
    expect(configCall![1]).toContain("master");
  });

  it("stores an explicit source branch when the worktree starts from a frozen commit", async () => {
    const frozenCommit = "a".repeat(40);
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "show-ref") return { stdout: `${frozenCommit} refs/heads/main\n` };
      if (args[0] === "rev-parse") return { stdout: `${frozenCommit}\n` };
      if (args[0] === "config") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().addWorktree(
      location,
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron",
      "poracode/brave-heron",
      true,
      frozenCommit,
      undefined,
      false,
      false,
      undefined,
      "main",
      "experiment-1",
    );

    const sourceConfigCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        gitSubcommandArgs(call[1] as string[])[0] === "config" &&
        gitSubcommandArgs(call[1] as string[]).includes(
          "branch.poracode/brave-heron.poracodeSource",
        ),
    );
    expect(sourceConfigCall).toBeDefined();
    expect(sourceConfigCall![1]).toContain("main");
    const ownerConfigCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        gitSubcommandArgs(call[1] as string[]).includes(
          "branch.poracode/brave-heron.poracodeOwner",
        ),
    );
    expect(ownerConfigCall).toBeDefined();
    expect(ownerConfigCall![1]).toContain("experiment-1");
    const commands = execFileMock.mock.calls.map((call: unknown[]) =>
      gitSubcommandArgs(call[1] as string[]),
    );
    expect(commands).toContainEqual([
      "update-ref",
      "--create-reflog",
      "-m",
      "poracode experiment owner experiment-1",
      "refs/heads/poracode/brave-heron",
      frozenCommit,
      "0".repeat(40),
    ]);
    expect(commands).toContainEqual([
      "worktree",
      "add",
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron",
      "poracode/brave-heron",
    ]);
    const worktreeAddIndex = commands.findIndex(
      (args) => args[0] === "worktree" && args[1] === "add",
    );
    expect(
      commands.findIndex((args) => args.includes("branch.poracode/brave-heron.poracodeOwner")),
    ).toBeLessThan(worktreeAddIndex);
    expect(
      commands.findIndex((args) => args.includes("branch.poracode/brave-heron.poracodeSource")),
    ).toBeLessThan(worktreeAddIndex);
  });

  it("reports frozen-metadata rollback leftovers with their path and branch", async () => {
    const frozenCommit = "a".repeat(40);
    const worktreePath =
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron";
    mockGitCommands((args) => {
      if (args[0] === "show-ref") return { stdout: `${frozenCommit} refs/heads/main\n` };
      if (args[0] === "rev-parse") return { stdout: `${frozenCommit}\n` };
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "config") return { error: new Error("config failed") };
      if (args[0] === "worktree" && args[1] === "remove") {
        return { error: new Error("remove failed") };
      }
      if (args[0] === "branch" && args[1] === "-D") {
        return { error: new Error("delete failed") };
      }
      return { stdout: "" };
    });

    await expect(
      new GitService().addWorktree(
        location,
        worktreePath,
        "poracode/brave-heron",
        true,
        frozenCommit,
        undefined,
        false,
        false,
        undefined,
        "main",
      ),
    ).rejects.toThrow(
      `Rollback left worktree at ${worktreePath}: Git worktree failed: remove failed; branch poracode/brave-heron: Git branch failed: delete failed`,
    );

    const commands = execFileMock.mock.calls.map((call: unknown[]) =>
      gitSubcommandArgs(call[1] as string[]),
    );
    expect(commands).toContainEqual(["worktree", "remove", "--force", worktreePath]);
    expect(commands).toContainEqual(["branch", "-D", "poracode/brave-heron"]);
  });

  it("qualifies a bare remote-tracking branch start point with its remote", async () => {
    // The composer passes a remote branch's short name (no "origin/" prefix) as
    // the base. On its own that is not a valid object, so the worktree add must
    // fork from the qualified `origin/<name>` ref instead.
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "remote") return { stdout: "origin\n" };
      if (args[0] === "rev-parse") {
        const ref = args[args.length - 1];
        // The bare name does not resolve; only the qualified remote ref does.
        if (ref === "refs/remotes/origin/poracode/silver-meadow-abcd") return { stdout: "sha\n" };
        return { error: new Error("fatal: Needed a single revision") };
      }
      if (args[0] === "config") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().addWorktree(
      location,
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron",
      "poracode/brave-heron",
      true,
      "poracode/silver-meadow-abcd",
    );

    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(
      commands.some((c) =>
        c.includes(
          "worktree add --no-track -b poracode/brave-heron " +
            "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron " +
            "origin/poracode/silver-meadow-abcd",
        ),
      ),
    ).toBe(true);

    expect(commands.some((c) => c.includes("branch --unset-upstream poracode/brave-heron"))).toBe(
      true,
    );

    // The recorded source branch is the qualified ref, so diff bases line up.
    const configCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        gitSubcommandArgs(call[1] as string[])[0] === "config" &&
        gitSubcommandArgs(call[1] as string[]).includes(
          "branch.poracode/brave-heron.poracodeSource",
        ),
    );
    expect(configCall).toBeDefined();
    expect(configCall![1]).toContain("origin/poracode/silver-meadow-abcd");
  });

  it("does not let a remote-tracking start point become the new branch's upstream", async () => {
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "rev-parse") return { stdout: "sha\n" };
      if (args[0] === "config") return { stdout: "" };
      if (args[0] === "branch" && args[1] === "--unset-upstream") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().addWorktree(
      location,
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron",
      "poracode/brave-heron",
      true,
      "origin/master",
    );

    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(
      commands.some(
        (c) =>
          c.startsWith("worktree add --no-track -b poracode/brave-heron") &&
          c.endsWith("origin/master"),
      ),
    ).toBe(true);
    expect(commands).toContain("branch --unset-upstream poracode/brave-heron");
  });

  it("leaves a start point untouched when it resolves locally", async () => {
    const revParseRefs: string[] = [];
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "rev-parse") {
        revParseRefs.push(args[args.length - 1]!);
        return { stdout: "sha\n" }; // resolves directly — no remote lookup needed
      }
      if (args[0] === "config") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().addWorktree(
      location,
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron",
      "poracode/brave-heron",
      true,
      "main",
    );

    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(
      commands.some(
        (c) => c.includes("worktree add --no-track -b poracode/brave-heron") && c.endsWith("main"),
      ),
    ).toBe(true);
    // A resolvable start point short-circuits before any `git remote` lookup.
    expect(commands.some((c) => c === "remote")).toBe(false);
    expect(revParseRefs).toEqual(["main"]);
  });

  it("qualifies with the single matching remote when several remotes are configured", async () => {
    // Two remotes exist, but only `upstream` carries the branch — qualify with it.
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "remote") return { stdout: "origin\nupstream\n" };
      if (args[0] === "rev-parse") {
        const ref = args[args.length - 1];
        if (ref === "refs/remotes/upstream/feature/x") return { stdout: "sha\n" };
        return { error: new Error("fatal: Needed a single revision") };
      }
      if (args[0] === "config") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().addWorktree(
      location,
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron",
      "poracode/brave-heron",
      true,
      "feature/x",
    );

    const wtAdd = execFileMock.mock.calls
      .map((c: unknown[]) => gitSubcommandArgs(c[1] as string[]).join(" "))
      .find((c) => c.startsWith("worktree add --no-track -b poracode/brave-heron"));
    expect(wtAdd?.endsWith("upstream/feature/x")).toBe(true);
  });

  it("prefers origin when the branch name exists on multiple remotes", async () => {
    // Both `origin` and `upstream` carry the name — prefer origin, matching the
    // module's origin-centric diff-base handling, rather than failing as ambiguous.
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "remote") return { stdout: "upstream\norigin\n" };
      if (args[0] === "rev-parse") {
        const ref = args[args.length - 1];
        if (ref === "refs/remotes/origin/feature/x" || ref === "refs/remotes/upstream/feature/x") {
          return { stdout: "sha\n" };
        }
        return { error: new Error("fatal: Needed a single revision") };
      }
      if (args[0] === "config") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().addWorktree(
      location,
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron",
      "poracode/brave-heron",
      true,
      "feature/x",
    );

    const wtAdd = execFileMock.mock.calls
      .map((c: unknown[]) => gitSubcommandArgs(c[1] as string[]).join(" "))
      .find((c) => c.startsWith("worktree add --no-track -b poracode/brave-heron"));
    expect(wtAdd?.endsWith("origin/feature/x")).toBe(true);
  });

  it("forks a local branch directly when its name also exists on a remote", async () => {
    // The bare name resolves locally, so the worktree forks the local branch and
    // never consults remotes (no qualification, no `git remote` call).
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "add") return { stdout: "" };
      if (args[0] === "rev-parse") return { stdout: "sha\n" }; // resolves locally
      if (args[0] === "config") return { stdout: "" };
      return { stdout: "" };
    });

    await new GitService().addWorktree(
      location,
      "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\poracode-brave-heron",
      "poracode/brave-heron",
      true,
      "feature/x",
    );

    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    const wtAdd = commands.find((c) =>
      c.startsWith("worktree add --no-track -b poracode/brave-heron"),
    );
    expect(wtAdd?.endsWith("feature/x")).toBe(true);
    expect(commands.some((c) => c === "remote")).toBe(false);
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
          linuxPath: "/home/demo/work/poracode",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\poracode",
        },
        undefined,
        "feature/x",
        false,
      );

      expect(home).toHaveBeenCalledWith(expect.objectContaining({ distro: "Ubuntu" }));
      expect(readWslCommandOutputAsync).not.toHaveBeenCalled();
      expect(gitExec).toHaveBeenCalledWith(
        expect.objectContaining({ linuxPath: "/home/demo/work/poracode" }),
        expect.objectContaining({
          args: [
            ...GIT_QUOTEPATH_PREFIX,
            "worktree",
            "add",
            expect.stringMatching(
              /^\/home\/demo\/.poracode\/worktrees\/poracode-[a-f0-9]{4}\/feature-x$/,
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

describe("GitService.addWorktree (transfer uncommitted changes)", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\poracode",
  };
  const worktreePath = "C:\\Users\\demo\\.poracode\\worktrees\\poracode-12345678\\feature-x";

  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
  });

  it("moves the stash into the worktree, drops it, and leaves the source clean", async () => {
    let stashPushed = false;
    mockGitCommands((args) => {
      if (args[0] === "status" && args[1] === "--porcelain") return { stdout: " M src/file.ts\n" };
      if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "master\n" };
      if (args[0] === "stash" && args[1] === "push") {
        stashPushed = true;
        return { stdout: "" };
      }
      // The transfer stash is only pinned once `stash push` actually creates it.
      if (args[0] === "rev-parse" && args.includes("stash@{0}")) {
        return stashPushed ? { stdout: "stashsha\n" } : { error: new Error("unknown revision") };
      }
      if (args[0] === "stash" && args[1] === "list") return { stdout: "stashsha stash@{0}\n" };
      return { stdout: "" };
    });

    const result = await new GitService().addWorktree(
      location,
      worktreePath,
      "feature/x",
      true,
      "master",
      undefined,
      true,
    );

    expect(result.changesTransferred).toBe(true);

    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(commands.some((c) => c.startsWith("stash push -u"))).toBe(true);
    expect(commands.some((c) => c.startsWith("worktree add --no-track -b feature/x"))).toBe(true);
    // Never relies on stash@{0}: apply/drop are pinned to the captured SHA.
    expect(commands).not.toContain("stash pop");

    // Move semantics: the pinned stash is applied ONLY inside the worktree (the
    // source is left clean — not re-applied), then dropped.
    const applyCwds = execFileMock.mock.calls
      .filter(
        (c: unknown[]) =>
          Array.isArray(c[1]) &&
          gitSubcommandArgs(c[1] as string[]).join(" ") === "stash apply --index stashsha",
      )
      .map((c: unknown[]) => (c[2] as { cwd?: string }).cwd);
    expect(applyCwds).toEqual([worktreePath]);
    expect(applyCwds).not.toContain(location.path);
    expect(commands).toContain("stash drop stash@{0}");
  });

  it("copies the stash into the worktree and restores the source when keepChangesInSource is set", async () => {
    let stashPushed = false;
    mockGitCommands((args) => {
      if (args[0] === "status" && args[1] === "--porcelain") return { stdout: " M src/file.ts\n" };
      if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "master\n" };
      if (args[0] === "stash" && args[1] === "push") {
        stashPushed = true;
        return { stdout: "" };
      }
      // The transfer stash is only pinned once `stash push` actually creates it.
      if (args[0] === "rev-parse" && args.includes("stash@{0}")) {
        return stashPushed ? { stdout: "stashsha\n" } : { error: new Error("unknown revision") };
      }
      if (args[0] === "stash" && args[1] === "list") return { stdout: "stashsha stash@{0}\n" };
      return { stdout: "" };
    });

    const result = await new GitService().addWorktree(
      location,
      worktreePath,
      "feature/x",
      true,
      "master",
      undefined,
      true,
      true,
    );

    expect(result.changesTransferred).toBe(true);

    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(commands).not.toContain("stash pop");

    // Copy semantics: the pinned stash is applied into BOTH the worktree and the
    // source, then dropped — the source keeps its changes.
    const applyCwds = execFileMock.mock.calls
      .filter(
        (c: unknown[]) =>
          Array.isArray(c[1]) &&
          gitSubcommandArgs(c[1] as string[]).join(" ") === "stash apply --index stashsha",
      )
      .map((c: unknown[]) => (c[2] as { cwd?: string }).cwd);
    expect(applyCwds).toContain(worktreePath);
    expect(applyCwds).toContain(location.path);
    expect(commands).toContain("stash drop stash@{0}");
  });

  it("keeps the changes stashed (changesTransferred=false) when the worktree apply conflicts", async () => {
    let stashPushed = false;
    mockGitCommands((args) => {
      if (args[0] === "status" && args[1] === "--porcelain") return { stdout: " M src/file.ts\n" };
      if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "master\n" };
      if (args[0] === "stash" && args[1] === "push") {
        stashPushed = true;
        return { stdout: "" };
      }
      if (args[0] === "rev-parse" && args.includes("stash@{0}")) {
        return stashPushed ? { stdout: "stashsha\n" } : { error: new Error("unknown revision") };
      }
      if (args[0] === "stash" && args[1] === "apply") {
        return { error: new Error("CONFLICT (content): Merge conflict in src/file.ts") };
      }
      return { stdout: "" };
    });

    const result = await new GitService().addWorktree(
      location,
      worktreePath,
      "feature/x",
      true,
      "master",
      undefined,
      true,
    );

    // The source was already left clean by the stash push; a conflicting apply
    // keeps the work recoverable in the stash rather than dropping it.
    expect(result.changesTransferred).toBe(false);
    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(commands.some((c) => c.startsWith("stash drop"))).toBe(false);
  });

  it("skips the transfer when the working tree is clean", async () => {
    mockGitCommands((args) => {
      if (args[0] === "status" && args[1] === "--porcelain") return { stdout: "" };
      if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "master\n" };
      return { stdout: "" };
    });

    await new GitService().addWorktree(
      location,
      worktreePath,
      "feature/x",
      true,
      "master",
      undefined,
      true,
    );

    const stashCall = execFileMock.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[])[0] === "stash",
    );
    expect(stashCall).toBeUndefined();
  });

  it("never touches a pre-existing stash when `git stash push` saves nothing (e.g. dirty submodule)", async () => {
    // `git status` reports dirty (a dirty submodule), but `git stash push` is a
    // no-op, and an UNRELATED user stash already sits on top of the shared list.
    mockGitCommands((args) => {
      if (args[0] === "status" && args[1] === "--porcelain") return { stdout: " M sub\n" };
      if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "master\n" };
      // push saves nothing → the top-of-stack SHA is unchanged before and after.
      if (args[0] === "rev-parse" && args.includes("stash@{0}")) return { stdout: "userstash\n" };
      return { stdout: "" };
    });

    const result = await new GitService().addWorktree(
      location,
      worktreePath,
      "feature/x",
      true,
      "master",
      undefined,
      true,
    );

    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    // The worktree is still created, but the unrelated stash is never applied or
    // dropped — no data loss.
    expect(commands.some((c) => c.startsWith("worktree add --no-track -b feature/x"))).toBe(true);
    expect(commands.some((c) => c.startsWith("stash apply"))).toBe(false);
    expect(commands.some((c) => c.startsWith("stash drop"))).toBe(false);
    expect(result.changesTransferred).toBeUndefined();
  });

  it("applies transferred changes to WSL worktrees with a UNC filesystem path", async () => {
    const wslLocation = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/home/demo/work/poracode",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\poracode",
    };
    const wslWorktreePath = "/home/demo/.poracode/worktrees/poracode/feature-x";
    const bridgeMkdir = vi.fn<() => Promise<void>>(async () => undefined);
    let stashPushed = false;
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async (_location, input) => {
      const args = gitSubcommandArgs(input.args);
      if (args[0] === "status" && args[1] === "--porcelain") {
        return { ok: true, stdout: " M src/file.ts\n", stderr: "", exitCode: 0 };
      }
      if (args[0] === "stash" && args[1] === "push") {
        stashPushed = true;
        return { ok: true, stdout: "", stderr: "", exitCode: 0 };
      }
      if (args[0] === "rev-parse" && args.includes("stash@{0}")) {
        return stashPushed
          ? { ok: true, stdout: "stashsha\n", stderr: "", exitCode: 0 }
          : { ok: false, stdout: "", stderr: "", exitCode: 1 };
      }
      if (args[0] === "stash" && args[1] === "list") {
        return { ok: true, stdout: "stashsha stash@{0}\n", stderr: "", exitCode: 0 };
      }
      return { ok: true, stdout: "", stderr: "", exitCode: 0 };
    });
    const service = new GitService();
    service.setWslClient({ gitExec, mkdir: bridgeMkdir } as unknown as WslBridgeClient);

    try {
      await service.addWorktree(
        wslLocation,
        wslWorktreePath,
        "feature/x",
        true,
        "main",
        undefined,
        true,
      );

      const applyCalls = gitExec.mock.calls.filter(
        ([, input]) => gitSubcommandArgs(input.args).join(" ") === "stash apply --index stashsha",
      );
      expect(applyCalls[0]?.[0]).toMatchObject({
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: wslWorktreePath,
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\.poracode\\worktrees\\poracode\\feature-x",
      });
      expect(applyCalls[0]?.[1]).toMatchObject({ cwd: wslWorktreePath });
    } finally {
      service.setWslClient(undefined);
    }
  });
});

describe("GitService.revert", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\poracode",
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
      (c: unknown[]) =>
        Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("checkout"),
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
      (c: unknown[]) =>
        Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("clean"),
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
      (c: unknown[]) =>
        Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("clean"),
    );
    expect(cleanCall).toBeDefined();
    expect(cleanCall![1]).toContain("docs/new-name.md");

    const checkoutCall = execFileMock.mock.calls.find(
      (c: unknown[]) =>
        Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("checkout"),
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
          args: [...GIT_QUOTEPATH_PREFIX, "commit", "-m", message],
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

describe("GitService.init", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\new-project",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes a repository at the project location", async () => {
    mockGitCommands(() => ({ stdout: "" }));

    await new GitService().init(location);

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [...GIT_QUOTEPATH_PREFIX, "init"],
      expect.objectContaining({ cwd: location.path }),
      expect.any(Function),
    );
  });
});

describe("GitService.addRemote", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\new-project",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a remote at the project location", async () => {
    mockGitCommands(() => ({ stdout: "" }));

    await new GitService().addRemote(location, "origin", "https://github.com/demo/repo.git");

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [...GIT_QUOTEPATH_PREFIX, "remote", "add", "origin", "https://github.com/demo/repo.git"],
      expect.objectContaining({ cwd: location.path }),
      expect.any(Function),
    );
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
          args: [...GIT_QUOTEPATH_PREFIX, "log", "--oneline", "main..HEAD"],
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
      if (gitSubcommandArgs(input.args)[0] === "remote") {
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
        expect.objectContaining({ args: [...GIT_QUOTEPATH_PREFIX, "remote"], loginEnv: true }),
      );
      expect(gitExec).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ distro: "Ubuntu" }),
        expect.objectContaining({
          args: [...GIT_QUOTEPATH_PREFIX, "fetch", "origin"],
          loginEnv: true,
        }),
      );
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });

  it("coalesces concurrent fetches for the same project and prune mode", async () => {
    let releaseFetch: (() => void) | undefined;
    const fetchPending = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async (_location, input) => {
      if (gitSubcommandArgs(input.args)[0] === "remote") {
        return { ok: true, stdout: "origin\n", stderr: "", exitCode: 0 };
      }
      await fetchPending;
      return { ok: true, stdout: "", stderr: "", exitCode: 0 };
    });
    const service = new GitService();
    service.setWslClient({ gitExec } as unknown as WslBridgeClient);
    const location: WslLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/work/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\repo",
    };

    try {
      const first = service.fetch(location, "origin", true);
      const second = service.fetch({ ...location }, "origin", true);
      await vi.waitFor(() => expect(gitExec).toHaveBeenCalledTimes(2));
      releaseFetch?.();
      await Promise.all([first, second]);

      expect(gitExec).toHaveBeenCalledTimes(2);
      expect(gitExec).toHaveBeenLastCalledWith(
        expect.objectContaining({ distro: "Ubuntu" }),
        expect.objectContaining({
          args: [...GIT_QUOTEPATH_PREFIX, "fetch", "origin", "--prune"],
          loginEnv: true,
        }),
      );
    } finally {
      service.setWslClient(undefined);
    }
  });

  it("skips Windows fetch when the path is not a Git repository", async () => {
    mockGitCommands((args) => {
      if (args[0] === "remote") {
        return { error: new Error("fatal: not a git repository") };
      }
      return { stdout: "" };
    });

    await new GitService().fetch(
      {
        kind: "windows",
        path: "C:\\Users\\demo\\work\\not-repo",
      },
      "origin",
      false,
    );

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [...GIT_QUOTEPATH_PREFIX, "remote"],
      expect.objectContaining({ cwd: "C:\\Users\\demo\\work\\not-repo" }),
      expect.any(Function),
    );
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
        expect.objectContaining({ args: [...GIT_QUOTEPATH_PREFIX, "remote"], loginEnv: true }),
      );
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });

  it("skips WSL fetch when the path is not a Git repository", async () => {
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async () => ({
      ok: false,
      stdout: "",
      stderr: "fatal: not a git repository",
      exitCode: 128,
    }));
    const service = new GitService();
    service.setWslClient({ gitExec } as unknown as WslBridgeClient);

    try {
      await service.fetch(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/not-repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\not-repo",
        },
        "origin",
        false,
      );

      expect(gitExec).toHaveBeenCalledTimes(1);
      expect(gitExec).toHaveBeenCalledWith(
        expect.objectContaining({ distro: "Ubuntu" }),
        expect.objectContaining({ args: [...GIT_QUOTEPATH_PREFIX, "remote"], loginEnv: true }),
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
    path: "C:\\Users\\demo\\work\\poracode",
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
    expect(
      execFileMock.mock.calls.some((call) =>
        gitSubcommandArgs(call[1] as string[]).includes("HEAD"),
      ),
    ).toBe(true);
  });
});

describe("GitService.getExperimentCandidateDiff", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\candidate",
  };
  const baseRef = "a".repeat(40);
  const headCommit = "c".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compares the full working tree to the frozen base and appends only untracked diffs", async () => {
    const trackedDiff = [
      "diff --git a/src/tracked.ts b/src/tracked.ts",
      "--- a/src/tracked.ts",
      "+++ b/src/tracked.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");
    const untrackedDiff = [
      "diff --git a/src/new.ts b/src/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/src/new.ts",
      "@@ -0,0 +1 @@",
      "+new file",
    ].join("\n");

    mockGitCommands((args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") {
        return { stdout: `${headCommit}\n` };
      }
      if (args[0] === "diff" && args[1] === baseRef && args[2] === "--") {
        return { stdout: trackedDiff };
      }
      if (args[0] === "status") {
        return {
          stdout: ["# branch.oid abc123", "# branch.head experiment", "? src/new.ts"].join("\n"),
        };
      }
      if (args[0] === "ls-files") return { stdout: "src/new.ts\0" };
      if (args[0] === "diff" && args[1] === "--" && args[2] === "src/new.ts") {
        return { stdout: "" };
      }
      if (args[0] === "diff" && args[1] === "--no-index") {
        return { stdout: untrackedDiff };
      }
      return { stdout: "" };
    });

    const result = await new GitService().getExperimentCandidateDiff(location, baseRef);

    expect(result).toEqual({
      diff: `${trackedDiff}\n${untrackedDiff}`,
      headCommit,
    });
    const diffCommands = execFileMock.mock.calls
      .map((call: unknown[]) => gitSubcommandArgs(call[1] as string[]))
      .filter((args) => args[0] === "diff");
    expect(diffCommands).toContainEqual(["diff", baseRef, "--"]);
    expect(diffCommands.some((args) => args.includes("--cached"))).toBe(false);
  });

  it("rejects non-commit diff bases before invoking git", async () => {
    await expect(
      new GitService().getExperimentCandidateDiff(location, "--output=stolen"),
    ).rejects.toThrow("must be a full commit hash");
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("fails instead of silently omitting an unreadable untracked file", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") {
        return { stdout: `${headCommit}\n` };
      }
      if (args[0] === "status") {
        return {
          stdout: ["# branch.oid abc123", "# branch.head experiment", "? src/vanished.ts"].join(
            "\n",
          ),
        };
      }
      if (args[0] === "ls-files") return { stdout: "src/vanished.ts\0" };
      return { stdout: "" };
    });

    await expect(new GitService().getExperimentCandidateDiff(location, baseRef)).rejects.toThrow(
      "Unable to read untracked candidate file: src/vanished.ts",
    );
  });

  it("rejects a candidate that changes while its diff is being captured", async () => {
    let diffCalls = 0;
    mockGitCommands((args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") {
        return { stdout: `${headCommit}\n` };
      }
      if (args[0] === "diff" && args[1] === baseRef && args[2] === "--") {
        diffCalls += 1;
        return { stdout: diffCalls === 1 ? "first" : "second" };
      }
      if (args[0] === "status") {
        return { stdout: ["# branch.oid abc123", "# branch.head experiment"].join("\n") };
      }
      return { stdout: "" };
    });

    await expect(new GitService().getExperimentCandidateDiff(location, baseRef)).rejects.toThrow(
      "changed while its diff was being captured",
    );
  });

  it("rejects a candidate that no longer descends from the frozen base", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") {
        return { stdout: `${headCommit}\n` };
      }
      if (args[0] === "merge-base") return { error: new Error("not an ancestor") };
      return { stdout: "" };
    });

    await expect(new GitService().getExperimentCandidateDiff(location, baseRef)).rejects.toThrow(
      "no longer descends from its frozen base commit",
    );
  });
});

describe("GitService.getExperimentCandidateStats", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\candidate",
  };
  const baseRef = "b".repeat(40);
  const headCommit = "d".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes committed, working-tree, and untracked changes from the frozen base", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") {
        return { stdout: `${headCommit}\n` };
      }
      if (args[0] === "diff" && args[1] === "--numstat" && args[2] === baseRef) {
        return { stdout: "4\t2\tsrc/tracked.ts\n" };
      }
      if (args[0] === "status") {
        return {
          stdout: ["# branch.oid abc123", "# branch.head experiment", "? src/new.ts"].join("\n"),
        };
      }
      if (args[0] === "ls-files") return { stdout: "src/new.ts\0" };
      if (args[0] === "diff" && args[1] === "--no-index" && args[2] === "--numstat") {
        return { stdout: "3\t0\t/dev/null => src/new.ts\n" };
      }
      return { stdout: "" };
    });

    await expect(new GitService().getExperimentCandidateStats(location, baseRef)).resolves.toEqual({
      insertions: 7,
      deletions: 2,
      files: 2,
    });
  });
});

describe("GitService.getStatus Windows path normalization", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\poracode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the lightweight status path when summary detail is requested", async () => {
    mockGitCommands((args) => {
      if (args[0] === "status") {
        return {
          stdout: [
            "# branch.oid abc123",
            "# branch.head main",
            "# branch.upstream origin/main",
            "# branch.ab +0 -1",
          ].join("\n"),
        };
      }
      return { stdout: "" };
    });

    const result = await new GitService().getStatus(location, "summary");
    const commands = execFileMock.mock.calls.map((call) => gitSubcommandArgs(call[1]));

    expect(result.detail).toBe("summary");
    expect(result.branch).toBe("main");
    expect(result.behind).toBe(1);
    expect(commands.some((args) => args[0] === "remote" || args[0] === "diff")).toBe(false);
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
      // numstat backs each porcelain row — a row absent here is pruned as a
      // stat-only phantom, so both sides must echo the backslash paths.
      if (args[0] === "diff" && args[1] === "--cached") {
        return { stdout: "3\t1\tsrc\\staged.ts" };
      }
      if (args[0] === "diff") {
        return { stdout: "2\t1\tdocs\\{renamed-old.md => renamed-new.md}" };
      }
      return { stdout: "" };
    });

    const result = await new GitService().getStatus(location);

    expect(result.staged[0]?.path).toBe("src/staged.ts");
    expect(result.unstaged[0]?.path).toBe("docs/renamed-new.md");
    expect(result.unstaged[0]?.oldPath).toBe("docs/renamed-old.md");
  });

  it("reports mergeInProgress when unmerged entries exist", async () => {
    readFileMock.mockResolvedValue(
      [
        "Merge branch 'main' of github.com:owner/repo into feature-a",
        "",
        "# Conflicts:",
        "#\tsrc/file.ts",
      ].join("\n"),
    );
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") {
        return {
          stdout: args.includes("--git-path")
            ? "C:/Users/demo/work/poracode/.git/MERGE_MSG\n"
            : "true\n",
        };
      }
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
    expect(result.mergeMessage).toBe("Merge branch 'main' of github.com:owner/repo into feature-a");
    expect(result.conflictFiles).toEqual([
      { path: "src/file.ts", status: "U", staged: false, insertions: 0, deletions: 0 },
    ]);
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
    expect(readFileMock).toHaveBeenCalledWith("C:/Users/demo/work/poracode/.git/MERGE_MSG", "utf8");
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
              args: [...GIT_QUOTEPATH_PREFIX, "status", "--porcelain=v2", "-b"],
            }),
          ]),
        }),
      );
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      service.setWslClient(undefined);
    }
  });

  it("reads the merge message from the linked-worktree Git path in WSL", async () => {
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
          stdout: [
            "# branch.oid abc123",
            "# branch.head feature-a",
            "u UU N... 100644 100644 100644 100644 a b c src/file.ts",
          ].join("\n"),
          stderr: "",
          exitCode: 0,
        },
        { ok: true, stdout: "", stderr: "", exitCode: 0 },
        { ok: true, stdout: "", stderr: "", exitCode: 0 },
        { ok: true, stdout: "", stderr: "", exitCode: 0 },
      ],
    }));
    const mergeMessagePath = "/home/demo/repo/.git/worktrees/feature-a/MERGE_MSG";
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async (_location, input) => ({
      ok: true,
      stdout: input.args.includes("--git-path") ? `${mergeMessagePath}\n` : "",
      stderr: "",
      exitCode: 0,
    }));
    const readFile = vi.fn<WslBridgeClient["readFile"]>(async () => ({
      tooLarge: false as const,
      size: 83,
      mtimeMs: 1,
      contentBase64: Buffer.from(
        "Merge branch 'main' into feature-a\n\n# Conflicts:\n#\tsrc/file.ts\n",
      ).toString("base64"),
    }));
    const service = new GitService();
    service.setWslClient({ gitBatch, gitExec, readFile } as unknown as WslBridgeClient);

    try {
      const result = await service.getStatus({
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
      });

      expect(result.mergeMessage).toBe("Merge branch 'main' into feature-a");
      expect(readFile).toHaveBeenCalledWith(
        expect.objectContaining({
          distro: "Ubuntu",
          linuxPath: "/home/demo/repo/.git/worktrees/feature-a",
        }),
        mergeMessagePath,
        { maxBytes: 64 * 1024 },
      );
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
      (c: unknown[]) =>
        Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("merge"),
    );
    expect(mergeCall![1]).toContain("--ff-only");
    expect(mergeCall![1]).toContain("origin/main");
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) =>
          Array.isArray(c[1]) &&
          gitSubcommandArgs(c[1] as string[]).join(" ") === "fetch origin --prune",
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
      (c: unknown[]) =>
        Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("merge"),
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
        (c: unknown[]) => Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[])[0] === "merge",
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
        (c: unknown[]) => Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[])[0] === "merge",
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
    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(commands).toContain("stash push -u -m Poracode: before pull from main");
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

  it("returns the preserved stash commit when the pull merge conflicts", async () => {
    const stashCommit = "b".repeat(40);
    mockGitCommands((args) => {
      if (args[0] === "status") return { stdout: " M src/file.ts\n" };
      if (args[0] === "rev-parse" && args[1] === "refs/stash")
        return { stdout: `${stashCommit.toUpperCase()}\n` };
      if (args[0] === "merge-base") return { error: new Error("not ancestor") };
      if (args[0] === "merge")
        return {
          error: new Error("git merge failed: CONFLICT (content): Merge conflict in src/file.ts"),
        };
      return { stdout: "" };
    });

    const result = await new GitService().pullFromSource(location, "main", true);

    expect(result).toMatchObject({
      merged: false,
      conflicting: true,
      stashPreserved: true,
      stashCommit,
    });
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) =>
          Array.isArray(c[1]) &&
          gitSubcommandArgs(c[1] as string[])
            .slice(0, 2)
            .join(" ") === "stash pop",
      ),
    ).toBe(false);
  });

  it("returns the preserved stash commit when re-applying the stash conflicts", async () => {
    const stashCommit = "b".repeat(40);
    mockGitCommands((args) => {
      if (args[0] === "status") return { stdout: " M src/file.ts\n" };
      if (args[0] === "rev-parse" && args[1] === "refs/stash")
        return { stdout: `${stashCommit}\n` };
      if (args[0] === "stash" && args[1] === "pop") {
        return { error: new Error("CONFLICT (content): Merge conflict in src/file.ts") };
      }
      return { stdout: "" };
    });

    const result = await new GitService().pullFromSource(location, "main", true);

    expect(result).toMatchObject({
      merged: false,
      reapplyConflicting: true,
      stashPreserved: true,
      stashCommit,
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
      (c: unknown[]) =>
        Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("merge"),
    );
    expect(mergeCalls.length).toBeGreaterThan(0);
    const mergeArgs = mergeCalls[0]![1] as string[];
    expect(mergeArgs).toContain("--no-ff");
    expect(mergeArgs).toContain("feature");
  });
});

describe("GitService.mergeToSource immutable commit validation", () => {
  const repoLocation = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\repo",
  };
  const worktreeLocation = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\worktree",
  };
  const expectedCommit = "b".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates the candidate worktree and merges the expected commit instead of the branch name", async () => {
    const sourceCommit = "a".repeat(40);
    const mergedCommit = "c".repeat(40);
    let branchReads = 0;
    mockGitCommands((args) => {
      if (args[0] === "status") return { stdout: "" };
      if (args[0] === "branch" && args[1] === "--show-current") {
        return { stdout: branchReads++ === 0 ? "feature\n" : "main\n" };
      }
      if (args[0] === "rev-parse") {
        const ref = args[args.length - 1];
        if (ref === `refs/heads/main^{commit}`) return { stdout: `${sourceCommit}\n` };
        if (ref === "HEAD") return { stdout: `${mergedCommit}\n` };
        return { stdout: `${expectedCommit}\n` };
      }
      if (args[0] === "merge-base") return { error: new Error("not ancestor") };
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: [
            "worktree C:/Users/demo/work/repo",
            `HEAD ${sourceCommit}`,
            "branch refs/heads/main",
            "",
            "worktree C:/Users/demo/work/worktree",
            `HEAD ${expectedCommit}`,
            "branch refs/heads/feature",
            "",
          ].join("\n"),
        };
      }
      if (args[0] === "merge") return { stdout: "" };
      return { stdout: "" };
    });

    await expect(
      new GitService().mergeToSource(
        repoLocation,
        worktreeLocation,
        "feature",
        "main",
        expectedCommit,
      ),
    ).resolves.toEqual({
      merged: true,
      fastForward: false,
      newSourceCommit: mergedCommit,
    });

    const mergeCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) && gitSubcommandArgs(call[1] as string[])[0] === "merge",
    );
    expect(gitSubcommandArgs(mergeCall![1] as string[])).toEqual([
      "merge",
      expectedCommit,
      "--no-edit",
      "--no-ff",
    ]);
  });

  it.each([
    {
      name: "dirty worktree",
      status: " M src/file.ts\n",
      branch: "feature",
      head: expectedCommit,
      ref: expectedCommit,
      error: "has uncommitted changes",
    },
    {
      name: "wrong branch",
      status: "",
      branch: "other",
      head: expectedCommit,
      ref: expectedCommit,
      error: "Expected worktree branch feature",
    },
    {
      name: "moved HEAD",
      status: "",
      branch: "feature",
      head: "c".repeat(40),
      ref: expectedCommit,
      error: "Expected worktree HEAD",
    },
    {
      name: "moved branch ref",
      status: "",
      branch: "feature",
      head: expectedCommit,
      ref: "c".repeat(40),
      error: "Expected branch feature",
    },
  ])("rejects a $name before merging", async ({ status, branch, head, ref, error }) => {
    mockGitCommands((args) => {
      if (args[0] === "status") return { stdout: status };
      if (args[0] === "branch" && args[1] === "--show-current") {
        return { stdout: `${branch}\n` };
      }
      if (args[0] === "rev-parse" && args[args.length - 1] === "HEAD^{commit}") {
        return { stdout: `${head}\n` };
      }
      if (args[0] === "rev-parse") return { stdout: `${ref}\n` };
      return { stdout: "" };
    });

    await expect(
      new GitService().mergeToSource(
        repoLocation,
        worktreeLocation,
        "feature",
        "main",
        expectedCommit,
      ),
    ).rejects.toThrow(error);
    expect(
      execFileMock.mock.calls.some(
        (call: unknown[]) =>
          Array.isArray(call[1]) && gitSubcommandArgs(call[1] as string[])[0] === "merge",
      ),
    ).toBe(false);
  });
});

describe("GitService.mergeToSource fast-forward safety", () => {
  const repoLocation = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\repo",
  };
  const worktreeLocation = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\worktree",
  };
  const sourceCommit = "a".repeat(40);
  const worktreeCommit = "b".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to fast-forward a checked-out source with local changes", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") {
        return {
          stdout:
            args[args.length - 1] === `refs/heads/main^{commit}` ? sourceCommit : worktreeCommit,
        };
      }
      if (args[0] === "merge-base") return { stdout: "" };
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: [
            "worktree C:/Users/demo/work/repo",
            `HEAD ${sourceCommit}`,
            "branch refs/heads/main",
            "",
            "worktree C:/Users/demo/work/worktree",
            `HEAD ${worktreeCommit}`,
            "branch refs/heads/feature",
            "",
          ].join("\n"),
        };
      }
      if (args[0] === "status") return { stdout: " M README.md\n" };
      if (args[0] === "branch" && args[1] === "--show-current") {
        return { stdout: "main\n" };
      }
      return { stdout: "" };
    });

    await expect(
      new GitService().mergeToSource(repoLocation, worktreeLocation, "feature", "main"),
    ).rejects.toThrow("has uncommitted changes");
    expect(
      execFileMock.mock.calls.some(
        (call: unknown[]) =>
          Array.isArray(call[1]) && gitSubcommandArgs(call[1] as string[])[0] === "merge",
      ),
    ).toBe(false);
  });

  it("uses the observed source tip as a compare-and-swap guard when updating its ref", async () => {
    mockGitCommands((args) => {
      if (args[0] === "rev-parse") {
        return {
          stdout:
            args[args.length - 1] === `refs/heads/main^{commit}` ? sourceCommit : worktreeCommit,
        };
      }
      if (args[0] === "merge-base") return { stdout: "" };
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: [
            "worktree C:/Users/demo/work/repo",
            `HEAD ${worktreeCommit}`,
            "branch refs/heads/other",
            "",
          ].join("\n"),
        };
      }
      return { stdout: "" };
    });

    await expect(
      new GitService().mergeToSource(repoLocation, worktreeLocation, "feature", "main"),
    ).resolves.toEqual({
      merged: true,
      fastForward: true,
      newSourceCommit: worktreeCommit,
    });

    const commands = execFileMock.mock.calls.map((call: unknown[]) =>
      gitSubcommandArgs(call[1] as string[]),
    );
    expect(commands).toContainEqual([
      "update-ref",
      "refs/heads/main",
      worktreeCommit,
      sourceCommit,
    ]);
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
      if (args[0] === "branch" && args[1] === "--show-current") {
        return { stdout: "master\n" };
      }
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
        gitSubcommandArgs(call[1] as string[])[0] === "worktree" &&
        gitSubcommandArgs(call[1] as string[])[1] === "add",
    );
    expect(worktreeAddCall).toBeUndefined();

    const mergeCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        gitSubcommandArgs(call[1] as string[])[0] === "merge" &&
        (call[2] as { cwd?: string }).cwd === repoLocation.path,
    );
    expect(mergeCall).toBeDefined();
  });

  it("refuses to merge after the source worktree switches branches", async () => {
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
      if (args[0] === "branch" && args[1] === "--show-current") {
        return { stdout: "important-work\n" };
      }
      if (args[0] === "rev-parse") return { stdout: "abc123\n" };
      return { stdout: "" };
    });

    const result = await new GitService().mergeToSource(
      repoLocation,
      worktreeLocation,
      "feature",
      "master",
    );

    expect(result.merged).toBe(false);
    expect(result.error).toContain("Expected source worktree branch master");
    expect(
      execFileMock.mock.calls.some(
        (call: unknown[]) =>
          Array.isArray(call[1]) && gitSubcommandArgs(call[1] as string[])[0] === "merge",
      ),
    ).toBe(false);
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
      if (args[0] === "branch" && args[1] === "--show-current") {
        return { stdout: "master\n" };
      }
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
      (call: unknown[]) =>
        Array.isArray(call[1]) && gitSubcommandArgs(call[1] as string[])[0] === "merge",
    );
    expect(mergeCall).toBeUndefined();
  });
});

describe("GitService worktree metadata", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\poracode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers a missing source branch from the main worktree branch", async () => {
    mockGitCommands((args) => {
      if (args[0] === "config" && args[1] === "--get") {
        return {
          error: Object.assign(new Error("not found"), { code: 1, stdout: "", stderr: "" }),
        };
      }
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: [
            "worktree C:/Users/demo/work/poracode",
            "HEAD abc123",
            "branch refs/heads/master",
            "",
            "worktree C:/Users/demo/.poracode/worktrees/poracode-12345678/poracode-brave-heron",
            "HEAD def456",
            "branch refs/heads/poracode/brave-heron",
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

    const result = await new GitService().getWorktreeSourceBranch(location, "poracode/brave-heron");

    expect(result).toEqual({
      sourceBranch: "master",
      commitsAhead: 1,
      sourceAhead: 1,
    });

    const configCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        gitSubcommandArgs(call[1] as string[])[0] === "config" &&
        gitSubcommandArgs(call[1] as string[])[1] !== "--get" &&
        gitSubcommandArgs(call[1] as string[]).includes(
          "branch.poracode/brave-heron.poracodeSource",
        ),
    );
    expect(configCall).toBeDefined();
    expect(configCall![1]).toContain("master");
    const revListCall = execFileMock.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) && gitSubcommandArgs(call[1] as string[])[0] === "rev-list",
    );
    expect(revListCall![1]).toContain("origin/master...poracode/brave-heron");
    expect(
      execFileMock.mock.calls.some(
        (call: unknown[]) =>
          Array.isArray(call[1]) && gitSubcommandArgs(call[1] as string[])[0] === "fetch",
      ),
    ).toBe(false);
  });

  it("returns the durable worktree owner marker", async () => {
    mockGitCommands((args) => {
      if (args[0] === "config" && args[1] === "--get") {
        if (args[2]?.endsWith(".poracodeOwner")) return { stdout: "experiment-1\n" };
        if (args[2]?.endsWith(".poracodeSource")) return { stdout: "main\n" };
      }
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "rev-list") return { stdout: "0\t2\n" };
      return { stdout: "" };
    });

    await expect(
      new GitService().getWorktreeOwner(location, "poracode/brave-heron"),
    ).resolves.toEqual({
      ownerToken: "experiment-1",
    });
  });

  it("recovers the owner marker from the branch creation reflog", async () => {
    mockGitCommands((args) => {
      if (args[0] === "config" && args[1] === "--get") {
        if (args[2]?.endsWith(".poracodeOwner")) {
          return {
            error: Object.assign(new Error("not found"), { code: 1, stdout: "", stderr: "" }),
          };
        }
        return { stdout: "main\n" };
      }
      if (args[0] === "rev-parse" && args.includes("refs/heads/poracode/brave-heron")) {
        return { stdout: `${"a".repeat(40)}\n` };
      }
      if (args[0] === "reflog") {
        return { stdout: "poracode experiment owner experiment-1:candidate-1\n" };
      }
      if (args[0] === "remote") return { stdout: "" };
      if (args[0] === "rev-list") return { stdout: "0\t0\n" };
      return { stdout: "" };
    });

    await expect(
      new GitService().getWorktreeOwner(location, "poracode/brave-heron"),
    ).resolves.toEqual({
      ownerToken: "experiment-1:candidate-1",
    });
  });

  it("does not treat a Git config failure as a missing owner marker", async () => {
    mockGitCommands((args) => {
      if (args[0] === "config" && args[1] === "--get") {
        return {
          error: Object.assign(new Error("config locked"), {
            code: 128,
            stdout: "",
            stderr: "config locked",
          }),
        };
      }
      return { stdout: "" };
    });

    await expect(
      new GitService().getWorktreeOwner(location, "poracode/brave-heron"),
    ).rejects.toThrow("config locked");
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
        gitSubcommandArgs(call[1] as string[])[0] === "push" &&
        gitSubcommandArgs(call[1] as string[]).includes("--set-upstream"),
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
  const worktreePath = "C:\\Users\\demo\\.poracode\\worktrees\\repo-12345678\\feature-x";

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
        gitSubcommandArgs(call[1] as string[])[0] === "worktree" &&
        gitSubcommandArgs(call[1] as string[])[1] === "remove",
    );
    expect(gitSubcommandArgs(removeCall?.[1] as string[])).toEqual([
      "worktree",
      "remove",
      "--force",
      "--force",
      worktreePath,
    ]);
  });

  it("refuses to remove a worktree that switched away from its expected branch", async () => {
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${worktreePath.replace(/\\/g, "/")}\nHEAD def456\nbranch refs/heads/important-work\n\n`,
        };
      }
      return { stdout: "" };
    });

    await expect(
      new GitService().removeWorktree(location, worktreePath, true, false, "experiment-candidate"),
    ).rejects.toThrow("Expected worktree branch experiment-candidate, but found important-work");
    expect(
      execFileMock.mock.calls.some((call: unknown[]) => {
        const args = gitSubcommandArgs(call[1] as string[]);
        return args[0] === "worktree" && args[1] === "remove";
      }),
    ).toBe(false);
  });

  it("refuses to remove a worktree whose owner marker changed", async () => {
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${worktreePath.replace(/\\/g, "/")}\nHEAD def456\nbranch refs/heads/experiment-candidate\n\n`,
        };
      }
      if (args[0] === "config" && args[1] === "--get") {
        return { stdout: "another-experiment:candidate\n" };
      }
      return { stdout: "" };
    });

    await expect(
      new GitService().removeWorktree(
        location,
        worktreePath,
        true,
        true,
        "experiment-candidate",
        "experiment-1:candidate-1",
      ),
    ).rejects.toThrow("Expected worktree owner experiment-1:candidate-1");
    expect(
      execFileMock.mock.calls.some((call: unknown[]) => {
        const args = gitSubcommandArgs(call[1] as string[]);
        return args[0] === "worktree" && args[1] === "remove";
      }),
    ).toBe(false);
  });

  it("does not prune worktrees from a sibling path with the same prefix", async () => {
    const managedRoot = "C:\\Users\\demo\\.poracode\\worktrees";
    const siblingPath = "C:\\Users\\demo\\.poracode\\worktrees-old\\repo-1234\\feature-x";
    const staleManagedPath = "C:\\Users\\demo\\.poracode\\worktrees\\repo-1234\\feature-y";

    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "prune") return { stdout: "" };
      if (args[0] === "worktree" && args[1] === "remove") return { stdout: "" };
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: [
            `worktree ${location.path}`,
            "HEAD abc123",
            "branch refs/heads/main",
            "",
            `worktree ${siblingPath.replace(/\\/g, "/")}`,
            "HEAD def456",
            "branch refs/heads/feature-x",
            "",
            `worktree ${staleManagedPath.replace(/\\/g, "/")}`,
            "HEAD fed987",
            "branch refs/heads/feature-y",
            "",
          ].join("\n"),
        };
      }
      return { stdout: "" };
    });

    await new GitService().pruneWorktrees(location, [], [managedRoot]);

    const removeCalls = execFileMock.mock.calls.filter(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        gitSubcommandArgs(call[1] as string[])[0] === "worktree" &&
        gitSubcommandArgs(call[1] as string[])[1] === "remove",
    );
    expect(removeCalls.map((call) => gitSubcommandArgs(call[1] as string[]))).toEqual([
      ["worktree", "remove", "--force", "--force", staleManagedPath],
    ]);
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

  it("deletes the directory itself when a forced removal is interrupted", async () => {
    const listedPath = worktreePath.replace(/\\/g, "/");
    let listCalls = 0;
    mockGitCommands((args) => {
      if (args[0] === "worktree" && args[1] === "remove") {
        return { error: new Error("Command failed: git worktree remove") };
      }
      if (args[0] === "worktree" && args[1] === "list") {
        listCalls++;
        if (listCalls === 1) {
          return {
            stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${listedPath}\nHEAD def456\nbranch refs/heads/feature-x\n\n`,
          };
        }
        return { stdout: `worktree ${location.path}\nHEAD abc123\nbranch refs/heads/main\n\n` };
      }
      return { stdout: "" };
    });

    await new GitService().removeWorktree(location, worktreePath, true);

    expect(rmMock).toHaveBeenCalledWith(worktreePath, { recursive: true, force: true });
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
    const wslWorktreePath = "/home/demo/.poracode/worktrees/repo/feature-x";
    const gitExec = vi.fn<
      (location: WslLocation, input: WslGitExecInput) => Promise<WslGitExecResult>
    >(async (_location, input) => {
      const args = gitSubcommandArgs(input.args);
      if (args[0] === "worktree" && args[1] === "remove") {
        return {
          ok: false,
          stdout: "",
          stderr: `fatal: failed to delete '${wslWorktreePath}': Directory not empty`,
          exitCode: 1,
        };
      }
      if (args[0] === "worktree" && args[1] === "list") {
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
      (c: unknown[]) => Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("-d"),
    );
    expect(softDeleteCall).toBeUndefined();
  });

  it("refuses to delete a branch whose owner marker changed", async () => {
    mockGitCommands((args) => {
      if (args[0] === "config" && args[1] === "--get") {
        return { stdout: "another-experiment:candidate\n" };
      }
      return { stdout: "" };
    });

    await expect(
      new GitService().deleteBranch(location, "feature/x", true, "experiment-1:candidate-1"),
    ).rejects.toThrow("Expected worktree owner experiment-1:candidate-1");
    expect(
      execFileMock.mock.calls.some((call: unknown[]) => {
        const args = gitSubcommandArgs(call[1] as string[]);
        return args[0] === "branch" && args[1] === "-D";
      }),
    ).toBe(false);
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
        gitSubcommandArgs(c[1] as string[])[0] === "worktree" &&
        gitSubcommandArgs(c[1] as string[])[1] === "prune",
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
      (c: unknown[]) => Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("-D"),
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

    expect(execFileMock.mock.calls.map((call) => gitSubcommandArgs(call[1] as string[]))).toEqual([
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
      (c: unknown[]) =>
        Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[]).includes("merge"),
    );
    expect(mergeCall).toBeDefined();
    expect(mergeCall![1]).toContain("--abort");
  });

  it("re-applies and drops the requested pull stash after aborting", async () => {
    const stashCommit = "c".repeat(40);
    mockGitCommands((args) => {
      if (args[0] === "stash" && args[1] === "list")
        return { stdout: `${"d".repeat(40)}\n${stashCommit.toUpperCase()}\n` };
      return { stdout: "" };
    });

    const result = await new GitService().abortMerge(location, stashCommit);

    expect(result).toEqual({ stashReapplied: true });
    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(commands).toContain("merge --abort");
    expect(commands).toContain("stash pop stash@{1}");
  });

  it("keeps the stash preserved when the stash commit is not in the stash list", async () => {
    const stashCommit = "c".repeat(40);
    mockGitCommands((args) => {
      if (args[0] === "stash" && args[1] === "list") return { stdout: `${"d".repeat(40)}\n` };
      return { stdout: "" };
    });

    const result = await new GitService().abortMerge(location, stashCommit);

    expect(result).toEqual({ stashPreserved: true });
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) =>
          Array.isArray(c[1]) &&
          gitSubcommandArgs(c[1] as string[])
            .slice(0, 2)
            .join(" ") === "stash pop",
      ),
    ).toBe(false);
  });
});

describe("GitService.finishMerge", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\worktree",
  };
  const stashCommit = "c".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits the merge and re-applies the requested pull stash", async () => {
    mockGitCommands((args) => {
      if (args[0] === "stash" && args[1] === "list")
        return { stdout: `${"d".repeat(40)}\n${stashCommit}\n` };
      return { stdout: "" };
    });

    const result = await new GitService().finishMerge(location, stashCommit);

    expect(result).toEqual({ success: true, stashReapplied: true });
    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(commands).toContain("commit --no-edit");
    expect(commands).toContain("stash pop stash@{1}");
  });

  it("reports conflicts and keeps the stash when re-applying it conflicts", async () => {
    mockGitCommands((args) => {
      if (args[0] === "stash" && args[1] === "list") return { stdout: `${stashCommit}\n` };
      if (args[0] === "stash" && args[1] === "pop") {
        return { error: new Error("CONFLICT (content): Merge conflict in src/file.ts") };
      }
      return { stdout: "" };
    });

    const result = await new GitService().finishMerge(location, stashCommit);

    expect(result).toEqual({
      success: true,
      reapplyConflicting: true,
      stashPreserved: true,
      conflictFiles: ["src/file.ts"],
    });
  });

  it("keeps the stash preserved without popping when the stash commit is missing", async () => {
    mockGitCommands((args) => {
      if (args[0] === "stash" && args[1] === "list") return { stdout: `${"d".repeat(40)}\n` };
      return { stdout: "" };
    });

    const result = await new GitService().finishMerge(location, stashCommit);

    expect(result).toEqual({ success: true, stashPreserved: true });
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) =>
          Array.isArray(c[1]) &&
          gitSubcommandArgs(c[1] as string[])
            .slice(0, 2)
            .join(" ") === "stash pop",
      ),
    ).toBe(false);
  });

  it("does not touch the stash when the merge commit fails", async () => {
    mockGitCommands((args) => {
      if (args[0] === "commit") return { error: new Error("commit failed") };
      return { stdout: "" };
    });

    const result = await new GitService().finishMerge(location, stashCommit);

    expect(result).toMatchObject({ success: false });
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) => Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[])[0] === "stash",
      ),
    ).toBe(false);
  });
});

describe("GitService.commit pull-stash re-apply", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\worktree",
  };
  const stashCommit = "c".repeat(40);
  const commitOutput = "[poracode/feature abc1234] merge master\n";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-applies the requested pull stash after a successful commit", async () => {
    mockGitCommands((args) => {
      if (args[0] === "commit") return { stdout: commitOutput };
      if (args[0] === "stash" && args[1] === "list")
        return { stdout: `${"d".repeat(40)}\n${stashCommit}\n` };
      return { stdout: "" };
    });

    const result = await new GitService().commit(location, "merge master", false, stashCommit);

    expect(result).toEqual({ hash: "abc1234", stashReapplied: true });
    const commands = execFileMock.mock.calls.map((c: unknown[]) =>
      gitSubcommandArgs(c[1] as string[]).join(" "),
    );
    expect(commands).toContain("stash pop stash@{1}");
  });

  it("reports conflicts and keeps the stash when re-applying it conflicts", async () => {
    mockGitCommands((args) => {
      if (args[0] === "commit") return { stdout: commitOutput };
      if (args[0] === "stash" && args[1] === "list") return { stdout: `${stashCommit}\n` };
      if (args[0] === "stash" && args[1] === "pop") {
        return { error: new Error("CONFLICT (content): Merge conflict in src/file.ts") };
      }
      return { stdout: "" };
    });

    const result = await new GitService().commit(location, "merge master", false, stashCommit);

    expect(result).toEqual({
      hash: "abc1234",
      reapplyConflicting: true,
      stashPreserved: true,
      conflictFiles: ["src/file.ts"],
    });
  });

  it("keeps the stash preserved without popping when the stash commit is missing", async () => {
    mockGitCommands((args) => {
      if (args[0] === "commit") return { stdout: commitOutput };
      if (args[0] === "stash" && args[1] === "list") return { stdout: `${"d".repeat(40)}\n` };
      return { stdout: "" };
    });

    const result = await new GitService().commit(location, "merge master", false, stashCommit);

    expect(result).toEqual({ hash: "abc1234", stashPreserved: true });
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) =>
          Array.isArray(c[1]) &&
          gitSubcommandArgs(c[1] as string[])
            .slice(0, 2)
            .join(" ") === "stash pop",
      ),
    ).toBe(false);
  });

  it("does not touch the stash when the commit fails", async () => {
    mockGitCommands((args) => {
      if (args[0] === "commit") return { error: new Error("pre-commit hook failed") };
      return { stdout: "" };
    });

    await expect(
      new GitService().commit(location, "merge master", false, stashCommit),
    ).rejects.toThrow("pre-commit hook failed");
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) => Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[])[0] === "stash",
      ),
    ).toBe(false);
  });

  it("does not touch the stash when no re-apply is requested", async () => {
    mockGitCommands((args) => {
      if (args[0] === "commit") return { stdout: commitOutput };
      return { stdout: "" };
    });

    const result = await new GitService().commit(location, "merge master", false);

    expect(result).toEqual({ hash: "abc1234" });
    expect(
      execFileMock.mock.calls.some(
        (c: unknown[]) => Array.isArray(c[1]) && gitSubcommandArgs(c[1] as string[])[0] === "stash",
      ),
    ).toBe(false);
  });
});

describe("GitService.getStatus Windows untracked expansion", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\poracode",
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
