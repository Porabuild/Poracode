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
import { toWslUncPath } from "@/shared/wsl";
import { getCachedWslHomeDirectory, type AgentEnvContext } from "../../base";
import {
  copyPluginAssetsIfStale,
  copyWslFile,
  createPluginSourceResolver,
  getNativePluginBaseDir,
  getWslPluginBaseDirs,
  isWslPluginContext,
  readBundledPluginVersion,
  readPluginManifest,
  readPluginManifestWith,
  readWslTextFile,
  removeStagedPluginDir,
  removeWslPath,
  resolvePluginVerificationIo,
  resolveWslHomePath,
  stagePluginAssetsToWsl,
  writeWslTextFile,
  type PluginManifest,
  type PluginVerificationTarget,
} from "../../plugin/installerBase";

/**
 * OpenCode plugin installer.
 *
 * Unlike Claude/Codex/Gemini — which stage `forward.mjs` and render a settings
 * document so the agent CLI invokes the forwarder via shell command — OpenCode
 * loads plugin files in-process. So "install" here means:
 *
 *   1. Stage `plugin.json` + `poracode-status.mjs` to
 *      `~/.poracode/agent-plugins/opencode/` (the canonical poracode-managed
 *      location used for version bookkeeping and the manifest the supervisor
 *      reads at boot).
 *   2. Copy the staged plugin into OpenCode's auto-discovery directory at
 *      `~/.config/opencode/plugins/poracode-status.js`. OpenCode globs
 *      `{plugin,plugins}/*.{ts,js}` (no `.mjs`!) so the deployed file uses
 *      `.js`. Bun (OpenCode's runtime) treats ESM syntax in `.js` natively.
 *
 * Why drop into `plugins/` instead of registering a `file://` spec in
 * `~/.config/opencode/opencode.json`: empirically, an opencode.json reference
 * to a file under `~/.poracode/` did not load reliably in OpenCode 1.14.31
 * across Windows/WSL — auto-discovery from `plugins/` is the well-trodden
 * path every other ecosystem plugin (Warp, sample plugins) uses, and the
 * displayed name in OpenCode's TUI status panel comes from the basename of
 * the dropped file, so naming the drop `poracode-status.js` gives the right
 * label without further plumbing.
 *
 * Older poracode builds added a `file://` plugin entry to opencode.json that
 * would now be a dead reference; install removes it on every run so users
 * upgrading from those builds aren't left with a ghost entry.
 *
 * The plugin reads `PORACODE_HOOK_URL` / `PORACODE_HOOK_SECRET` /
 * `PORACODE_THREAD_ID` etc. from `process.env` at hook time. When those
 * vars are unset (i.e. the user runs `opencode` outside Poracode) the
 * handlers no-op.
 */

/** Files staged into `~/.poracode/agent-plugins/opencode/`. */
const OPENCODE_PLUGIN_ASSET_FILES = ["plugin.json", "poracode-status.mjs"] as const;

/**
 * Filename OpenCode auto-discovers in its plugins/ directory. Must use a `.js`
 * (or `.ts`) extension — OpenCode's loader scans `{plugin,plugins}/*.{ts,js}`
 * and silently ignores any other extension.
 */
const OPENCODE_PLUGIN_DROP_FILE_NAME = "poracode-status.js";

/**
 * Filename of the manifest we drop next to the plugin file. Lets the plugin
 * read its version at runtime from `import.meta.url`'s directory.
 */
const OPENCODE_PLUGIN_DROP_MANIFEST_NAME = "poracode-status.plugin.json";

/**
 * Older Poracode versions dropped a `.mjs` here, which OpenCode never loaded
 * (auto-discovery is `*.{ts,js}` only). Cleaned up at install/uninstall time
 * so users upgrading don't end up with two stale siblings.
 */
