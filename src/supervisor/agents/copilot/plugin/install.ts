import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toWslUncPath } from "@/shared/wsl";
import { getCachedWslHomeDirectory, type AgentEnvContext } from "../../base";
import {
  FORWARD_RUNTIME_FILE,
  buildNativeHookCommandHeads,
  buildWslHookCommandHead,
  copyForwardRuntimeFile,
  copyPluginAssetsIfStale,
  createPluginSourceResolver,
  ctxCacheKey,
  getNativePluginBaseDir,
  getSshPluginBaseDirs,
  getWslPluginBaseDirs,
  isSshPluginContext,
  isWslPluginContext,
  memoByCtx,
  readBundledPluginVersion,
  readPluginManifest,
  readSshTextFile,
  removeSshFile,
  removeStagedPluginDir,
  stagePluginAssetsToSsh,
  stagePluginAssetsToWsl,
  verifyStagedPluginAt,
  verifySshStagedPlugin,
  writeSshTextFile,
  writeNativeHookWrapper,
  type PluginManifest,
} from "../../plugin/installerBase";

/**
 * GitHub Copilot CLI plugin installer.
 *
 * Two writes per install:
 *   1. **Plugin staging** under `~/.lightcode/agent-plugins/copilot/` — copies
 *      `forward.mjs` + `plugin.json` + the shared forwarder runtime + the
 *      native wrapper script. Same shape as Claude/Codex/Gemini.
 *   2. **Global hook config** at `${COPILOT_HOME ?? ~/.copilot}/hooks/lightcode-status.json`.
 *      Copilot CLI loads this at every session regardless of cwd. Done at
 *      install time, not per-spawn — no per-project file is written.
 *
 * Both files are owned by Lightcode — we replace them on reinstall and never
 * merge into user-authored config.
 */

export interface CopilotPluginPaths {
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

const COPILOT_HOOK_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "userPromptSubmitted",
  "preToolUse",
  "postToolUse",
  "errorOccurred",
] as const;

const GLOBAL_HOOK_FILENAME = "lightcode-status.json";
const GLOBAL_HOOK_DIR_NAME = "hooks";
const HOOK_TIMEOUT_SEC = 5;

const callerDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url ?? "file://"));

const resolveSourceDir = createPluginSourceResolver({
  kind: "copilot",
  sourceEnvVar: "LIGHTCODE_COPILOT_PLUGIN_SOURCE",
  callerDir,
});

export function readBundledCopilotPluginVersion(): string {
  return readBundledPluginVersion(resolveSourceDir);
}

/**
 * Resolve the user-level Copilot config dir on the host.
 *
 * Honors `COPILOT_HOME`; otherwise defaults to `~/.copilot` per
 * https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference.
 */
function nativeGlobalCopilotDir(): string {
  const override = process.env.COPILOT_HOME;
  if (override && override.trim().length > 0) {
    return resolve(override);
  }
  return join(homedir(), ".copilot");
}

/**
 * Resolve the user-level Copilot config dir inside a WSL distro. We don't read
 * `COPILOT_HOME` from inside the distro (the host can't introspect distro env);
 * always default to `$HOME/.copilot`.
 */
function wslGlobalCopilotDir(distro: string): string {
  const home = getCachedWslHomeDirectory(distro);
  return home ? `${home}/.copilot` : "";
}

function computeCopilotPluginPaths(ctx?: AgentEnvContext): CopilotPluginPaths {
  if (isSshPluginContext(ctx)) {
    const ssh = getSshPluginBaseDirs(ctx, "copilot");
    if (!ssh) return { pluginDir: "", globalHookFilePath: "", version: "0.0.0" };
    return {
      pluginDir: ssh.linuxBase,
      globalHookFilePath: `${ssh.home}/.copilot/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`,
      version: "0.0.0",
    };
  }
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "copilot");
    if (!wsl) return { pluginDir: "", globalHookFilePath: "", version: "0.0.0" };
    let version = "0.0.0";
    try {
      version = readPluginManifest(wsl.uncBase).version;
    } catch {
      // staged manifest missing or distro unreachable
    }
    const copilotDir = wslGlobalCopilotDir(ctx.wslDistro);
    return {
      pluginDir: wsl.linuxBase,
      globalHookFilePath: copilotDir
        ? `${copilotDir}/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`
        : "",
      version,
    };
  }
  const pluginDir = getNativePluginBaseDir("copilot", ctx?.baseDir);
  let version = "0.0.0";
  try {
    version = readPluginManifest(pluginDir).version;
  } catch {
    // staged manifest missing; caller should run installCopilotPlugin first.
  }
  return {
    pluginDir,
    globalHookFilePath: join(nativeGlobalCopilotDir(), GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME),
    version,
  };
}

const copilotPluginPathsMemo = memoByCtx(computeCopilotPluginPaths, ctxCacheKey);

/** Compute the plugin staging dir without performing any install work. */
export function getCopilotPluginPaths(ctx?: AgentEnvContext): CopilotPluginPaths {
  return copilotPluginPathsMemo.call(ctx);
}

