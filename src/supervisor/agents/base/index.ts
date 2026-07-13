import { existsSync, readFileSync, watch as fsWatch } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { toWslUncPath } from "@/shared/wsl";
import type {
  AgentProviderMetadata,
  AgentStatus,
  AuthState,
  ProjectLocation,
} from "@/shared/contracts";
import { primeAgentBinaryPath, resolveAgentBinaryPath } from "../binaryResolver";
import {
  batchWslCommandsAsync,
  getCachedWslHomeDirectory,
  getPrimedPosixEnv,
  getProjectShellEnv,
  getWindowsPathOverrideEnv,
  isWslInteropBinaryPath,
  readCommandOutputAsync,
  readWslLoginShellCommandOutputAsync,
  resolveExecutablePath,
  resolveExecutablePathAsync,
  resolveWslShellPath,
} from "./processRuntime";
import {
  buildPosixExportPrefix,
  getPosixLoginShellArgs,
  getWslCommand,
  quotePosixShellArg,
  quotePowerShellLiteral,
} from "./shellBasics";
import type {
  AgentArgvSpec,
  AgentEnvContext,
  AuthProbe,
  CommandSpec,
  DetectionSpec,
  DetectProbeCtx,
  ResolveExecutablePath,
  StatusProbeResult,
} from "./types";

export type {
  AcpSessionUpdateTransform,
  AgentAcpAuth,
  AgentAdapter,
  AgentArgvSpec,
  AgentCliHookPluginSupport,
  AgentDetector,
  AgentEnvContext,
  AgentLaunchOptions,
  AgentLauncher,
  AgentMetadata,
  AgentOneShotRunner,
  AgentPromptFormatter,
  AgentSessionTracker,
  AgentSkillRootSpec,
  AgentSkillSupport,
  AgentTerminalObserver,
  AgentUpdater,
  AgentUpdaterCommand,
  AuthProbe,
  CapabilitiesProbeResult,
  CommandSpec,
  CreateStructuredSessionInput,
  DetectionSpec,
  DetectProbeCtx,
  FindBestHintOptions,
  HintEntry,
  OneShotChildCommand,
  ResolveExecutablePath,
  RunOneShotInput,
  SubagentOneShotCommandInput,
  StartTurnOptions,
  StatusProbe,
  StatusProbeResult,
  StructuredSessionHandle,
  StructuredSessionListener,
  StructuredSessionUpdate,
  SyncConfigFromTerminalStateInput,
  TerminalStatusHint,
  ThreadHistory,
  ThreadHistoryEntry,
} from "./types";
export * from "./terminalHints";
export * from "./promptSession";
export * from "./processRuntime";
export * from "./shellBasics";
export * from "./sessionFs";
export function buildWindowsCmdCommand(cwd: string, command: string, args: string[]): CommandSpec {
  return {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", command, ...args],
    cwd,
  };
}

/**
 * Inject environment variables into an already-built WSL CommandSpec.
 * The WSL command structure from `buildAgentCommand` always ends with
 * `[..., shellPath, "-l", "-i", "-c", script]`, so we prepend `export`
 * statements to the script string.
 *
 * For non-WSL commands, the env is stored on `CommandSpec.env` and merged
 * into the PTY spawn options by the caller — no script rewriting needed.
 */
export function injectWslEnv(
  spec: CommandSpec,
  location: ProjectLocation,
  env: Record<string, string>,
): CommandSpec {
  if (location.kind !== "wsl" || Object.keys(env).length === 0) return spec;

  const prefix = buildPosixExportPrefix(env);
  if (!prefix) return spec;

  // The script is always the last arg after "-c".
  const args = [...spec.args];
  const scriptIdx = args.length - 1;
  args[scriptIdx] = `${prefix}${args[scriptIdx]}`;
  return { ...spec, args };
}

/**
 * Drop `undefined` values so an `env` record matches the `Record<string, string>`
 * shape that `buildAgentCommand` expects (the SDK's `SpawnOptions.env` allows
 * `undefined` values).
 */
export function definedEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function isWindowsDirectExecutable(command: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(command) && /\.(?:exe|com)$/i.test(command);
}