const OPENCODE_LEGACY_DROP_FILES = [
  "poracode-status.mjs",
  "lightcode-status.js",
  "lightcode-status.mjs",
  "lightcode-status.plugin.json",
] as const;

/**
 * Substring identifying our entry in the user's `opencode.json` `"plugin"`
 * array. Older poracode versions registered a `file://` URL here pointing
 * at the staged plugin under `~/.poracode/`. We no longer write such an
 * entry but still scrub any prior one out on every install / uninstall.
 */
const PORACODE_PLUGIN_SPEC_MARKER = "agent-plugins/opencode/";

const OPENCODE_CONFIG_FILE_NAME = "opencode.json";
const LEGACY_MANAGED_MCP_FILE_NAME = ".poracode-managed-mcp.json";

export interface OpenCodePluginPaths {
  pluginDir: string;
  /** Path to the dropped file OpenCode auto-discovers. */
  opencodePluginFile: string;
  version?: string;
}

const callerDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url ?? "file://"));

const resolveSourceDir = createPluginSourceResolver({
  kind: "opencode",
  sourceEnvVar: "PORACODE_OPENCODE_PLUGIN_SOURCE",
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

/**
 * Home-resolving variant used by install/uninstall. Resolves a cold home
 * through the staging worker instead of a synchronous `wsl.exe` spawn.
 */
async function resolveOpenCodeWslConfigDirAsync(
  distro: string,
): Promise<{ linuxDir: string; uncDir: string } | undefined> {
  const home = await resolveWslHomePath(distro);
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
    const opencodeDir = resolveOpenCodeWslPluginsDir(ctx.wslDistro);
    return {
      pluginDir: wsl.linuxBase,
      opencodePluginFile: opencodeDir
        ? `${opencodeDir.linuxDir}/${OPENCODE_PLUGIN_DROP_FILE_NAME}`
        : "",
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

export async function installOpenCodePlugin(
  ctx?: AgentEnvContext,
): Promise<
  { ok: true; paths: OpenCodePluginPaths; version: string } | { ok: false; reason: string }
> {
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
    copyFileSync(join(pluginDir, "poracode-status.mjs"), opencodePluginFile);
    copyFileSync(join(pluginDir, "plugin.json"), opencodeManifestFile);
    cleanupLegacyDrops(opencodePluginsDir);
  } catch (error) {
    return {
      ok: false,
      reason: `failed to copy poracode-status plugin into ${opencodePluginsDir}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  // Best-effort: restore any user MCP entries shadowed by the retired config
  // projection, then scrub the dead `file://...` plugin entry. Runtime MCP is
  // now injected at launch, so entries without a legacy sidecar are user-owned.
  const nativeConfigDir = resolveOpenCodeNativeConfigDir();
  const nativeConfigPath = join(nativeConfigDir, OPENCODE_CONFIG_FILE_NAME);
  scrubLegacyOpenCodeMcpProjection(
    nativeConfigPath,
    join(nativeConfigDir, LEGACY_MANAGED_MCP_FILE_NAME),
  );
  updateOpenCodeConfigFile(nativeConfigPath, { remove: [] });

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

async function installOpenCodePluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
): Promise<
  { ok: true; paths: OpenCodePluginPaths; version: string } | { ok: false; reason: string }
> {
  const staged = await stagePluginAssetsToWsl(
    distro,
    sourceDir,
    "opencode",
    OPENCODE_PLUGIN_ASSET_FILES,
  );
  if (!staged.ok) return staged;

  const linuxPluginDir = staged.linuxPluginDir;
  const cfgDir = await resolveOpenCodeWslConfigDirAsync(distro);
  if (!cfgDir) {
    return {
      ok: false,
      reason: `failed to resolve OpenCode plugins dir in wsl distro ${distro} (could not read $HOME)`,
    };
  }
  const opencodePluginsDir = `${cfgDir.linuxDir}/plugins`;
  const opencodePluginFile = `${opencodePluginsDir}/${OPENCODE_PLUGIN_DROP_FILE_NAME}`;

  try {
    await copyWslFile(
      distro,
      `${linuxPluginDir}/poracode-status.mjs`,
      `${opencodePluginsDir}/${OPENCODE_PLUGIN_DROP_FILE_NAME}`,
    );
    await copyWslFile(
      distro,
      `${linuxPluginDir}/plugin.json`,
      `${opencodePluginsDir}/${OPENCODE_PLUGIN_DROP_MANIFEST_NAME}`,
    );
    await cleanupLegacyDropsWsl(distro, opencodePluginsDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `failed to copy poracode-status plugin into ${opencodePluginsDir} (distro ${distro}): ${detail}`,
    };
  }

  // Same scrub on the WSL-side opencode.json. Browser MCP is synced at launch
  // time so it can honor the user's provider setting.
  await scrubLegacyOpenCodeMcpProjectionWsl(
    distro,
    `${cfgDir.linuxDir}/${OPENCODE_CONFIG_FILE_NAME}`,
    `${cfgDir.linuxDir}/${LEGACY_MANAGED_MCP_FILE_NAME}`,
  );
  await updateOpenCodeConfigFileWsl(distro, `${cfgDir.linuxDir}/${OPENCODE_CONFIG_FILE_NAME}`, {
    remove: [],
  });

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

export async function isOpenCodePluginInstalled(
  ctx?: AgentEnvContext,
): Promise<{ installed: boolean; version?: string }> {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "opencode");
    if (!wsl) return { installed: false };
    const opencodeDir = resolveOpenCodeWslPluginsDir(ctx.wslDistro);
    if (!opencodeDir) return { installed: false };
    return verifyOpenCodeInstallAt(wsl.linuxBase, opencodeDir.linuxDir, "wsl", {
      distro: ctx.wslDistro,
    });
  }
  return verifyOpenCodeInstallAt(
    getNativePluginBaseDir("opencode", ctx?.baseDir),
    resolveOpenCodeNativePluginsDir(),
    "native",
  );
}

async function verifyOpenCodeInstallAt(
  readableStagingDir: string,
  readableOpencodeDir: string,
  target: "native" | "wsl",
  options?: PluginVerificationTarget,
): Promise<{ installed: boolean; version?: string }> {
  const io = resolvePluginVerificationIo(target, options);
  let version: string;
  try {
    version = (await readPluginManifestWith(io, readableStagingDir)).version;
  } catch {
    return { installed: false };
  }
  for (const asset of OPENCODE_PLUGIN_ASSET_FILES) {
    if (!(await io.pathExists(io.joinPath(readableStagingDir, asset)))) {
      return { installed: false };
    }
  }
  const droppedPlugin = io.joinPath(readableOpencodeDir, OPENCODE_PLUGIN_DROP_FILE_NAME);
  const droppedManifest = io.joinPath(readableOpencodeDir, OPENCODE_PLUGIN_DROP_MANIFEST_NAME);
  // Content equality so a hand-edited drop is treated as not-installed and the
  // next install call restages. Both files are UTF-8 text, so the worker's
  // decoded read is byte-faithful.
  try {
    const stagedPlugin = await io.readTextFile(
      io.joinPath(readableStagingDir, "poracode-status.mjs"),
    );
    const droppedText = await io.readTextFile(droppedPlugin);
    if (stagedPlugin === null || droppedText === null || stagedPlugin !== droppedText) {
      return { installed: false };
    }
    const stagedManifest = await io.readTextFile(io.joinPath(readableStagingDir, "plugin.json"));
    const droppedManifestText = await io.readTextFile(droppedManifest);
    if (
      stagedManifest === null ||
      droppedManifestText === null ||
      stagedManifest !== droppedManifestText
    ) {
      return { installed: false };
    }
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
   * Poracode-managed `mcp` server keys to strip before (re)adding. Callers
   * pass only the keys they own so unrelated MCP servers (and each other's
   * entries — browser vs Crossagents) are preserved across independent syncs.
   */
  remove: readonly string[];
  /** MCP server entries to (re)add. Omit to only remove. */
  add?: Record<string, unknown>;
}

/**
 * Update `opencode.json` in a single read+write: scrub any poracode-managed
 * `file://` plugin entry (left behind by older poracode builds) and merge the
 * requested poracode-managed MCP server entries under `mcp`. Only the keys in
 * `update.remove` are touched, so browser and Crossagents syncs can run
 * independently without clobbering one another. Writes only when the resulting
 * JSON actually differs from what's on disk. Best-effort: missing files /
 * malformed JSON are swallowed.
 */
function applyOpenCodeConfigUpdate(
  original: Record<string, unknown>,
  update: OpenCodeMcpConfigUpdate,
): Record<string, unknown> {
  const config: Record<string, unknown> = { ...original };

  const existingPlugin = config.plugin;
  if (Array.isArray(existingPlugin)) {
    const filtered = existingPlugin.filter((entry) => {
      if (typeof entry !== "string") return true;
      return !entry.includes(PORACODE_PLUGIN_SPEC_MARKER);
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

  return config;
}

function renderOpenCodeConfig(config: Record<string, unknown>): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function updateOpenCodeConfigFile(configPath: string, update: OpenCodeMcpConfigUpdate): void {
  const read = readJsonFileOrEmpty(configPath);
  if (!read.ok) return;
  const original =
    read.value && typeof read.value === "object" && !Array.isArray(read.value)
      ? (read.value as Record<string, unknown>)
      : {};
  const next = renderOpenCodeConfig(applyOpenCodeConfigUpdate(original, update));
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

async function updateOpenCodeConfigFileWsl(
  distro: string,
  linuxConfigPath: string,
  update: OpenCodeMcpConfigUpdate,
): Promise<void> {
  let current: string | null = null;
  try {
    current = await readWslTextFile(distro, linuxConfigPath);
  } catch {
    return;
  }
  if (current !== null && current.trim().length > 0) {
    try {
      JSON.parse(current);
    } catch {
      return;
    }
  }
  const original =
    current !== null && current.trim().length > 0
      ? (JSON.parse(current) as Record<string, unknown>)
      : {};
  const parsed =
    original && typeof original === "object" && !Array.isArray(original) ? original : {};
  const next = renderOpenCodeConfig(applyOpenCodeConfigUpdate(parsed, update));
  if (current === next) return;
  try {
    await writeWslTextFile(distro, linuxConfigPath, next);
  } catch {
    // best-effort
  }
}

function readManagedMcpOriginals(path: string): Record<string, unknown | null> {
  const read = readJsonFileOrEmpty(path);
  if (!read.ok) return {};
  if (Array.isArray(read.value)) {
    return Object.fromEntries(
      read.value
        .filter((name): name is string => typeof name === "string")
        .map((name) => [name, null]),
    );
  }
  return read.value && typeof read.value === "object"
    ? (read.value as Record<string, unknown | null>)
    : {};
}

function scrubLegacyOpenCodeMcpProjection(configPath: string, managedNamesPath: string): void {
  const originals = readManagedMcpOriginals(managedNamesPath);
  const names = Object.keys(originals);
  const restored = Object.fromEntries(
    Object.entries(originals).filter(
      (entry): entry is [string, Exclude<unknown, null>] => entry[1] !== null,
    ),
  );
  if (names.length > 0) {
    updateOpenCodeConfigFile(configPath, {
      remove: names,
      ...(Object.keys(restored).length > 0 ? { add: restored } : {}),
    });
  }
  removeIfPresent(managedNamesPath);
}

async function scrubLegacyOpenCodeMcpProjectionWsl(
  distro: string,
  linuxConfigPath: string,
  linuxManagedNamesPath: string,
): Promise<void> {
  const managedRaw = await readWslTextFile(distro, linuxManagedNamesPath).catch(() => null);
  const originals = parseManagedMcpOriginalsText(managedRaw);
  const names = Object.keys(originals);
  const restored = Object.fromEntries(
    Object.entries(originals).filter(
      (entry): entry is [string, Exclude<unknown, null>] => entry[1] !== null,
    ),
  );
  if (names.length > 0) {
    await updateOpenCodeConfigFileWsl(distro, linuxConfigPath, {
      remove: names,
      ...(Object.keys(restored).length > 0 ? { add: restored } : {}),
    });
  }
  await removeWslPath(distro, linuxManagedNamesPath);
}

function parseManagedMcpOriginalsText(raw: string | null): Record<string, unknown | null> {
  if (raw === null) return {};
  if (raw.trim().length === 0) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.filter((name): name is string => typeof name === "string").map((name) => [name, null]),
    );
  }
  return value && typeof value === "object" ? (value as Record<string, unknown | null>) : {};
}

async function cleanupLegacyDropsWsl(distro: string, linuxPluginsDir: string): Promise<void> {
  for (const name of OPENCODE_LEGACY_DROP_FILES) {
    await removeWslPath(distro, `${linuxPluginsDir}/${name}`);
  }
}

/**
 * Removes the dropped plugin file from OpenCode's plugins/ directory and any
 * legacy drops, plus scrubs the poracode entry from opencode.json. Staging
 * dir under `~/.poracode/` stays so version diagnostics survive.
 * Best-effort: missing files / unreachable distros are swallowed.
 */
export async function uninstallOpenCodePlugin(ctx?: AgentEnvContext): Promise<void> {
  if (isWslPluginContext(ctx)) {
    const cfgDir = await resolveOpenCodeWslConfigDirAsync(ctx.wslDistro);
    if (cfgDir) {
      const opencodePluginsDir = `${cfgDir.linuxDir}/plugins`;
      await removeWslPath(ctx.wslDistro, `${opencodePluginsDir}/${OPENCODE_PLUGIN_DROP_FILE_NAME}`);
      await removeWslPath(
        ctx.wslDistro,
        `${opencodePluginsDir}/${OPENCODE_PLUGIN_DROP_MANIFEST_NAME}`,
      );
      await cleanupLegacyDropsWsl(ctx.wslDistro, opencodePluginsDir);
      const configPath = `${cfgDir.linuxDir}/${OPENCODE_CONFIG_FILE_NAME}`;
      await scrubLegacyOpenCodeMcpProjectionWsl(
        ctx.wslDistro,
        configPath,
        `${cfgDir.linuxDir}/${LEGACY_MANAGED_MCP_FILE_NAME}`,
      );
      await updateOpenCodeConfigFileWsl(ctx.wslDistro, configPath, { remove: [] });
    }
    await removeStagedPluginDir("opencode", ctx);
    return;
  }
  const pluginsDir = resolveOpenCodeNativePluginsDir();
  removeIfPresent(join(pluginsDir, OPENCODE_PLUGIN_DROP_FILE_NAME));
  removeIfPresent(join(pluginsDir, OPENCODE_PLUGIN_DROP_MANIFEST_NAME));
  cleanupLegacyDrops(pluginsDir);
  const configDir = resolveOpenCodeNativeConfigDir();
  const configPath = join(configDir, OPENCODE_CONFIG_FILE_NAME);
  scrubLegacyOpenCodeMcpProjection(configPath, join(configDir, LEGACY_MANAGED_MCP_FILE_NAME));
  updateOpenCodeConfigFile(configPath, { remove: [] });
  await removeStagedPluginDir("opencode", ctx);
}

function removeIfPresent(path: string): void {
  try {
    const stat = statSync(path);
    if (stat.isFile()) unlinkSync(path);
  } catch {
    // file missing or unreachable
  }
}
