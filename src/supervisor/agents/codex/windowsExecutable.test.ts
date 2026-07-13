import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});
