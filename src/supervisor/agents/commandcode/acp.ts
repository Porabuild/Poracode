import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { probeAcpCapabilities } from "../acp";
import { buildAgentCommand, type DetectProbeCtx } from "../base";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";
import { resolveCommandCodePermissionMode } from "./permissionMode";

/** Native ACP shipped in 1.74.0; older installations remain terminal-only. */
export function commandCodeSupportsAcp(version: string | undefined): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(version ?? "");
  if (!match) return false;
  const major = Number(match[1]);
  return major > 1 || (major === 1 && Number(match[2]) >= 74);
}

export function buildCommandCodeAcpCommand(
  location: ProjectLocation,
  executablePath?: string,
  env?: Record<string, string>,
) {
  return buildAgentCommand(location, "command-code", ["acp"], executablePath, env);
}

/** Keep saved terminal policy IDs usable on the native ACP permission engine. */
export function resolveCommandCodeAcpMode(
  config: ThreadConfig,
  availableModeIds: string[],
): string | undefined {
  const mode = resolveCommandCodePermissionMode(config);
  return availableModeIds.includes(mode) ? mode : undefined;
}

export async function probeCommandCodeAcp(ctx: DetectProbeCtx & { executablePath: string }) {
  const command = buildCommandCodeAcpCommand(ctx.location, ctx.executablePath, ctx.probeEnv);
  const processCwd = resolveProbeSpawnCwd(ctx.location, command.cwd);
  return probeAcpCapabilities(command.command, command.args, getAgentProbeCwd(ctx.location), {
    ...(processCwd ? { processCwd } : {}),
    ...(command.env ? { env: command.env } : {}),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    timeoutMs: 20_000,
    preserveEmptyModelEfforts: true,
    label: "commandcode",
  });
}