/** Detect the best available shell. Returns a shell path on Windows (pwsh > powershell > cmd), or `true` on Unix (default shell). */
export function detectShell(
  resolvePath: ResolveExecutablePath = resolveExecutablePath,
): string | true {
  if (process.platform !== "win32") return true;
  return (
    resolvePath("pwsh.exe") ??
    resolvePath("pwsh") ??
    resolvePath("powershell.exe") ??
    resolvePath("powershell") ??
    true
  );
}

export function buildWindowsCommand(
  cwd: string,
  command: string,
  args: string[],
  resolvePath: ResolveExecutablePath = resolveExecutablePath,
): CommandSpec {
  if (isWindowsDirectExecutable(command)) {
    return { command, args, cwd };
  }

  const shell = detectShell(resolvePath);
  if (typeof shell === "string") {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$cmd = ${quotePowerShellLiteral(command)}`,
      `$args = @(${args.map(quotePowerShellLiteral).join(", ")})`,
      "& $cmd @args",
    ].join("; ");

    return {
      command: shell,
      args: ["-NoLogo", "-NoProfile", "-EncodedCommand", encodePowerShellCommand(script)],
      cwd,
    };
  }

  return buildWindowsCmdCommand(cwd, command, args);
}

function resolveWindowsNodeCmdShim(commandPath: string):
  | {
      command: string;
      argsPrefix: string[];
    }
  | undefined {
  let effectivePath = commandPath;
  if (!/\.cmd$/i.test(commandPath)) {
    // Bare command names like "npx" resolve to "npx.cmd" via PATHEXT.
    // Without this resolution the batch-file wrapper spawns cmd.exe which
    // creates a visible console window on Windows — windowsHide: true on the
    // parent spawn only applies to the immediate child, not grandchildren.
    const resolved = resolveExecutablePath(commandPath);
    if (!resolved || !/\.cmd$/i.test(resolved)) return undefined;
    effectivePath = resolved;
  }

  let content: string;
  try {
    content = readFileSync(effectivePath, "utf8");
  } catch {
    return undefined;
  }

  const match = /["']?%dp0%\\([^"']+?\.[cm]?js)["']?\s+%\*/i.exec(content);
  const relScript = match?.[1];
  if (!relScript) return undefined;

  const baseDir = dirname(effectivePath);
  const scriptPath = join(baseDir, ...relScript.split(/[\\/]+/));
  if (!existsSync(scriptPath)) return undefined;

  const localNode = join(baseDir, "node.exe");
  return {
    command: existsSync(localNode) ? localNode : "node",
    argsPrefix: [scriptPath],
  };
}

/**
 * Build a command spec for POSIX systems (macOS/Linux).
 *
 * Fast path: when given an absolute binary path, spawn directly and inject
 * the user's full shell env captured at the project root (via
 * `primeProjectShellEnv`). Standing in the project root before dumping `env`
 * lets the user's version manager — fnm, nvm, volta, asdf, mise, or any
 * other — apply its chpwd / cd-hook so the project-pinned Node/Python/Ruby
 * is the one on PATH. Falls back to the homedir-scoped `primedPosixEnv`
 * (and ultimately the bare process env) when the project prime has not yet
 * completed. Bare command names still wrap in `$SHELL -l [-i] -c` so
 * unprimed binaries are resolvable.
 */
function buildPosixCommand(cwd: string, command: string, args: string[]): CommandSpec {
  const env = getProjectShellEnv(cwd) ?? getPrimedPosixEnv();
  if (command.startsWith("/")) {
    return {
      command,
      args,
      cwd,
      ...(env ? { env: { ...env } } : {}),
    };
  }

  const shell = process.env.SHELL || "/bin/bash";
  const script = `exec ${[command, ...args].map(quotePosixShellArg).join(" ")}`;
  return {
    command: shell,
    args: getPosixLoginShellArgs(script),
    cwd,
    ...(env ? { env: { ...env } } : {}),
  };
}

/**
 * Build a command spec for an agent CLI across all platforms.
 * Agent adapters should use this - no platform branching needed.
 *
 * Handles:
 * - "windows" → PowerShell or cmd.exe
 * - "wsl" → wsl.exe with Linux shell
 * - "posix" → macOS/Linux with $SHELL or /bin/bash
 */
export function buildAgentCommand(
  location: ProjectLocation,
  command: string,
  args: string[],
  resolvedExecPath?: string,
  env?: Record<string, string>,
): CommandSpec {
  if (location.kind === "wsl") {
    // Always launch the agent through `bash -l -i -c` so the user's rc files
    // (nvm/fnm/asdf init, PATH overrides, shell functions) are sourced. Hooks
    // spawned by the agent inherit this env — without `-l -i`, Windows-side
    // tooling reachable via `/mnt/c` interop can shadow Linux node from a
    // version manager and break things like `npx` (e.g. fnm shims that exec a
    // node not on PATH).
    const shellPath = resolveWslShellPath(location.distro);
    const execCommand = resolvedExecPath ?? command;
    const exports = buildPosixExportPrefix(env);
    const script = `${exports}exec ${[execCommand, ...args].map(quotePosixShellArg).join(" ")}`;
    return {
      command: getWslCommand(),
      args: [
        "-d",
        location.distro,
        "--cd",
        location.linuxPath,
        "--",
        shellPath,
        "-l",
        "-i",
        "-c",
        script,
      ],
    };
  }

  if (location.kind === "windows") {
    const commandPath = resolvedExecPath ?? command;
    const shim = resolveWindowsNodeCmdShim(commandPath);
    const spec = shim
      ? buildWindowsCommand(location.path, shim.command, [...shim.argsPrefix, ...args])
      : buildWindowsCommand(location.path, commandPath, args);
    const shellEnv = getProjectShellEnv(location.path) ?? getWindowsPathOverrideEnv();
    const mergedEnv = { ...(shellEnv ?? {}), ...(env ?? {}) };
    if (Object.keys(mergedEnv).length > 0) spec.env = mergedEnv;
    return spec;
  }

  // location.kind === "posix" (macOS/Linux)
  const spec = buildPosixCommand(location.path, resolvedExecPath ?? command, args);
  if (env && Object.keys(env).length > 0) {
    spec.env = { ...spec.env, ...env };
  }
  return spec;
}

/**
 * Turn an adapter's `AgentArgvSpec` into a platform-ready `CommandSpec`.
 * Resolves an absolute binary path when available (WSL distro lookup, native
 * Windows fallback PATH lookup), wraps through `buildAgentCommand`, and
 * forwards the optional `sessionRef`. Adapters stay free of shell/platform
 * concerns — all branching lives here.
 */
export function resolveLaunchSpec(location: ProjectLocation, argv: AgentArgvSpec): CommandSpec {
  const resolvedExecPath =
    argv.preferShell && location.kind === "posix"
      ? undefined
      : resolveAgentBinaryPath(location, argv.binary);
  const spec = buildAgentCommand(location, argv.binary, argv.args, resolvedExecPath, argv.env);
  if (argv.sessionRef) {
    spec.sessionRef = argv.sessionRef;
  }
  if (argv.cleanup) {
    spec.cleanup = argv.cleanup;
  }
  return spec;
}

// ── Install-detection engine ───────────────────────────────────────

/**
 * Reads an env var on the provider's native side — either WSL (`printf %s
 * "$NAME"` inside the distro so we see the user's login-shell env, not the
 * Windows host env) or the host process's `process.env`.
 * Returns "authenticated" if any listed name is set and non-empty.
 */
export function envVarAuthProbe(names: string[]): AuthProbe {
  return async (ctx) => {
    if (ctx.location.kind === "wsl") {
      const results = await batchWslCommandsAsync(
        ctx.location.distro,
        names.map((n) => `printf %s "$${n}"`),
      );
      const any = results.some((r) => r.ok && r.stdout.trim().length > 0);
      return any ? "authenticated" : "unknown";
    }
    const any = names.some((n) => {
      const value = process.env[n];
      return typeof value === "string" && value.trim().length > 0;
    });
    return any ? "authenticated" : "unknown";
  };
}

/**
 * Existence-check for a config file whose path depends on the environment.
 * Return `undefined` from the resolver to skip the probe (e.g. WSL-only or
 * native-only detection). Returns "authenticated" when the file exists,
 * "missing" when the path resolved but the file is absent.
 */
export function configFileAuthProbe(
  resolvePath: (location: ProjectLocation) => string | undefined,
): AuthProbe {
  return async (ctx) => {
    const path = resolvePath(ctx.location);
    if (!path) return undefined;
    return existsSync(path) ? "authenticated" : "missing";
  };
}

/**
 * Runs the resolved executable with a subcommand (e.g. `["auth", "status"]`)
 * and treats exit-0 as "authenticated", anything else as "unknown". Skipped
 * when the executable itself is missing.
 */
export function cliSubcommandAuthProbe(args: string[]): AuthProbe {
  return async (ctx) => {
    if (!ctx.executablePath) return undefined;
    const spec = buildAgentCommand(ctx.location, ctx.executablePath, args);
    const result = await readCommandOutputAsync(spec.command, spec.args, {
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
      ...(spec.env ? { env: spec.env } : {}),
    });
    return result.ok ? "authenticated" : "unknown";
  };
}

const PROBE_WSL_LINUX_PATH = "/tmp";

export function detectProbeLocation(ctx: AgentEnvContext | undefined): ProjectLocation {
  if (ctx?.envKind === "wsl" && ctx.wslDistro) {
    return {
      kind: "wsl",
      distro: ctx.wslDistro,
      linuxPath: PROBE_WSL_LINUX_PATH,
      uncPath: "\\\\wsl$",
    };
  }
  if (process.platform === "win32") {
    return { kind: "windows", path: homedir() };
  }
  return { kind: "posix", path: homedir() };
}

/**
 * Adapter helper for CLIs that expose logout as a shell subcommand
 * (`claude auth logout`, `codex logout`, `cursor-agent logout`). Delegates
 * to `buildAgentCommand` so posix, Windows, and WSL share the same shell
 * wrapping the agent uses in production.
 */
export function buildAgentLogoutCommand(
  binary: string,
  args: string[],
): (ctx?: AgentEnvContext) => Promise<CommandSpec> {
  return async (ctx) => {
    const location = detectProbeLocation(ctx);
    return buildAgentCommand(location, binary, args, resolveAgentBinaryPath(location, binary));
  };
}

async function resolveDetectedBinary(
  ctx: AgentEnvContext | undefined,
  binary: string,
): Promise<string | undefined> {
  if (ctx?.envKind === "wsl" && ctx.wslDistro) {
    const [result] = await batchWslCommandsAsync(ctx.wslDistro, [`command -v ${binary}`]);
    // A `/mnt/...` result is a Windows binary surfaced via PATH interop, not a
    // real Linux install — reject it so detection matches launch-time
    // resolution (see isWslInteropBinaryPath).
    const path = result?.ok && !isWslInteropBinaryPath(result.stdout) ? result.stdout : undefined;
    primeAgentBinaryPath(ctx.wslDistro, binary, path);
    return path;
  }
  return resolveExecutablePathAsync(binary);
}

function extractSemverFromVersionOutput(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/\b\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?\b/);
  return match ? match[0] : raw.trim() || undefined;
}

async function readDetectedVersion(
  location: ProjectLocation,
  executablePath: string | undefined,
  versionArgs: string[],
  probeEnv?: Record<string, string>,
): Promise<string | undefined> {
  if (!executablePath) return undefined;
  if (location.kind === "wsl") {
    const result = await readWslLoginShellCommandOutputAsync(
      location.distro,
      PROBE_WSL_LINUX_PATH,
      executablePath,
      versionArgs,
      probeEnv ? { env: probeEnv } : undefined,
    );
    return result.ok ? extractSemverFromVersionOutput(result.stdout) : undefined;
  }
  // Run the resolved binary directly rather than re-resolving the bare name
  // through PATH. The supervisor's PATH is a launch-time snapshot, so a freshly
  // installed native CLI (e.g. just-installed `grok` on Windows) is found by
  // detection — which uses the registry-backed fallback — but its `--version`
  // would miss and the version would render blank. Matches the WSL branch above
  // and readAgentCommandOutput.
  const spec = buildAgentCommand(location, executablePath, versionArgs, undefined, probeEnv);
  const result = await readCommandOutputAsync(
    spec.command,
    spec.args,
    spec.cwd || spec.env
      ? { ...(spec.cwd ? { cwd: spec.cwd } : {}), ...(spec.env ? { env: spec.env } : {}) }
      : undefined,
  );
  return result.ok ? extractSemverFromVersionOutput(result.stdout) : undefined;
}

// ── Agent command output (native vs WSL) ─────────────────────────────────

/**
 * Run `<executablePath> <args>` against an agent binary and return its
 * stdout/stderr/ok, abstracting the native-vs-WSL fork that detection /
 * session code used to inline. For WSL it routes through the user's login
 * shell (so PATH and profile-loaded helpers like nvm resolve); for native it
 * uses the platform-aware `buildAgentCommand` wrapper.
 */
export async function readAgentCommandOutput(
  location: ProjectLocation,
  executablePath: string,
  args: string[],
  options?: {
    timeoutMs?: number;
    wslLinuxCwd?: string;
    posixCwd?: string;
    env?: Record<string, string>;
  },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  if (location.kind === "wsl") {
    const wslOptions =
      options?.timeoutMs !== undefined || options?.env
        ? {
            ...(options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
            ...(options?.env ? { env: options.env } : {}),
          }
        : undefined;
    return readWslLoginShellCommandOutputAsync(
      location.distro,
      options?.wslLinuxCwd ?? location.linuxPath,
      executablePath,
      args,
      wslOptions,
    );
  }
  const spec = buildAgentCommand(location, executablePath, args, undefined, options?.env);
  const effectiveCwd = options?.posixCwd ?? spec.cwd;
  const runOptions = {
    ...(effectiveCwd ? { cwd: effectiveCwd } : {}),
    ...(spec.env ? { env: spec.env } : {}),
    ...(options?.timeoutMs ? { timeout: options.timeoutMs } : {}),
  };
  return readCommandOutputAsync(
    spec.command,
    spec.args,
    Object.keys(runOptions).length > 0 ? runOptions : undefined,
  );
}

// ── Session helpers (shared across providers with session-dir watchers) ───

/**
 * Resolve a path inside the user's home directory, correctly across native
 * (`os.homedir()`) and WSL (UNC path against the distro's home, read from the
 * cache via `getCachedWslHomeDirectory`, populated by the bridge-backed
 * `resolveWslHomeDirectoryAsync`). Returns `undefined` when the WSL home is
 * unavailable. Replaces per-provider platform branching like
 * `~/.codex/sessions` or `~/.gemini/tmp/<project>`.
 */
export function resolveAgentHomeSubpath(
  location: ProjectLocation,
  subpath: string,
): string | undefined {
  if (location.kind === "wsl") {
    const home = getCachedWslHomeDirectory(location.distro);
    if (!home) return undefined;
    const trimmed = subpath.replace(/^[\\/]+/, "");
    return toWslUncPath(location.distro, `${home}/${trimmed}`);
  }
  return join(homedir(), ...subpath.split(/[\\/]/).filter((s) => s.length > 0));
}

/**
 * Recursive `fs.watch` wrapper with uniform error-swallow / cleanup semantics.
 * Returns an undo handle or `undefined` when the watcher could not be
 * established (unsupported platform, missing path, etc.). `label` goes into
 * log output so two providers don't have to reimplement the same boilerplate.
 */
export function createRecursiveDirWatcher(
  watchPath: string,
  onChanged: () => void,
  label: string,
): (() => void) | undefined {
  try {
    const watcher = fsWatch(watchPath, { recursive: true }, () => onChanged());
    watcher.on("error", () => {
      try {
        watcher.close();
      } catch {
        // Ignore watcher teardown races.
      }
    });
    console.log("[%s] session watcher active at %s", label, watchPath);
    return () => {
      try {
        watcher.close();
      } catch {
        // Ignore watcher teardown races.
      }
    };
  } catch (error) {
    console.log(
      [
        `[${label}] session watcher unavailable`,
        `  path: ${watchPath}`,
        `  error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
    return undefined;
  }
}

