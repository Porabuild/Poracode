/**
 * Shared dispatcher for ACP `authenticate()` / `logout()` calls.
 *
 * Every ACP-speaking adapter (Copilot, Gemini, Cursor, and the generic
 * acp-generic driver) implements {@link AgentAdapter.buildAcpAuthCommand},
 * returning the same CommandSpec used by detection probes. This module wraps
 * those commands with the side effects every interactive auth needs: WSL
 * BROWSER override, spawn-cwd resolution, and unsupported-logout swallow.
 *
 * Per-adapter persistence (e.g. the acp-generic `authAcknowledged` write) is
 * the caller's responsibility — this module only owns the spawn handshake.
 */

import type { ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter, AgentEnvContext } from "../base";
import {
  detectProbeLocation,
  injectWslEnv,
  mergeSpawnEnv,
  readCommandOutputAsync,
  resolveAgentEnvContext,
  WSL_HOST_BROWSER_ENV,
  withCommandBaseSpawnEnv,
} from "../base";
import { resolveProbeSpawnCwd } from "../probeCwd";
import { authenticateAcpAgent, logoutAcpAgent } from "./probe";

/**
 * Apply WSL-only env overrides for interactive ACP auth flows.
 *
 * Each ACP-speaking adapter defaults to `BROWSER=/bin/true` inside WSL so the
 * agent's TUI does not try to xdg-open a browser inside the distro on launch.
 * That same setting would silently break an OAuth login — point it at the
 * Windows host's default browser instead.
 */
function authBrowserEnv(envKind: string | undefined): Record<string, string> | undefined {
  if (envKind !== "wsl") return undefined;
  return WSL_HOST_BROWSER_ENV;
}

