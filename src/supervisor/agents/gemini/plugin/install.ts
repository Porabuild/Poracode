import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toWslUncPath } from "@/shared/wsl";
import { isReservedMcpServerName } from "@/shared/contracts";
import { BROWSER_MCP_SERVER_NAME, type BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import {
  SUBAGENT_MCP_SERVER_NAME,
  type SubagentMcpHttpConfig,
} from "@/supervisor/agents/subagentMcp";
import {
  COMPUTER_USE_MCP_SERVER_NAME,
  type ComputerUseMcpHttpConfig,
} from "@/supervisor/agents/computerUseMcp";
import { CHROME_MCP_SERVER_NAME, type ChromeMcpHttpConfig } from "@/supervisor/agents/chromeMcp";
import {
  APP_CONTROLS_MCP_SERVER_NAME,
  type AppControlsMcpHttpConfig,
} from "@/supervisor/agents/appControlsMcp";
import { buildGeminiBrowserMcpServers, type GeminiMcpServerEntry } from "../mcpBrowser";
import { buildGeminiSubagentMcpServers } from "../mcpSubagent";
import { buildGeminiComputerUseMcpServers } from "../mcpComputerUse";
import { buildGeminiChromeMcpServers } from "../mcpChrome";
import { buildGeminiAppControlsMcpServers } from "../mcpAppControls";
import { buildGeminiUserMcpServers } from "../../userMcp";
import type { AgentEnvContext } from "../../base";
import {
  FORWARD_RUNTIME_FILE,
  buildNativeHookCommandHeads,
  buildWslHookCommandHead,
  copyForwardRuntimeFile,
  copyPluginAssetsIfStale,
  createPluginSourceResolver,
  ctxCacheKey,
  getNativeHookWrapperFilename,
  getNativePluginBaseDir,
  getWslPluginBaseDirs,
  hasNativeHookWrapper,
  isWslPluginContext,
  memoByCtx,
  readBundledPluginVersion,
  readPluginManifest,
  removeStagedPluginDir,
  stagePluginAssetsToWsl,
  writeNativeHookWrapper,
  type PluginManifest,
} from "../../plugin/installerBase";

export interface GeminiPluginPaths {
  pluginDir: string;
  settingsPath: string;
  version: string;
}

interface GeminiHookEntry {
  matcher?: string;
  hooks: Array<{
    name: string;
    type: "command";
    command: string;
    timeout: number;
  }>;
}

interface GeminiSettings {
  hooksConfig: {
    notifications: false;
  };
  hooks: Record<string, GeminiHookEntry[]>;
  mcpServers?: Record<
    string,
    {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      httpUrl?: string;
      url?: string;
      cwd?: string;
      headers?: Record<string, string>;
      timeout?: number;
    }
  >;
}

/**
 * Minimal hook surface for Gemini status tracking. Every entry produces a
 * distinct state edge in the supervisor:
 *   - SessionStart   → `session.started`         (bookkeeping / install proof-of-life)
 *   - BeforeAgent    → `session.turn_started`    (turn-open edge)
 *   - AfterAgent     → `session.turn_finished`   (turn-close edge)
 *   - Notification   → `session.needs_approval`  (approval prompts only)
 *
 * `BeforeModel` / `BeforeTool` / `AfterTool` were intentionally dropped:
 * they all converged on `session.turn_started`, fired up to 2N+ times per
 * turn (matcher: "*"), and the supervisor already deduplicates identical
 * state transitions in `ThreadOutputPipeline.updateState`. Tool-level
 * granularity is recoverable from Gemini's OSC title status, and per-tool
 * extras were only consumed by `hookDebug` for diagnostics.
 */
const GEMINI_HOOK_SPECS: ReadonlyArray<{ event: string; matcher?: string }> = [
  { event: "SessionStart" },
  { event: "BeforeAgent" },
  { event: "AfterAgent" },
  { event: "Notification" },
];

const callerDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url ?? "file://"));

const resolveSourceDir = createPluginSourceResolver({
  kind: "gemini",
  sourceEnvVar: "PORACODE_GEMINI_PLUGIN_SOURCE",
  callerDir,
});

