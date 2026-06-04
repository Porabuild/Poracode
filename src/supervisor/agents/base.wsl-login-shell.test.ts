import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, spawnSyncMock } = vi.hoisted(() => ({
  execFileMock:
    vi.fn<
      (
        cmd: string,
        args: string[],
        opts: unknown,
        callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
      ) => void
    >(),
  spawnSyncMock: vi.fn<() => { error?: undefined; status: number; stdout: string }>(),
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: execFileMock,
    spawnSync: spawnSyncMock,
  };
});

import {
  clearExecutablePathCache,
  getWslProjectShellEnv,
  batchWslCommandsAsync,
  primeWslProjectShellEnv,
  readWslLoginShellCommandOutputAsync,
  resolveWslHomeDirectory,
  resolveWslShellPath,
  setWslProcessBridgeClient,
} from "./base";

describe("WSL process bridge helpers", () => {
  afterEach(() => {
    setWslProcessBridgeClient(undefined);
  });

  it("routes login-shell command output through the bridge when available", async () => {
    const processExec = vi.fn<
      () => Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number }>
    >(async () => ({ ok: true, stdout: "claude 1.0.0\n", stderr: "", exitCode: 0 }));
    setWslProcessBridgeClient({ processExec } as never);

    const result = await readWslLoginShellCommandOutputAsync(
      "Ubuntu",
      "/tmp",
      "/home/demo/.nvm/versions/node/v24/bin/claude",
      ["--version"],
    );

    expect(result).toEqual({ ok: true, stdout: "claude 1.0.0", stderr: "" });
    expect(execFileMock).not.toHaveBeenCalled();
    expect(processExec).toHaveBeenCalledWith(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/tmp",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\",
      },
      {
        command: "/home/demo/.nvm/versions/node/v24/bin/claude",
        cwd: "/tmp",
        args: ["--version"],
        loginEnv: true,
        timeoutMs: 10_000,
      },
    );
  });

  it("routes batched shell probes through the bridge when available", async () => {
    const processBatch = vi.fn<
      () => Promise<{
        results: { ok: boolean; stdout: string; stderr: string; exitCode: number }[];
      }>
    >(async () => ({
      results: [
        { ok: true, stdout: "/usr/bin/codex\n", stderr: "", exitCode: 0 },
        { ok: false, stdout: "", stderr: "missing", exitCode: 1 },
      ],
    }));
    setWslProcessBridgeClient({ processBatch } as never);

    const result = await batchWslCommandsAsync("Ubuntu", ["command -v codex", "missing --version"]);

    expect(result).toEqual([
      { ok: true, stdout: "/usr/bin/codex" },
      { ok: false, stdout: "" },
    ]);
    expect(execFileMock).not.toHaveBeenCalled();
    expect(processBatch).toHaveBeenCalledWith(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\",
      },
      {
        timeoutMs: 15_000,
        commands: [
          { command: "sh", cwd: "/", args: ["-lc", "command -v codex"], loginEnv: true },
          { command: "sh", cwd: "/", args: ["-lc", "missing --version"], loginEnv: true },
        ],
      },
    );
  });
});

describe.skipIf(process.platform !== "win32")("readWslLoginShellCommandOutputAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearExecutablePathCache();
    setWslProcessBridgeClient(undefined);
    spawnSyncMock.mockReturnValue({
      error: undefined,
      status: 0,
      stdout: "/bin/bash\n",
    });
  });

  it("does not fall back to direct WSL when the bridge is unavailable", async () => {
    const result = await readWslLoginShellCommandOutputAsync(
      "Ubuntu",
      "/tmp",
      "/home/demo/.nvm/versions/node/v24/bin/claude",
      ["--version"],
    );

    expect(result).toEqual({ ok: false, stdout: "", stderr: "" });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("resolves the distro user's login shell through bootstrap WSL", () => {
    spawnSyncMock.mockReturnValue({
      error: undefined,
      status: 0,
      stdout: "/usr/bin/zsh\n",
    });

    expect(resolveWslShellPath("Ubuntu")).toBe("/usr/bin/zsh");
    expect(spawnSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/wsl\.exe$/i),
      ["-d", "Ubuntu", "--", "sh", "-lc", 'getent passwd "$(id -un)" | cut -d: -f7'],
      expect.objectContaining({ timeout: 3_000 }),
    );
  });

  it("resolves and caches the WSL home directory through bootstrap WSL", () => {
    spawnSyncMock.mockReturnValue({
      error: undefined,
      status: 0,
      stdout: "/home/demo\n",
    });

    expect(resolveWslHomeDirectory("Ubuntu")).toBe("/home/demo");
    expect(resolveWslHomeDirectory("Ubuntu")).toBe("/home/demo");
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  it("captures and caches the WSL project env through the bridge", async () => {
    const processExec = vi.fn<
      () => Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number }>
    >(async () => ({
      ok: true,
      stdout: [
        "__LIGHTCODE_ENV_BEGIN__",
        "PATH=/home/demo/.nvm/versions/node/v24/bin:/usr/bin:/bin",
        "NVM_DIR=/home/demo/.nvm",
        "EDITOR=nvim",
        "PWD=/home/demo/project",
        "SHLVL=1",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    }));
    setWslProcessBridgeClient({ processExec } as never);

    await expect(primeWslProjectShellEnv("Ubuntu", "/home/demo/project")).resolves.toEqual({
      PATH: "/home/demo/.nvm/versions/node/v24/bin:/usr/bin:/bin",
      NVM_DIR: "/home/demo/.nvm",
      EDITOR: "nvim",
    });

    expect(getWslProjectShellEnv("Ubuntu", "/home/demo/project")).toEqual({
      PATH: "/home/demo/.nvm/versions/node/v24/bin:/usr/bin:/bin",
      NVM_DIR: "/home/demo/.nvm",
      EDITOR: "nvim",
    });
    expect(execFileMock).not.toHaveBeenCalled();
    expect(processExec).toHaveBeenCalledWith(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\",
      },
      {
        command: "sh",
        cwd: "/home/demo/project",
        args: ["-lc", "printf '%s\\n' '__LIGHTCODE_ENV_BEGIN__'; env"],
        loginEnv: true,
        timeoutMs: 15_000,
      },
    );
  });
});
