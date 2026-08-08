import { existsSync } from "node:fs";
import type { AgentEnvContext, AgentNativePlugin } from "../base";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  detectProbeLocation,
  quotePosixShellArg,
  readCommandOutputAsync,
} from "../base";
import { getCodexPluginPaths } from "./plugin/install";

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

export async function listNativeCodexPlugins(
  ctx: AgentEnvContext,
): Promise<readonly AgentNativePlugin[]> {
  const paths = getCodexPluginPaths(ctx);
  if (ctx.envKind === "wsl" && ctx.wslDistro) {
    const homePrefix = paths.codexHomeDir
      ? `if [ -d ${quotePosixShellArg(paths.codexHomeDir)} ]; then export CODEX_HOME=${quotePosixShellArg(paths.codexHomeDir)}; fi; `
      : "";
    const [result] = await batchWslCommandsAsync(ctx.wslDistro, [
      `${homePrefix}codex plugin list --json`,
    ]);
    return result?.ok ? parseEnabledCodexPlugins(result.stdout) : [];
  }

  const location = detectProbeLocation(ctx);
  const command = buildAgentCommand(location, "codex", ["plugin", "list", "--json"]);
  const env =
    paths.codexHomeDir && existsSync(paths.codexHomeDir)
      ? { ...command.env, CODEX_HOME: paths.codexHomeDir }
      : command.env;
  const result = await readCommandOutputAsync(command.command, command.args, {
    ...(command.cwd ? { cwd: command.cwd } : {}),
    ...(env ? { env } : {}),
  });
  return result.ok ? parseEnabledCodexPlugins(result.stdout) : [];
}
