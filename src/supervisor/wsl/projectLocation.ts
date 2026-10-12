import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { promisify } from "node:util";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { getWslCommand } from "../agents/base/shellBasics";

const execFileAsync = promisify(execFile);

type WindowsProjectLocation = Extract<ProjectLocation, { kind: "windows" }>;
type WslProjectLocation = Extract<ProjectLocation, { kind: "wsl" }>;

export type WslCommandRunner = (args: string[], signal?: AbortSignal) => Promise<string>;

async function runWsl(args: string[], signal?: AbortSignal): Promise<string> {
  const { stdout } = await execFileAsync(getWslCommand(), args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    ...(signal ? { signal } : {}),
  });
  return stdout;
}

export async function resolveDefaultWslDistro(
  signal?: AbortSignal,
  run: WslCommandRunner = runWsl,
): Promise<string> {
  const distro = (
    await run(["--exec", "sh", "-lc", 'printf "%s" "${WSL_DISTRO_NAME:-}"'], signal)
  ).trim();
  if (!distro) throw new Error("The default WSL distribution could not be determined.");
  return distro;
}

export async function windowsProjectLocationInWsl(
  location: WindowsProjectLocation,
  signal?: AbortSignal,
  run: WslCommandRunner = runWsl,
): Promise<WslProjectLocation> {
  const distro = await resolveDefaultWslDistro(signal, run);
  return windowsProjectLocationInWslDistro(location, distro, signal, run);
}

/**
 * The long form of an existing Windows path. DrvFs inside WSL does not resolve
 * 8.3 short names (`RUNNER~1`), so translating a short path yields a Linux
 * path that names a different, literal directory. A path that cannot be
 * resolved (missing, or not on this host) is returned unchanged.
 */
export function longWindowsPath(
  path: string,
  resolve: (path: string) => string = realpathSync.native,
): string {
  if (!path.includes("~")) return path;
  try {
    return resolve(path);
  } catch {
    return path;
  }
}

export async function windowsProjectLocationInWslDistro(
  location: WindowsProjectLocation,
  distro: string,
  signal?: AbortSignal,
  run: WslCommandRunner = runWsl,
  resolveLongPath: (path: string) => string = longWindowsPath,
): Promise<WslProjectLocation> {
  const linuxPath = (
    await run(
      ["-d", distro, "--exec", "wslpath", "-a", "-u", resolveLongPath(location.path)],
      signal,
    )
  ).trim();
  if (!linuxPath.startsWith("/")) {
    throw new Error(`WSL could not translate the project path: ${location.path}`);
  }
  return {
    kind: "wsl",
    distro,
    linuxPath,
    uncPath: toWslUncPath(distro, linuxPath),
    ...(location.remoteServerId ? { remoteServerId: location.remoteServerId } : {}),
  };
}
