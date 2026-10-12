import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, posix as posixPath } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { getProjectFsPath } from "@/shared/wsl";
import {
  readWslDirectory,
  readWslTextFile,
  wslPathExists,
  type WslFileIoOptions,
} from "../plugin/wslStaging";
import { resolveWslHomeDirectory } from "../base";

interface SkillConfigEntry {
  path: string;
  enabled: boolean;
}

/**
 * Path IO used by the skill-conflict probe. Native launches read the host
 * filesystem directly; WSL launches route every read through the per-distro
 * staging worker so a stalled UNC share cannot pin the supervisor.
 */
export interface CodexSkillConflictIo {
  exists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<{ name: string; directory: boolean }[]>;
  /** `null` when the file does not exist; throws when it exists but is unreadable. */
  readTextFile(path: string): Promise<string | null>;
}

const BROWSER_PLUGIN_SKILL = {
  marketplace: "openai-bundled",
  plugin: "browser",
  pathSegments: ["skills", "control-in-app-browser", "SKILL.md"],
} as const;

const nativeSkillConflictIo: CodexSkillConflictIo = {
  async exists(path) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  },
  async readDirectory(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((entry) => ({ name: entry.name, directory: entry.isDirectory() }));
    } catch {
      return [];
    }
  },
  async readTextFile(path) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
};

function wslSkillConflictIo(distro: string, options?: WslFileIoOptions): CodexSkillConflictIo {
  return {
    exists: (path) => wslPathExists(distro, path, options),
    readDirectory: (path) => readWslDirectory(distro, path, options),
    readTextFile: (path) => readWslTextFile(distro, path, options),
  };
}

async function readSkillConfigEntries(
  configPath: string,
  io: CodexSkillConflictIo,
): Promise<SkillConfigEntry[] | undefined> {
  let raw: string | null;
  try {
    raw = await io.readTextFile(configPath);
  } catch (error) {
    console.warn(`[codex] unable to read skill config from ${configPath}:`, error);
    return undefined;
  }
  if (raw === null) return [];
  try {
    const parsed = parseToml(raw) as { skills?: { config?: unknown } };
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

async function installedBrowserSkillPaths(
  hostCodexHome: string,
  providerCodexHome: string,
  io: CodexSkillConflictIo,
): Promise<string[]> {
  const hostJoin = hostCodexHome.startsWith("/") ? posixPath.join : join;
  const providerJoin = providerCodexHome.startsWith("/") ? posixPath.join : join;
  const hostPluginRoot = hostJoin(
    hostCodexHome,
    "plugins",
    "cache",
    BROWSER_PLUGIN_SKILL.marketplace,
    BROWSER_PLUGIN_SKILL.plugin,
  );
  try {
    if (!(await io.exists(hostPluginRoot))) return [];
    const entries = await io.readDirectory(hostPluginRoot);
    const paths: string[] = [];
    for (const entry of entries) {
      if (!entry.directory) continue;
      const hostPath = hostJoin(hostPluginRoot, entry.name, ...BROWSER_PLUGIN_SKILL.pathSegments);
      if (!(await io.exists(hostPath))) continue;
      paths.push(
        providerJoin(
          providerCodexHome,
          "plugins",
          "cache",
          BROWSER_PLUGIN_SKILL.marketplace,
          BROWSER_PLUGIN_SKILL.plugin,
          entry.name,
          ...BROWSER_PLUGIN_SKILL.pathSegments,
        ),
      );
    }
    return paths;
  } catch {
    return [];
  }
}

async function codexHomePaths(
  location: ProjectLocation,
): Promise<{ codexHome: string; projectConfigPath: string } | undefined> {
  if (location.kind !== "wsl") {
    const codexHome = join(homedir(), ".codex");
    return {
      codexHome,
      projectConfigPath: join(getProjectFsPath(location), ".codex", "config.toml"),
    };
  }
  // Awaits the bounded authoritative distro probe; no synchronous UNC read.
  const home = await resolveWslHomeDirectory(location.distro);
  if (!home) return undefined;
  const linuxHome = home.replace(/\/$/, "");
  const linuxProject = location.linuxPath.replace(/\/$/, "");
  return {
    codexHome: `${linuxHome}/.codex`,
    projectConfigPath: `${linuxProject}/.codex/config.toml`,
  };
}

/**
 * OpenAI's bundled Browser plugin controls ChatGPT's own in-app browser via
 * node_repl. Its mandatory skill conflicts with Poracode's separate `browser`
 * MCP and makes Codex reject the working Poracode tools. Disable that one
 * skill in this child process while preserving the user's existing skill
 * enablement config. The plugin remains enabled in every other Codex host.
 */
export async function buildCodexMcpSkillConflictArgs(
  location: ProjectLocation,
  mcpServers: readonly ResolvedMcpServer[],
  options?: WslFileIoOptions,
): Promise<string[]> {
  if (!hasBrowserMcp(mcpServers)) return [];

  const homes = await codexHomePaths(location);
  if (!homes) return [];
  const io =
    location.kind === "wsl" ? wslSkillConflictIo(location.distro, options) : nativeSkillConflictIo;
  const providerJoin = homes.codexHome.startsWith("/") ? posixPath.join : join;
  return buildCodexMcpSkillConflictArgsForPaths(
    mcpServers,
    homes.codexHome,
    homes.codexHome,
    [providerJoin(homes.codexHome, "config.toml"), homes.projectConfigPath],
    io,
  );
}

export async function buildCodexMcpSkillConflictArgsForPaths(
  mcpServers: readonly ResolvedMcpServer[],
  hostCodexHome: string,
  providerCodexHome: string,
  configPaths: readonly string[],
  io: CodexSkillConflictIo = nativeSkillConflictIo,
): Promise<string[]> {
  if (!hasBrowserMcp(mcpServers)) return [];
  const conflictingPaths = await installedBrowserSkillPaths(hostCodexHome, providerCodexHome, io);
  if (conflictingPaths.length === 0) return [];

  const existingEntries: SkillConfigEntry[] = [];
  for (const configPath of configPaths) {
    const entries = await readSkillConfigEntries(configPath, io);
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
