import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toWslUncPath } from "@/shared/wsl";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import type { ComputerUseMcpHttpConfig } from "@/supervisor/agents/computerUseMcp";
import { buildGeminiBrowserMcpServers } from "../mcpBrowser";
import { buildGeminiComputerUseMcpServers } from "../mcpComputerUse";
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
  sourceEnvVar: "LIGHTCODE_GEMINI_PLUGIN_SOURCE",
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

export function syncGeminiBrowserMcpSettings(
  ctx: AgentEnvContext | undefined,
  browserMcp?: BrowserMcpHttpConfig,
  computerUseMcp?: ComputerUseMcpHttpConfig,
): void {
  if (ctx?.browserMcpEnabled === undefined && ctx?.computerUseMcpEnabled === undefined) return;
  const paths = getGeminiPluginPaths(ctx);
  if (!paths.settingsPath) return;
  const settingsPath = resolveSettingsWritePath(ctx, paths.settingsPath);
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as GeminiSettings;
    const location = isWslPluginContext(ctx)
      ? ({ kind: "wsl", distro: ctx.wslDistro } as const)
      : process.platform === "win32"
        ? ({ kind: "windows" } as const)
        : ({ kind: "posix" } as const);
    const servers = {
      ...((ctx.browserMcpEnabled && browserMcp
        ? buildGeminiBrowserMcpServers(location, browserMcp)
        : undefined) ?? {}),
      ...((ctx.computerUseMcpEnabled && computerUseMcp
        ? buildGeminiComputerUseMcpServers(location, computerUseMcp)
        : undefined) ?? {}),
    };
    if (Object.keys(servers).length > 0) {
      settings.mcpServers = servers;
    } else {
      delete settings.mcpServers;
    }
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
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
    );
  }

  const pluginDir = getNativePluginBaseDir("gemini", ctx?.baseDir);
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  const settingsPath = join(pluginDir, "settings.json");
  const nativeCommands = buildNativeHookCommandHeads(wrapperPath);
  const mcpServers = {
    ...(buildGeminiBrowserMcpServers({ kind: "windows" }, ctx?.browserMcp) ?? {}),
    ...(buildGeminiComputerUseMcpServers({ kind: "windows" }, ctx?.computerUseMcp) ?? {}),
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
): { ok: true; paths: GeminiPluginPaths; version: string } | { ok: false; reason: string } {
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
      ...(buildGeminiBrowserMcpServers({ kind: "wsl", distro }, browserMcp) ?? {}),
      ...(buildGeminiComputerUseMcpServers({ kind: "wsl", distro }, computerUseMcp) ?? {}),
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

export function uninstallGeminiPlugin(ctx?: AgentEnvContext): void {
  removeStagedPluginDir("gemini", ctx);
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
 * node path) or the native shape (`lightcode-hook.{sh,cmd,ps1}` wrapper).
 */
const LIGHTCODE_GEMINI_HOOK_RE =
  /agent-plugins(?:[/\\]+)gemini(?:[/\\]+)(?:forward\.mjs|lightcode-hook\.(?:sh|cmd|ps1))/;

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
        return typeof command === "string" && LIGHTCODE_GEMINI_HOOK_RE.test(command);
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
          name: `lightcode-status-${spec.event}`,
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
