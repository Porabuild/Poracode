import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toWslUncPath } from "@/shared/wsl";
import { resolveWslHomeDirectory, type AgentEnvContext } from "../../base";
import {
  FORWARD_RUNTIME_FILE,
  buildNativeHookCommandHeads,
  buildWslHookCommandHead,
  copyForwardRuntimeFile,
  copyPluginAssetsIfStale,
  createPluginSourceResolver,
  ctxCacheKey,
  getNativePluginBaseDir,
  getWslPluginBaseDirs,
  isWslPluginContext,
  memoByCtx,
  readBundledPluginVersion,
  readPluginManifest,
  removeStagedPluginDir,
  stagePluginAssetsToWsl,
  verifyStagedPluginAt,
  writeNativeHookWrapper,
  type PluginManifest,
} from "../../plugin/installerBase";

/**
 * Grok CLI plugin installer.
 *
 * Two writes per install:
 *   1. **Plugin staging** under `~/.lightcode/agent-plugins/grok/` — copies
 *      `forward.mjs` + `plugin.json` + the shared forwarder runtime + the
 *      native wrapper script. Same shape as Claude/Codex/Gemini/Copilot.
 *   2. **Global hook config** at `~/.grok/hooks/lightcode-status.json`. Grok
 *      loads global hooks at every session and always trusts them — no
 *      `/hooks-trust` prompt is required. Done at install time, not per-spawn.
 *
 * Both files are owned by Lightcode — we replace them on reinstall and never
 * merge into user-authored config.
 */

export interface GrokPluginPaths {
  /**
   * Directory containing forward.mjs, plugin.json, and the native wrapper.
   * For WSL contexts this is a Linux path inside the distro; native fs APIs
   * must use `toWslUncPath(distro, ...)` instead.
   */
  pluginDir: string;
  /** Absolute path of the user-global hook config file written by install. */
  globalHookFilePath: string;
  /** Plugin semver from plugin.json. */
  version: string;
}

const GROK_HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "Stop", "Notification"] as const;

const GLOBAL_HOOK_FILENAME = "lightcode-status.json";
const GLOBAL_HOOK_DIR_NAME = "hooks";
const GLOBAL_GROK_DIR_NAME = ".grok";
const HOOK_TIMEOUT_SEC = 5;

const callerDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url ?? "file://"));

const resolveSourceDir = createPluginSourceResolver({
  kind: "grok",
  sourceEnvVar: "LIGHTCODE_GROK_PLUGIN_SOURCE",
  callerDir,
});

export function readBundledGrokPluginVersion(): string {
  return readBundledPluginVersion(resolveSourceDir);
}

function nativeGlobalGrokDir(): string {
  return join(homedir(), GLOBAL_GROK_DIR_NAME);
}

function wslGlobalGrokDir(distro: string): string {
  const home = resolveWslHomeDirectory(distro);
  return home ? `${home}/${GLOBAL_GROK_DIR_NAME}` : "";
}

function computeGrokPluginPaths(ctx?: AgentEnvContext): GrokPluginPaths {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "grok");
    if (!wsl) return { pluginDir: "", globalHookFilePath: "", version: "0.0.0" };
    let version = "0.0.0";
    try {
      version = readPluginManifest(wsl.uncBase).version;
    } catch {
      // staged manifest missing or distro unreachable
    }
    const grokDir = wslGlobalGrokDir(ctx.wslDistro);
    return {
      pluginDir: wsl.linuxBase,
      globalHookFilePath: grokDir
        ? `${grokDir}/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`
        : "",
      version,
    };
  }
  const pluginDir = getNativePluginBaseDir("grok", ctx?.baseDir);
  let version = "0.0.0";
  try {
    version = readPluginManifest(pluginDir).version;
  } catch {
    // staged manifest missing; caller should run installGrokPlugin first.
  }
  return {
    pluginDir,
    globalHookFilePath: join(nativeGlobalGrokDir(), GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME),
    version,
  };
}

const grokPluginPathsMemo = memoByCtx(computeGrokPluginPaths, ctxCacheKey);

export function getGrokPluginPaths(ctx?: AgentEnvContext): GrokPluginPaths {
  return grokPluginPathsMemo.call(ctx);
}

