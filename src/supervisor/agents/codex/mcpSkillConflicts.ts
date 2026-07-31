import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, posix as posixPath } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { getProjectFsPath, toWslUncPath } from "@/shared/wsl";
import { resolveWslHomeDirectory } from "../base";

interface SkillConfigEntry {
  path: string;
  enabled: boolean;
}

const BROWSER_PLUGIN_SKILL = {
  marketplace: "openai-bundled",
  plugin: "browser",
  pathSegments: ["skills", "control-in-app-browser", "SKILL.md"],
} as const;

function readSkillConfigEntries(configPath: string): SkillConfigEntry[] | undefined {
  if (!existsSync(configPath)) return [];
  try {
    const parsed = parseToml(readFileSync(configPath, "utf8")) as {
      skills?: { config?: unknown };
    };
    if (!Array.isArray(parsed.skills?.config)) return [];
    return parsed.skills.config.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      if (typeof record.path !== "string" || typeof record.enabled !== "boolean") return [];
      return [{ path: record.path, enabled: record.enabled }];
    });
  } catch (error) {
    console.warn(`[codex] unable to preserve skill config from ${configPath}:`, error);
    return undefined;
  }
}

function quoteTomlString(value: string): string {
  // JSON strings use the same quoted/backslash escapes needed by TOML basic strings.
  return JSON.stringify(value);
}

export function serializeSkillConfigOverride(entries: readonly SkillConfigEntry[]): string {
  return `[${entries
    .map(
      (entry) =>
        `{ path = ${quoteTomlString(entry.path)}, enabled = ${entry.enabled ? "true" : "false"} }`,
    )
    .join(", ")}]`;
}

function hasBrowserMcp(mcpServers: readonly ResolvedMcpServer[]): boolean {
  return mcpServers.some((server) => server.id === "browser");
}

function installedBrowserSkillPaths(hostCodexHome: string, providerCodexHome: string): string[] {
  const hostPluginRoot = join(
    hostCodexHome,
    "plugins",
    "cache",
    BROWSER_PLUGIN_SKILL.marketplace,
    BROWSER_PLUGIN_SKILL.plugin,
  );
  if (!existsSync(hostPluginRoot)) return [];
  const providerJoin = providerCodexHome.startsWith("/") ? posixPath.join : join;
  try {
    return readdirSync(hostPluginRoot, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) return [];
      const hostPath = join(hostPluginRoot, entry.name, ...BROWSER_PLUGIN_SKILL.pathSegments);
      if (!existsSync(hostPath)) return [];
      return [
        providerJoin(
          providerCodexHome,
          "plugins",
          "cache",
          BROWSER_PLUGIN_SKILL.marketplace,
          BROWSER_PLUGIN_SKILL.plugin,
          entry.name,
          ...BROWSER_PLUGIN_SKILL.pathSegments,
        ),
      ];
    });
  } catch {
    return [];
  }
}

function codexHomePaths(
  location: ProjectLocation,
): { hostPath: string; providerPath: string } | undefined {
  if (location.kind !== "wsl") {
    const path = join(homedir(), ".codex");
    return { hostPath: path, providerPath: path };
  }
  const home = resolveWslHomeDirectory(location.distro);
  if (!home) return undefined;
  const providerPath = `${home.replace(/\/$/, "")}/.codex`;
  return {
    hostPath: toWslUncPath(location.distro, providerPath),
    providerPath,
  };
}

/**
 * OpenAI's bundled Browser plugin controls ChatGPT's own in-app browser via
 * node_repl. Its mandatory skill conflicts with Poracode's separate `browser`
 * MCP and makes Codex reject the working Poracode tools. Disable that one
 * skill in this child process while preserving the user's existing skill
 * enablement config. The plugin remains enabled in every other Codex host.
 */
export function buildCodexMcpSkillConflictArgs(
  location: ProjectLocation,
  mcpServers: readonly ResolvedMcpServer[],
): string[] {
  if (!hasBrowserMcp(mcpServers)) return [];

  const codexHome = codexHomePaths(location);
  if (!codexHome) return [];
  const configPaths = [
    join(codexHome.hostPath, "config.toml"),
    join(getProjectFsPath(location), ".codex", "config.toml"),
  ];
  return buildCodexMcpSkillConflictArgsForPaths(
    mcpServers,
    codexHome.hostPath,
    codexHome.providerPath,
    configPaths,
  );
}

export function buildCodexMcpSkillConflictArgsForPaths(
  mcpServers: readonly ResolvedMcpServer[],
  hostCodexHome: string,
  providerCodexHome: string,
  configPaths: readonly string[],
): string[] {
  if (!hasBrowserMcp(mcpServers)) return [];
  const conflictingPaths = installedBrowserSkillPaths(hostCodexHome, providerCodexHome);
  if (conflictingPaths.length === 0) return [];

  const existingEntries: SkillConfigEntry[] = [];
  for (const configPath of configPaths) {
    const entries = readSkillConfigEntries(configPath);
    // Do not replace an unreadable user config with a partial skills array.
    if (!entries) return [];
    existingEntries.push(...entries);
  }

  const merged = new Map(existingEntries.map((entry) => [entry.path, entry]));
  for (const path of conflictingPaths) {
    merged.set(path, { path, enabled: false });
  }
  return ["-c", `skills.config=${serializeSkillConfigOverride([...merged.values()])}`];
}
