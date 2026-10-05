import { existsSync } from "node:fs";
import type { AgentEnvContext, AgentNativePlugin } from "../base";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  detectProbeLocation,
  quotePosixShellArg,
  readCommandOutputAsync,
} from "../base";
import { getCodexPluginPaths, type CodexHomeOverlay } from "./plugin/install";

interface CodexPluginListDocument {
  installed?: Array<{
    name?: unknown;
    installed?: unknown;
    enabled?: unknown;
    source?: { path?: unknown };
  }>;
}

export function parseEnabledCodexPlugins(raw: string): AgentNativePlugin[] {
  try {
    const document = JSON.parse(raw) as CodexPluginListDocument;
    if (!Array.isArray(document.installed)) return [];
    return document.installed.flatMap((entry) =>
      typeof entry.name === "string" &&
      entry.installed === true &&
      entry.enabled === true &&
      typeof entry.source?.path === "string"
        ? [{ name: entry.name, root: entry.source.path }]
        : [],
    );
  } catch {
    return [];
  }
}

/**
 * A profile's effective launch home: its own `CODEX_HOME`, or the private
 * hook overlay staged for it when one exists (native only).
 */
export interface CodexPluginDiscoveryHome {
  homeDir: string;
  overlay?: CodexHomeOverlay;
}

/**
 * List the Codex plugins enabled for the account a launch would run as.
 * Without `profile` this is the base account (its hook overlay, else the
 * default `~/.codex`); with one, discovery never falls back to the base home.
 */
export async function listNativeCodexPlugins(
  ctx: AgentEnvContext,
  profile?: CodexPluginDiscoveryHome,
): Promise<readonly AgentNativePlugin[]> {
  const paths = getCodexPluginPaths(ctx, profile?.overlay);
  if (ctx.envKind === "wsl" && ctx.wslDistro) {
    const homePrefix = profile
      ? `export CODEX_HOME=${quotePosixShellArg(profile.homeDir)}; `
      : paths.codexHomeDir
        ? `if [ -d ${quotePosixShellArg(paths.codexHomeDir)} ]; then export CODEX_HOME=${quotePosixShellArg(paths.codexHomeDir)}; fi; `
        : "";
    const [result] = await batchWslCommandsAsync(ctx.wslDistro, [
      `${homePrefix}codex plugin list --json`,
    ]);
    return result?.ok ? parseEnabledCodexPlugins(result.stdout) : [];
  }

  const location = detectProbeLocation(ctx);
  const command = buildAgentCommand(location, "codex", ["plugin", "list", "--json"]);
  const launchHome =
    paths.codexHomeDir && existsSync(paths.codexHomeDir) ? paths.codexHomeDir : profile?.homeDir;
  const env = launchHome ? { ...command.env, CODEX_HOME: launchHome } : command.env;
  const result = await readCommandOutputAsync(command.command, command.args, {
    ...(command.cwd ? { cwd: command.cwd } : {}),
    ...(env ? { env } : {}),
  });
  return result.ok ? parseEnabledCodexPlugins(result.stdout) : [];
}
