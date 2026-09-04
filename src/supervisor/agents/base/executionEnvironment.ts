import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import {
  resolveDefaultWslDistro,
  windowsProjectLocationInWsl,
  windowsProjectLocationInWslDistro,
} from "../../wsl/projectLocation";
import { buildPosixExportPrefix, quotePowerShellLiteral } from "./shellBasics";
import { mergeSpawnEnv } from "./spawnEnv";
import type { AgentAdapter, AgentEnvContext } from "./types";

export async function resolveAgentEnvContext(
  adapter: AgentAdapter,
  context: AgentEnvContext,
): Promise<AgentEnvContext> {
  if (
    process.platform !== "win32" ||
    context.envKind !== "windows" ||
    adapter.windowsProjectExecution !== "wsl"
  ) {
    return context;
  }
  return {
    ...context,
    envKind: "wsl",
    wslDistro: await resolveDefaultWslDistro(context.signal),
  };
}

export async function resolveAgentProjectLocation(
  adapter: AgentAdapter,
  location: ProjectLocation,
  executionEnvironment?: ThreadConfig["executionEnvironment"],
  signal?: AbortSignal,
): Promise<ProjectLocation> {
  if (
    process.platform !== "win32" ||
    location.kind !== "windows" ||
    adapter.windowsProjectExecution !== "wsl"
  ) {
    return location;
  }
  return executionEnvironment?.kind === "wsl"
    ? windowsProjectLocationInWslDistro(location, executionEnvironment.distro, signal)
    : windowsProjectLocationInWsl(location, signal);
}

export const WSL_HOST_BROWSER_ENV = { BROWSER: 'cmd.exe /c start ""' } as const;

export function buildWindowsWslLoginCommand(
  adapter: AgentAdapter,
  distro: string,
  command: string,
): string {
  return buildWindowsWslShellCommand(
    distro,
    command,
    mergeSpawnEnv(mergeSpawnEnv(adapter.baseSpawnEnv, adapter.spawnEnv?.wsl), WSL_HOST_BROWSER_ENV),
  );
}

export function buildWindowsWslShellCommand(
  distro: string,
  command: string,
  env?: Record<string, string>,
): string {
  const script = `${buildPosixExportPrefix(env)}${command}`;
  return `wsl.exe -d ${quotePowerShellLiteral(distro)} --exec bash -l -i -c ${quotePowerShellLiteral(script)}`;
}