/**
 * Run the shared install-detection flow for an adapter.
 *
 * Steps:
 *   1. Resolve the executable path (WSL `command -v` or native `which`/`where`).
 *      Primes the shared `BinaryResolver` cache so the eventual launch reuses
 *      this lookup instead of probing again.
 *   2. Fetch the version via `spec.versionArgs` (default `["--version"]`).
 *   3. Run `capabilitiesProbe` and merge its partial into `spec.capabilities`.
 *   4. Run `statusProbe` + `capabilitiesProbe` in parallel.
 *   5. Run `authProbes` in order; first `"authenticated"` wins.
 *   6. Assemble the `AgentStatus`.
 */
export async function detectAgentInstall(
  ctx: AgentEnvContext | undefined,
  spec: DetectionSpec,
): Promise<AgentStatus> {
  const location = detectProbeLocation(ctx);
  const executablePath = await resolveDetectedBinary(ctx, spec.binary);

  const versionArgs = spec.versionArgs ?? ["--version"];
  const version = await readDetectedVersion(location, executablePath, versionArgs, spec.probeEnv);

  let capabilities = spec.capabilities;
  let statusProbeResult: StatusProbeResult | undefined;
  let probedAuthMethods: AgentStatus["authMethods"];
  let probedAuthLogoutSupported: boolean | undefined;
  let probedAuthState: AuthState | undefined;
  let probedProviderMetadata: AgentProviderMetadata | undefined;
  let probedPreferTerminalLogin: boolean | undefined;
  if (executablePath) {
    const probeCtx: DetectProbeCtx = { location, executablePath, version, probeEnv: spec.probeEnv };
    const [capabilityPartial, nextStatusProbeResult] = await Promise.all([
      spec.capabilitiesProbe ? spec.capabilitiesProbe(probeCtx) : Promise.resolve(undefined),
      spec.statusProbe ? spec.statusProbe(probeCtx) : Promise.resolve(undefined),
    ]);
    if (capabilityPartial) {
      const {
        authMethods: probeAuthMethods,
        authLogoutSupported: probeAuthLogoutSupported,
        authState: probeAuthStateValue,
        providerMetadata: probeProviderMetadata,
        preferTerminalLogin: probePreferTerminalLogin,
        ...capabilityRest
      } = capabilityPartial;
      capabilities = { ...capabilities, ...capabilityRest };
      if (probePreferTerminalLogin) {
        probedPreferTerminalLogin = true;
      }
      if (probeAuthMethods?.length) {
        probedAuthMethods = probeAuthMethods;
      }
      if (probeAuthLogoutSupported) {
        probedAuthLogoutSupported = true;
      }
      if (probeAuthStateValue !== undefined) {
        probedAuthState = probeAuthStateValue;
      }
      if (probeProviderMetadata) {
        probedProviderMetadata = probeProviderMetadata;
      }
    }
    statusProbeResult = nextStatusProbeResult;
  }

  const probeCtx: DetectProbeCtx = { location, executablePath, version };

  let authState: AuthState;
  if (!executablePath) {
    authState = "missing";
  } else if (probedAuthState !== undefined) {
    // The ACP protocol probe gives a definitive answer (newSession succeeded
    // → authenticated; `auth_required` error → missing). Treat it as the
    // source of truth — env-var / config-dir / `gh auth status` heuristics
    // can't see post-logout state and would otherwise keep reporting stale
    // authentication.
    authState = probedAuthState;
  } else {
    authState = statusProbeResult?.authState ?? "unknown";
    if (authState !== "authenticated") {
      for (const probe of spec.authProbes ?? []) {
        const result = await probe(probeCtx);
        if (result === "authenticated") {
          authState = "authenticated";
          break;
        }
        if (result !== undefined) {
          authState = result;
        }
      }
    }
  }

  const providerMetadata = statusProbeResult?.providerMetadata ?? probedProviderMetadata;

  const loginCommand =
    typeof spec.loginCommand === "function" ? spec.loginCommand(probeCtx) : spec.loginCommand;

  return {
    kind: spec.kind,
    label: spec.label,
    installed: executablePath !== undefined,
    ...(loginCommand ? { loginCommand } : {}),
    ...(probedPreferTerminalLogin ? { preferTerminalLogin: true } : {}),
    ...(executablePath ? { executablePath } : {}),
    ...(version ? { version } : {}),
    ...(spec.update ? { update: spec.update } : {}),
    authState,
    ...(providerMetadata ? { providerMetadata } : {}),
    ...(probedAuthMethods ? { authMethods: probedAuthMethods } : {}),
    ...(probedAuthLogoutSupported ? { authLogoutSupported: true } : {}),
    capabilities,
  };
}
