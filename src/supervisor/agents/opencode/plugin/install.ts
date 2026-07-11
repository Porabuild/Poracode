import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import {
  SUBAGENT_MCP_SERVER_NAME,
  type SubagentMcpHttpConfig,
} from "@/supervisor/agents/subagentMcp";
import type { ComputerUseMcpHttpConfig } from "@/supervisor/agents/computerUseMcp";
import { CHROME_MCP_SERVER_NAME, type ChromeMcpHttpConfig } from "@/supervisor/agents/chromeMcp";
import {
  APP_CONTROLS_MCP_SERVER_NAME,
  type AppControlsMcpHttpConfig,
} from "@/supervisor/agents/appControlsMcp";
import { getCachedWslHomeDirectory, type AgentEnvContext } from "../../base";
import { BROWSER_MCP_SERVER_NAME } from "../../browserMcp";
import { COMPUTER_USE_MCP_SERVER_NAME } from "../../computerUseMcp";
import { buildOpenCodeComputerUseMcp } from "../mcpComputerUse";
import { buildOpenCodeChromeMcp } from "../mcpChrome";
import { buildOpenCodeAppControlsMcp } from "../mcpAppControls";
import {
  copyPluginAssetsIfStale,
  createPluginSourceResolver,
  getNativePluginBaseDir,
  getWslPluginBaseDirs,
  isWslPluginContext,
  readBundledPluginVersion,
  readPluginManifest,
  removeStagedPluginDir,
  stagePluginAssetsToWsl,
  type PluginManifest,
} from "../../plugin/installerBase";
import { buildOpenCodeBrowserMcp, type OpenCodeMcpServers } from "../mcpBrowser";
import { buildOpenCodeSubagentMcp } from "../mcpSubagent";

/**
 * OpenCode plugin installer.
 *
 * Unlike Claude/Codex/Gemini — which stage `forward.mjs` and render a settings
 * document so the agent CLI invokes the forwarder via shell command — OpenCode
 * loads plugin files in-process. So "install" here means:
 *
 *   1. Stage `plugin.json` + `lightcode-status.mjs` to
 *      `~/.poracode/agent-plugins/opencode/` (the canonical lightcode-managed
 *      location used for version bookkeeping and the manifest the supervisor
 *      reads at boot).
 *   2. Copy the staged plugin into OpenCode's auto-discovery directory at
 *      `~/.config/opencode/plugins/lightcode-status.js`. OpenCode globs
 *      `{plugin,plugins}/*.{ts,js}` (no `.mjs`!) so the deployed file uses
 *      `.js`. Bun (OpenCode's runtime) treats ESM syntax in `.js` natively.
 *
 * Why drop into `plugins/` instead of registering a `file://` spec in
 * `~/.config/opencode/opencode.json`: empirically, an opencode.json reference
 * to a file under `~/.poracode/` did not load reliably in OpenCode 1.14.31
 * across Windows/WSL — auto-discovery from `plugins/` is the well-trodden
 * path every other ecosystem plugin (Warp, sample plugins) uses, and the
 * displayed name in OpenCode's TUI status panel comes from the basename of
 * the dropped file, so naming the drop `lightcode-status.js` gives the right
 * label without further plumbing.
 *
 * Older lightcode builds added a `file://` plugin entry to opencode.json that
 * would now be a dead reference; install removes it on every run so users
 * upgrading from those builds aren't left with a ghost entry.
 *
 * The plugin reads `LIGHTCODE_HOOK_URL` / `LIGHTCODE_HOOK_SECRET` /
 * `LIGHTCODE_THREAD_ID` etc. from `process.env` at hook time. When those
 * vars are unset (i.e. the user runs `opencode` outside Poracode) the
 * handlers no-op.
 */

/** Files staged into `~/.poracode/agent-plugins/opencode/`. */
const OPENCODE_PLUGIN_ASSET_FILES = ["plugin.json", "lightcode-status.mjs"] as const;

/**
 * Filename OpenCode auto-discovers in its plugins/ directory. Must use a `.js`
 * (or `.ts`) extension — OpenCode's loader scans `{plugin,plugins}/*.{ts,js}`
 * and silently ignores any other extension.
 */
