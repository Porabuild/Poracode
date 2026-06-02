import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnSyncMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const execFileAsyncMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ stdout: string; stderr?: string }>>(),
);

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const { promisify } = require("node:util") as typeof import("node:util");
  return {
    ...actual,
    spawnSync: spawnSyncMock,
    execFile: Object.assign(vi.fn(), {
      [promisify.custom]: execFileAsyncMock,
    }),
  };
});

import {
  clearExecutablePathCache,
  getRefreshedWindowsPath,
  invalidateExecutablePathCache,
  resolveExecutablePath,
  resolveExecutablePathAsync,
} from "./base";

const USER_REG_QUERY = [
  "HKEY_CURRENT_USER\\Environment",
  "    Path    REG_EXPAND_SZ    %USERPROFILE%\\.local\\bin;C:\\Users\\demo\\scoop\\shims",
].join("\r\n");

const MACHINE_REG_QUERY = [
  "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
  "    Path    REG_EXPAND_SZ    C:\\Windows\\System32;C:\\Program Files\\Git\\cmd",
].join("\r\n");

describe.skipIf(process.platform !== "win32")("Windows executable path fallback", () => {
  const originalPlatform = process.platform;
  const originalPath = process.env.Path;
  const originalPATH = process.env.PATH;
  const originalSystemRoot = process.env.SystemRoot;
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    clearExecutablePathCache();
    spawnSyncMock.mockReset();
    execFileAsyncMock.mockReset();
    process.env.SystemRoot = "C:\\Windows";
    process.env.USERPROFILE = "C:\\Users\\demo";
    process.env.Path = "C:\\Windows\\System32";
    delete process.env.PATH;
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    if (originalPath === undefined) {
      delete process.env.Path;
    } else {
      process.env.Path = originalPath;
    }
    if (originalPATH === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPATH;
    }
    if (originalSystemRoot === undefined) {
      delete process.env.SystemRoot;
    } else {
      process.env.SystemRoot = originalSystemRoot;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
    vi.restoreAllMocks();
  });

  it("falls back to the registry-backed Windows Path when ambient lookup misses", () => {
    spawnSyncMock
      .mockReturnValueOnce({ error: undefined, status: 1, stdout: "", stderr: "" })
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: USER_REG_QUERY, stderr: "" })
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: MACHINE_REG_QUERY, stderr: "" })
      .mockReturnValueOnce({
        error: undefined,
        status: 0,
        stdout: "C:\\Users\\demo\\.local\\bin\\opencode.exe\r\n",
        stderr: "",
      });

    expect(resolveExecutablePath("opencode")).toBe("C:\\Users\\demo\\.local\\bin\\opencode.exe");

    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      4,
      "C:\\Windows\\System32\\where.exe",
      ["opencode"],
      expect.objectContaining({
        env: expect.objectContaining({
          Path: expect.stringContaining("C:\\Users\\demo\\.local\\bin"),
          PATH: expect.stringContaining("C:\\Users\\demo\\.local\\bin"),
        }),
      }),
    );
  });

  it("prefers npm .cmd shims over extensionless POSIX shims", () => {
    spawnSyncMock.mockReturnValueOnce({
      error: undefined,
      status: 0,
      stdout: [
        "C:\\Users\\demo\\AppData\\Roaming\\npm\\gemini",
        "C:\\Users\\demo\\AppData\\Roaming\\npm\\gemini.cmd",
      ].join("\r\n"),
      stderr: "",
    });

    expect(resolveExecutablePath("gemini")).toBe(
      "C:\\Users\\demo\\AppData\\Roaming\\npm\\gemini.cmd",
    );
  });

  it("applies the same fallback to async resolution", async () => {
    execFileAsyncMock.mockRejectedValueOnce(new Error("not found")).mockResolvedValueOnce({
      stdout: "C:\\Users\\demo\\scoop\\shims\\opencode.exe\r\n",
      stderr: "",
    });
    spawnSyncMock
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: USER_REG_QUERY, stderr: "" })
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: MACHINE_REG_QUERY, stderr: "" });

    await expect(resolveExecutablePathAsync("opencode")).resolves.toBe(
      "C:\\Users\\demo\\scoop\\shims\\opencode.exe",
    );

    expect(execFileAsyncMock).toHaveBeenLastCalledWith(
      "C:\\Windows\\System32\\where.exe",
      ["opencode"],
      expect.objectContaining({
        env: expect.objectContaining({
          Path: expect.stringContaining("C:\\Users\\demo\\scoop\\shims"),
          PATH: expect.stringContaining("C:\\Users\\demo\\scoop\\shims"),
        }),
        timeout: 5_000,
        windowsHide: true,
      }),
    );
  });

  it("prefers npm .cmd shims during async resolution", async () => {
    execFileAsyncMock.mockResolvedValueOnce({
      stdout: [
        "C:\\Users\\demo\\AppData\\Roaming\\npm\\gemini",
        "C:\\Users\\demo\\AppData\\Roaming\\npm\\gemini.cmd",
      ].join("\r\n"),
      stderr: "",
    });

    await expect(resolveExecutablePathAsync("gemini")).resolves.toBe(
      "C:\\Users\\demo\\AppData\\Roaming\\npm\\gemini.cmd",
    );
  });

  it("getRefreshedWindowsPath merges registry PATH beyond the live process Path", () => {
    spawnSyncMock
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: USER_REG_QUERY, stderr: "" })
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: MACHINE_REG_QUERY, stderr: "" });

    const refreshed = getRefreshedWindowsPath();
    expect(refreshed).toContain("C:\\Windows\\System32");
    expect(refreshed).toContain("C:\\Users\\demo\\.local\\bin");
    expect(refreshed).toContain("C:\\Program Files\\Git\\cmd");
  });

  it("getRefreshedWindowsPath returns undefined when the registry adds nothing new", () => {
    // A live process always has a PATH; assert against it (the case-insensitive
    // delete in beforeEach drops it, so set it explicitly here).
    process.env.Path = "C:\\Windows\\System32";
    const onlySystem32 = [
      "HKEY_CURRENT_USER\\Environment",
      "    Path    REG_EXPAND_SZ    C:\\Windows\\System32",
    ].join("\r\n");
    spawnSyncMock
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: onlySystem32, stderr: "" })
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: onlySystem32, stderr: "" });

    expect(getRefreshedWindowsPath()).toBeUndefined();
  });

  it("re-reads the registry PATH after invalidateExecutablePathCache (post-install)", () => {
    process.env.Path = "C:\\Windows\\System32";
    // Before install: the registry PATH matches the process PATH, so a spawned
    // shell would only see System32 — the just-installed CLI is absent.
    const beforeInstall = [
      "HKEY_CURRENT_USER\\Environment",
      "    Path    REG_EXPAND_SZ    C:\\Windows\\System32",
    ].join("\r\n");
    spawnSyncMock
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: beforeInstall, stderr: "" })
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: beforeInstall, stderr: "" });
    expect(getRefreshedWindowsPath()).toBeUndefined();

    // The installer added a new dir to the user registry PATH; the post-install
    // refresh invalidates the cache, so the next read picks it up immediately.
    invalidateExecutablePathCache();
    spawnSyncMock
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: USER_REG_QUERY, stderr: "" })
      .mockReturnValueOnce({ error: undefined, status: 0, stdout: MACHINE_REG_QUERY, stderr: "" });
    expect(getRefreshedWindowsPath()).toContain("C:\\Users\\demo\\.local\\bin");
  });
});
