import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const buildAgentCommandMock = vi.hoisted(() =>
  vi.fn<(location: ProjectLocation, command: string, args: string[]) => unknown>(),
);
const terminateProcessTreeMock = vi.hoisted(() => vi.fn<(pid: number) => void>());
const spawnPtyMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock("./agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agents/base")>()),
  buildAgentCommand: buildAgentCommandMock,
}));
vi.mock("@/shared/processTree", () => ({ terminateProcessTree: terminateProcessTreeMock }));
vi.mock("node-pty", () => ({ spawn: spawnPtyMock }));

import { ONE_SHOT_OUTPUT_MARKER } from "./oneShotOutputMarker";
import { buildOneShotSpec, prepareOneShot, spawnAgent, spawnAgentPty } from "./oneShotSpawn";

beforeEach(() => {
  vi.clearAllMocks();
  buildAgentCommandMock.mockImplementation((location) => ({ command: "agy", args: [], location }));
});

function capturedLocation(): ProjectLocation {
  return buildAgentCommandMock.mock.calls[0]?.[0] as ProjectLocation;
}

describe("buildOneShotSpec isolateCwd", () => {
  const windowsProject: ProjectLocation = { kind: "windows", path: "C:\\Users\\demo\\project" };
  const wslProject: ProjectLocation = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/demo/project",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
  };

  it("uses the project cwd by default", () => {
    buildOneShotSpec(windowsProject, "agy", ["-p", "hi"]);
    expect(capturedLocation()).toEqual(windowsProject);
  });

  it("redirects a native one-shot to the OS temp dir when isolated", () => {
    buildOneShotSpec(windowsProject, "agy", ["-p", "hi"], { isolateCwd: true });
    expect(capturedLocation()).toEqual({ kind: "windows", path: tmpdir() });
  });

  it("redirects a WSL one-shot to /tmp inside the distro when isolated", () => {
    buildOneShotSpec(wslProject, "agy", ["-p", "hi"], { isolateCwd: true });
    // Distro + uncPath are preserved; only the working directory is neutralized.
    expect(capturedLocation()).toEqual({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/tmp",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
    });
  });

  it("does not neutralize the cwd when isolateCwd is false", () => {
    buildOneShotSpec(wslProject, "agy", ["-p", "hi"], { isolateCwd: false });
    expect(capturedLocation()).toEqual(wslProject);
  });
});

describe("spawnAgentPty", () => {
  it("preserves cursor-positioned PTY rows when stripping ANSI", async () => {
    let onData: ((data: string) => void) | undefined;
    let onExit: ((event: { exitCode: number }) => void) | undefined;
    spawnPtyMock.mockReturnValue({
      pid: 4321,
      kill: vi.fn<() => void>(),
      write: vi.fn<() => void>(),
      onData: vi.fn<(callback: (data: string) => void) => { dispose: () => void }>((callback) => {
        onData = callback;
        return { dispose: vi.fn<() => void>() };
      }),
      onExit: vi.fn<(callback: (event: { exitCode: number }) => void) => { dispose: () => void }>(
        (callback) => {
          onExit = callback;
          return { dispose: vi.fn<() => void>() };
        },
      ),
    });

    const result = spawnAgentPty({ command: "agy", args: ["models"] }, "", 10_000);
    onData?.(
      "\u001b[H⠋ Fetching available models...\u001b[Hgemini-3.6-flash-high\r\ngemini-3.6-flash-medium\r\n",
    );
    onExit?.({ exitCode: 0 });

    await expect(result).resolves.toBe(
      "⠋ Fetching available models...\ngemini-3.6-flash-high\r\ngemini-3.6-flash-medium",
    );
  });

  it("strips a login-shell banner preceding the sentinel", async () => {
    let onData: ((data: string) => void) | undefined;
    let onExit: ((event: { exitCode: number }) => void) | undefined;
    spawnPtyMock.mockReturnValue({
      pid: 4321,
      kill: vi.fn<() => void>(),
      write: vi.fn<() => void>(),
      onData: vi.fn<(callback: (data: string) => void) => { dispose: () => void }>((callback) => {
        onData = callback;
        return { dispose: vi.fn<() => void>() };
      }),
      onExit: vi.fn<(callback: (event: { exitCode: number }) => void) => { dispose: () => void }>(
        (callback) => {
          onExit = callback;
          return { dispose: vi.fn<() => void>() };
        },
      ),
    });

    const result = spawnAgentPty({ command: "agy", args: ["-p"] }, "", 10_000);
    onData?.(
      `Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.18.3 x86_64)\r\n${ONE_SHOT_OUTPUT_MARKER}\r\nFix WSL cold-boot thread titles\r\n`,
    );
    onExit?.({ exitCode: 0 });

    await expect(result).resolves.toBe("Fix WSL cold-boot thread titles");
  });

  it("terminates the process tree on Windows instead of invoking node-pty's console helper", async () => {
    vi.useFakeTimers();
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    let onExit: ((event: { exitCode: number }) => void) | undefined;
    const kill = vi.fn<() => void>();
    spawnPtyMock.mockReturnValue({
      pid: 4321,
      kill,
      write: vi.fn<() => void>(),
      onData: vi.fn<() => { dispose: () => void }>(() => ({
        dispose: vi.fn<() => void>(),
      })),
      onExit: vi.fn<(callback: (event: { exitCode: number }) => void) => { dispose: () => void }>(
        (callback) => {
          onExit = callback;
          return { dispose: vi.fn<() => void>() };
        },
      ),
    });

    try {
      const result = spawnAgentPty({ command: "agy", args: [] }, "", 10);
      await vi.advanceTimersByTimeAsync(10);

      expect(terminateProcessTreeMock).toHaveBeenCalledWith(4321);
      expect(kill).not.toHaveBeenCalled();

      onExit?.({ exitCode: 1 });
      await expect(result).rejects.toThrow("Agent timed out");
    } finally {
      platform.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("one-shot banner fencing", () => {
  const wslProject: ProjectLocation = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/demo/project",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
  };

  it("marks one-shot login-shell scripts so startup banners can be dropped", () => {
    buildAgentCommandMock.mockReturnValue({
      command: "wsl.exe",
      args: ["-d", "Ubuntu", "--exec", "/bin/bash", "-l", "-i", "-c", "exec 'claude' '-p'"],
    });
    const { spec } = prepareOneShot(wslProject, { command: "claude", args: ["-p"] });
    expect(spec.args.at(-1)).toBe(`printf '%s\n' '${ONE_SHOT_OUTPUT_MARKER}'; exec 'claude' '-p'`);
  });

  it("resolves only the output that follows the sentinel", async () => {
    const script = [
      `console.log("Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.18.3 x86_64)")`,
      `console.log(${JSON.stringify(ONE_SHOT_OUTPUT_MARKER)})`,
      `console.log("Fix WSL cold-boot thread titles")`,
    ].join(";");
    await expect(
      spawnAgent({ command: process.execPath, args: ["-e", script] }, "", 30_000),
    ).resolves.toBe("Fix WSL cold-boot thread titles");
  });
});