export interface InstallGrokPluginOptions {
  /**
   * Absolute path to the Node binary the staged hook command should use.
   *
   * - **WSL contexts:** required. Comes from `resolveNodeForDistro`.
   * - **Native contexts:** optional. When provided (preferred), the wrapper
   *   exec's the bare Node binary directly; otherwise it falls back to
   *   `ELECTRON_RUN_AS_NODE=1` against the bundled Electron binary.
   */
  resolvedNodePath?: string | undefined;
  /**
   * Override `~/.grok` (or the WSL distro equivalent) when writing the global
   * hook file. Tests pass a temp dir to avoid touching the user's real Grok
   * config; production calls leave this undefined.
   */
  globalGrokDirOverride?: string;
}

export function installGrokPlugin(
  ctx?: AgentEnvContext,
  options?: InstallGrokPluginOptions,
): { ok: true; paths: GrokPluginPaths; version: string } | { ok: false; reason: string } {
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
          "WSL Grok plugin install requires a resolved node path; the adapter must call resolveNodeForDistro before installing.",
      };
    }
    return installGrokPluginWsl(
      ctx.wslDistro,
      sourceDir,
      manifest,
      options.resolvedNodePath,
      options.globalGrokDirOverride,
    );
  }

  const pluginDir = getNativePluginBaseDir("grok", ctx?.baseDir);
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  const globalGrokDir = options?.globalGrokDirOverride
    ? resolve(options.globalGrokDirOverride)
    : nativeGlobalGrokDir();
  const hookFilePath = join(globalGrokDir, GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME);

  const nativeCommands = buildNativeHookCommandHeads(wrapperPath);

  const writeResult = writeGrokHookFileIfChanged(hookFilePath, {
    command: nativeCommands.command,
  });
  if (!writeResult.ok) return writeResult;

  console.log(
    [
      `[supervisor] Grok hook plugin staged v${manifest.version}`,
      `  pluginDir: ${pluginDir}`,
      `  hookFile: ${hookFilePath}`,
    ].join("\n"),
  );

  return {
    ok: true,
    version: manifest.version,
    paths: { pluginDir, globalHookFilePath: hookFilePath, version: manifest.version },
  };
}

function installGrokPluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
  globalGrokDirOverride: string | undefined,
): { ok: true; paths: GrokPluginPaths; version: string } | { ok: false; reason: string } {
  const staged = stagePluginAssetsToWsl(distro, sourceDir, "grok", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  const linuxForward = `${staged.linuxPluginDir}/forward.mjs`;
  const linuxGrokDir = globalGrokDirOverride ?? `${staged.deploy.home}/${GLOBAL_GROK_DIR_NAME}`;
  const linuxHookFilePath = `${linuxGrokDir}/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`;
  const uncHookFilePath = toWslUncPath(distro, linuxHookFilePath);

  const command = buildWslHookCommandHead(resolvedNodePath, linuxForward);

  const writeResult = writeGrokHookFileIfChanged(uncHookFilePath, { command });
  if (!writeResult.ok) {
    return {
      ok: false,
      reason: `failed to write Grok hook file at ${linuxHookFilePath} in wsl distro ${distro}: ${writeResult.reason}`,
    };
  }

  console.log(
    [
      `[supervisor] Grok hook plugin staged v${manifest.version} in WSL distro ${distro}`,
      `  pluginDir: ${staged.linuxPluginDir}`,
      `  hookFile: ${linuxHookFilePath}`,
    ].join("\n"),
  );

  return {
    ok: true,
    version: manifest.version,
    paths: {
      pluginDir: staged.linuxPluginDir,
      globalHookFilePath: linuxHookFilePath,
      version: manifest.version,
    },
  };
}

const GROK_VERIFY_ASSETS = ["plugin.json", "forward.mjs", FORWARD_RUNTIME_FILE] as const;

export function isGrokPluginInstalled(ctx?: AgentEnvContext): {
  installed: boolean;
  version?: string;
} {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "grok");
    if (!wsl) return { installed: false };
    const grokDir = wslGlobalGrokDir(ctx.wslDistro);
    const hookFile = grokDir
      ? toWslUncPath(ctx.wslDistro, `${grokDir}/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`)
      : "";
    return verifyStagedPluginAt(wsl.uncBase, "wsl", {
      assets: GROK_VERIFY_ASSETS,
      extraCheck: () => hookFile.length > 0 && hookFileMatchesLightcode(hookFile),
    });
  }
  const hookFile = join(nativeGlobalGrokDir(), GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME);
  return verifyStagedPluginAt(getNativePluginBaseDir("grok", ctx?.baseDir), "native", {
    assets: GROK_VERIFY_ASSETS,
    extraCheck: () => hookFileMatchesLightcode(hookFile),
  });
}

