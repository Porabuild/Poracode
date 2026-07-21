import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toWslUncPath } from "@/shared/wsl";
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

/**
 * Qoder CLI plugin installer.
 *
 * "Install" here just means: stage the plugin assets at a stable location
 * outside the Electron asar/source tree so that:
 *   1. Qoder CLI can read `forward.mjs` as a regular file (asar reads fail
 *      from child Node processes), and
 *   2. We can render a Qoder `--settings <path>` JSON file that points
 *      `command` at the staged forwarder.
 *
 * The flow is idempotent: every call copies `plugin.json` + `forward.mjs`
 * from source and regenerates `settings.json`. That keeps the staging dir in
 * sync with the current build even if a previous version left stale files
 * behind.
 *
 * For WSL projects the plugin must live INSIDE the distro because Qoder runs
 * there and can't read `\\wsl.localhost\` paths reliably from inside a login
 * shell. We reuse the shared `deployFilesToWslHome` primitive (the same one
 * the bridge uses for `bridge.mjs`) and emit a settings file with Linux-side
 * paths.
 */

export interface QoderPluginPaths {
  /**
   * Directory containing forward.mjs, plugin.json. For WSL contexts this is a
   * Linux path inside the distro (e.g. `/home/user/.poracode/agent-plugins/qoder`);
   * the caller must NOT pass it to native fs APIs.
   */
  pluginDir: string;
  /** Path to the generated Qoder settings file (passed via `--settings`). */
  settingsPath: string;
  /** Plugin semver from plugin.json. */
  version: string;
}

const callerDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url ?? "file://"));

const resolveSourceDir = createPluginSourceResolver({
  kind: "qoder",
  sourceEnvVar: "PORACODE_QODER_PLUGIN_SOURCE",
  callerDir,
});

/**
 * Single source of truth for the plugin semver: `plugin.json` next to this
 * package in the repo / resources tree. Used by the Qoder adapter for install
 * cache keys; `forward.mjs` reads the same file from disk next to itself at
 * runtime after staging.
 */
export function readBundledQoderPluginVersion(): string {
  return readBundledPluginVersion(resolveSourceDir);
}

function computeQoderPluginPaths(ctx?: AgentEnvContext): QoderPluginPaths {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "qoder");
    if (!wsl) return { pluginDir: "", settingsPath: "", version: "0.0.0" };
    let version = "0.0.0";
    try {
      version = readPluginManifest(wsl.uncBase).version;
    } catch {
      // staged manifest missing or distro unreachable.
    }
    return {
      pluginDir: wsl.linuxBase,
      settingsPath: `${wsl.linuxBase}/settings.json`,
      version,
    };
  }
  const pluginDir = getNativePluginBaseDir("qoder", ctx?.baseDir);
  let version = "0.0.0";
  try {
    version = readPluginManifest(pluginDir).version;
  } catch {
    // staged manifest missing; caller should run installQoderPlugin first.
  }
  return {
    pluginDir,
    settingsPath: join(pluginDir, "settings.json"),
    version,
  };
}

const qoderPluginPathsMemo = memoByCtx(computeQoderPluginPaths, ctxCacheKey);

/**
 * Compute the plugin staging dir without performing any install work.
 * Result is memoized per (envKind, wslDistro, baseDir) for the supervisor
 * lifetime — all inputs are stable across spawns. After `installQoderPlugin`
 * runs, the manifest version on disk is the same the memo would have read,
 * so re-installs don't require invalidation in practice.
 */
export function getQoderPluginPaths(ctx?: AgentEnvContext): QoderPluginPaths {
  return qoderPluginPathsMemo.call(ctx);
}

/**
 * Stage the Qoder plugin assets and write a `settings.json` that wires
 * Qoder's hook system to invoke the staged `forward.mjs`. Idempotent — safe
 * to call from every supervisor boot. For WSL contexts, assets are staged
 * into the distro's `~/.poracode/agent-plugins/qoder/` via the shared
 * `deployFilesToWslHome` helper.
 */