export function readBundledGeminiPluginVersion(): string {
  return readBundledPluginVersion(resolveSourceDir);
}

function computeGeminiPluginPaths(ctx?: AgentEnvContext): GeminiPluginPaths {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "gemini");
    if (!wsl) return { pluginDir: "", settingsPath: "", version: "0.0.0" };
    let version = "0.0.0";
    try {
      version = readPluginManifest(wsl.uncBase).version;
    } catch {
      // staged manifest missing or distro unreachable
    }
    return {
      pluginDir: wsl.linuxBase,
      settingsPath: `${wsl.linuxBase}/settings.json`,
      version,
    };
  }
  const pluginDir = getNativePluginBaseDir("gemini", ctx?.baseDir);
  let version = "0.0.0";
  try {
    version = readPluginManifest(pluginDir).version;
  } catch {
    // staged manifest missing; caller should install first
  }
  return {
    pluginDir,
    settingsPath: join(pluginDir, "settings.json"),
    version,
  };
}

const geminiPluginPathsMemo = memoByCtx(computeGeminiPluginPaths, ctxCacheKey);

export function getGeminiPluginPaths(ctx?: AgentEnvContext): GeminiPluginPaths {
  return geminiPluginPathsMemo.call(ctx);
}

function resolveSettingsWritePath(ctx: AgentEnvContext | undefined, settingsPath: string): string {
  return isWslPluginContext(ctx) ? toWslUncPath(ctx.wslDistro, settingsPath) : settingsPath;
}

/**
 * Ensure Gemini has a Poracode-owned system settings file for MCP projection,
 * even when the optional status-hook plugin could not be installed. Existing
 * hook settings are preserved; a missing file is created only when requested.
 */
export function ensureGeminiLaunchSettingsFile(
  ctx: AgentEnvContext | undefined,
  createIfMissing: boolean,
): string | undefined {
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return undefined;
  const settingsPath = resolveSettingsWritePath(ctx, paths.settingsPath);
  if (existsSync(settingsPath)) return paths.settingsPath;
  if (!createIfMissing) return undefined;
  try {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, "{}\n", "utf8");
    return paths.settingsPath;
  } catch {
    return undefined;
  }
}

/** Snapshot the managed settings into a file consumed by one CLI process only. */
export function createGeminiThreadSettingsFile(
  ctx: AgentEnvContext | undefined,
): { settingsPath: string; cleanup: () => void } | undefined {
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return undefined;
  const sourcePath = resolveSettingsWritePath(ctx, paths.settingsPath);
  if (!existsSync(sourcePath)) return undefined;

  const fileName = `.poracode-thread-${randomUUID()}.json`;
  const settingsPath = isWslPluginContext(ctx)
    ? `${paths.pluginDir.replace(/\/$/u, "")}/${fileName}`
    : join(paths.pluginDir, fileName);
  const writePath = resolveSettingsWritePath(ctx, settingsPath);
  try {
    copyFileSync(sourcePath, writePath);
  } catch {
    return undefined;
  }
  return {
    settingsPath,
    cleanup: () => {
      try {
        unlinkSync(writePath);
      } catch {
        // The temp file may already have been removed by external cleanup.
      }
    },
  };
}

/**
 * Merge (or clear) a single poracode-managed `mcpServers` entry, preserving
 * every other key. Browser and subagents each own one key, so their syncs can
 * run independently against the same `settings.json` without clobbering one
 * another. Returns `undefined` when the map ends up empty so the caller can
 * drop `mcpServers` entirely.
 */
function upsertGeminiMcpServer(
  existing: GeminiSettings["mcpServers"],
  name: string,
  entry: GeminiMcpServerEntry | undefined,
): GeminiSettings["mcpServers"] {
  const next: Record<string, GeminiMcpServerEntry> = { ...(existing ?? {}) };
  if (entry) next[name] = entry;
  else delete next[name];
  return Object.keys(next).length > 0 ? next : undefined;
}

function updateGeminiSettings(
  settingsPath: string,
  mutate: (settings: GeminiSettings) => void,
): void {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as GeminiSettings;
    mutate(settings);
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  } catch {
    // Best-effort; stale settings should not block thread launch.
  }
}