const OPENCODE_PLUGIN_DROP_FILE_NAME = "lightcode-status.js";

/**
 * Filename of the manifest we drop next to the plugin file. Lets the plugin
 * read its version at runtime from `import.meta.url`'s directory.
 */
const OPENCODE_PLUGIN_DROP_MANIFEST_NAME = "lightcode-status.plugin.json";

/**
 * Older Poracode versions dropped a `.mjs` here, which OpenCode never loaded
 * (auto-discovery is `*.{ts,js}` only). Cleaned up at install/uninstall time
 * so users upgrading don't end up with two stale siblings.
 */
const OPENCODE_LEGACY_DROP_FILES = ["lightcode-status.mjs"] as const;

/**
 * Substring identifying our entry in the user's `opencode.json` `"plugin"`
 * array. Older lightcode versions registered a `file://` URL here pointing
 * at the staged plugin under `~/.poracode/`. We no longer write such an
 * entry but still scrub any prior one out on every install / uninstall.
 */
const LIGHTCODE_PLUGIN_SPEC_MARKER = "agent-plugins/opencode/";

const OPENCODE_CONFIG_FILE_NAME = "opencode.json";

/**
 * All `mcp` server keys Lightcode owns in `opencode.json`. Scrubbed together at
 * install/uninstall so no stale lightcode-managed entry survives a reinstall.
 */
const LIGHTCODE_MANAGED_MCP_KEYS = [
  BROWSER_MCP_SERVER_NAME,
  SUBAGENT_MCP_SERVER_NAME,
  COMPUTER_USE_MCP_SERVER_NAME,
] as const;

export interface OpenCodePluginPaths {
  pluginDir: string;
  /** Path to the dropped file OpenCode auto-discovers. */
  opencodePluginFile: string;
  version: string;
}

const callerDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url ?? "file://"));

const resolveSourceDir = createPluginSourceResolver({
  kind: "opencode",
  sourceEnvVar: "LIGHTCODE_OPENCODE_PLUGIN_SOURCE",
  callerDir,
});

export function readBundledOpenCodePluginVersion(): string {
  return readBundledPluginVersion(resolveSourceDir);
}

/**
 * Resolve the directory OpenCode reads its global config from. Honors
 * `OPENCODE_CONFIG_DIR` for native installs (per
 * https://opencode.ai/docs/config); WSL always uses `$HOME/.config/opencode`
 * inside the distro because the host can't introspect the distro's env.
 */
function resolveOpenCodeNativeConfigDir(): string {
  const override = process.env.OPENCODE_CONFIG_DIR;
  if (override && override.trim().length > 0) {
    return resolve(override);
  }
  return join(homedir(), ".config", "opencode");
}

function resolveOpenCodeNativePluginsDir(): string {
  return join(resolveOpenCodeNativeConfigDir(), "plugins");
}

function resolveOpenCodeWslConfigDir(
  distro: string,
): { linuxDir: string; uncDir: string } | undefined {
  const home = getCachedWslHomeDirectory(distro);
  if (!home) return undefined;
  const linuxDir = `${home}/.config/opencode`;
  return { linuxDir, uncDir: toWslUncPath(distro, linuxDir) };
}

function resolveOpenCodeWslPluginsDir(
  distro: string,
): { linuxDir: string; uncDir: string } | undefined {
  const cfg = resolveOpenCodeWslConfigDir(distro);
  if (!cfg) return undefined;
  return {
    linuxDir: `${cfg.linuxDir}/plugins`,
    uncDir: `${cfg.uncDir}\\plugins`,
  };
}

