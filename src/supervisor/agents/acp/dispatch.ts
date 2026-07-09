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

import type { AgentAdapter, AgentEnvContext } from "../base";
import { detectProbeLocation, injectWslEnv, readCommandOutputAsync } from "../base";
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
  return { BROWSER: 'cmd.exe /c start ""' };
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
}): Promise<void> {
  if (!input.adapter.buildAcpAuthCommand) {
    throw new Error(`Agent does not support ACP authentication: ${input.adapter.kind}`);
  }
  const ctx = envContextFromPayload(input.envKind, input.wslDistro);
  const command = await input.adapter.buildAcpAuthCommand(ctx);
  if (!command) {
    throw new Error(`Agent did not return an ACP auth command: ${input.adapter.kind}`);
  }
  const location = detectProbeLocation(ctx);
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  const browserEnv = authBrowserEnv(input.envKind);
  const env = { ...(command.env ?? {}), ...(browserEnv ?? {}) };
  const authCommand =
    location.kind === "wsl" && browserEnv ? injectWslEnv(command, location, browserEnv) : command;
  await authenticateAcpAgent(authCommand.command, authCommand.args, input.methodId, {
    ...(processCwd ? { processCwd } : {}),
    ...(location.kind !== "wsl" && Object.keys(env).length > 0 ? { env } : {}),
    label: input.adapter.label,
  });
}

export async function dispatchAcpLogout(input: {
  adapter: AgentAdapter;
  envKind?: AgentEnvContext["envKind"];
  wslDistro?: string;
}): Promise<void> {
  const ctx = envContextFromPayload(input.envKind, input.wslDistro);
  const location = detectProbeLocation(ctx);
  if (input.adapter.buildAcpLogoutCommand) {
    const command = await input.adapter.buildAcpLogoutCommand(ctx);
    if (!command) {
      throw new Error(`Agent did not return an ACP logout command: ${input.adapter.kind}`);
    }
    const processCwd = resolveProbeSpawnCwd(location, command.cwd);
    const result = await readCommandOutputAsync(
      command.command,
      command.args,
      processCwd || command.env
        ? {
            ...(processCwd ? { cwd: processCwd } : {}),
            ...(command.env ? { env: command.env } : {}),
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
    return;
  }
  if (!input.adapter.buildAcpAuthCommand) {
    throw new Error(`Agent does not support ACP logout: ${input.adapter.kind}`);
  }
  const command = await input.adapter.buildAcpAuthCommand(ctx);
  if (!command) {
    throw new Error(`Agent did not return an ACP logout command: ${input.adapter.kind}`);
  }
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  await logoutAcpAgent(command.command, command.args, {
    ...(processCwd ? { processCwd } : {}),
    ...(command.env ? { env: command.env } : {}),
    label: input.adapter.label,
  });
}

export function isUnsupportedAcpLogoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /logout is not supported/i.test(message);
}