export function uninstallGrokPlugin(ctx?: AgentEnvContext): void {
  const hookFile = isWslPluginContext(ctx)
    ? toWslUncPath(
        ctx.wslDistro,
        `${wslGlobalGrokDir(ctx.wslDistro)}/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`,
      )
    : join(nativeGlobalGrokDir(), GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME);
  try {
    if (hookFileMatchesLightcode(hookFile)) unlinkSync(hookFile);
  } catch {
    // best-effort uninstall
  }
  removeStagedPluginDir("grok", ctx);
}

/**
 * Match either the WSL command shape (absolute node path + forward.mjs) or
 * the native shape (`lightcode-hook.{sh,cmd,ps1}` wrapper). Used to confirm
 * the hook file points at our staged wrapper and not at a stale or
 * user-authored entry.
 */
const LIGHTCODE_GROK_HOOK_RE =
  /agent-plugins(?:[/\\]+)grok(?:[/\\]+)(?:forward\.mjs|lightcode-hook\.(?:sh|cmd|ps1))/;

function hookFileMatchesLightcode(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { hooks?: Record<string, unknown> };
    if (!parsed.hooks || typeof parsed.hooks !== "object") return false;
    for (const event of GROK_HOOK_EVENTS) {
      const groups = parsed.hooks[event];
      if (!Array.isArray(groups) || groups.length === 0) return false;
      const found = groups.some((group) => {
        if (!group || typeof group !== "object") return false;
        const hookEntries = (group as { hooks?: unknown }).hooks;
        if (!Array.isArray(hookEntries)) return false;
        return hookEntries.some((hook) => {
          if (!hook || typeof hook !== "object") return false;
          const command = (hook as { command?: unknown }).command;
          return typeof command === "string" && LIGHTCODE_GROK_HOOK_RE.test(command);
        });
      });
      if (!found) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── Hook config rendering / write ─────────────────────────────────────────

interface GrokHookCommand {
  type: "command";
  command: string;
  timeout: number;
}

interface GrokHookEntry {
  hooks: GrokHookCommand[];
}

interface GrokHookConfig {
  hooks: Record<string, GrokHookEntry[]>;
}

/**
 * Render the user-global hook config that points the Grok CLI at our staged
 * forwarder. Single `command` field per hook entry — Grok's hook schema
 * matches Claude Code's: one shell string the runner exec's with the event
 * name appended as `argv[2]`. Timeout is the Grok-doc default (5 s).
 */
export function renderGrokHookConfig(input: { command: string }): GrokHookConfig {
  const hooks: Record<string, GrokHookEntry[]> = {};
  for (const event of GROK_HOOK_EVENTS) {
    hooks[event] = [
      {
        hooks: [
          {
            type: "command",
            command: `${input.command} ${event}`,
            timeout: HOOK_TIMEOUT_SEC,
          },
        ],
      },
    ];
  }
  return { hooks };
}

function writeGrokHookFileIfChanged(
  hookFilePath: string,
  input: { command: string },
): { ok: true } | { ok: false; reason: string } {
  const serialized = `${JSON.stringify(renderGrokHookConfig(input), null, 2)}\n`;
  try {
    const existing = readFileSync(hookFilePath, "utf8");
    if (existing === serialized) return { ok: true };
  } catch {
    // file missing or unreadable; fall through to write
  }
  try {
    mkdirSync(dirname(hookFilePath), { recursive: true });
    writeFileSync(hookFilePath, serialized, "utf8");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export { GROK_HOOK_EVENTS, GLOBAL_HOOK_FILENAME, GLOBAL_HOOK_DIR_NAME };