export function getOpenCodePluginPaths(ctx?: AgentEnvContext): OpenCodePluginPaths {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "opencode");
    if (!wsl) {
      return { pluginDir: "", opencodePluginFile: "", version: "0.0.0" };
    }
    let version = "0.0.0";
    try {
      version = readPluginManifest(wsl.uncBase).version;
    } catch {
      // staged manifest absent on first install
    }
    const opencodeDir = resolveOpenCodeWslPluginsDir(ctx.wslDistro);
    return {
      pluginDir: wsl.linuxBase,
      opencodePluginFile: opencodeDir
        ? `${opencodeDir.linuxDir}/${OPENCODE_PLUGIN_DROP_FILE_NAME}`
        : "",
      version,
    };
  }
  const pluginDir = getNativePluginBaseDir("opencode", ctx?.baseDir);
  let version = "0.0.0";
  try {
    version = readPluginManifest(pluginDir).version;
  } catch {
    // staged manifest absent on first install
  }
  return {
    pluginDir,
    opencodePluginFile: join(resolveOpenCodeNativePluginsDir(), OPENCODE_PLUGIN_DROP_FILE_NAME),
    version,
  };
}

export function installOpenCodePlugin(
  ctx?: AgentEnvContext,
): { ok: true; paths: OpenCodePluginPaths; version: string } | { ok: false; reason: string } {
  let sourceDir: string;
  try {
    sourceDir = resolveSourceDir();
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  let manifest: PluginManifest;
  try {
    manifest = readPluginManifest(sourceDir);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  if (isWslPluginContext(ctx)) {
    return installOpenCodePluginWsl(ctx.wslDistro, sourceDir, manifest);
  }

  const pluginDir = getNativePluginBaseDir("opencode", ctx?.baseDir);
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir, OPENCODE_PLUGIN_ASSET_FILES);

  const opencodePluginsDir = resolveOpenCodeNativePluginsDir();
  const opencodePluginFile = join(opencodePluginsDir, OPENCODE_PLUGIN_DROP_FILE_NAME);
  const opencodeManifestFile = join(opencodePluginsDir, OPENCODE_PLUGIN_DROP_MANIFEST_NAME);
  try {
    mkdirSync(opencodePluginsDir, { recursive: true });
    copyFileSync(join(pluginDir, "lightcode-status.mjs"), opencodePluginFile);
    copyFileSync(join(pluginDir, "plugin.json"), opencodeManifestFile);
    cleanupLegacyDrops(opencodePluginsDir);
  } catch (error) {
    return {
      ok: false,
      reason: `failed to copy lightcode-status plugin into ${opencodePluginsDir}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  // Best-effort: scrub the dead `file://...` entry older lightcode versions
  // wrote into opencode.json. Browser MCP is synced at OpenCode launch time so
  // it can honor the user's provider setting.
  const nativeConfigPath = join(resolveOpenCodeNativeConfigDir(), OPENCODE_CONFIG_FILE_NAME);
  updateOpenCodeConfigFile(nativeConfigPath, { remove: LIGHTCODE_MANAGED_MCP_KEYS });

  console.log(
    `[supervisor] OpenCode hook plugin staged v${manifest.version} at ${pluginDir} ` +
      `→ ${opencodePluginFile}`,
  );

  return {
    ok: true,
    version: manifest.version,
    paths: { pluginDir, opencodePluginFile, version: manifest.version },
  };
}

function installOpenCodePluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
): { ok: true; paths: OpenCodePluginPaths; version: string } | { ok: false; reason: string } {
  const staged = stagePluginAssetsToWsl(distro, sourceDir, "opencode", OPENCODE_PLUGIN_ASSET_FILES);
  if (!staged.ok) return staged;

  const linuxPluginDir = staged.linuxPluginDir;
  const opencodeDir = resolveOpenCodeWslPluginsDir(distro);
  if (!opencodeDir) {
    return {
      ok: false,
      reason: `failed to resolve OpenCode plugins dir in wsl distro ${distro} (could not read $HOME)`,
    };
  }
  const opencodePluginFile = `${opencodeDir.linuxDir}/${OPENCODE_PLUGIN_DROP_FILE_NAME}`;
  const opencodePluginUnc = `${opencodeDir.uncDir}\\${OPENCODE_PLUGIN_DROP_FILE_NAME}`;
  const opencodeManifestUnc = `${opencodeDir.uncDir}\\${OPENCODE_PLUGIN_DROP_MANIFEST_NAME}`;
  const stagedPluginUnc = toWslUncPath(distro, `${linuxPluginDir}/lightcode-status.mjs`);
  const stagedManifestUnc = toWslUncPath(distro, `${linuxPluginDir}/plugin.json`);

  try {
    mkdirSync(opencodeDir.uncDir, { recursive: true });
    copyFileSync(stagedPluginUnc, opencodePluginUnc);
    copyFileSync(stagedManifestUnc, opencodeManifestUnc);
    cleanupLegacyDrops(opencodeDir.uncDir, "wsl");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `failed to copy lightcode-status plugin into ${opencodeDir.linuxDir} (distro ${distro}): ${detail}`,
    };
  }

  // Same scrub on the WSL-side opencode.json. Browser MCP is synced at launch
  // time so it can honor the user's provider setting.
  const cfgDir = resolveOpenCodeWslConfigDir(distro);
  if (cfgDir) {
    const wslConfigPath = `${cfgDir.uncDir}\\${OPENCODE_CONFIG_FILE_NAME}`;
    updateOpenCodeConfigFile(wslConfigPath, { remove: LIGHTCODE_MANAGED_MCP_KEYS });
  }

  console.log(
    `[supervisor] OpenCode hook plugin staged v${manifest.version} in WSL distro ${distro} ` +
      `at ${linuxPluginDir} → ${opencodePluginFile}`,
  );

  return {
    ok: true,
    version: manifest.version,
    paths: {
      pluginDir: linuxPluginDir,
      opencodePluginFile,
      version: manifest.version,
    },
  };
}

export function isOpenCodePluginInstalled(ctx?: AgentEnvContext): {
  installed: boolean;
  version?: string;
} {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "opencode");
    if (!wsl) return { installed: false };
    const opencodeDir = resolveOpenCodeWslPluginsDir(ctx.wslDistro);
    if (!opencodeDir) return { installed: false };
    return verifyOpenCodeInstallAt(wsl.uncBase, opencodeDir.uncDir, "wsl");
  }
  return verifyOpenCodeInstallAt(
    getNativePluginBaseDir("opencode", ctx?.baseDir),
    resolveOpenCodeNativePluginsDir(),
    "native",
  );
}

