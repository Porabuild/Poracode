import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  extractWindowsCmdShimScript,
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
  let tempDirs: string[] = [];

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    clearExecutablePathCache();
    spawnSyncMock.mockReset();
    execFileAsyncMock.mockReset();
    tempDirs = [];
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
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it("resolves npm .cmd shims to their package exe target when present", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-claude-shim-"));
    tempDirs.push(root);
    const cmdPath = join(root, "claude.cmd");
    const exePath = join(root, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    mkdirSync(join(root, "node_modules", "@anthropic-ai", "claude-code", "bin"), {
      recursive: true,
    });
    writeFileSync(
      cmdPath,
      '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" %*\n',
    );
    writeFileSync(exePath, "");
    spawnSyncMock.mockReturnValueOnce({
      error: undefined,
      status: 0,
      stdout: [join(root, "claude"), cmdPath].join("\r\n"),
      stderr: "",
    });

    expect(resolveExecutablePath("claude")).toBe(exePath);
  });

  it("resolves Scoop .exe shims to their executable target", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-scoop-shim-"));
    tempDirs.push(root);
    const shimDir = join(root, "scoop", "shims");
    const target = join(root, "scoop", "apps", "opencode", "current", "opencode.exe");
    mkdirSync(shimDir, { recursive: true });
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(join(shimDir, "opencode.exe"), "");
    writeFileSync(join(shimDir, "opencode.shim"), `path = "${target}"\n`);
    writeFileSync(target, "");
    spawnSyncMock.mockReturnValueOnce({
      error: undefined,
      status: 0,
      stdout: `${join(shimDir, "opencode.exe")}\r\n`,
      stderr: "",
    });

    expect(resolveExecutablePath("opencode")).toBe(target);
  });

  it("keeps Scoop shims that supply fixed arguments", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-scoop-args-shim-"));
    tempDirs.push(root);
    const shim = join(root, "tool.exe");
    const target = join(root, "target.exe");
    writeFileSync(shim, "");
    writeFileSync(join(root, "tool.shim"), `path = "${target}"\nargs = "--fixed"\n`);
    writeFileSync(target, "");
    spawnSyncMock.mockReturnValueOnce({
      error: undefined,
      status: 0,
      stdout: `${shim}\r\n`,
      stderr: "",
    });

    expect(resolveExecutablePath("tool")).toBe(shim);
  });

  it("keeps the .cmd path for npm node-shim wrappers (e.g. command-code.cmd → node index.mjs)", () => {
    // Regression: a previous version of resolveWindowsCmdExeTarget greedily
    // matched `"%dp0%\node.exe"` in npm's standard Node-script shim and
    // returned node.exe directly. That stripped the script entry, so
    // buildAgentCommand spawned `node.exe --model ... --enable ...` and Node
    // rejected the agent's flags with "bad option: --model". The .cmd must
    // remain so resolveWindowsNodeCmdShim can extract the script entry later.
    const root = mkdtempSync(join(tmpdir(), "poracode-command-code-shim-"));
    tempDirs.push(root);
    const cmdPath = join(root, "command-code.cmd");
    const nodeExePath = join(root, "node.exe");
    const jsPath = join(root, "node_modules", "command-code", "dist", "index.mjs");
    mkdirSync(join(root, "node_modules", "command-code", "dist"), { recursive: true });
    writeFileSync(nodeExePath, "");
    writeFileSync(jsPath, "");
    writeFileSync(
      cmdPath,
      [
        "@ECHO off",
        "SETLOCAL",
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%dp0%\\node.exe"  "%dp0%\\node_modules\\command-code\\dist\\index.mjs" %*',
        "",
      ].join("\r\n"),
    );
    spawnSyncMock.mockReturnValueOnce({
      error: undefined,
      status: 0,
      stdout: [join(root, "command-code"), cmdPath].join("\r\n"),
      stderr: "",
    });

    expect(resolveExecutablePath("command-code")).toBe(cmdPath);
  });

  it("keeps the .cmd path for npm shims with an extensionless bin script (e.g. grok.cmd)", () => {
    // Regression: @xai-official/grok's npm bin entry has no .js extension
    // (`"%_prog%"  "%dp0%\node_modules\@xai-official\grok\bin\grok" %*`), so
    // the .js-only shim guard missed it and the exe substitution matched the
    // shim's `IF EXIST "%dp0%\node.exe"` line — resolving `grok` to node.exe.
    // Detection then read node's version and the ACP probe spawned
    // `node.exe agent stdio`, breaking version, models, and account info.
    const root = mkdtempSync(join(tmpdir(), "poracode-grok-shim-"));
    tempDirs.push(root);
    const cmdPath = join(root, "grok.cmd");
    const nodeExePath = join(root, "node.exe");
    writeFileSync(nodeExePath, "");
    writeFileSync(
      cmdPath,
      [
        "@ECHO off",
        "SETLOCAL",
        'IF EXIST "%dp0%\\node.exe" (',
        '  SET "_prog=%dp0%\\node.exe"',
        ") ELSE (",
        '  SET "_prog=node"',
        ")",
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@xai-official\\grok\\bin\\grok" %*',
        "",
      ].join("\r\n"),
    );
    spawnSyncMock.mockReturnValueOnce({
      error: undefined,
      status: 0,
      stdout: [join(root, "grok"), cmdPath].join("\r\n"),
      stderr: "",
    });

    expect(resolveExecutablePath("grok")).toBe(cmdPath);
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

describe("extractWindowsCmdShimScript", () => {
  it("extracts .js/.mjs script entries", () => {
    const body = '"%dp0%\\node.exe"  "%dp0%\\node_modules\\command-code\\dist\\index.mjs" %*';
    expect(extractWindowsCmdShimScript(body)).toBe("node_modules\\command-code\\dist\\index.mjs");
  });

  it("extracts extensionless %_prog% bin scripts", () => {
    const body = '"%_prog%"  "%dp0%\\node_modules\\@xai-official\\grok\\bin\\grok" %*';
    expect(extractWindowsCmdShimScript(body)).toBe("node_modules\\@xai-official\\grok\\bin\\grok");
  });

  it("returns undefined for exe-wrapping shims", () => {
    const body = '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" %*';
    expect(extractWindowsCmdShimScript(body)).toBeUndefined();
  });
});
