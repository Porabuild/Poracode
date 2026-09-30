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
import type { ResolvedMcpServer } from "@/shared/contracts";
import type { GeminiMcpServerConfig as GeminiMcpServerEntry } from "../../userMcp";
import { buildGeminiMcpServers } from "../../userMcp";
import type { AgentEnvContext, Awaitable } from "../../base";
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
  isWslPluginContext,
  memoByCtx,
  readBundledPluginVersion,
  readPluginManifest,
  readPluginManifestWith,
  readWslTextFile,
  resolvePluginVerificationIo,
  removeStagedPluginDir,
  removeWslPath,
  resolveWslPluginBaseDirs,
  stagePluginAssetsToWsl,
  writeWslTextFile,
  writeNativeHookWrapper,
  wslPathExists,
  type PluginManifest,
  type PluginVerificationTarget,
} from "../../plugin/installerBase";

export interface GeminiPluginPaths {
  pluginDir: string;
  settingsPath: string;
  version?: string;
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
    return {
      pluginDir: wsl.linuxBase,
      settingsPath: `${wsl.linuxBase}/settings.json`,
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

/**
 * Ensure Gemini has a Poracode-owned system settings file for MCP projection,
 * even when the optional status-hook plugin could not be installed. Existing
 * hook settings are preserved; a missing file is created only when requested.
 * WSL reads/writes run through the staging worker — never a synchronous UNC
 * handle on the launch path.
 */
export async function ensureGeminiLaunchSettingsFile(
  ctx: AgentEnvContext | undefined,
  createIfMissing: boolean,
): Promise<string | undefined> {
  if (isWslPluginContext(ctx)) {
    const dirs = await resolveWslPluginBaseDirs(ctx.wslDistro, "gemini");
    if (!dirs) return undefined;
    const settingsPath = `${dirs.linuxBase}/settings.json`;
    try {
      if (await wslPathExists(ctx.wslDistro, settingsPath)) return settingsPath;
      if (!createIfMissing) return undefined;
      await writeWslTextFile(ctx.wslDistro, settingsPath, "{}\n");
      return settingsPath;
    } catch {
      return undefined;
    }
  }
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return undefined;
  if (existsSync(paths.settingsPath)) return paths.settingsPath;
  if (!createIfMissing) return undefined;
  try {
    mkdirSync(dirname(paths.settingsPath), { recursive: true });
    writeFileSync(paths.settingsPath, "{}\n", "utf8");
    return paths.settingsPath;
  } catch {
    return undefined;
  }
}

/** Snapshot the managed settings into a file consumed by one CLI process only. */
export async function createGeminiThreadSettingsFile(
  ctx: AgentEnvContext | undefined,
): Promise<{ settingsPath: string; cleanup: () => Awaitable<void> } | undefined> {
  const fileName = `.poracode-thread-${randomUUID()}.json`;
  if (isWslPluginContext(ctx)) {
    const dirs = await resolveWslPluginBaseDirs(ctx.wslDistro, "gemini");
    if (!dirs) return undefined;
    const threadPath = `${dirs.linuxBase}/${fileName}`;
    try {
      const source = await readWslTextFile(ctx.wslDistro, `${dirs.linuxBase}/settings.json`);
      if (source === null) return undefined;
      await writeWslTextFile(ctx.wslDistro, threadPath, source);
    } catch {
      return undefined;
    }
    return {
      settingsPath: threadPath,
      cleanup: () => removeWslPath(ctx.wslDistro, threadPath),
    };
  }

  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath || !existsSync(paths.settingsPath)) return undefined;
  const writePath = join(paths.pluginDir, fileName);
  try {
    copyFileSync(paths.settingsPath, writePath);
  } catch {
    return undefined;
  }
  return {
    settingsPath: writePath,
    cleanup: () => {
      try {
        unlinkSync(writePath);
      } catch {
        // The temp file may already have been removed by external cleanup.
      }
    },
  };
}

function applyGeminiMcpServers(
  settings: GeminiSettings,
  servers: readonly ResolvedMcpServer[],
): GeminiSettings {
  const mcpServers: Record<string, GeminiMcpServerEntry> = buildGeminiMcpServers(servers);
  if (Object.keys(mcpServers).length > 0) settings.mcpServers = mcpServers;
  else delete settings.mcpServers;
  return settings;
}

/** Replace the complete per-thread MCP projection with one settings-file update. */
export async function syncGeminiLaunchMcpSettings(
  ctx: AgentEnvContext,
  servers: readonly ResolvedMcpServer[],
): Promise<void> {
  if (isWslPluginContext(ctx)) {
    const dirs = await resolveWslPluginBaseDirs(ctx.wslDistro, "gemini");
    if (!dirs) return;
    const settingsPath = `${dirs.linuxBase}/settings.json`;
    try {
      const raw = await readWslTextFile(ctx.wslDistro, settingsPath);
      if (raw === null) return;
      const settings = applyGeminiMcpServers(JSON.parse(raw) as GeminiSettings, servers);
      await writeWslTextFile(ctx.wslDistro, settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    } catch {
      // Best-effort; stale settings should not block thread launch.
    }
    return;
  }
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return;
  try {
    const settings = applyGeminiMcpServers(
      JSON.parse(readFileSync(paths.settingsPath, "utf8")) as GeminiSettings,
      servers,
    );
    writeFileSync(paths.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  } catch {
    // Best-effort; stale settings should not block thread launch.
  }
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

export async function installGeminiPlugin(
  ctx?: AgentEnvContext,
  options?: InstallGeminiPluginOptions,
): Promise<
  { ok: true; paths: GeminiPluginPaths; version: string } | { ok: false; reason: string }
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
      ctx.mcpServers ?? [],
    );
  }

  const pluginDir = getNativePluginBaseDir("gemini", ctx?.baseDir);
  const settingsPath = join(pluginDir, "settings.json");
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  const nativeCommands = buildNativeHookCommandHeads(wrapperPath);
  const mcpServers = buildGeminiMcpServers(ctx?.mcpServers ?? []);
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

async function installGeminiPluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
  servers: readonly ResolvedMcpServer[],
): Promise<
  { ok: true; paths: GeminiPluginPaths; version: string } | { ok: false; reason: string }
> {
  const staged = await stagePluginAssetsToWsl(distro, sourceDir, "gemini", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  const linuxPluginDir = staged.linuxPluginDir;
  const linuxSettingsPath = `${linuxPluginDir}/settings.json`;
  const linuxForwardPath = `${linuxPluginDir}/forward.mjs`;
  const headExpression = buildWslHookCommandHead(resolvedNodePath, linuxForwardPath);

  try {
    const mcpServers = buildGeminiMcpServers(servers);
    const settings = renderGeminiSettings({
      headExpression,
      ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
    });
    await writeWslTextFile(distro, linuxSettingsPath, `${JSON.stringify(settings, null, 2)}\n`);
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

export async function isGeminiPluginInstalled(
  ctx?: AgentEnvContext,
): Promise<{ installed: boolean; version?: string }> {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "gemini");
    if (!wsl) return { installed: false };
    return verifyGeminiInstallAt(wsl.linuxBase, "wsl", { distro: ctx.wslDistro });
  }
  return verifyGeminiInstallAt(getNativePluginBaseDir("gemini", ctx?.baseDir), "native");
}

export async function uninstallGeminiPlugin(ctx?: AgentEnvContext): Promise<void> {
  await removeStagedPluginDir("gemini", ctx);
}

const GEMINI_VERIFY_ASSETS = [
  "plugin.json",
  "forward.mjs",
  FORWARD_RUNTIME_FILE,
  "settings.json",
] as const;

async function verifyGeminiInstallAt(
  readableDir: string,
  target: "native" | "wsl",
  options?: PluginVerificationTarget,
): Promise<{ installed: boolean; version?: string }> {
  const io = resolvePluginVerificationIo(target, options);
  for (const asset of GEMINI_VERIFY_ASSETS) {
    if (!(await io.pathExists(io.joinPath(readableDir, asset)))) return { installed: false };
  }
  if (
    target === "native" &&
    !(await io.pathExists(io.joinPath(readableDir, getNativeHookWrapperFilename())))
  ) {
    return { installed: false };
  }
  try {
    const raw = await io.readTextFile(io.joinPath(readableDir, "settings.json"));
    if (raw === null) return { installed: false };
    const settings = JSON.parse(raw) as { hooks?: Record<string, unknown> };
    if (!hasGeminiHooks(settings.hooks)) return { installed: false };
    const manifest = await readPluginManifestWith(io, readableDir);
    return { installed: true, version: manifest.version };
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
