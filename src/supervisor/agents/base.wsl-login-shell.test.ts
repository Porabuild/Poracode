import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, spawnSyncMock, spawnMock } = vi.hoisted(() => ({
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
  spawnMock: vi.fn<(command: string, args: string[], options?: unknown) => unknown>(),
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: execFileMock,
    spawn: spawnMock,
    spawnSync: spawnSyncMock,
  };
});

import {
  buildWslLoginShellCommand,
  clearExecutablePathCache,
  getCachedWslHomeDirectory,
  getCachedWslShellPath,
  getWslProjectShellEnv,
  batchWslCommandsAsync,
  prepareWslDistroEnvironment,
  primeWslLaunchEnvironment,
  primeWslProjectShellEnv,
  readWslLoginShellCommandOutputAsync,
  resolveWslHomeDirectory,
  setWslProcessBridgeClient,
  WslLaunchEnvironmentUnpreparedError,
} from "./base";

const ENV_MARKER = "__PORACODE_WSL_ENV__";

function probeStdout(shellPath: string, home: string): string {
  return `${ENV_MARKER}\n${shellPath}\n${home}\n`;
}

interface FakeProbeChild extends EventEmitter {
  stdout: EventEmitter & { setEncoding: (encoding: string) => void };
  stderr: EventEmitter & { setEncoding: (encoding: string) => void };
}

function fakeProbeChild(stdout?: string): FakeProbeChild {
  const child = new EventEmitter() as FakeProbeChild;
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} });
  if (stdout !== undefined) {
    setImmediate(() => {
      child.stdout.emit("data", stdout);
      child.emit("close", 0);
    });
  }
  return child;
}

/**
 * A fake `wsl.exe` whose probe responds for every distro except the ones named
 * in `stallingDistros`, which never emit output or close — a stalled distro.
 */
function installFakeWslProbe(stallingDistros: readonly string[] = []) {
  const children = new Map<string, FakeProbeChild>();
  const calls: string[] = [];
  spawnMock.mockImplementation((_command: string, args: readonly string[]) => {
    const distroIndex = args.indexOf("-d");
    const distro = distroIndex >= 0 ? (args[distroIndex + 1] ?? "") : "";
    calls.push(distro);
    const child = fakeProbeChild(
      stallingDistros.includes(distro) ? undefined : probeStdout("/usr/bin/zsh", "/home/demo"),
    );
    children.set(distro, child);
    return child;
  });
  return { children, calls };
}

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

  it("captures and caches the WSL project env through the bridge", async () => {
    const processExec = vi.fn<
      () => Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number }>
    >(async () => ({
      ok: true,
      stdout: [
        "__PORACODE_ENV_BEGIN__",
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
        args: ["-lc", "printf '%s\\n' '__PORACODE_ENV_BEGIN__'; env"],
        loginEnv: true,
        timeoutMs: 15_000,
      },
    );
  });
});

