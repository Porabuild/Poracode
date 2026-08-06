import { mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type {
  InstalledPlugins,
  LoadedPlugin,
  McpServer,
  McpTransport,
  ProjectLocation,
} from "@/shared/contracts";
import { DEFAULT_MCP_SERVER_TIMEOUT_MS, isValidMcpServerName } from "@/shared/contracts";
import {
  isPluginSupportedForProject,
  pluginMcpServerId,
  pluginMcpServerName,
} from "@/shared/plugins/catalog";
import {
  pluginDiagnostic,
  type PluginDiagnostic,
  type PluginMcpEntry,
  type PluginMcpStdioEntry,
} from "@/shared/plugins/spec";
import { relativePolicyPath } from "./pathContainment";

/**
 * Turns `mcp.json` declarations into the provider-agnostic `McpServer` records
 * the launch pipeline already understands.
 *
 * This is what makes plugins work across every provider Poracode supports:
 * Poracode is the Agent Plugins client, and once a declaration becomes an
 * `McpServer` the existing per-provider translators in
 * `src/supervisor/agents/userMcp/translate.ts` emit native config for Claude,
 * Codex, Gemini, OpenCode, and ACP. The provider never needs to know the Agent
 * Plugins specification exists.
 *
 * Known limitation: for remote servers the provider CLI owns the HTTP client, so
 * the specification's "do not forward configured headers across origins on
 * redirect" rule can only be enforced in Poracode's own probe path
 * (`src/supervisor/mcp/probeMcpServer.ts`), not inside the provider process.
 *
 * @see https://agent-plugins.org/client-implementers/mcp-runtime
 */

export interface PluginMcpRuntimeContext {
  /** Parent directory holding one persistent data directory per plugin. */
  pluginDataRoot: string;
  /** Host/project policy is optional for direct conformance helpers. */
  hostPlatform?: NodeJS.Platform;
  projectLocation?: ProjectLocation;
}

export interface ResolvedPluginMcpServers {
  servers: McpServer[];
  diagnostics: PluginDiagnostic[];
}

/** `PLUGIN_DATA` for a plugin. Created before launch, as the spec requires. */
export function pluginDataDirectory(pluginDataRoot: string, pluginName: string): string {
  return join(pluginDataRoot, pluginName);
}

function ensureDirectory(path: string): boolean {
  try {
    mkdirSync(path, { recursive: true });
    return true;
  } catch (error) {
    console.warn(`[plugins] cannot create plugin data directory '${path}':`, error);
    return false;
  }
}

/**
 * Single, non-recursive textual replacement of the two plugin placeholders.
 * One `replace` pass means substituted text is never rescanned.
 */
function expandPlaceholders(value: string, root: string, data: string): string {
  return value.replace(/\$\{(PLUGIN_ROOT|PLUGIN_DATA)\}/gu, (_match, key: string) =>
    key === "PLUGIN_ROOT" ? root : data,
  );
}

/**
 * Resolves a stdio `command`. The spec allows a bare executable name, resolved
 * by platform search rules, or a `./`-relative path resolved against the plugin
 * root with containment enforced. Anything else is rejected.
 */
function resolveStdioCommand(
  command: string,
  root: string,
): { command: string } | { error: string } {
  if (command.startsWith("./") || command.startsWith(".\\")) {
    const target = resolve(root, command);
    if (relativePolicyPath(root, target) === undefined) {
      return { error: `command '${command}' resolves outside the package boundary` };
    }
    return { command: target };
  }
  if (isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return {
      error: `command '${command}' must be a bare executable name or a './'-relative path`,
    };
  }
  return { command };
}

function resolveStdioCwd(
  cwd: string | undefined,
  root: string,
  data: string,
): { cwd: string } | { error: string } {
  if (cwd === undefined) return { cwd: root };
  const expanded = expandPlaceholders(cwd, root, data);
  // `${PLUGIN_DATA}` legitimately points outside the package, so it is the one
  // absolute working directory the spec permits.
  if (expanded === data || relativePolicyPath(data, expanded) !== undefined) {
    return { cwd: expanded };
  }
  const target = isAbsolute(expanded) ? resolve(expanded) : resolve(root, expanded);
  // The package root itself is inside the boundary; `relativePathInside` returns
  // an empty relative path for it, which is not a containment failure.
  if (target !== resolve(root) && relativePolicyPath(root, target) === undefined) {
    return { error: `cwd '${cwd}' resolves outside the package boundary` };
  }
  return { cwd: target };
}

function buildTransport(
  entry: PluginMcpEntry,
  root: string,
  data: string,
): { transport: McpTransport } | { error: string } {
  if (entry.type !== "stdio") {
    // Headers are intentionally not placeholder-expanded: the spec limits
    // expansion to args, env values, and cwd.
    return {
      transport: {
        type: entry.type === "streamable-http" ? "http" : "sse",
        url: entry.url.trim(),
        headers: { ...entry.headers },
      },
    };
  }

  const stdio: PluginMcpStdioEntry = entry;
  const command = resolveStdioCommand(stdio.command, root);
  if ("error" in command) return command;
  const cwd = resolveStdioCwd(stdio.cwd, root, data);
  if ("error" in cwd) return cwd;

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(stdio.env)) {
    env[key] = expandPlaceholders(value, root, data);
  }
  // Set last so a plugin cannot override the values it is meant to read.
  env.PLUGIN_ROOT = root;
  env.PLUGIN_DATA = data;

  return {
    transport: {
      type: "stdio",
      command: command.command,
      args: stdio.args.map((arg) => expandPlaceholders(arg, root, data)),
      env,
      cwd: cwd.cwd,
    },
  };
}

