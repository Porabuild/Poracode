import { execFile } from "node:child_process";
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

export async function windowsProjectLocationInWslDistro(
  location: WindowsProjectLocation,
  distro: string,
  signal?: AbortSignal,
  run: WslCommandRunner = runWsl,
): Promise<WslProjectLocation> {
  const linuxPath = (
    await run(["-d", distro, "--exec", "wslpath", "-a", "-u", location.path], signal)
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
