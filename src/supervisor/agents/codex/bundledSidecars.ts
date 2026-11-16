import { join, posix as posixPath } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import type { WslFileIoOptions } from "../plugin/wslStaging";
import { codexMcpServerName } from "../userMcp";
import {
  codexHomePaths,
  nativeSkillConflictIo,
  wslSkillConflictIo,
  type CodexSkillConflictIo,
} from "./mcpSkillConflicts";

/**
 * OpenAI Codex Desktop App writes desktop-only bundled plugins and a `cua_node`
 * `node_repl` MCP entry into the shared `~/.codex/config.toml`. Those plugins
 * depend on internal Codex Desktop App IPC pipes (`CODEX_APP_TOOLS_PIPE_PATH`,
 * `BROWSER_USE_ACCESS_PIPE_PATH`) that do not exist in Poracode, yet each open
 * Codex thread still spawns `cua_repl` + `node_repl` + `conhost` (~38 MB
 * Private / ~85 MB Working Set per extra open thread on Windows).
 */
const SUPPRESSED_BUNDLED_PLUGINS = [
  "codex-app-tools@openai-bundled",
  "unified-computer-use@openai-bundled",
  "computer-use@openai-bundled",
  "chrome@openai-bundled",
] as const;

export interface DetectedCodexBundledSidecars {
  readonly enabledPlugins: ReadonlySet<string>;
  readonly hasNodeRepl: boolean;
}

const EMPTY_DETECTED_SIDECARS: DetectedCodexBundledSidecars = {
  enabledPlugins: new Set(),
  hasNodeRepl: false,
};

const BUNDLED_CUA_NODE_REPL_BINARY_PATTERN = /(?:^|[\\/])cua_(?:node|repl)(?:\.exe)?$/i;

function isBundledCodexNodeReplEntry(entry: Record<string, unknown>): boolean {
  if (entry.enabled === false) return false;
  if (typeof entry.url === "string" && entry.url.trim().length > 0) {
    return false;
  }
  if (typeof entry.command === "string" && entry.command.trim().length > 0) {
    return BUNDLED_CUA_NODE_REPL_BINARY_PATTERN.test(entry.command.trim());
  }
  return false;
}

function hasCollidingNodeReplServer(mcpServers?: readonly ResolvedMcpServer[]): boolean {
  return mcpServers?.some((server) => codexMcpServerName(server) === "node_repl") === true;
}

export async function detectConfiguredCodexBundledSidecarsForPaths(
  configPaths: readonly string[],
  io: Pick<CodexSkillConflictIo, "readTextFile"> = nativeSkillConflictIo,
): Promise<DetectedCodexBundledSidecars> {
  const enabledPlugins = new Set<string>();
  let nodeReplEntry: Record<string, unknown> | undefined;

  for (const configPath of configPaths) {
    let raw: string | null;
    try {
      raw = await io.readTextFile(configPath);
    } catch {
      continue;
    }
    if (!raw) continue;
    let parsed: {
      plugins?: Record<string, unknown>;
      mcp_servers?: Record<string, unknown>;
    };
    try {
      parsed = parseToml(raw) as {
        plugins?: Record<string, unknown>;
        mcp_servers?: Record<string, unknown>;
      };
    } catch {
      continue;
    }

    if (parsed.plugins && typeof parsed.plugins === "object") {
      for (const [pluginId, value] of Object.entries(parsed.plugins)) {
        if (!value || typeof value !== "object") continue;
        const enabled = (value as Record<string, unknown>).enabled;
        if (enabled === true) {
          enabledPlugins.add(pluginId);
        } else if (enabled === false) {
          enabledPlugins.delete(pluginId);
        }
      }
    }

    const nodeRepl = parsed.mcp_servers?.node_repl;
    if (nodeRepl && typeof nodeRepl === "object" && !Array.isArray(nodeRepl)) {
      nodeReplEntry = { ...nodeReplEntry, ...(nodeRepl as Record<string, unknown>) };
    }
  }

  return {
    enabledPlugins,
    hasNodeRepl: nodeReplEntry !== undefined && isBundledCodexNodeReplEntry(nodeReplEntry),
  };
}

export async function detectConfiguredCodexBundledSidecars(
  location: ProjectLocation,
  env?: Record<string, string>,
  options?: WslFileIoOptions,
): Promise<DetectedCodexBundledSidecars> {
  const homes = await codexHomePaths(location, env);
  if (!homes) return EMPTY_DETECTED_SIDECARS;
  const io =
    location.kind === "wsl" ? wslSkillConflictIo(location.distro, options) : nativeSkillConflictIo;
  const providerJoin = homes.codexHome.startsWith("/") ? posixPath.join : join;
  return detectConfiguredCodexBundledSidecarsForPaths(
    [providerJoin(homes.codexHome, "config.toml"), homes.projectConfigPath],
    io,
  );
}

/**
 * Build CLI `-c` flags for terminal launches. Only emits overrides for plugins
 * and `mcp_servers.node_repl` entries actually present in `config.toml`,
 * avoiding Codex CLI bootstrap errors when `node_repl` is absent from user
 * configuration.
 */
export function buildCodexBundledSidecarCliArgs(input: {
  detected: DetectedCodexBundledSidecars;
  mcpServers?: readonly ResolvedMcpServer[];
}): string[] {
  const args: string[] = [];
  for (const pluginId of SUPPRESSED_BUNDLED_PLUGINS) {
    if (input.detected.enabledPlugins.has(pluginId)) {
      args.push("-c", `plugins."${pluginId}".enabled=false`);
    }
  }
  const hasNodeRepl = input.detected.hasNodeRepl;
  if (hasNodeRepl && !hasCollidingNodeReplServer(input.mcpServers)) {
    args.push("-c", "mcp_servers.node_repl.enabled=false");
  }
  return args;
}

/**
 * Build per-thread `config` overrides for `thread/start`, `thread/resume`, and
 * `thread/fork` on `codex app-server`. Only emits overrides for bundled
 * plugins and `mcp_servers.node_repl` entries actually detected in the user or
 * project `config.toml`, keeping thread config clean on
 * unconfigured homes and older Codex versions.
 */
export function buildCodexBundledSidecarThreadConfig(options?: {
  detected?: DetectedCodexBundledSidecars;
  mcpServers?: readonly ResolvedMcpServer[];
}): Record<string, { enabled: false }> {
  const overrides: Record<string, { enabled: false }> = {};
  const enabledPlugins = options?.detected?.enabledPlugins;
  if (enabledPlugins && enabledPlugins.size > 0) {
    for (const pluginId of SUPPRESSED_BUNDLED_PLUGINS) {
      if (enabledPlugins.has(pluginId)) {
        overrides[`plugins.${pluginId}`] = { enabled: false };
      }
    }
  }
  const hasNodeRepl = options?.detected?.hasNodeRepl === true;
  if (hasNodeRepl && !hasCollidingNodeReplServer(options?.mcpServers)) {
    overrides["mcp_servers.node_repl"] = { enabled: false };
  }
  return overrides;
}