function writeGeminiMcpServer(
  settingsPath: string,
  name: string,
  entry: GeminiMcpServerEntry | undefined,
): void {
  updateGeminiSettings(settingsPath, (settings) => {
    const next = upsertGeminiMcpServer(settings.mcpServers, name, entry);
    if (next) settings.mcpServers = next;
    else delete settings.mcpServers;
  });
}

function readGeminiMcpServers(settingsPath: string): NonNullable<GeminiSettings["mcpServers"]> {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as GeminiSettings;
    return settings.mcpServers ?? {};
  } catch {
    return {};
  }
}

export function syncGeminiBrowserMcpSettings(
  ctx: AgentEnvContext | undefined,
  browserMcp?: BrowserMcpHttpConfig,
  computerUseMcp?: ComputerUseMcpHttpConfig,
  chromeMcp?: ChromeMcpHttpConfig,
): void {
  if (!ctx) return;
  if (
    ctx.browserMcpEnabled === undefined &&
    ctx.computerUseMcpEnabled === undefined &&
    ctx.chromeMcpEnabled === undefined
  ) {
    return;
  }
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return;
  const settingsPath = resolveSettingsWritePath(ctx, paths.settingsPath);
  const location = isWslPluginContext(ctx)
    ? ({ kind: "wsl", distro: ctx.wslDistro } as const)
    : process.platform === "win32"
      ? ({ kind: "windows" } as const)
      : ({ kind: "posix" } as const);
  // Upsert each server independently so a sync for one MCP never clobbers the
  // other's staged entry (or the subagents entry written by its own sync).
  if (ctx.browserMcpEnabled !== undefined) {
    const entry =
      ctx.browserMcpEnabled && browserMcp
        ? buildGeminiBrowserMcpServers(location, browserMcp)?.[BROWSER_MCP_SERVER_NAME]
        : undefined;
    writeGeminiMcpServer(settingsPath, BROWSER_MCP_SERVER_NAME, entry);
  }
  if (ctx.computerUseMcpEnabled !== undefined) {
    const entry = buildGeminiComputerUseMcpServers(
      location,
      ctx.computerUseMcpEnabled === true,
      computerUseMcp,
    )?.[COMPUTER_USE_MCP_SERVER_NAME];
    writeGeminiMcpServer(settingsPath, COMPUTER_USE_MCP_SERVER_NAME, entry);
  }
  if (ctx.chromeMcpEnabled !== undefined) {
    const entry = buildGeminiChromeMcpServers(location, ctx.chromeMcpEnabled === true, chromeMcp)?.[
      CHROME_MCP_SERVER_NAME
    ];
    writeGeminiMcpServer(settingsPath, CHROME_MCP_SERVER_NAME, entry);
  }
}

export function syncGeminiUserMcpSettings(ctx: AgentEnvContext | undefined): void {
  if (!ctx) return;
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return;
  const settingsPath = resolveSettingsWritePath(ctx, paths.settingsPath);
  updateGeminiSettings(settingsPath, (settings) => {
    const existing = settings.mcpServers ?? {};
    const builtIns = Object.fromEntries(
      Object.entries(existing).filter(([name]) => isReservedMcpServerName(name)),
    );
    const mcpServers = {
      ...buildGeminiUserMcpServers(ctx.mcpServers ?? []),
      ...builtIns,
    };
    if (Object.keys(mcpServers).length > 0) settings.mcpServers = mcpServers;
    else delete settings.mcpServers;
  });
}

/**
 * Merge (or clear) the cross-provider subagents MCP server entry in Gemini's
 * staged `settings.json`. Mirrors `syncGeminiBrowserMcpSettings`; the endpoint
 * is pre-resolved so there is no location/WSL fallback. Passing an undefined
 * `subagentMcp` clears the entry.
 */