function verifyOpenCodeInstallAt(
  readableStagingDir: string,
  readableOpencodeDir: string,
  target: "native" | "wsl",
): { installed: boolean; version?: string } {
  let version: string;
  try {
    version = readPluginManifest(readableStagingDir).version;
  } catch {
    return { installed: false };
  }
  for (const asset of OPENCODE_PLUGIN_ASSET_FILES) {
    if (!existsSync(join(readableStagingDir, asset))) return { installed: false };
  }
  const joinDropped = (name: string) =>
    target === "wsl" ? `${readableOpencodeDir}\\${name}` : join(readableOpencodeDir, name);
  const droppedPlugin = joinDropped(OPENCODE_PLUGIN_DROP_FILE_NAME);
  const droppedManifest = joinDropped(OPENCODE_PLUGIN_DROP_MANIFEST_NAME);
  // Byte-for-byte equality so a hand-edited drop is treated as not-installed
  // and the next install call restages.
  try {
    const stagedPlugin = readFileSync(join(readableStagingDir, "lightcode-status.mjs"));
    const droppedBuf = readFileSync(droppedPlugin);
    if (stagedPlugin.length !== droppedBuf.length) return { installed: false };
    if (!stagedPlugin.equals(droppedBuf)) return { installed: false };
    const stagedManifest = readFileSync(join(readableStagingDir, "plugin.json"));
    const droppedManifestBuf = readFileSync(droppedManifest);
    if (stagedManifest.length !== droppedManifestBuf.length) return { installed: false };
    if (!stagedManifest.equals(droppedManifestBuf)) return { installed: false };
  } catch {
    return { installed: false };
  }
  return { installed: true, version };
}

function cleanupLegacyDrops(pluginsDir: string, target: "native" | "wsl" = "native"): void {
  for (const name of OPENCODE_LEGACY_DROP_FILES) {
    const path = target === "wsl" ? `${pluginsDir}\\${name}` : join(pluginsDir, name);
    removeIfPresent(path);
  }
}

