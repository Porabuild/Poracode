import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LoadedPlugin, PluginSource } from "@/shared/contracts";
import { formatPluginDiagnostic, type PluginDiagnostic } from "@/shared/plugins/spec";
import { loadPluginFromDirectory, PLUGIN_MANIFEST_FILE, PLUGIN_MCP_FILE } from "./PluginLoader";

/**
 * Discovers Agent Plugins packages from the roots Poracode scans.
 *
 * Bundled packages ship with the app, user packages are whatever the user drops
 * into the app plugin directory, and project packages live in the repository at
 * `<project>/.poracode/plugins`. The specification leaves these locations to the
 * client — it only fixes what a package looks like once a root is handed to the
 * loader.
 *
 * Scan order is precedence, first match wins: bundled → user → project. A
 * package that arrives with a clone therefore can never shadow a first-party
 * package or one the user installed themselves.
 *
 * @see https://agent-plugins.org/client-implementers/loading-and-discovery
 */

export interface PluginRegistryOptions {
  /** Read-only packages shipped with the app. */
  bundledPluginsDir: () => string | undefined;
  /** Writable directory the user can drop packages into. */
  userPluginsDir: () => string;
  onDiagnostics?: (pluginDirectory: string, lines: readonly string[]) => void;
}

/** Repository-scoped packages, alongside `.poracode/skills` and friends. */
export const PROJECT_PLUGINS_DIR = join(".poracode", "plugins");

export function projectPluginsDir(projectFsPath: string): string {
  return join(projectFsPath, PROJECT_PLUGINS_DIR);
}

function samePath(left: string, right: string): boolean {
  const normalize = (path: string) => {
    const resolved = resolve(path).replace(/[\\/]+$/u, "");
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

interface ScanRoot {
  directory: string;
  source: PluginSource;
}

/** Cheap change signal: the set of candidate directories plus their mtimes. */
function rootFingerprint(directory: string): string {
  let entries: string[];
  try {
    entries = readdirSync(directory).sort();
  } catch {
    return `${directory}\0missing`;
  }
  const parts = entries.map((entry) => {
    // A directory's mtime does not change when a file inside it is rewritten, so
    // fold in the two manifests as well; otherwise editing a package in place
    // keeps serving the stale parse to every launch and skill scan.
    const stamp = (path: string): string => {
      try {
        return String(statSync(path).mtimeMs);
      } catch {
        return "?";
      }
    };
    const dir = join(directory, entry);
    return `${entry}:${stamp(dir)}:${stamp(join(dir, PLUGIN_MANIFEST_FILE))}:${stamp(join(dir, PLUGIN_MCP_FILE))}`;
  });
  return `${directory}\0${parts.join("\0")}`;
}

export class PluginRegistry {
  /** Keyed by project scan root ("" for the app-global scopes only). */
  private readonly cache = new Map<string, { fingerprint: string; plugins: LoadedPlugin[] }>();

  constructor(private readonly options: PluginRegistryOptions) {}

  /** Absolute path of the writable plugin directory, created on demand. */
  ensureUserPluginsDir(): string {
    const directory = this.options.userPluginsDir();
    try {
      mkdirSync(directory, { recursive: true });
    } catch (error) {
      console.warn(`[plugins] cannot create user plugin directory '${directory}':`, error);
    }
    return directory;
  }

  /** Drops the cache so the next read rescans. */
  refresh(): void {
    this.cache.clear();
  }

  listPlugins(projectFsPath?: string): LoadedPlugin[] {
    const roots = this.scanRoots(projectFsPath);
    const fingerprint = roots.map((root) => rootFingerprint(root.directory)).join("\n");
    const key = projectFsPath ?? "";
    const cached = this.cache.get(key);
    if (cached?.fingerprint === fingerprint) return cached.plugins;
    const plugins = this.scan(roots);
    this.cache.set(key, { fingerprint, plugins });
    return plugins;
  }

  getPlugin(name: string, projectFsPath?: string): LoadedPlugin | undefined {
    return this.listPlugins(projectFsPath).find((plugin) => plugin.name === name);
  }

  private scanRoots(projectFsPath?: string): ScanRoot[] {
    const roots: ScanRoot[] = [];
    const bundled = this.options.bundledPluginsDir();
    if (bundled) roots.push({ directory: bundled, source: "bundled" });
    const userDir = this.options.userPluginsDir();
    roots.push({ directory: userDir, source: "user" });
    if (projectFsPath) {
      const projectDir = projectPluginsDir(projectFsPath);
      // The home-scope project lives at the home directory, whose
      // `.poracode/plugins` is the user plugin folder itself — scanning it twice
      // would just re-read the same packages under a different source label.
      if (!samePath(projectDir, userDir)) {
        roots.push({ directory: projectDir, source: "project" });
      }
    }
    return roots;
  }

  private scan(roots: readonly ScanRoot[]): LoadedPlugin[] {
    const byName = new Map<string, LoadedPlugin>();
    for (const root of roots) {
      for (const directory of candidateDirectories(root.directory)) {
        const result = loadPluginFromDirectory(directory, root.source);
        this.report(directory, result.diagnostics);
        const plugin = result.plugin;
        if (!plugin) continue;
        const existing = byName.get(plugin.name);
        if (existing) {
          console.warn(
            `[plugins] ignoring '${directory}': plugin name '${plugin.name}' is already provided by '${existing.root}'`,
          );
          continue;
        }
        byName.set(plugin.name, plugin);
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private report(directory: string, diagnostics: readonly PluginDiagnostic[]): void {
    if (diagnostics.length === 0) return;
    const lines = diagnostics.map(formatPluginDiagnostic);
    for (const line of lines) console.warn(`[plugins] ${directory}: ${line}`);
    this.options.onDiagnostics?.(directory, lines);
  }
}

/** Immediate child directories that contain a `plugin.json`. */
function candidateDirectories(root: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root).sort();
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const directory = join(root, entry);
    try {
      if (!statSync(directory).isDirectory()) return [];
      if (!statSync(join(directory, PLUGIN_MANIFEST_FILE)).isFile()) return [];
    } catch {
      return [];
    }
    return [directory];
  });
}
