import {
  constants as fsConstants,
  copyFileSync,
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { toWslUncPath } from "@/shared/wsl";
import { detectPowerShell } from "../../shellPreference";
import {
  getCachedWslHomeDirectory,
  resolveExecutablePath,
  resolveWslHomeDirectoryAsync,
  type AgentEnvContext,
} from "../base";
import { deployFilesToWslHome, type WslHomeDeployResult } from "../../wsl/wslDeploy";

/**
 * Shared plumbing for provider hook plugin installers (claude/codex/gemini).
 * Each provider keeps its hook-event list, settings/hooks document shape, and
 * intent map private; this module only handles the generic plumbing — source
 * resolution, manifest reading, asset copy/freshness, and WSL path math.
 */

export const PLUGIN_ASSET_FILES = ["plugin.json", "forward.mjs"] as const;

export interface PluginManifest {
  version: string;
  [key: string]: unknown;
}

export type WslAgentEnvContext = AgentEnvContext & { envKind: "wsl"; wslDistro: string };

export function isWslPluginContext(ctx: AgentEnvContext | undefined): ctx is WslAgentEnvContext {
  return Boolean(ctx && ctx.envKind === "wsl" && ctx.wslDistro);
}

export interface PluginSourceResolverOptions {
  kind: string;
  /** Env var override for the source dir, e.g. `PORACODE_CLAUDE_PLUGIN_SOURCE`. */
  sourceEnvVar: string;
  /**
   * `__dirname` of the *caller* (the provider's install.ts). Fallback candidate
   * paths are computed relative to this so both bundled and source-checkout
   * layouts resolve correctly.
   */
  callerDir: string;
}

/**
 * Memoized per-call: the first successful resolve is cached for the lifetime
 * of the closure. The `PORACODE_*_PLUGIN_SOURCE` env override is therefore
 * read only on the first call; subsequent env mutations are ignored.
 */
export function createPluginSourceResolver(opts: PluginSourceResolverOptions): () => string {
  let cached: string | undefined;
  return () => {
    if (cached) return cached;
    const candidates: string[] = [];
    const override = process.env[opts.sourceEnvVar];
    if (override) candidates.push(resolve(override));
    if (typeof process.resourcesPath === "string" && process.resourcesPath.length > 0) {
      candidates.push(join(process.resourcesPath, "agent-plugins", opts.kind));
    }
    candidates.push(resolve(opts.callerDir));
    candidates.push(resolve(opts.callerDir, `../../../agent-plugins/${opts.kind}`));
    candidates.push(resolve(opts.callerDir, `../../src/supervisor/agents/${opts.kind}/plugin`));
    candidates.push(resolve(opts.callerDir, `../../../src/supervisor/agents/${opts.kind}/plugin`));
    candidates.push(resolve(opts.callerDir, `../../resources/agent-plugins/${opts.kind}`));
    candidates.push(resolve(opts.callerDir, `../resources/agent-plugins/${opts.kind}`));
    for (const candidate of candidates) {
      if (existsSync(join(candidate, "plugin.json"))) {
        cached = candidate;
        return candidate;
      }
    }
    throw new Error(`${opts.kind} plugin source dir not found; checked: ${candidates.join(", ")}`);
  };
}

export function readPluginManifest(dir: string): PluginManifest {
  const raw = readFileSync(join(dir, "plugin.json"), "utf8");
  return JSON.parse(raw) as PluginManifest;
}

export function readBundledPluginVersion(resolveSourceDir: () => string): string {
  try {
    const v = readPluginManifest(resolveSourceDir()).version;
    return typeof v === "string" && v.length > 0 ? v : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function copyPluginAssetFile(source: string, target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

export function isPluginAssetsFresh(
  sourceDir: string,
  targetDir: string,
  files: readonly string[] = PLUGIN_ASSET_FILES,
): boolean {
  for (const file of files) {
    try {
      const sourceStat = statSync(join(sourceDir, file));
      const targetStat = statSync(join(targetDir, file));
      if (sourceStat.size !== targetStat.size) return false;
      if (sourceStat.mtimeMs > targetStat.mtimeMs) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function copyPluginAssetsIfStale(
  sourceDir: string,
  targetDir: string,
  files: readonly string[] = PLUGIN_ASSET_FILES,
): void {
  if (isPluginAssetsFresh(sourceDir, targetDir, files)) return;
  for (const file of files) {
    copyPluginAssetFile(join(sourceDir, file), join(targetDir, file));
  }
}

/**
 * Quote a path for embedding in a hook command line. POSIX shells and Claude's
 * settings reader want single-quoted; Windows cmd inside a JSON command field
 * wants double-quoted with embedded `"` escaped.
 */
export function quoteHookCommandArg(value: string, target: "native" | "wsl"): string {
  if (target === "native" && process.platform === "win32") {
    return `"${value.replaceAll('"', '\\"')}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Native hook command heads for staged hook wrappers.
 *
 * On Windows, prefer invoking the staged PowerShell wrapper directly. Claude
 * runs hook commands through its own Windows shell layer, and nesting another
 * `cmd.exe /c call ...` can leave the JSON hook payload to be interpreted by
 * an interactive cmd prompt instead of being delivered to the forwarder.
 * Keep the `.cmd` wrapper as the final fallback for machines without either
 * PowerShell 7 or Windows PowerShell.
 */
export interface NativeHookCommandHeads {
  /**
   * Generic hook command field used by providers whose hook config exposes a
   * single shell command string (Claude/Codex/Gemini/Cursor).
   */
  command: string;
  /**
   * Bash-specific hook command for providers with per-shell config fields
   * (Copilot). Uses the staged cmd/sh wrapper path.
   */
  bashCommand: string;
  /**
   * PowerShell-specific hook command for providers with per-shell config
   * fields. On Windows this targets the staged ps1 wrapper directly.
   */
  powershellCommand?: string;
}

export function buildNativeHookCommandHeads(
  wrapperPath: string,
  resolvePath: (command: string) => string | undefined = resolveExecutablePath,
): NativeHookCommandHeads {
  const bashCommand = quoteHookCommandArg(wrapperPath, "wsl");
  if (process.platform === "win32") {
    const ps1Path = join(dirname(wrapperPath), getNativeHookPowerShellWrapperFilename());
    const powershellCommand = `& ${quotePowerShellSingleQuoted(ps1Path)}`;
    const detectedShell = detectPowerShell(resolvePath);
    const shell = detectedShell && quoteHookCommandArg(detectedShell.path, "native");
    if (shell) {
      return {
        command: `${shell} -NoProfile -ExecutionPolicy Bypass -File ${quoteHookCommandArg(ps1Path, "native")}`,
        bashCommand,
        powershellCommand,
      };
    }
    return {
      command: `cmd.exe /d /s /c call ${quoteHookCommandArg(wrapperPath, "native")}`,
      bashCommand,
      powershellCommand,
    };
  }
  return { command: quoteHookCommandArg(wrapperPath, "native"), bashCommand };
}

/** Back-compat convenience for callers that only need the generic command field. */
export function buildNativeHookCommandHead(
  wrapperPath: string,
  resolvePath: (command: string) => string | undefined = resolveExecutablePath,
): string {
  return buildNativeHookCommandHeads(wrapperPath, resolvePath).command;
}

/**
 * Native hook command head that avoids referencing `pwsh.exe` / `powershell.exe`
 * in the command string on Windows.
 *
 * Cursor's hook runner reacts to a `pwsh.exe` token in the configured command
 * by wrapping the host-provided JSON input in a PowerShell here-string
 * pipeline (`@'<json>'@ | & <command>`) — but executes that wrapped script
 * through the shell it found on PATH (sh/bash via Git for Windows on most
 * developer machines), which can't parse PowerShell syntax and aborts with
 * `eval: line 3: syntax error near unexpected token '&'`. Routing through the
 * staged `poracode-hook.cmd` wrapper via `cmd.exe /d /s /c call …` keeps the
 * command pwsh-free and works under both sh and cmd shells. POSIX hosts get
 * the same shape as `buildNativeHookCommandHead`.
 */
export function buildNativeHookCmdShellCommand(wrapperPath: string): string {
  if (process.platform === "win32") {
    return `cmd.exe /d /s /c call ${quoteHookCommandArg(wrapperPath, "native")}`;
  }
  return quoteHookCommandArg(wrapperPath, "native");
}

export interface WslPluginBaseDirs {
  /** Linux home dir, e.g. `/home/sdsle`. */
  home: string;
  /** Linux-side plugin dir inside the distro. */
  linuxBase: string;
  /** Windows UNC path to that Linux plugin dir, for `fs.*` access from Win32. */
  uncBase: string;
}

export function getWslPluginBaseDirs(distro: string, kind: string): WslPluginBaseDirs | undefined {
  const home = getCachedWslHomeDirectory(distro);
  if (!home) return undefined;
  const linuxBase = `${home}/.poracode/agent-plugins/${kind}`;
  return { home, linuxBase, uncBase: toWslUncPath(distro, linuxBase) };
}

export function getNativePluginBaseDir(kind: string, baseDir?: string): string {
  const paths = resolvePoracodePaths(baseDir);
  return join(paths.agentPluginsDir, kind);
}

export function removeStagedPluginDir(kind: string, ctx?: AgentEnvContext): void {
  const dir = isWslPluginContext(ctx)
    ? getWslPluginBaseDirs(ctx.wslDistro, kind)?.uncBase
    : getNativePluginBaseDir(kind, ctx?.baseDir);
  if (!dir) return;
  removeWithoutFollowingSymlinks(dir);
}

// `fs.rmSync({ recursive: true, force: true })` is unreliable here because
// codex stages a `home/` subdir whose contents are Windows junctions (e.g.
// `sessions/ → ~/.codex/sessions`) and POSIX symlinks (over WSL UNC). On
// Windows the recursive remover can either follow the junction and EPERM
// inside the user's real `~/.codex/`, or leave the symlink behind so the
// parent dir reports ENOTEMPTY. Walk the tree ourselves, lstat every entry,
// and remove links via their own inode without ever following them.
function removeWithoutFollowingSymlinks(target: string): void {
  let stat;
  try {
    stat = lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink()) {
    try {
      unlinkSync(target);
    } catch (error) {
      // Windows directory junctions can report ENOENT on unlink yet need
      // rmdir to be removed; EPERM/EISDIR is the other shape Node returns.
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EISDIR") {
        rmdirSync(target);
        return;
      }
      throw error;
    }
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(target)) {
      removeWithoutFollowingSymlinks(join(target, entry));
    }
    rmdirSync(target);
    return;
  }
  unlinkSync(target);
}

/**
 * Generic in-memory memo over a callable. Keyed by `keyFn(...args)`. Intended
 * for closure-scoped caches inside individual adapters (path resolution, node
 * resolution, project-hook install). Process-lifetime cache; no TTL. Pass an
 * `invalidate(key)` returned alongside the wrapped fn to clear an entry after
 * a write that should re-trigger the underlying op next time.
 */
export function memoByCtx<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  keyFn: (...args: TArgs) => string,
): {
  call: (...args: TArgs) => TResult;
  invalidate: (...args: TArgs) => void;
  clear: () => void;
} {
  const cache = new Map<string, TResult>();
  return {
    call(...args: TArgs): TResult {
      const key = keyFn(...args);
      if (cache.has(key)) return cache.get(key) as TResult;
      const value = fn(...args);
      cache.set(key, value);
      return value;
    },
    invalidate(...args: TArgs): void {
      cache.delete(keyFn(...args));
    },
    clear(): void {
      cache.clear();
    },
  };
}

/** Stable string key for an `AgentEnvContext`. Process-local; not for persistence. */
export function ctxCacheKey(ctx: AgentEnvContext | undefined): string {
  if (!ctx) return "no-ctx";
  return `${ctx.envKind}|${ctx.wslDistro ?? ""}|${ctx.baseDir ?? ""}`;
}

/**
 * Print a one-line warning at module load when a provider's bundled plugin
 * manifest is missing (the `0.0.0` sentinel from `readBundledPluginVersion`).
 * The coordinator treats `0.0.0` as a no-cache retry-on-success state.
 *
 * Optionally pass `devHint` to surface the path layout that contributors
 * should check (dev source dir, packaged resources dir, prepare script).
 */
export function warnIfPluginManifestMissing(kind: string, version: string, devHint?: string): void {
  if (version !== "0.0.0") return;
  let message =
    `[${kind}] plugin manifest not found at module load — CLI hooks disabled for this session. ` +
    "If you just added the plugin files, restart the app to enable hooks.";
  if (devHint) message += ` ${devHint}`;
  console.warn(message);
}

// ── Native hook wrapper ──────────────────────────────────────────────────

/**
 * Filename of the per-plugin native hook wrapper. The wrapper sits next
 * to `forward.mjs` in the plugin staging dir and runs `forward.mjs` under
 * poracode's bundled Electron Node via `ELECTRON_RUN_AS_NODE=1`. On
 * Windows we write a `.cmd` because cmd.exe doesn't accept inline
 * `VAR=val` prefixes; everywhere else we write a POSIX `.sh`.
 */
export function getNativeHookWrapperFilename(): string {
  return process.platform === "win32" ? "poracode-hook.cmd" : "poracode-hook.sh";
}

function getNativeHookPowerShellWrapperFilename(): string {
  return "poracode-hook.ps1";
}

/**
 * Render the wrapper script body. Two shapes:
 *
 *   - When `nodePath` is provided, the wrapper invokes that bare Node
 *     binary directly — fastest path (~30–50 ms cold) and what we always
 *     prefer.
 *   - Otherwise it falls back to running poracode's bundled Electron
 *     binary with `ELECTRON_RUN_AS_NODE=1`, which still produces a
 *     working Node runtime but pays a ~150 ms startup tax per spawn.
 *
 * `electronPath` is baked in absolute (typically `process.execPath`) so
 * the wrapper doesn't depend on PATH or env-var inheritance. `forward.mjs`
 * is resolved relative to the wrapper at runtime — keeps the wrapper
 * portable if the staging dir is relocated.
 */
export interface RenderNativeHookWrapperOptions {
  /** poracode's bundled Electron binary, used as the fallback runtime. */
  electronPath: string;
  /** Absolute path to a usable native Node binary (preferred runtime). */
  nodePath?: string;
}

function quotePowerShellSingleQuoted(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderNativeHookPowerShellWrapper(opts: RenderNativeHookWrapperOptions): string {
  const useElectron = !opts.nodePath;
  const bin = opts.nodePath ?? opts.electronPath;
  return [
    "$ErrorActionPreference = 'Stop'",
    ...(useElectron ? ["$env:ELECTRON_RUN_AS_NODE = '1'"] : []),
    `$forward = Join-Path $PSScriptRoot 'forward.mjs'`,
    `& ${quotePowerShellSingleQuoted(bin)} $forward @args`,
    "exit $LASTEXITCODE",
    "",
  ].join("\r\n");
}

export function renderNativeHookWrapper(opts: RenderNativeHookWrapperOptions): string {
  const useElectron = !opts.nodePath;
  const bin = opts.nodePath ?? opts.electronPath;
  if (process.platform === "win32") {
    const safe = bin.replaceAll('"', '""');
    const ps1 = getNativeHookPowerShellWrapperFilename();
    const lines = [
      "@echo off",
      "setlocal",
      "where pwsh.exe >nul 2>nul",
      "if not errorlevel 1 (",
      `  pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0${ps1}" %*`,
      "  exit /b %errorlevel%",
      ")",
      "where powershell.exe >nul 2>nul",
      "if not errorlevel 1 (",
      `  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0${ps1}" %*`,
      "  exit /b %errorlevel%",
      ")",
    ];
    if (useElectron) lines.push("set ELECTRON_RUN_AS_NODE=1");
    lines.push(`"${safe}" "%~dp0forward.mjs" %*`, "");
    return lines.join("\r\n");
  }
  const safe = bin.replaceAll("'", "'\\''");
  const envPrefix = useElectron ? "env ELECTRON_RUN_AS_NODE=1 " : "";
  return [
    "#!/bin/sh",
    'dir=$(dirname "$0")',
    `exec ${envPrefix}'${safe}' "$dir/forward.mjs" "$@"`,
    "",
  ].join("\n");
}

/**
 * Write the native hook wrapper into `pluginDir` next to `forward.mjs`.
 * Chmods to 0755 on POSIX. Returns the absolute path to the wrapper
 * (suitable for use as a hook command in agent settings).
 *
 * `nodePath`, when provided, makes the wrapper exec a bare Node binary
 * instead of `ELECTRON_RUN_AS_NODE=1` — preferred path because it shaves
 * ~100–200 ms off every hook spawn (smaller binary, no Chromium init).
 *
 * `electronPath` overrides `process.execPath` for the fallback case. Useful
 * for tests and for the rare case where the supervisor itself is running
 * under bare Node (e.g. `pnpm tsx`) instead of inside the Electron
 * binary; production callers should leave it undefined.
 */
export interface WriteNativeHookWrapperOptions {
  electronPath?: string;
  nodePath?: string;
}

export function writeNativeHookWrapper(
  pluginDir: string,
  options?: WriteNativeHookWrapperOptions,
): string {
  const filename = getNativeHookWrapperFilename();
  const target = join(pluginDir, filename);
  const body = renderNativeHookWrapper({
    electronPath: options?.electronPath ?? process.execPath,
    ...(options?.nodePath ? { nodePath: options.nodePath } : {}),
  });
  mkdirSync(pluginDir, { recursive: true });
  let needsWrite = true;
  try {
    needsWrite = readFileSync(target, "utf8") !== body;
  } catch {
    // File missing or unreadable — fall through to writeFileSync below.
  }
  if (needsWrite) writeFileSync(target, body, "utf8");
  if (process.platform === "win32") {
    const psTarget = join(pluginDir, getNativeHookPowerShellWrapperFilename());
    const psBody = renderNativeHookPowerShellWrapper({
      electronPath: options?.electronPath ?? process.execPath,
      ...(options?.nodePath ? { nodePath: options.nodePath } : {}),
    });
    let needsPowerShellWrite = true;
    try {
      needsPowerShellWrite = readFileSync(psTarget, "utf8") !== psBody;
    } catch {
      // File missing or unreadable — fall through to writeFileSync below.
    }
    if (needsPowerShellWrite) writeFileSync(psTarget, psBody, "utf8");
  }
  if (process.platform !== "win32") {
    try {
      chmodSync(target, 0o755);
    } catch {
      // Best-effort; subsequent exec will surface a clearer error.
    }
  }
  return target;
}

/**
 * Verify the native wrapper is staged when the install context is native.
 * WSL installs bake the absolute node path into the hook command directly
 * and don't use a wrapper.
 */
export function hasNativeHookWrapper(readableDir: string, target: "native" | "wsl"): boolean {
  if (target === "wsl") return true;
  return existsSync(join(readableDir, getNativeHookWrapperFilename()));
}

/**
 * WSL hook command head: `'<absolute-node-path>' '<forward.mjs-path>'`.
 * Used by Claude/Codex/Gemini to render hook commands that pass an
 * absolute node path so /bin/sh -c never falls back to PATH lookup.
 */
export function buildWslHookCommandHead(nodePath: string, forwardMjsPath: string): string {
  return `${quoteHookCommandArg(nodePath, "wsl")} ${quoteHookCommandArg(forwardMjsPath, "wsl")}`;
}

/**
 * Resolve an absolute Node path the installer should bake into the hook
 * command. Three paths:
 *
 *   - **WSL:** required. Pulled from `resolveNodeForDistro`, which probes
 *     the user's login shell and falls back to downloading the pinned LTS
 *     into the distro. Failure is fatal — the installer reports it and the
 *     adapter surfaces a degraded state.
 *
 *   - **Native:** preferred. When the host has a usable Node binary (managed
 *     fast path → user login-shell probe), we bake that path in directly,
 *     skipping the ~100–200 ms Electron-as-Node startup tax. On a miss the
 *     resolver kicks off a background download for next boot, and this
 *     call returns `{ ok: true }` with no `nodePath` — the wrapper falls
 *     back to Electron-as-Node for this session.
 *
 *   - **Bare Node supervisor (`pnpm tsx`)**: tests/dev. Same as native, just
 *     no Electron. Probe still resolves the user's node; if not, the
 *     wrapper exec'ing `process.execPath` produces a working runtime.
 *
 * Native resolution is best-effort: any error inside the probe is swallowed
 * and treated as "no native node available" so a flaky shell rc never
 * fails plugin install.
 */
export async function resolveInstallNodePath(
  ctx: AgentEnvContext | undefined,
): Promise<{ ok: true; nodePath?: string } | { ok: false; reason: string }> {
  if (ctx && ctx.envKind === "wsl" && ctx.wslDistro) {
    try {
      const { resolveNodeForDistro } = await import("../../wsl/runtime");
      const resolved = await resolveNodeForDistro(ctx.wslDistro);
      await resolveWslHomeDirectoryAsync(ctx.wslDistro);
      return { ok: true, nodePath: resolved.nodePath };
    } catch (error) {
      return {
        ok: false,
        reason: `failed to resolve node in WSL distro ${ctx.wslDistro}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  try {
    const { resolveNativeNode } = await import("../../native/runtime");
    const baseDirOpts = ctx?.baseDir ? { baseDir: ctx.baseDir } : {};
    const resolved = await resolveNativeNode(baseDirOpts);
    if (resolved) return { ok: true, nodePath: resolved.nodePath };
    return { ok: true };
  } catch {
    // Probe failed — fall back to Electron-as-Node by returning no nodePath.
    return { ok: true };
  }
}

// ── Shared hooks.json IO ─────────────────────────────────────────────────

/**
 * Read and JSON-parse a hooks document. Empty or zero-filled files are treated
 * as an empty document. Returns `null` if the file is missing or otherwise
 * unparseable — callers can then distinguish "missing" from "malformed" by
 * following with `existsSync(path)` if they need to.
 */
export function parseExistingHooksJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    const buffer = readFileSync(path);
    for (const text of hooksJsonTextCandidates(buffer)) {
      if (text.trim() === "") return {};
      try {
        return JSON.parse(text) as unknown;
      } catch {
        // Try the next plausible encoding/sanitized variant.
      }
    }
    return null;
  } catch {
    return null;
  }
}

function hooksJsonTextCandidates(buffer: Buffer): string[] {
  const candidates = [stripLeadingJsonPadding(buffer.toString("utf8"))];

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    candidates.push(stripLeadingJsonPadding(buffer.subarray(2).toString("utf16le")));
  } else if (looksLikeUtf16Le(buffer)) {
    candidates.push(stripLeadingJsonPadding(buffer.toString("utf16le")));
  }

  return [...new Set(candidates)];
}

function stripLeadingJsonPadding(text: string): string {
  let start = 0;
  while (
    start < text.length &&
    (text.charCodeAt(start) === 0 || text.charCodeAt(start) === 0xfeff)
  ) {
    start += 1;
  }
  return start > 0 ? text.slice(start) : text;
}

function looksLikeUtf16Le(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 256);
  if (sampleLength < 4) return false;

  let oddNulls = 0;
  let evenNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }

  return oddNulls > sampleLength / 4 && evenNulls < oddNulls / 4;
}

/** Write a hooks document with stable 2-space indent and trailing newline. */
export function writeHooksJsonFile(path: string, doc: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

// ── Shared private-home state mirroring ──────────────────────────────────

/**
 * `lstatSync`-based existence check that succeeds for symlinks even when
 * their target is missing — matches the semantics installers want when
 * deciding whether to (re)create a state link.
 */
export function pathExistsOrSymlink(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirror a global-home file/dir into a private agent-home dir, preferring
 * symlinks. Falls back to hardlink, then file copy on platforms where
 * symlinks are restricted (e.g. Windows without dev mode). Skips when the
 * source is missing — the agent CLI is expected to recreate state on first
 * use in that case.
 */
export function ensureNativeStateLink(source: string, target: string, kind: "dir" | "file"): void {
  if (pathExistsOrSymlink(target)) return;
  if (!existsSync(source)) return;
  mkdirSync(dirname(target), { recursive: true });
  try {
    symlinkSync(source, target, kind === "dir" && process.platform === "win32" ? "junction" : kind);
    return;
  } catch {
    // Fall through to hard-link/copy compatibility.
  }
  if (kind === "file") {
    try {
      linkSync(source, target);
      return;
    } catch {
      try {
        copyFileSync(source, target, fsConstants.COPYFILE_EXCL);
      } catch {
        // Best-effort; the agent CLI will recreate state if missing.
      }
    }
  }
}

// ── Shared forward.mjs runtime ───────────────────────────────────────────

/**
 * Filename of the shared forwarder runtime that ships next to each provider's
 * `forward.mjs` in the staging dir. Each `forward.mjs` imports it as a
 * sibling (`./poracode-hook-runtime.mjs`) and calls `runForwarder({...})`.
 */
export const FORWARD_RUNTIME_FILE = "poracode-hook-runtime.mjs";

let cachedRuntimeSourcePath: string | undefined;

/**
 * Resolve the canonical `poracode-hook-runtime.mjs` source path. Mirrors
 * `createPluginSourceResolver`: checks packaged `<resources>/agent-plugins/
 * _runtime/`, then dev candidates relative to this module's location.
 * Memoized for the supervisor lifetime.
 */
export function resolveForwardRuntimeSourcePath(): string {
  if (cachedRuntimeSourcePath) return cachedRuntimeSourcePath;
  const callerDir = __dirname;
  const candidates: string[] = [];
  if (typeof process.resourcesPath === "string" && process.resourcesPath.length > 0) {
    candidates.push(join(process.resourcesPath, "agent-plugins", "_runtime", FORWARD_RUNTIME_FILE));
  }
  candidates.push(resolve(callerDir, "forward-runtime", FORWARD_RUNTIME_FILE));
  candidates.push(resolve(callerDir, "../plugin/forward-runtime", FORWARD_RUNTIME_FILE));
  candidates.push(
    resolve(callerDir, "../../src/supervisor/agents/plugin/forward-runtime", FORWARD_RUNTIME_FILE),
  );
  candidates.push(
    resolve(
      callerDir,
      "../../../src/supervisor/agents/plugin/forward-runtime",
      FORWARD_RUNTIME_FILE,
    ),
  );
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedRuntimeSourcePath = candidate;
      return candidate;
    }
  }
  throw new Error(`forward runtime source not found; checked: ${candidates.join(", ")}`);
}

/**
 * Copy the shared runtime into a native plugin staging dir. Idempotent:
 * skips when target file is identical (size+mtime). Targets sit next to
 * `forward.mjs` so its relative `import "./poracode-hook-runtime.mjs"`
 * resolves.
 */
export function copyForwardRuntimeFile(targetDir: string): void {
  const source = resolveForwardRuntimeSourcePath();
  const target = join(targetDir, FORWARD_RUNTIME_FILE);
  try {
    const sourceStat = statSync(source);
    const targetStat = statSync(target);
    if (sourceStat.size === targetStat.size && sourceStat.mtimeMs <= targetStat.mtimeMs) {
      return;
    }
  } catch {
    // target missing or unreadable — fall through to copy
  }
  copyPluginAssetFile(source, target);
}

/**
 * Build the WSL deploy file list for a forwarder-based provider. Includes
 * `plugin.json`, `forward.mjs` (from the per-provider source dir), and the
 * shared runtime (from the canonical location). Used by callers that pass
 * the result to `deployFilesToWslHome` directly.
 */
export function getForwarderWslDeployFiles(
  sourceDir: string,
  kind: string,
): Array<{ src: string; relDest: string }> {
  return [
    ...PLUGIN_ASSET_FILES.map((file) => ({
      src: join(sourceDir, file),
      relDest: `agent-plugins/${kind}/${file}`,
    })),
    {
      src: resolveForwardRuntimeSourcePath(),
      relDest: `agent-plugins/${kind}/${FORWARD_RUNTIME_FILE}`,
    },
  ];
}

// ── Shared install-verification ──────────────────────────────────────────

export interface VerifyStagedPluginOptions {
  /**
   * Asset list whose existence is required for "installed" to be true.
   * Defaults to `PLUGIN_ASSET_FILES` (plugin.json + forward.mjs). Providers
   * that ship different files (e.g. OpenCode's plugin.mjs) override this.
   */
  assets?: readonly string[];
  /**
   * When true (default), native installs must also have the
   * `poracode-hook.{sh,cmd}` wrapper next to forward.mjs. WSL installs bake
   * the absolute node path directly into hook commands and never need it.
   * Providers that don't use a forwarder wrapper (OpenCode in-process plugin)
   * set this to false.
   */
  requireNativeWrapper?: boolean;
  /**
   * Optional provider-specific extra check run after the asset existence
   * checks pass. Returns true to continue treating the install as good.
   * Used by Cursor (hooks.json must contain a Poracode entry) and OpenCode
   * (dropped files must byte-match the staging dir).
   */
  extraCheck?: () => boolean;
}

/**
 * Generic "is the staged plugin layout intact" check used by every provider's
 * `isXxxPluginInstalled`. Returns `{ installed: false }` on any missing
 * asset, missing wrapper (native + required), failing extra check, or
 * unreadable manifest. On success, includes the manifest version.
 */
export function verifyStagedPluginAt(
  readableDir: string,
  target: "native" | "wsl",
  options?: VerifyStagedPluginOptions,
): { installed: boolean; version?: string } {
  const assets = options?.assets ?? PLUGIN_ASSET_FILES;
  for (const asset of assets) {
    if (!existsSync(join(readableDir, asset))) return { installed: false };
  }
  const requireWrapper = options?.requireNativeWrapper ?? true;
  if (requireWrapper && !hasNativeHookWrapper(readableDir, target)) {
    return { installed: false };
  }
  if (options?.extraCheck && !options.extraCheck()) return { installed: false };
  try {
    const version = readPluginManifest(readableDir).version;
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

// ── Shared WSL plugin staging ────────────────────────────────────────────

export interface StagePluginAssetsToWslOptions {
  /**
   * Asset list (filenames in sourceDir) to deploy. Defaults to
   * `PLUGIN_ASSET_FILES`. OpenCode passes its own list (`plugin.mjs` instead
   * of `forward.mjs`).
   */
  assets?: readonly string[];
  /**
   * When true, also stage the shared `poracode-hook-runtime.mjs` next to
   * `forward.mjs`. Forwarder-based providers (claude/codex/gemini/copilot/
   * cursor) pass true; OpenCode (in-process plugin, no forwarder) passes false.
   */
  includeForwardRuntime?: boolean;
}

/**
 * Stage a provider's plugin assets into a WSL distro under
 * `<home>/.poracode/agent-plugins/<kind>/`. Returns the deploy result on
 * success; on failure returns a `reason` string the caller should propagate.
 * Centralizes the `deployFilesToWslHome → !deploy → reason` pattern shared
 * across copilot/cursor/opencode (and matches the shape used by claude/codex
 * /gemini callers, even though those have extra steps after staging).
 */
export function stagePluginAssetsToWsl(
  distro: string,
  sourceDir: string,
  kind: string,
  options?: StagePluginAssetsToWslOptions | readonly string[],
):
  | { ok: true; deploy: WslHomeDeployResult; linuxPluginDir: string }
  | { ok: false; reason: string } {
  let opts: StagePluginAssetsToWslOptions;
  if (Array.isArray(options)) {
    opts = { assets: options as readonly string[] };
  } else if (options) {
    opts = options as StagePluginAssetsToWslOptions;
  } else {
    opts = {};
  }
  const assets = opts.assets ?? PLUGIN_ASSET_FILES;
  const files: Array<{ src: string; relDest: string }> = assets.map((file) => ({
    src: join(sourceDir, file),
    relDest: `agent-plugins/${kind}/${file}`,
  }));
  if (opts.includeForwardRuntime) {
    files.push({
      src: resolveForwardRuntimeSourcePath(),
      relDest: `agent-plugins/${kind}/${FORWARD_RUNTIME_FILE}`,
    });
  }
  const deploy = deployFilesToWslHome(distro, files);
  if (!deploy) {
    return { ok: false, reason: `failed to stage ${kind} plugin into wsl distro ${distro}` };
  }
  return {
    ok: true,
    deploy,
    linuxPluginDir: `${deploy.linuxBaseDir}/agent-plugins/${kind}`,
  };
}