export interface InstallQoderPluginOptions {
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

export function installQoderPlugin(
  ctx?: AgentEnvContext,
  options?: InstallQoderPluginOptions,
): { ok: true; paths: QoderPluginPaths; version: string } | { ok: false; reason: string } {
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
          "WSL Qoder plugin install requires a resolved node path; the adapter must call resolveNodeForDistro before installing.",
      };
    }
    return installQoderPluginWsl(ctx.wslDistro, sourceDir, manifest, options.resolvedNodePath);
  }

  const pluginDir = getNativePluginBaseDir("qoder", ctx?.baseDir);
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  const settingsPath = join(pluginDir, "settings.json");
  const nativeCommands = buildNativeHookCommandHeads(wrapperPath);
  const settings = renderQoderSettings(nativeCommands.command);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");

  console.log(
    `[supervisor] Qoder hook plugin staged v${manifest.version} at ${pluginDir} (forward.mjs, ${getNativeHookWrapperFilename()}, settings.json)`,
  );

  return {
    ok: true,
    version: manifest.version,
    paths: { pluginDir, settingsPath, version: manifest.version },
  };
}

function installQoderPluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
): { ok: true; paths: QoderPluginPaths; version: string } | { ok: false; reason: string } {
  const staged = stagePluginAssetsToWsl(distro, sourceDir, "qoder", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  const linuxPluginDir = staged.linuxPluginDir;
  const linuxSettingsPath = `${linuxPluginDir}/settings.json`;
  const linuxForwardPath = `${linuxPluginDir}/forward.mjs`;
  const headExpression = buildWslHookCommandHead(resolvedNodePath, linuxForwardPath);

  const uncSettingsPath = toWslUncPath(distro, linuxSettingsPath);
  try {
    mkdirSync(dirname(uncSettingsPath), { recursive: true });
    const settings = renderQoderSettings(headExpression);
    writeFileSync(uncSettingsPath, JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    return {
      ok: false,
      reason: `failed to write Qoder settings.json in wsl distro ${distro}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  console.log(
    `[supervisor] Qoder hook plugin staged v${manifest.version} in WSL distro ${distro} at ${linuxPluginDir} (forward.mjs, settings.json) using node=${resolvedNodePath}`,
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

/**
 * Read whether the plugin is already installed at the canonical staging path
 * for the given environment.
 */
export function isQoderPluginInstalled(ctx?: AgentEnvContext): {
  installed: boolean;
  version?: string;
} {
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "qoder");
    if (!wsl) return { installed: false };
    return verifyQoderInstallAt(wsl.uncBase, "wsl");
  }
  return verifyQoderInstallAt(getNativePluginBaseDir("qoder", ctx?.baseDir), "native");
}

export function uninstallQoderPlugin(ctx?: AgentEnvContext): void {
  removeStagedPluginDir("qoder", ctx);
}

function verifyQoderInstallAt(
  readableDir: string,
  target: "native" | "wsl",
): { installed: boolean; version?: string } {
  if (!existsSync(join(readableDir, "plugin.json"))) return { installed: false };
  if (!existsSync(join(readableDir, "forward.mjs"))) return { installed: false };
  if (!existsSync(join(readableDir, FORWARD_RUNTIME_FILE))) return { installed: false };
  if (!existsSync(join(readableDir, "settings.json"))) return { installed: false };
  if (!hasNativeHookWrapper(readableDir, target)) return { installed: false };
  try {
    const version = readPluginManifest(readableDir).version;
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

interface QoderHookEntry {
  hooks: Array<{ type: "command"; command: string }>;
}

interface QoderSettings {
  hooks: Record<string, QoderHookEntry[]>;
}

/**
 * Default hooks: intents we forward for sidebar status detection.
 * Qoder fires `Stop` when the main agent finishes responding; user interrupts
 * surface through `StopFailure` / the absence of `Stop`, mirroring Claude.
 * A matcher is omitted everywhere — Qoder matches all when it's absent.
 */
const QODER_HOOK_EVENTS: readonly string[] = [
  "SessionStart",
  "UserPromptSubmit",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "ElicitationResult",
  "Notification",
  "Stop",
  "StopFailure",
];

/**
 * Build the Qoder `--settings` document. `headExpression` is the fully
 * quoted command prefix to which we append ` <event>` per hook — caller
 * decides whether that's a native wrapper path or a WSL `<node> <fwd>`
 * pair.
 */
function renderQoderSettings(headExpression: string): QoderSettings {
  const hooks: Record<string, QoderHookEntry[]> = {};
  for (const event of QODER_HOOK_EVENTS) {
    hooks[event] = [{ hooks: [{ type: "command", command: `${headExpression} ${event}` }] }];
  }
  return { hooks };
}
