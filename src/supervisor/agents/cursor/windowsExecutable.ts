import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import {
  buildAgentCommand,
  readAgentCommandOutput,
  readCommandOutputAsync,
  type AgentArgvSpec,
  type CommandSpec,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";

interface CursorWindowsLaunch {
  binary: string;
  argsPrefix: string[];
  env: Record<string, string>;
}

const CURSOR_VERSION_DIR_RE =
  /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(\d{2})-(\d{2})-(\d{2}))?-[a-f0-9]+$/i;

function cursorVersionSortKey(name: string): number | undefined {
  const match = CURSOR_VERSION_DIR_RE.exec(name);
  if (!match) return undefined;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
  );
}

function launchFromDir(dir: string, invokedAs: string): CursorWindowsLaunch | undefined {
  const binary = join(dir, "node.exe");
  const script = join(dir, "index.js");
  if (!existsSync(binary) || !existsSync(script)) return undefined;
  return {
    binary,
    argsPrefix: [script],
    env: {
      CURSOR_INVOKED_AS: invokedAs,
      ...(process.env.NODE_COMPILE_CACHE
        ? { NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE }
        : process.env.LOCALAPPDATA
          ? { NODE_COMPILE_CACHE: join(process.env.LOCALAPPDATA, "cursor-compile-cache") }
          : {}),
    },
  };
}

export function resolveCursorWindowsLaunch(
  executablePath: string | undefined,
): CursorWindowsLaunch | undefined {
  if (
    process.platform !== "win32" ||
    !executablePath ||
    !/^(?:cursor-agent|agent)\.(?:cmd|ps1)$/i.test(basename(executablePath)) ||
    !existsSync(executablePath)
  ) {
    return undefined;
  }

  const invokedAs = basename(executablePath);
  const shimDir = dirname(executablePath);
  const local = launchFromDir(shimDir, invokedAs);
  if (local) return local;

  const versionsDir = join(shimDir, "versions");
  let versions: Array<{ name: string; sortKey: number }>;
  try {
    versions = readdirSync(versionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, sortKey: cursorVersionSortKey(entry.name) }))
      .filter((entry): entry is { name: string; sortKey: number } => entry.sortKey !== undefined)
      .sort((a, b) => b.sortKey - a.sortKey || b.name.localeCompare(a.name));
  } catch {
    return undefined;
  }

  for (const version of versions) {
    const launch = launchFromDir(join(versionsDir, version.name), invokedAs);
    if (launch) return launch;
  }
  return undefined;
}

function resolveCursorExecutablePath(
  location: ProjectLocation,
  executablePath: string | undefined,
): string | undefined {
  return executablePath ?? resolveAgentBinaryPath(location, "cursor-agent");
}

export function buildCursorAgentCommand(
  location: ProjectLocation,
  args: string[],
  executablePath?: string,
): CommandSpec {
  const resolvedPath = resolveCursorExecutablePath(location, executablePath);
  const launch = location.kind === "windows" ? resolveCursorWindowsLaunch(resolvedPath) : undefined;
  if (launch) {
    return buildAgentCommand(
      location,
      launch.binary,
      [...launch.argsPrefix, ...args],
      launch.binary,
      launch.env,
    );
  }
  return buildAgentCommand(location, "cursor-agent", args, resolvedPath);
}

export function buildCursorArgvSpec(
  location: ProjectLocation,
  args: string[],
  executablePath?: string,
): AgentArgvSpec {
  const launch =
    location.kind === "windows"
      ? resolveCursorWindowsLaunch(resolveCursorExecutablePath(location, executablePath))
      : undefined;
  if (!launch) return { binary: "cursor-agent", args };
  return {
    binary: launch.binary,
    args: [...launch.argsPrefix, ...args],
    env: launch.env,
  };
}

export async function readCursorAgentCommandOutput(
  location: ProjectLocation,
  executablePath: string,
  args: string[],
  options?: {
    timeoutMs?: number;
    wslLinuxCwd?: string;
    posixCwd?: string;
    env?: Record<string, string>;
  },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  if (location.kind !== "windows") {
    return readAgentCommandOutput(location, executablePath, args, options);
  }
  const spec = buildCursorAgentCommand(location, args, executablePath);
  const effectiveCwd = options?.posixCwd ?? spec.cwd;
  const runOptions = {
    ...(effectiveCwd ? { cwd: effectiveCwd } : {}),
    ...(spec.env || options?.env ? { env: { ...spec.env, ...options?.env } } : {}),
    ...(options?.timeoutMs ? { timeout: options.timeoutMs } : {}),
  };
  return readCommandOutputAsync(
    spec.command,
    spec.args,
    Object.keys(runOptions).length > 0 ? runOptions : undefined,
  );
}