interface ReadJsonOk {
  ok: true;
  value: unknown;
}
interface ReadJsonErr {
  ok: false;
  reason: string;
}
function readJsonFileOrEmpty(path: string): ReadJsonOk | ReadJsonErr {
  if (!existsSync(path)) return { ok: true, value: {} };
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    return {
      ok: false,
      reason: `failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (raw.trim().length === 0) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      reason: `malformed JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

interface OpenCodeMcpConfigUpdate {
  /**
   * Lightcode-managed `mcp` server keys to strip before (re)adding. Callers
   * pass only the keys they own so unrelated MCP servers (and each other's
   * entries — browser vs subagents) are preserved across independent syncs.
   */
  remove: readonly string[];
  /** MCP server entries to (re)add. Omit to only remove. */
  add?: OpenCodeMcpServers;
}

/**
 * Update `opencode.json` in a single read+write: scrub any lightcode-managed
 * `file://` plugin entry (left behind by older lightcode builds) and merge the
 * requested lightcode-managed MCP server entries under `mcp`. Only the keys in
 * `update.remove` are touched, so browser and subagents syncs can run
 * independently without clobbering one another. Writes only when the resulting
 * JSON actually differs from what's on disk. Best-effort: missing files /
 * malformed JSON are swallowed.
 */
function updateOpenCodeConfigFile(configPath: string, update: OpenCodeMcpConfigUpdate): void {
  const read = readJsonFileOrEmpty(configPath);
  if (!read.ok) return;
  const original =
    read.value && typeof read.value === "object" && !Array.isArray(read.value)
      ? (read.value as Record<string, unknown>)
      : {};
  const config: Record<string, unknown> = { ...original };

  const existingPlugin = config.plugin;
  if (Array.isArray(existingPlugin)) {
    const filtered = existingPlugin.filter((entry) => {
      if (typeof entry !== "string") return true;
      return !entry.includes(LIGHTCODE_PLUGIN_SPEC_MARKER);
    });
    if (filtered.length === 0) {
      delete config.plugin;
    } else if (filtered.length !== existingPlugin.length) {
      config.plugin = filtered;
    }
  }

  const mcpRaw = config.mcp;
  const mcp: Record<string, unknown> =
    mcpRaw && typeof mcpRaw === "object" && !Array.isArray(mcpRaw)
      ? { ...(mcpRaw as Record<string, unknown>) }
      : {};
  for (const name of update.remove) delete mcp[name];
  if (update.add) {
    for (const [name, entry] of Object.entries(update.add)) {
      mcp[name] = entry;
    }
  }
  if (Object.keys(mcp).length === 0) {
    delete config.mcp;
  } else {
    config.mcp = mcp;
  }

  const next = `${JSON.stringify(config, null, 2)}\n`;
  let current: string | null = null;
  try {
    current = readFileSync(configPath, "utf8");
  } catch {
    // missing — treat as different so we write
  }
  if (current === next) return;
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next, "utf8");
  } catch {
    // best-effort
  }
}

export function syncOpenCodeBrowserMcpConfigFile(
  location: ProjectLocation,
  browserEnabled: boolean,
  browserMcp?: BrowserMcpHttpConfig,
  computerUseEnabled = false,
  computerUseMcp?: ComputerUseMcpHttpConfig,
  chromeEnabled = false,
  chromeMcp?: ChromeMcpHttpConfig,
): void {
  const add = {
    ...((browserEnabled ? buildOpenCodeBrowserMcp(location, browserMcp) : undefined) ?? {}),
    ...(buildOpenCodeComputerUseMcp(location, computerUseEnabled, computerUseMcp) ?? {}),
    ...(buildOpenCodeChromeMcp(location, chromeEnabled, chromeMcp) ?? {}),
  };
  const update: OpenCodeMcpConfigUpdate = {
    remove: [BROWSER_MCP_SERVER_NAME, COMPUTER_USE_MCP_SERVER_NAME, CHROME_MCP_SERVER_NAME],
    ...(Object.keys(add).length > 0 ? { add } : {}),
  };
  writeOpenCodeConfigUpdate(location, update);
}