export function syncGeminiSubagentMcpSettings(
  ctx: AgentEnvContext | undefined,
  subagentMcp?: SubagentMcpHttpConfig,
): void {
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return;
  const settingsPath = resolveSettingsWritePath(ctx, paths.settingsPath);
  const entry = buildGeminiSubagentMcpServers(subagentMcp)?.[SUBAGENT_MCP_SERVER_NAME];
  writeGeminiMcpServer(settingsPath, SUBAGENT_MCP_SERVER_NAME, entry);
}

export function syncGeminiAppControlsMcpSettings(
  ctx: AgentEnvContext | undefined,
  enabled: boolean,
  appControlsMcp?: AppControlsMcpHttpConfig,
): void {
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return;
  const settingsPath = resolveSettingsWritePath(ctx, paths.settingsPath);
  const location = isWslPluginContext(ctx)
    ? ({ kind: "wsl", distro: ctx.wslDistro } as const)
    : process.platform === "win32"
      ? ({ kind: "windows" } as const)
      : ({ kind: "posix" } as const);
  const entry = enabled
    ? buildGeminiAppControlsMcpServers(location, appControlsMcp)?.[APP_CONTROLS_MCP_SERVER_NAME]
    : undefined;
  writeGeminiMcpServer(settingsPath, APP_CONTROLS_MCP_SERVER_NAME, entry);
}

export interface GeminiLaunchMcpSettings {
  browserMcp?: BrowserMcpHttpConfig;
  computerUseMcp?: ComputerUseMcpHttpConfig;
  chromeMcp?: ChromeMcpHttpConfig;
  subagentMcp?: SubagentMcpHttpConfig;
  appControlsMcp?: AppControlsMcpHttpConfig;
}

/** Replace the complete per-thread MCP projection with one settings-file update. */
export function syncGeminiLaunchMcpSettings(
  ctx: AgentEnvContext,
  input: GeminiLaunchMcpSettings,
): void {
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return;
  const settingsPath = resolveSettingsWritePath(ctx, paths.settingsPath);
  const location = isWslPluginContext(ctx)
    ? ({ kind: "wsl", distro: ctx.wslDistro } as const)
    : process.platform === "win32"
      ? ({ kind: "windows" } as const)
      : ({ kind: "posix" } as const);

  updateGeminiSettings(settingsPath, (settings) => {
    const existingBuiltIns = Object.fromEntries(
      Object.entries(settings.mcpServers ?? {}).filter(([name]) => isReservedMcpServerName(name)),
    );
    const mcpServers: Record<string, GeminiMcpServerEntry> = {
      ...buildGeminiUserMcpServers(ctx.mcpServers ?? []),
      ...existingBuiltIns,
    };
    const set = (name: string, entry: GeminiMcpServerEntry | undefined): void => {
      if (entry) mcpServers[name] = entry;
      else delete mcpServers[name];
    };

    set(
      BROWSER_MCP_SERVER_NAME,
      ctx.browserMcpEnabled && input.browserMcp
        ? buildGeminiBrowserMcpServers(location, input.browserMcp)?.[BROWSER_MCP_SERVER_NAME]
        : undefined,
    );
    set(
      COMPUTER_USE_MCP_SERVER_NAME,
      buildGeminiComputerUseMcpServers(
        location,
        ctx.computerUseMcpEnabled === true,
        input.computerUseMcp,
      )?.[COMPUTER_USE_MCP_SERVER_NAME],
    );
    set(
      CHROME_MCP_SERVER_NAME,
      buildGeminiChromeMcpServers(location, ctx.chromeMcpEnabled === true, input.chromeMcp)?.[
        CHROME_MCP_SERVER_NAME
      ],
    );
    set(
      SUBAGENT_MCP_SERVER_NAME,
      buildGeminiSubagentMcpServers(input.subagentMcp)?.[SUBAGENT_MCP_SERVER_NAME],
    );
    set(
      APP_CONTROLS_MCP_SERVER_NAME,
      input.appControlsMcp
        ? buildGeminiAppControlsMcpServers(location, input.appControlsMcp)?.[
            APP_CONTROLS_MCP_SERVER_NAME
          ]
        : undefined,
    );

    if (Object.keys(mcpServers).length > 0) settings.mcpServers = mcpServers;
    else delete settings.mcpServers;
  });
}