function unbakedBaseEnv(
  baseEnv: Record<string, string> | undefined,
  commandEnv: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!baseEnv) return undefined;
  const entries = Object.entries(baseEnv).filter(([key]) => commandEnv?.[key] === undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function envContextFromPayload(
  envKind: AgentEnvContext["envKind"] | undefined,
  wslDistro: string | undefined,
): AgentEnvContext | undefined {
  if (!envKind) return undefined;
  return {
    envKind,
    ...(wslDistro ? { wslDistro } : {}),
  };
}

export async function dispatchAcpAuthenticate(input: {
  adapter: AgentAdapter;
  methodId: string;
  envKind?: AgentEnvContext["envKind"];
  wslDistro?: string;
}): Promise<AgentEnvContext | undefined> {
  if (!input.adapter.buildAcpAuthCommand) {
    throw new Error(`Agent does not support ACP authentication: ${input.adapter.kind}`);
  }
  const requestedContext = envContextFromPayload(input.envKind, input.wslDistro);
  const ctx = requestedContext
    ? await resolveAgentEnvContext(input.adapter, requestedContext)
    : undefined;
  const rawCommand = await input.adapter.buildAcpAuthCommand(ctx);
  if (!rawCommand) {
    throw new Error(`Agent did not return an ACP auth command: ${input.adapter.kind}`);
  }
  const command = withCommandBaseSpawnEnv(rawCommand, input.adapter.baseSpawnEnv);
  const location = detectProbeLocation(ctx);
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  const browserEnv = authBrowserEnv(ctx?.envKind);
  const env = mergeSpawnEnv(command.env, browserEnv);
  const wslEnv = mergeSpawnEnv(
    unbakedBaseEnv(input.adapter.baseSpawnEnv, rawCommand.env),
    browserEnv,
  );
  const authCommand =
    location.kind === "wsl" && wslEnv ? injectWslEnv(command, location, wslEnv) : command;
  await authenticateAcpAgent(authCommand.command, authCommand.args, input.methodId, {
    ...(processCwd ? { processCwd } : {}),
    ...(location.kind !== "wsl" && env ? { env } : {}),
    label: input.adapter.label,
  });
  return ctx;
}

export async function dispatchAcpLogout(input: {
  adapter: AgentAdapter;
  envKind?: AgentEnvContext["envKind"];
  wslDistro?: string;
}): Promise<AgentEnvContext | undefined> {
  const requestedContext = envContextFromPayload(input.envKind, input.wslDistro);
  const ctx = requestedContext
    ? await resolveAgentEnvContext(input.adapter, requestedContext)
    : undefined;
  const location = detectProbeLocation(ctx);
  if (input.adapter.buildAcpLogoutCommand) {
    if (input.adapter.preferAcpLogoutRpc) {
      await tryAcpLogoutRpc(input.adapter, ctx, location);
    }
    const rawCommand = await input.adapter.buildAcpLogoutCommand(ctx);
    if (!rawCommand) {
      throw new Error(`Agent did not return an ACP logout command: ${input.adapter.kind}`);
    }
    // Same lane as auth: the logout command spawns the CLI, so it carries the
    // adapter's base env; command-declared values win.
    const command = withCommandBaseSpawnEnv(rawCommand, input.adapter.baseSpawnEnv);
    const processCwd = resolveProbeSpawnCwd(location, command.cwd);
    const wslEnv = unbakedBaseEnv(input.adapter.baseSpawnEnv, rawCommand.env);
    const logoutCommand =
      location.kind === "wsl" && wslEnv ? injectWslEnv(command, location, wslEnv) : command;
    const result = await readCommandOutputAsync(
      logoutCommand.command,
      logoutCommand.args,
      processCwd || (location.kind !== "wsl" && command.env)
        ? {
            ...(processCwd ? { cwd: processCwd } : {}),
            ...(location.kind !== "wsl" && command.env ? { env: command.env } : {}),
          }
        : undefined,
    );
    if (!result.ok) {
      const details = result.stderr || result.stdout;
      throw new Error(
        details
          ? `${input.adapter.label} logout failed: ${details}`
          : `${input.adapter.label} logout failed.`,
      );
    }
    return ctx;
  }
  if (!input.adapter.buildAcpAuthCommand) {
    throw new Error(`Agent does not support ACP logout: ${input.adapter.kind}`);
  }
  if (!(await runAcpLogoutRpc(input.adapter, ctx, location))) {
    throw new Error(`Agent did not return an ACP logout command: ${input.adapter.kind}`);
  }
  return ctx;
}

/**
 * Run the ACP `logout` RPC over the adapter's auth command. Returns false when
 * the adapter has no auth command to spawn. Errors propagate — callers that
 * treat the RPC as best-effort swallow them via {@link tryAcpLogoutRpc}.
 */
async function runAcpLogoutRpc(
  adapter: AgentAdapter,
  ctx: AgentEnvContext | undefined,
  location: ProjectLocation,
): Promise<boolean> {
  const rawCommand = await adapter.buildAcpAuthCommand?.(ctx);
  if (!rawCommand) return false;
  const command = withCommandBaseSpawnEnv(rawCommand, adapter.baseSpawnEnv);
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  await logoutAcpAgent(command.command, command.args, {
    ...(processCwd ? { processCwd } : {}),
    // WSL specs bake their env exports into the wsl.exe script already.
    ...(location.kind !== "wsl" && command.env ? { env: command.env } : {}),
    label: adapter.label,
  });
  return true;
}

/**
 * Best-effort ACP `logout` RPC ahead of an adapter's logout command.
 *
 * Never throws: an agent that predates the RPC answers "logout is not
 * supported", and a stalled or unspawnable ACP server must not strand the
 * user signed in when the command fallback would have cleared the credential
 * on its own. Both cases fall through to the command; only the unexpected one
 * is logged.
 */
async function tryAcpLogoutRpc(
  adapter: AgentAdapter,
  ctx: AgentEnvContext | undefined,
  location: ProjectLocation,
): Promise<void> {
  try {
    await runAcpLogoutRpc(adapter, ctx, location);
  } catch (error) {
    if (isUnsupportedAcpLogoutError(error)) return;
    console.log(
      "%s ACP logout RPC failed, falling back to the logout command: %s",
      adapter.label,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isUnsupportedAcpLogoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /logout is not supported/i.test(message);
}