export interface InstallCopilotPluginOptions {
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
   * Override `~/.copilot` (or the WSL distro equivalent) when writing the
   * global hook file. Tests pass a temp dir to avoid touching the user's
   * real Copilot config; production calls leave this undefined.
   */
  globalCopilotDirOverride?: string;
}

export function installCopilotPlugin(
  ctx?: AgentEnvContext,
  options?: InstallCopilotPluginOptions,
): { ok: true; paths: CopilotPluginPaths; version: string } | { ok: false; reason: string } {
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
          "WSL Copilot plugin install requires a resolved node path; the adapter must call resolveNodeForDistro before installing.",
      };
    }
    return installCopilotPluginWsl(
      ctx.wslDistro,
      sourceDir,
      manifest,
      options.resolvedNodePath,
      options.globalCopilotDirOverride,
    );
  }
  if (isSshPluginContext(ctx)) {
    if (!options?.resolvedNodePath) {
      return {
        ok: false,
        reason: "SSH Copilot plugin install requires a resolved node path on the remote host.",
      };
    }
    return installCopilotPluginSsh(
      ctx,
      sourceDir,
      manifest,
      options.resolvedNodePath,
      options.globalCopilotDirOverride,
    );
  }

  const pluginDir = getNativePluginBaseDir("copilot", ctx?.baseDir);
  mkdirSync(pluginDir, { recursive: true });
  copyPluginAssetsIfStale(sourceDir, pluginDir);
  copyForwardRuntimeFile(pluginDir);
  const wrapperPath = writeNativeHookWrapper(pluginDir, {
    ...(options?.resolvedNodePath ? { nodePath: options.resolvedNodePath } : {}),
  });

  const globalCopilotDir = options?.globalCopilotDirOverride ?? nativeGlobalCopilotDir();
  const hookFilePath = join(globalCopilotDir, GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME);

  const nativeCommands = buildNativeHookCommandHeads(wrapperPath);

  const writeResult = writeCopilotHookFileIfChanged(hookFilePath, {
    bashCommand: nativeCommands.bashCommand,
    ...(nativeCommands.powershellCommand
      ? { powershellCommand: nativeCommands.powershellCommand }
      : {}),
  });
  if (!writeResult.ok) return writeResult;

  console.log(
    [
      `[supervisor] Copilot hook plugin staged v${manifest.version}`,
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

function installCopilotPluginSsh(
  ctx: AgentEnvContext & { envKind: "ssh"; sshHost: string },
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
  globalCopilotDirOverride: string | undefined,
): { ok: true; paths: CopilotPluginPaths; version: string } | { ok: false; reason: string } {
  const staged = stagePluginAssetsToSsh(ctx, sourceDir, "copilot", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  const linuxForward = `${staged.linuxPluginDir}/forward.mjs`;
  const linuxCopilotDir = globalCopilotDirOverride ?? `${staged.deploy.home}/.copilot`;
  const hookFilePath = `${linuxCopilotDir}/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`;
  const bashCommand = buildWslHookCommandHead(resolvedNodePath, linuxForward);
  const writeResult = writeSshCopilotHookFileIfChanged(ctx, hookFilePath, { bashCommand });
  if (!writeResult.ok) {
    return {
      ok: false,
      reason: `failed to write Copilot hook file at ${hookFilePath} on ssh host ${ctx.sshHost}: ${writeResult.reason}`,
    };
  }

  console.log(
    [
      `[supervisor] Copilot hook plugin staged v${manifest.version} on SSH host ${ctx.sshHost}`,
      `  pluginDir: ${staged.linuxPluginDir}`,
      `  hookFile: ${hookFilePath}`,
    ].join("\n"),
  );

  return {
    ok: true,
    version: manifest.version,
    paths: {
      pluginDir: staged.linuxPluginDir,
      globalHookFilePath: hookFilePath,
      version: manifest.version,
    },
  };
}

function installCopilotPluginWsl(
  distro: string,
  sourceDir: string,
  manifest: PluginManifest,
  resolvedNodePath: string,
  globalCopilotDirOverride: string | undefined,
): { ok: true; paths: CopilotPluginPaths; version: string } | { ok: false; reason: string } {
  const staged = stagePluginAssetsToWsl(distro, sourceDir, "copilot", {
    includeForwardRuntime: true,
  });
  if (!staged.ok) return staged;

  const linuxForward = `${staged.linuxPluginDir}/forward.mjs`;
  const linuxCopilotDir = globalCopilotDirOverride ?? `${staged.deploy.home}/.copilot`;
  const linuxHookFilePath = `${linuxCopilotDir}/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`;
  const uncHookFilePath = toWslUncPath(distro, linuxHookFilePath);

  const bashCommand = buildWslHookCommandHead(resolvedNodePath, linuxForward);

  const writeResult = writeCopilotHookFileIfChanged(uncHookFilePath, { bashCommand });
  if (!writeResult.ok) {
    return {
      ok: false,
      reason: `failed to write Copilot hook file at ${linuxHookFilePath} in wsl distro ${distro}: ${writeResult.reason}`,
    };
  }

  console.log(
    [
      `[supervisor] Copilot hook plugin staged v${manifest.version} in WSL distro ${distro}`,
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

const COPILOT_VERIFY_ASSETS = ["plugin.json", "forward.mjs", FORWARD_RUNTIME_FILE] as const;

export function isCopilotPluginInstalled(ctx?: AgentEnvContext): {
  installed: boolean;
  version?: string;
} {
  if (isSshPluginContext(ctx)) {
    const paths = getCopilotPluginPaths(ctx);
    return verifySshStagedPlugin(ctx, "copilot", {
      assets: COPILOT_VERIFY_ASSETS,
      extraCheck: () => readSshTextFile(ctx, paths.globalHookFilePath) !== undefined,
    });
  }
  if (isWslPluginContext(ctx)) {
    const wsl = getWslPluginBaseDirs(ctx.wslDistro, "copilot");
    if (!wsl) return { installed: false };
    const copilotDir = wslGlobalCopilotDir(ctx.wslDistro);
    const hookFile = copilotDir
      ? toWslUncPath(ctx.wslDistro, `${copilotDir}/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`)
      : "";
    return verifyStagedPluginAt(wsl.uncBase, "wsl", {
      assets: COPILOT_VERIFY_ASSETS,
      extraCheck: () => hookFile.length > 0 && existsSync(hookFile),
    });
  }
  const hookFile = join(nativeGlobalCopilotDir(), GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME);
  return verifyStagedPluginAt(getNativePluginBaseDir("copilot", ctx?.baseDir), "native", {
    assets: COPILOT_VERIFY_ASSETS,
    extraCheck: () => existsSync(hookFile),
  });
}

export function uninstallCopilotPlugin(ctx?: AgentEnvContext): void {
  if (isSshPluginContext(ctx)) {
    const paths = getCopilotPluginPaths(ctx);
    if (readSshTextFile(ctx, paths.globalHookFilePath) !== undefined) {
      removeSshFile(ctx, paths.globalHookFilePath);
    }
    removeStagedPluginDir("copilot", ctx);
    return;
  }
  const hookFile = isWslPluginContext(ctx)
    ? toWslUncPath(
        ctx.wslDistro,
        `${wslGlobalCopilotDir(ctx.wslDistro)}/${GLOBAL_HOOK_DIR_NAME}/${GLOBAL_HOOK_FILENAME}`,
      )
    : join(nativeGlobalCopilotDir(), GLOBAL_HOOK_DIR_NAME, GLOBAL_HOOK_FILENAME);
  try {
    if (existsSync(hookFile)) unlinkSync(hookFile);
  } catch {
    // best-effort uninstall
  }
  removeStagedPluginDir("copilot", ctx);
}

// ── Hook config rendering / write ─────────────────────────────────────────

interface CopilotHookCommand {
  type: "command";
  bash?: string;
  powershell?: string;
  timeoutSec: number;
}

interface CopilotHookConfig {
  version: 1;
  hooks: Record<string, CopilotHookCommand[]>;
}

/**
 * Render the user-global hook config that points Copilot CLI at our staged
 * forwarder. `bashCommand` is set for POSIX/WSL targets, `powershellCommand`
 * for Windows native targets. Both are populated when applicable so the file
 * is portable across mixed-platform shells.
 */
export function renderCopilotHookConfig(input: {
  bashCommand?: string | undefined;
  powershellCommand?: string | undefined;
}): CopilotHookConfig {
  const hooks: Record<string, CopilotHookCommand[]> = {};
  for (const event of COPILOT_HOOK_EVENTS) {
    const cmd: CopilotHookCommand = { type: "command", timeoutSec: HOOK_TIMEOUT_SEC };
    if (input.bashCommand) cmd.bash = `${input.bashCommand} ${event}`;
    if (input.powershellCommand) cmd.powershell = `${input.powershellCommand} ${event}`;
    hooks[event] = [cmd];
  }
  return { version: 1, hooks };
}

/**
 * Write the hook config file if the on-disk content differs from the rendered
 * value. Idempotent: identical content means no write (and so no mtime bump),
 * matching the pattern used by Cursor and Codex installers.
 */
function writeCopilotHookFileIfChanged(
  hookFilePath: string,
  input: { bashCommand?: string | undefined; powershellCommand?: string | undefined },
): { ok: true } | { ok: false; reason: string } {
  const serialized = `${JSON.stringify(renderCopilotHookConfig(input), null, 2)}\n`;
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

function writeSshCopilotHookFileIfChanged(
  ctx: AgentEnvContext & { envKind: "ssh"; sshHost: string },
  hookFilePath: string,
  input: { bashCommand: string; powershellCommand?: string },
): { ok: true } | { ok: false; reason: string } {
  const serialized = `${JSON.stringify(renderCopilotHookConfig(input), null, 2)}\n`;
  if (readSshTextFile(ctx, hookFilePath) === serialized) return { ok: true };
  return writeSshTextFile(ctx, hookFilePath, serialized);
}

/** Exposed for tests. */
export { COPILOT_HOOK_EVENTS, GLOBAL_HOOK_FILENAME, GLOBAL_HOOK_DIR_NAME };
