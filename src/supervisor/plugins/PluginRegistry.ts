import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LoadedPlugin, PluginSource } from "@/shared/contracts";
import { formatPluginDiagnostic, type PluginDiagnostic } from "@/shared/plugins/spec";
import {
  loadPluginFromDirectory,
  PLUGIN_MCP_FILE,
  PLUGIN_INSTALL_RECEIPT_FILE,
} from "./PluginLoader";
import { findPluginManifest, PLUGIN_MANIFEST_PATHS } from "./packageCompatibility";

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

function fileStamp(path: string): string {
  try {
    return String(statSync(path).mtimeMs);
  } catch {
    return "?";
  }
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
    // fold in manifests and default component metadata; otherwise editing a package in place
    // keeps serving the stale parse to every launch and skill scan.
    const dir = join(directory, entry);
    return `${entry}:${fileStamp(dir)}:${PLUGIN_MANIFEST_PATHS.map((path) => fileStamp(join(dir, path))).join(":")}:${fileStamp(join(dir, PLUGIN_MCP_FILE))}:${fileStamp(join(dir, ".mcp.json"))}:${fileStamp(join(dir, PLUGIN_INSTALL_RECEIPT_FILE))}`;
  });
  return `${directory}\0${parts.join("\0")}`;
}

export class PluginRegistry {
  /** Keyed by project scan root ("" for the app-global scopes only). */
  private readonly cache = new Map<
    string,
    { fingerprint: string; plugins: LoadedPlugin[]; componentFiles: string[] }
  >();

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
    const key = projectFsPath ?? "";
    const cached = this.cache.get(key);
    const rootsFingerprint = roots.map((root) => rootFingerprint(root.directory)).join("\n");
    const fingerprint = (files: string[]) =>
      `${rootsFingerprint}\n${files.map((path) => `${path}:${fileStamp(path)}`).join("\n")}`;
    if (cached && cached.fingerprint === fingerprint(cached.componentFiles)) return cached.plugins;
    const scanned = this.scan(roots);
    this.cache.set(key, { fingerprint: fingerprint(scanned.componentFiles), ...scanned });
    return scanned.plugins;
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

  private scan(roots: readonly ScanRoot[]): { plugins: LoadedPlugin[]; componentFiles: string[] } {
    const byName = new Map<string, LoadedPlugin>();
    const componentFiles: string[] = [];
    for (const root of roots) {
      for (const directory of candidateDirectories(root.directory)) {
        const result = loadPluginFromDirectory(directory, root.source);
        componentFiles.push(...(result.componentFiles ?? []));
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
    return {
      plugins: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
      componentFiles,
    };
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
    if (entry.startsWith(".")) return [];
    const directory = join(root, entry);
    try {
      if (!statSync(directory).isDirectory()) return [];
      if (!findPluginManifest(directory)) return [];
    } catch {
      return [];
    }
    return [directory];
  });
}
