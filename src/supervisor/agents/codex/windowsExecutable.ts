import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { resolveAgentBinaryPath } from "../binaryResolver";

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

function candidateShimPaths(commandPath: string | undefined): string[] {
  if (!commandPath) return [];
  if (/\.(?:cmd|ps1)$/i.test(commandPath)) return [commandPath];
  return [`${commandPath}.cmd`, `${commandPath}.ps1`];
}

function resolvePackageRootFromShim(shimPath: string): string | undefined {
  if (!/\.(?:cmd|ps1)$/i.test(shimPath) || !existsSync(shimPath)) {
    return undefined;
  }
  let body: string;
  try {
    body = readFileSync(shimPath, "utf8");
  } catch {
    return undefined;
  }

  // The optional prefix strips the `%~dp0\` / `%dp0%\` (cmd) or `$basedir\` /
  // `$basedir/` (ps1) token so the capture can be joined onto the shim's dir;
  // without it the capture is an absolute path (some shims embed those).
  const scriptMatch =
    /(?:%(?:~dp0|dp0%)[\\/]|\$basedir[\\/])?([^"'\r\n]*?node_modules[/\\]@openai[/\\]codex[/\\]bin[/\\]codex\.js)/i.exec(
      body,
    )?.[1];
  if (!scriptMatch) return undefined;

  const scriptPath = isAbsolute(scriptMatch) ? scriptMatch : join(dirname(shimPath), scriptMatch);
  const packageRoot = dirname(dirname(scriptPath));
  try {
    return realpathSync(packageRoot);
  } catch {
    return packageRoot;
  }
}

export function resolveCodexNativeExecutableForWindows(
  commandPath: string | undefined,
): string | undefined {
  if (process.platform !== "win32") return undefined;
  if (commandPath && /codex\.exe$/i.test(commandPath) && existsSync(commandPath)) {
    return commandPath;
  }

  const target = WINDOWS_TARGETS[process.arch as keyof typeof WINDOWS_TARGETS];
  if (!target) return undefined;

  const shortName = target.packageName.replace(/^@[^/\\]+[/\\]/, "");
  for (const shimPath of candidateShimPaths(commandPath)) {
    const canonicalRoot = resolvePackageRootFromShim(shimPath);
    if (!canonicalRoot) continue;
    const candidates = [
      join(
        canonicalRoot,
        "node_modules",
        target.packageName,
        "vendor",
        target.targetTriple,
        "bin",
        "codex.exe",
      ),
      join(canonicalRoot, "vendor", target.targetTriple, "bin", "codex.exe"),
      join(dirname(canonicalRoot), shortName, "vendor", target.targetTriple, "bin", "codex.exe"),
    ];
    const executable = candidates.find((candidate) => existsSync(candidate));
    if (executable) return executable;
  }

  return undefined;
}

export function resolveCodexWindowsLaunchBinary(location: ProjectLocation): string | undefined {
  if (location.kind !== "windows") return undefined;
  const resolved = resolveAgentBinaryPath(location, "codex");
  return resolveCodexNativeExecutableForWindows(resolved) ?? resolved;
}
