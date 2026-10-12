import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const taskkillSpawnSyncMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: ((command, args, options) => {
      if (command === "taskkill") {
        return taskkillSpawnSyncMock(command, args, options);
      }
      return actual.spawnSync(command, args, options);
    }) as typeof actual.spawnSync,
  };
});

import { terminateChildProcessTree, terminateProcessTree } from "./processTree";

describe("processTree", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

  beforeEach(() => {
    taskkillSpawnSyncMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (platformDescriptor) {
      Object.defineProperty(process, "platform", platformDescriptor);
    }
  });

  it("uses taskkill on Windows to terminate the full process tree", () => {
    const processKillSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    taskkillSpawnSyncMock.mockReturnValue({
      pid: 0,
      output: [],
      stdout: null,
      stderr: null,
      status: 0,
      signal: null,
    });

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    terminateProcessTree(4242);

    expect(processKillSpy).toHaveBeenCalledWith(4242, 0);
    expect(taskkillSpawnSyncMock).toHaveBeenCalledWith(
      "taskkill",
      ["/PID", "4242", "/T", "/F"],
      expect.objectContaining({
        stdio: "ignore",
        windowsHide: true,
        // A wedged taskkill must time out instead of hanging the caller.
        timeout: expect.any(Number),
      }),
    );
    const options = taskkillSpawnSyncMock.mock.calls[0]?.[2] as { timeout?: number };
    expect(options.timeout).toBeGreaterThan(0);
    expect(processKillSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to a direct kill when taskkill times out instead of hanging", () => {
    const processKillSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    // A timed-out spawnSync reports an ETIMEDOUT error and no exit status.
    taskkillSpawnSyncMock.mockReturnValue({
      pid: 0,
      output: [],
      stdout: null,
      stderr: null,
      status: null,
      signal: null,
      error: Object.assign(new Error("spawnSync taskkill ETIMEDOUT"), { code: "ETIMEDOUT" }),
    });

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    terminateProcessTree(4242);

    expect(taskkillSpawnSyncMock).toHaveBeenCalledTimes(1);
    expect(processKillSpy).toHaveBeenCalledWith(4242);
  });

  it("falls back to a direct kill when taskkill fails without success", () => {
    const processKillSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    taskkillSpawnSyncMock.mockReturnValue({
      pid: 0,
      output: [],
      stdout: null,
      stderr: null,
      status: 128,
      signal: null,
    });

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    terminateProcessTree(4242);

    expect(processKillSpy).toHaveBeenCalledWith(4242);
  });

  it("falls back to process.kill on non-Windows platforms", () => {
    const processKillSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux",
    });

    terminateChildProcessTree({ pid: 31337 });

    expect(taskkillSpawnSyncMock).not.toHaveBeenCalled();
    expect(processKillSpy).toHaveBeenCalledWith(31337);
  });

  it("kills an owned POSIX process group", () => {
    const processKillSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux",
    });

    terminateChildProcessTree({ pid: 31337 }, { ownedProcessGroup: true });

    expect(taskkillSpawnSyncMock).not.toHaveBeenCalled();
    expect(processKillSpy).toHaveBeenCalledExactlyOnceWith(-31337, "SIGKILL");
  });
});