export interface InstallGeminiPluginOptions {
  /**
   * Absolute path to the Node binary the staged hook command should use.
   *
   * - **WSL contexts:** required. Comes from `resolveNodeForDistro`.
   * - **Native contexts:** optional. When provided (preferred), the wrapper
   *   exec's the bare Node binary directly; otherwise it falls back to
   *   `ELECTRON_RUN_AS_NODE=1` against the bundled Electron binary.
   */
  resolvedNodePath?: string | undefined;
}

export function installGeminiPlugin(
  ctx?: AgentEnvContext,
  options?: InstallGeminiPluginOptions,
): { ok: true; paths: GeminiPluginPaths; version: string } | { ok: false; reason: string } {
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
    if (!options?.resolvedNodePath) {
      return {
        ok: false,
        reason:
          "WSL Gemini plugin install requires a resolved node path; the adapter must call resolveNodeForDistro before installing.",
      };
    }
    return installGeminiPluginWsl(
      ctx.wslDistro,
      sourceDir,
      manifest,
      options.resolvedNodePath,
      ctx.browserMcp,
      ctx.computerUseMcp,
      ctx.chromeMcp,
    );
  }

  const pluginDir = getNativePluginBaseDir("gemini", ctx?.baseDir);
  const settingsPath = join(pluginDir, "settings.json");
  const preservedMcpServers = readGeminiMcpServers(settingsPath);
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  const nativeCommands = buildNativeHookCommandHeads(wrapperPath);
  const mcpServers = {
    ...preservedMcpServers,
    ...(buildGeminiBrowserMcpServers({ kind: "windows" }, ctx?.browserMcp) ?? {}),
    ...(buildGeminiComputerUseMcpServers(
      { kind: "windows" },
      ctx?.computerUseMcpEnabled === true,
      ctx?.computerUseMcp,
    ) ?? {}),
    ...(buildGeminiChromeMcpServers(
      { kind: "windows" },
      ctx?.chromeMcpEnabled === true,
      ctx?.chromeMcp,
    ) ?? {}),
  };
  const settings = renderGeminiSettings({
    headExpression: nativeCommands.command,
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
  });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

  console.log(
    `[supervisor] Gemini hook plugin staged v${manifest.version} at ${pluginDir} (forward.mjs, ${getNativeHookWrapperFilename()}, settings.json)`,
  );

  return {
    ok: true,
    version: manifest.version,
    paths: { pluginDir, settingsPath, version: manifest.version },
  };
}

function installGeminiPluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
  browserMcp?: BrowserMcpHttpConfig,
  computerUseMcp?: ComputerUseMcpHttpConfig,
  chromeMcp?: ChromeMcpHttpConfig,
): { ok: true; paths: GeminiPluginPaths; version: string } | { ok: false; reason: string } {
  const existingPluginDir = getWslPluginBaseDirs(distro, "gemini");
  const preservedMcpServers = existingPluginDir
    ? readGeminiMcpServers(`${existingPluginDir.uncBase}\\settings.json`)
    : {};
  const staged = stagePluginAssetsToWsl(distro, sourceDir, "gemini", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  const linuxPluginDir = staged.linuxPluginDir;
  const linuxSettingsPath = `${linuxPluginDir}/settings.json`;
  const linuxForwardPath = `${linuxPluginDir}/forward.mjs`;
  const uncSettingsPath = toWslUncPath(distro, linuxSettingsPath);
  const headExpression = buildWslHookCommandHead(resolvedNodePath, linuxForwardPath);

  try {
    mkdirSync(dirname(uncSettingsPath), { recursive: true });
    const mcpServers = {
      ...preservedMcpServers,
      ...(buildGeminiBrowserMcpServers({ kind: "wsl", distro }, browserMcp) ?? {}),
      ...(buildGeminiComputerUseMcpServers(
        { kind: "wsl", distro },
        computerUseMcp !== undefined,
        computerUseMcp,
      ) ?? {}),
      ...(buildGeminiChromeMcpServers(
        { kind: "wsl", distro },
        chromeMcp !== undefined,
        chromeMcp,
      ) ?? {}),
    };
    const settings = renderGeminiSettings({
      headExpression,
      ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
    });
    writeFileSync(uncSettingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  } catch (error) {
    return {
      ok: false,
      reason: `failed to write Gemini settings.json in wsl distro ${distro}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  console.log(
    `[supervisor] Gemini hook plugin staged v${manifest.version} in WSL distro ${distro} at ${linuxPluginDir} (forward.mjs, settings.json)`,
  );

  return {
    ok: true,
    version: manifest.version,
    paths: {
      pluginDir: linuxPluginDir,
      settingsPath: linuxSettingsPath,
      version: manifest.version,
    },
  };
}

export function isGeminiPluginInstalled(ctx?: AgentEnvContext): {
  installed: boolean;
  version?: string;
} {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "gemini");
    if (!wsl) return { installed: false };
    return verifyGeminiInstallAt(wsl.uncBase, "wsl");
  }
  return verifyGeminiInstallAt(getNativePluginBaseDir("gemini", ctx?.baseDir), "native");
}

export function uninstallGeminiPlugin(ctx?: AgentEnvContext, removeStaged = true): void {
  if (removeStaged) removeStagedPluginDir("gemini", ctx);
}

function verifyGeminiInstallAt(
  readableDir: string,
  target: "native" | "wsl",
): { installed: boolean; version?: string } {
  if (!existsSync(join(readableDir, "plugin.json"))) return { installed: false };
  if (!existsSync(join(readableDir, "forward.mjs"))) return { installed: false };
  if (!existsSync(join(readableDir, FORWARD_RUNTIME_FILE))) return { installed: false };
  if (!existsSync(join(readableDir, "settings.json"))) return { installed: false };
  if (!hasNativeHookWrapper(readableDir, target)) return { installed: false };
  try {
    const settings = JSON.parse(readFileSync(join(readableDir, "settings.json"), "utf8")) as {
      hooks?: Record<string, unknown>;
    };
    if (!hasGeminiHooks(settings.hooks)) return { installed: false };
    const version = readPluginManifest(readableDir).version;
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

/**
 * Match either the WSL command shape (`forward.mjs` invoked via absolute
 * node path) or the native shape (`poracode-hook.{sh,cmd,ps1}` wrapper).
 */
const PORACODE_GEMINI_HOOK_RE =
  /agent-plugins(?:[/\\]+)gemini(?:[/\\]+)(?:forward\.mjs|poracode-hook\.(?:sh|cmd|ps1))/;

function hasGeminiHooks(hooks: Record<string, unknown> | undefined): boolean {
  if (!hooks) return false;
  for (const spec of GEMINI_HOOK_SPECS) {
    const groups = hooks[spec.event];
    if (!Array.isArray(groups) || groups.length === 0) return false;
    const found = groups.some((group) => {
      if (!group || typeof group !== "object") return false;
      const hookEntries = (group as { hooks?: unknown }).hooks;
      if (!Array.isArray(hookEntries)) return false;
      return hookEntries.some((hook) => {
        if (!hook || typeof hook !== "object") return false;
        const command = (hook as { command?: unknown }).command;
        return typeof command === "string" && PORACODE_GEMINI_HOOK_RE.test(command);
      });
    });
    if (!found) return false;
  }
  return true;
}

export interface RenderGeminiSettingsOptions {
  headExpression: string;
  mcpServers?: GeminiSettings["mcpServers"];
}

export function renderGeminiSettings(opts: RenderGeminiSettingsOptions): GeminiSettings {
  const hooks: Record<string, GeminiHookEntry[]> = {};
  for (const spec of GEMINI_HOOK_SPECS) {
    const entry: GeminiHookEntry = {
      hooks: [
        {
          name: `poracode-status-${spec.event}`,
          type: "command",
          command: `${opts.headExpression} ${spec.event}`,
          timeout: 5000,
        },
      ],
    };
    if (spec.matcher !== undefined) entry.matcher = spec.matcher;
    hooks[spec.event] = [entry];
  }
  const settings: GeminiSettings = { hooksConfig: { notifications: false }, hooks };
  if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
    settings.mcpServers = opts.mcpServers;
  }
  return settings;
}