/**
 * Merge (or clear) the cross-provider subagents MCP server entry in
 * `opencode.json`. Mirrors `syncOpenCodeBrowserMcpConfigFile`; the endpoint is
 * pre-resolved so there is no location/WSL fallback. Passing an undefined
 * `subagentMcp` clears the entry.
 */
export function syncOpenCodeSubagentMcpConfigFile(
  location: ProjectLocation,
  subagentMcp?: SubagentMcpHttpConfig,
): void {
  const add = buildOpenCodeSubagentMcp(subagentMcp);
  const update: OpenCodeMcpConfigUpdate = {
    remove: [SUBAGENT_MCP_SERVER_NAME],
    ...(add ? { add } : {}),
  };
  writeOpenCodeConfigUpdate(location, update);
}

export function syncOpenCodeAppControlsMcpConfigFile(
  location: ProjectLocation,
  appControlsMcp?: AppControlsMcpHttpConfig,
): void {
  const add = buildOpenCodeAppControlsMcp(location, appControlsMcp);
  const update: OpenCodeMcpConfigUpdate = {
    remove: [APP_CONTROLS_MCP_SERVER_NAME],
    ...(add ? { add } : {}),
  };
  writeOpenCodeConfigUpdate(location, update);
}

function writeOpenCodeConfigUpdate(
  location: ProjectLocation,
  update: OpenCodeMcpConfigUpdate,
): void {
  if (location.kind === "wsl") {
    const cfgDir = resolveOpenCodeWslConfigDir(location.distro);
    if (!cfgDir) return;
    updateOpenCodeConfigFile(`${cfgDir.uncDir}\\${OPENCODE_CONFIG_FILE_NAME}`, update);
    return;
  }
  updateOpenCodeConfigFile(
    join(resolveOpenCodeNativeConfigDir(), OPENCODE_CONFIG_FILE_NAME),
    update,
  );
}

/**
 * Removes the dropped plugin file from OpenCode's plugins/ directory and any
 * legacy drops, plus scrubs the lightcode entry from opencode.json. Staging
 * dir under `~/.poracode/` stays so version diagnostics survive.
 * Best-effort: missing files / unreachable distros are swallowed.
 */
export function uninstallOpenCodePlugin(ctx?: AgentEnvContext): void {
  if (isWslPluginContext(ctx)) {
    const opencodeDir = resolveOpenCodeWslPluginsDir(ctx.wslDistro);
    if (opencodeDir) {
      removeIfPresent(`${opencodeDir.uncDir}\\${OPENCODE_PLUGIN_DROP_FILE_NAME}`);
      removeIfPresent(`${opencodeDir.uncDir}\\${OPENCODE_PLUGIN_DROP_MANIFEST_NAME}`);
      cleanupLegacyDrops(opencodeDir.uncDir, "wsl");
    }
    const cfgDir = resolveOpenCodeWslConfigDir(ctx.wslDistro);
    if (cfgDir) {
      updateOpenCodeConfigFile(`${cfgDir.uncDir}\\${OPENCODE_CONFIG_FILE_NAME}`, {
        remove: LIGHTCODE_MANAGED_MCP_KEYS,
      });
    }
    removeStagedPluginDir("opencode", ctx);
    return;
  }
  const pluginsDir = resolveOpenCodeNativePluginsDir();
  removeIfPresent(join(pluginsDir, OPENCODE_PLUGIN_DROP_FILE_NAME));
  removeIfPresent(join(pluginsDir, OPENCODE_PLUGIN_DROP_MANIFEST_NAME));
  cleanupLegacyDrops(pluginsDir);
  updateOpenCodeConfigFile(join(resolveOpenCodeNativeConfigDir(), OPENCODE_CONFIG_FILE_NAME), {
    remove: LIGHTCODE_MANAGED_MCP_KEYS,
  });
  removeStagedPluginDir("opencode", ctx);
}

function removeIfPresent(path: string): void {
  try {
    const stat = statSync(path);
    if (stat.isFile()) unlinkSync(path);
  } catch {
    // file missing or unreachable
  }
}
