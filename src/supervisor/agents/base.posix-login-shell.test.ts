import { homedir, tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const execFileAsyncMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ stdout: string; stderr?: string }>>(),
);
const spawnMock = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args: string[],
      options: Record<string, unknown>,
    ) => import("node:child_process").ChildProcess
  >(),
);

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const { promisify } = require("node:util") as typeof import("node:util");
  return {
    ...actual,
    spawn: spawnMock,
    execFile: Object.assign(vi.fn(), {
      [promisify.custom]: execFileAsyncMock,
    }),
  };
});

import {
  buildAgentCommand,
  clearExecutablePathCache,
  cliSubcommandAuthProbe,
  primeExecutablePathCache,
  primeProjectShellEnv,
  resolveLaunchSpec,
  resolveExecutablePathAsync,
} from "./base";
import { resolveAgentBinaryPath } from "./binaryResolver";

const expectedShellArgs = (script: string) =>
  process.platform === "darwin" ? ["-l", "-i", "-c", script] : ["-l", "-c", script];

const posixProject: ProjectLocation = {
  kind: "posix",
  path: "/Users/demo/project",
};

describe.skipIf(process.platform === "win32")("POSIX login shell wrappers", () => {
  const originalShell = process.env.SHELL;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockReset();
    clearExecutablePathCache();
    process.env.SHELL = "/bin/zsh";
  });

  afterAll(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }
  });

  it("resolves binaries through the user's login shell on POSIX", async () => {
    execFileAsyncMock.mockResolvedValue({
      stdout: "direnv: loading ~/.envrc\n/Users/demo/.local/bin/claude\n",
      stderr: "",
    });

    await expect(resolveExecutablePathAsync("claude")).resolves.toBe(
      "/Users/demo/.local/bin/claude",
    );

    expect(execFileAsyncMock).toHaveBeenCalledWith(
      "/bin/zsh",
      expectedShellArgs("command -v 'claude'"),
      expect.objectContaining({
        cwd: homedir(),
        timeout: 5_000,
        windowsHide: true,
      }),
    );
  });

  it("wraps native launches in the user's login shell when the binary is unresolved", () => {
    expect(buildAgentCommand(posixProject, "claude", ["--version"])).toEqual({
      command: "/bin/zsh",
      args: expectedShellArgs("exec 'claude' '--version'"),
      cwd: "/Users/demo/project",
    });
  });

  it("spawns absolute binary paths directly with the user's captured shell env", async () => {
    execFileAsyncMock.mockResolvedValue({
      stdout: [
        "claude\t/Users/demo/.local/bin/claude",
        "__PORACODE_ENV_BEGIN__",
        "PATH=/opt/homebrew/bin:/usr/bin:/bin",
        "NVM_DIR=/Users/demo/.nvm",
        "HOMEBREW_PREFIX=/opt/homebrew",
        "EDITOR=nvim",
        "PWD=/should/be/skipped",
        "SHLVL=1",
      ].join("\n"),
      stderr: "",
    });

    await primeExecutablePathCache(["claude"]);

    expect(
      buildAgentCommand(posixProject, "claude", ["--version"], "/Users/demo/.local/bin/claude"),
    ).toEqual({
      command: "/Users/demo/.local/bin/claude",
      args: ["--version"],
      cwd: "/Users/demo/project",
      env: {
        PATH: "/opt/homebrew/bin:/usr/bin:/bin",
        NVM_DIR: "/Users/demo/.nvm",
        HOMEBREW_PREFIX: "/opt/homebrew",
        EDITOR: "nvim",
      },
    });
  });

  it("keeps a detected executable after the probe TTL when the project selects another Node", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-versioned-cli-"));
    const binary = "versioned-agent";
    const executable = join(root, binary);
    writeFileSync(executable, "#!/bin/sh\nexit 0\n");
    chmodSync(executable, 0o700);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: `${binary}\t${executable}\n__PORACODE_ENV_BEGIN__\nPATH=${root}:/usr/bin:/bin\n`,
      });
      await primeExecutablePathCache([binary]);
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: "__PORACODE_ENV_BEGIN__\nPATH=/project-node/bin:/usr/bin:/bin\n",
      });
      await primeProjectShellEnv(posixProject.path);
      clock.mockReturnValue(now + 61_000);

      const resolved = resolveAgentBinaryPath(posixProject, binary);
      expect(resolved).toBe(executable);
      expect(buildAgentCommand(posixProject, binary, ["acp"], resolved)).toMatchObject({
        command: executable,
        args: ["acp"],
        env: { PATH: "/project-node/bin:/usr/bin:/bin" },
      });

      // A removed version-manager shim must still fall back to normal resolution.
      rmSync(executable);
      expect(resolveAgentBinaryPath(posixProject, binary)).toBeUndefined();
    } finally {
      clock.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("shell-wraps launches that opt out of absolute binary direct spawn", async () => {
    execFileAsyncMock.mockResolvedValue({
      stdout: [
        "opencode\t/Users/demo/.opencode/bin/opencode",
        "__PORACODE_ENV_BEGIN__",
        "PATH=/opt/homebrew/bin:/usr/bin:/bin",
      ].join("\n"),
      stderr: "",
    });

    await primeExecutablePathCache(["opencode"]);

    expect(
      await resolveLaunchSpec(posixProject, {
        binary: "opencode",
        args: ["--version"],
        preferShell: true,
      }),
    ).toEqual({
      command: "/bin/zsh",
      args: expectedShellArgs("exec 'opencode' '--version'"),
      cwd: "/Users/demo/project",
      env: {
        PATH: "/opt/homebrew/bin:/usr/bin:/bin",
      },
    });
  });

  it("uses the project-scoped shell env on direct spawn so cd-hooks (fnm/asdf/mise) win", async () => {
    const project = "/Users/demo/project";

    // First call: homedir-scoped prime. PATH carries the user's *default* node.
    execFileAsyncMock.mockResolvedValueOnce({
      stdout: [
        "claude\t/Users/demo/.local/bin/claude",
        "__PORACODE_ENV_BEGIN__",
        "PATH=/Users/demo/.fnm/aliases/default/bin:/usr/bin:/bin",
      ].join("\n"),
      stderr: "",
    });
    await primeExecutablePathCache(["claude"]);

    // Second call: project-scoped prime. The shell stood in the project root,
    // so the user's version manager swapped to the project-pinned node (24).
    execFileAsyncMock.mockResolvedValueOnce({
      stdout: [
        "__PORACODE_ENV_BEGIN__",
        "PATH=/Users/demo/.local/share/fnm/node-versions/v24.13.1/installation/bin:/usr/bin:/bin",
        "EDITOR=nvim",
      ].join("\n"),
      stderr: "",
    });
    await primeProjectShellEnv(project);

    const spec = buildAgentCommand(
      { kind: "posix", path: project },
      "claude",
      ["--version"],
      "/Users/demo/.local/bin/claude",
    );

    expect(spec).toEqual({
      command: "/Users/demo/.local/bin/claude",
      args: ["--version"],
      cwd: project,
      env: {
        PATH: "/Users/demo/.local/share/fnm/node-versions/v24.13.1/installation/bin:/usr/bin:/bin",
        EDITOR: "nvim",
      },
    });

    // The project-scoped probe must have been invoked with cwd=project.
    const projectCall = execFileAsyncMock.mock.calls.find(
      (call) => (call[2] as { cwd?: string })?.cwd === project,
    );
    expect(projectCall).toBeDefined();
  });

  it("falls back to the homedir-scoped prime when the project has not been primed", async () => {
    execFileAsyncMock.mockResolvedValueOnce({
      stdout: [
        "claude\t/Users/demo/.local/bin/claude",
        "__PORACODE_ENV_BEGIN__",
        "PATH=/opt/homebrew/bin:/usr/bin:/bin",
      ].join("\n"),
      stderr: "",
    });
    await primeExecutablePathCache(["claude"]);

    const spec = buildAgentCommand(
      { kind: "posix", path: "/Users/demo/project" },
      "claude",
      ["--version"],
      "/Users/demo/.local/bin/claude",
    );

    expect(spec.env?.PATH).toBe("/opt/homebrew/bin:/usr/bin:/bin");
  });

  it("runs CLI auth probes via direct spawn", async () => {
    spawnMock.mockImplementationOnce(() => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdout,
        stderr,
        pid: undefined,
        killed: false,
      }) as unknown as import("node:child_process").ChildProcess;
      queueMicrotask(() => {
        stdout.end("Authenticated\n");
        stderr.end();
        child.emit("close", 0);
      });
      return child;
    });

    const probe = cliSubcommandAuthProbe(["auth", "status"]);

    await expect(
      probe({
        location: posixProject,
        executablePath: "/Users/demo/.nvm/versions/node/v24/bin/claude",
      }),
    ).resolves.toBe("authenticated");

    expect(spawnMock).toHaveBeenCalledWith(
      "/Users/demo/.nvm/versions/node/v24/bin/claude",
      ["auth", "status"],
      expect.objectContaining({
        cwd: "/Users/demo/project",
        detached: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }),
    );
  });
});