describe("WSL launch-environment preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearExecutablePathCache();
    setWslProcessBridgeClient(undefined);
  });

  it("reads the login shell and home once through a bounded async probe", async () => {
    const { calls } = installFakeWslProbe();

    await expect(prepareWslDistroEnvironment("Ubuntu")).resolves.toEqual({
      shellPath: "/usr/bin/zsh",
      home: "/home/demo",
    });
    await expect(prepareWslDistroEnvironment("Ubuntu")).resolves.toEqual({
      shellPath: "/usr/bin/zsh",
      home: "/home/demo",
    });
    expect(calls).toEqual(["Ubuntu"]);

    expect(getCachedWslShellPath("Ubuntu")).toBe("/usr/bin/zsh");
    expect(getCachedWslHomeDirectory("Ubuntu")).toBe("/home/demo");
    expect(buildWslLoginShellCommand("Ubuntu", "/tmp", "echo hi").args).toEqual([
      "-d",
      "Ubuntu",
      "--cd",
      "/tmp",
      "--exec",
      "/usr/bin/zsh",
      "-l",
      "-i",
      "-c",
      "echo hi",
    ]);
    await expect(resolveWslHomeDirectory("Ubuntu")).resolves.toBe("/home/demo");
  });

  it("prefers the bridge for the probe when it is live", async () => {
    const processExec = vi.fn<
      (...args: unknown[]) => Promise<{
        ok: boolean;
        stdout: string;
        stderr: string;
        exitCode: number;
      }>
    >(async () => ({
      ok: true,
      stdout: probeStdout("/usr/bin/fish", "/home/bridge"),
      stderr: "",
      exitCode: 0,
    }));
    setWslProcessBridgeClient({ processExec } as never);

    await expect(prepareWslDistroEnvironment("Ubuntu")).resolves.toEqual({
      shellPath: "/usr/bin/fish",
      home: "/home/bridge",
    });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(getCachedWslHomeDirectory("Ubuntu")).toBe("/home/bridge");
  });

  it("fails closed without spawning or assuming a shell on a cold read", () => {
    expect(() => buildWslLoginShellCommand("ColdDistro", "/tmp", "echo hi")).toThrow(
      WslLaunchEnvironmentUnpreparedError,
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("invalidates prepared values and re-probes after an explicit cache clear", async () => {
    const { calls } = installFakeWslProbe();
    await prepareWslDistroEnvironment("Ubuntu");
    expect(getCachedWslShellPath("Ubuntu")).toBe("/usr/bin/zsh");

    clearExecutablePathCache();
    expect(getCachedWslShellPath("Ubuntu")).toBeUndefined();
    expect(() => buildWslLoginShellCommand("Ubuntu", "/tmp", "echo hi")).toThrow(
      WslLaunchEnvironmentUnpreparedError,
    );

    await prepareWslDistroEnvironment("Ubuntu");
    expect(calls).toEqual(["Ubuntu", "Ubuntu"]);
  });

  it("starts a fresh probe after a cache clear instead of joining a stale flight", async () => {
    const children: FakeProbeChild[] = [];
    spawnMock.mockImplementation(() => {
      const child = fakeProbeChild(undefined);
      children.push(child);
      return child;
    });

    const stale = prepareWslDistroEnvironment("Stale");
    await vi.waitFor(() => expect(children).toHaveLength(1));

    clearExecutablePathCache();
    const fresh = prepareWslDistroEnvironment("Stale");
    await vi.waitFor(() => expect(children).toHaveLength(2));

    children[1]!.stdout.emit("data", probeStdout("/usr/bin/zsh", "/home/demo"));
    children[1]!.emit("close", 0);
    await expect(fresh).resolves.toEqual({ shellPath: "/usr/bin/zsh", home: "/home/demo" });

    // The pre-clear flight finishes late and cannot repopulate the caches.
    children[0]!.stdout.emit("data", probeStdout("/usr/bin/bash", "/home/stale"));
    children[0]!.emit("close", 0);
    await expect(stale).resolves.toBeUndefined();
    expect(getCachedWslShellPath("Stale")).toBe("/usr/bin/zsh");
    expect(getCachedWslHomeDirectory("Stale")).toBe("/home/demo");
  });

  it("keeps local work and other distros moving while one distro stalls", async () => {
    const { children, calls } = installFakeWslProbe(["Stalled"]);

    const stalled = prepareWslDistroEnvironment("Stalled");
    let localAdvanced = false;
    const local = new Promise<void>((resolve) => {
      setImmediate(() => {
        localAdvanced = true;
        resolve();
      });
    });
    const ubuntu = await prepareWslDistroEnvironment("Ubuntu");
    await local;

    expect(localAdvanced).toBe(true);
    expect(ubuntu?.shellPath).toBe("/usr/bin/zsh");
    expect(calls.sort()).toEqual(["Stalled", "Ubuntu"]);

    // An aborted caller rejects only its own wait; the shared flight and other
    // distros stay usable.
    const controller = new AbortController();
    const aborted = prepareWslDistroEnvironment("Stalled", { signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toThrow(/abort/i);
    await expect(prepareWslDistroEnvironment("Debian")).resolves.toMatchObject({
      shellPath: "/usr/bin/zsh",
    });

    // A late probe completion after invalidation must not repopulate the cache.
    clearExecutablePathCache();
    const stalledChild = children.get("Stalled")!;
    stalledChild.stdout.emit("data", probeStdout("/usr/bin/zsh", "/home/demo"));
    stalledChild.emit("close", 0);
    await expect(stalled).resolves.toBeUndefined();
    expect(getCachedWslShellPath("Stalled")).toBeUndefined();
    expect(getCachedWslHomeDirectory("Stalled")).toBeUndefined();
  });

  it("seeds a prepared environment without spawning", async () => {
    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: undefined });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(buildWslLoginShellCommand("Ubuntu", "/tmp", "echo hi").args[5]).toBe("/bin/bash");
    expect(await resolveWslHomeDirectory("Ubuntu")).toBeUndefined();
  });
});
