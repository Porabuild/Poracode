import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
  return [commandPath, `${commandPath}.cmd`, `${commandPath}.ps1`];
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
  if (!/node_modules[/\\]@openai[/\\]codex[/\\]bin[/\\]codex\.js/i.test(body)) {
    return undefined;
  }
  return join(dirname(shimPath), "node_modules", "@openai", "codex");
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

  for (const shimPath of candidateShimPaths(commandPath)) {
    const packageRoot = resolvePackageRootFromShim(shimPath);
    if (!packageRoot) continue;
    const candidates = [
      join(
        packageRoot,
        "node_modules",
        target.packageName,
        "vendor",
        target.targetTriple,
        "bin",
        "codex.exe",
      ),
      join(packageRoot, "vendor", target.targetTriple, "bin", "codex.exe"),
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
