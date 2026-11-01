import type { ProjectLocation, RuntimeErrorReason, ThreadConfig } from "@/shared/contracts";
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

/**
 * Command Code rejects `session/prompt` with JSON-RPC -32603 and puts the API's
 * HTTP status in `data.status`. A 401 means the key `command-code login`
 * stored was rejected, so the thread needs sign-in rather than a retry.
 * Captured from 1.82.4: `{ code: -32603, message: "POST /alpha/generate → 401
 * error: Invalid 'Authorization' header or token.", data: { status: 401 } }`.
 */
export function resolveCommandCodePromptErrorReason(
  error: unknown,
): RuntimeErrorReason | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) return undefined;
  const data = (error as { data: unknown }).data;
  if (typeof data !== "object" || data === null) return undefined;
  return (data as { status?: unknown }).status === 401 ? "auth_required" : undefined;
}