/**
 * Builds the MCP servers contributed by enabled plugins.
 *
 * A server that fails to resolve is skipped with a diagnostic; its siblings, the
 * other components, and the plugin all keep loading.
 */
export function resolvePluginMcpServers(
  plugins: readonly LoadedPlugin[],
  installedPlugins: InstalledPlugins,
  context: PluginMcpRuntimeContext,
): ResolvedPluginMcpServers {
  const servers: McpServer[] = [];
  const diagnostics: PluginDiagnostic[] = [];

  for (const plugin of plugins) {
    const state = installedPlugins[plugin.name];
    if (
      !state?.enabled ||
      plugin.mcpServers.length === 0 ||
      !isPluginSupportedForProject(
        plugin,
        context.hostPlatform ?? process.platform,
        context.projectLocation,
      )
    ) {
      continue;
    }

    const data = pluginDataDirectory(context.pluginDataRoot, plugin.name);
    let dataReady: boolean | undefined;

    for (const declaration of plugin.mcpServers) {
      if (state.disabledMcpServerNames.includes(declaration.name)) continue;

      const name = pluginMcpServerName(plugin.name, declaration.name);
      if (!isValidMcpServerName(name)) {
        diagnostics.push(
          pluginDiagnostic(
            "error",
            "mcp-server",
            "mcp-name-unusable",
            `Skipping server '${declaration.name}': '${name}' is not a usable MCP server name`,
            declaration.name,
          ),
        );
        continue;
      }

      if (declaration.entry.type === "stdio") {
        // A stdio server is launched by the provider CLI, which runs inside the
        // distro for a WSL project. Every path we would hand it — `command`,
        // `cwd`, PLUGIN_ROOT, PLUGIN_DATA — is a Windows host path resolved from
        // the package directory, and nothing on the launch path rewrites them
        // (`agents/userMcp/translate.ts` writes them verbatim). Skip rather than
        // emit a config that cannot resolve inside the distro.
        if (context.projectLocation?.kind === "wsl") {
          diagnostics.push(
            pluginDiagnostic(
              "error",
              "mcp-server",
              "mcp-entry-host-only",
              `Skipping server '${declaration.name}': stdio servers run on the host and cannot be reached from a WSL project`,
              declaration.name,
            ),
          );
          continue;
        }
        dataReady ??= ensureDirectory(data);
        if (!dataReady) {
          diagnostics.push(
            pluginDiagnostic(
              "error",
              "mcp-server",
              "plugin-data-unavailable",
              `Skipping server '${declaration.name}': cannot create PLUGIN_DATA at '${data}'`,
              declaration.name,
            ),
          );
          continue;
        }
      }

      const built = buildTransport(declaration.entry, plugin.root, data);
      if ("error" in built) {
        diagnostics.push(
          pluginDiagnostic(
            "error",
            "mcp-server",
            "mcp-entry-unresolvable",
            `Skipping server '${declaration.name}': ${built.error}`,
            declaration.name,
          ),
        );
        continue;
      }

      servers.push({
        id: pluginMcpServerId(plugin.name, declaration.name),
        name,
        description: plugin.manifest.description ?? "",
        enabled: true,
        timeoutMs: DEFAULT_MCP_SERVER_TIMEOUT_MS,
        transport: built.transport,
      });
    }
  }

  return { servers, diagnostics };
}
