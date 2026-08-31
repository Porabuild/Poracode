import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCodexNativeExecutableForWindows } from "./windowsExecutable";

const WINDOWS_TARGETS = {
  x64: {
    packageName: "@openai/codex-win32-x64",
    targetTriple: "x86_64-pc-windows-msvc",
  },
  arm64: {
    packageName: "@openai/codex-win32-arm64",
    targetTriple: "aarch64-pc-windows-msvc",
  },
} as const;

describe.skipIf(process.platform !== "win32")("resolveCodexNativeExecutableForWindows", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  type WindowsTarget = { packageName: string; targetTriple: string };

  function createPnpmCodexFixture(
    root: string,
    target: WindowsTarget,
    shimName: string,
    shimBody: string,
  ): { shimPath: string; executablePath: string } {
    const binDir = join(root, "bin");
    const shimPath = join(binDir, shimName);

    const pnpmStoreDir = join(
      root,
      "global",
      "v11",
      "store",
      "node_modules",
      ".pnpm",
      "@openai+codex@0.151.0",
      "node_modules",
      "@openai",
    );
    const canonicalPackageDir = join(pnpmStoreDir, "codex");
    const siblingPackageDir = join(pnpmStoreDir, target.packageName.replace(/^@[^/\\]+[/\\]/, ""));
    const executablePath = join(
      siblingPackageDir,
      "vendor",
      target.targetTriple,
      "bin",
      "codex.exe",
    );

    const globalModulesDir = join(root, "global", "v11", "hash", "node_modules", "@openai");
    const symlinkPackageDir = join(globalModulesDir, "codex");

    mkdirSync(join(canonicalPackageDir, "bin"), { recursive: true });
    mkdirSync(dirname(executablePath), { recursive: true });
    mkdirSync(globalModulesDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    writeFileSync(executablePath, "", "utf8");
    writeFileSync(join(canonicalPackageDir, "bin", "codex.js"), "", "utf8");

    symlinkSync(canonicalPackageDir, symlinkPackageDir, "junction");
    writeFileSync(shimPath, shimBody, "utf8");

    return { shimPath, executablePath };
  }

  it("resolves npm Codex shims to the bundled native executable", () => {
    const target = WINDOWS_TARGETS[process.arch as keyof typeof WINDOWS_TARGETS];
    expect(target).toBeDefined();
    if (!target) return;

    const root = mkdtempSync(join(tmpdir(), "poracode-codex-native-"));
    tempDirs.push(root);
    const shimPath = join(root, "codex.cmd");
    const executablePath = join(
      root,
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      target.packageName,
      "vendor",
      target.targetTriple,
      "bin",
      "codex.exe",
    );
    mkdirSync(dirname(executablePath), { recursive: true });
    writeFileSync(executablePath, "", "utf8");
    writeFileSync(
      shimPath,
      [
        "@ECHO off",
        "SETLOCAL",
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%dp0%\\node.exe" "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
      ].join("\r\n"),
      "utf8",
    );

    expect(resolveCodexNativeExecutableForWindows(shimPath)).toBe(executablePath);
  });

  it("resolves pnpm Codex .cmd shims to the bundled native executable in virtual store", () => {
    const target = WINDOWS_TARGETS[process.arch as keyof typeof WINDOWS_TARGETS];
    expect(target).toBeDefined();
    if (!target) return;

    const root = mkdtempSync(join(tmpdir(), "poracode-codex-pnpm-cmd-"));
    tempDirs.push(root);

    const { shimPath, executablePath } = createPnpmCodexFixture(
      root,
      target,
      "codex.cmd",
      [
        "@SETLOCAL",
        '@IF EXIST "%~dp0\\node.exe" (',
        `  "%~dp0\\node.exe"  "%~dp0\\..\\global\\v11\\hash\\node_modules\\@openai\\codex\\bin\\codex.js" %*`,
        ") ELSE (",
        `  node  "%~dp0\\..\\global\\v11\\hash\\node_modules\\@openai\\codex\\bin\\codex.js" %*`,
        ")",
      ].join("\r\n"),
    );

    expect(resolveCodexNativeExecutableForWindows(shimPath)).toBe(executablePath);
    expect(resolveCodexNativeExecutableForWindows(join(dirname(shimPath), "codex"))).toBe(
      executablePath,
    );
  });

  it("resolves pnpm Codex .ps1 shims to the bundled native executable in virtual store", () => {
    const target = WINDOWS_TARGETS[process.arch as keyof typeof WINDOWS_TARGETS];
    expect(target).toBeDefined();
    if (!target) return;

    const root = mkdtempSync(join(tmpdir(), "poracode-codex-pnpm-ps1-"));
    tempDirs.push(root);

    const { shimPath, executablePath } = createPnpmCodexFixture(
      root,
      target,
      "codex.ps1",
      `& "$basedir/../global/v11/hash/node_modules/@openai/codex/bin/codex.js" $args\r\n`,
    );

    expect(resolveCodexNativeExecutableForWindows(shimPath)).toBe(executablePath);
    expect(resolveCodexNativeExecutableForWindows(join(dirname(shimPath), "codex"))).toBe(
      executablePath,
    );
  });
});
