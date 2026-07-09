import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AgentHookSupportEntry,
  defaultSharedSettings,
  normalizeSharedSettings,
} from "@/shared/settings";
import type {
  AgentKind,
  AgentHookPluginEnv,
  AgentHookPluginMutationResult,
  AgentHookPluginStatus,
  GetAgentHookPluginStatusesPayload,
  ProjectLocation,
} from "@/shared/contracts";
import {
  type AgentAdapter,
  type AgentEnvContext,
  type AgentCliHookPluginSupport,
  resolveWslHomeDirectoryAsync,
} from "../agents/base";
import type { BrowserMcpHttpConfig } from "../agents/browserMcp";
import type { ComputerUseMcpHttpConfig } from "../agents/computerUseMcp";
import type { WslBridgeServer } from "../wsl/bridge";
import { isLightcodeHookDebug } from "./hookDebug";
import { HookIngress, type HookIngressBootInfo } from "./hookIngress";

export interface CliHookPluginCoordinatorOptions {
  adapters: Map<AgentKind, AgentAdapter>;
  settingsPath: string;
  /**
   * Poracode data base dir for native plugin staging. Forwarded to each
   * adapter's `ctx.baseDir` so dev (`~/.lightcode-dev`) and prod
   * (`~/.poracode`) keep separate plugin stages instead of stomping the
   * same `agent-plugins/` directory. Omit only in tests — production callers
   * always pass the resolved lightcode data dir.
   */
  baseDir?: string;
  /** TCP port preference; falls back to ephemeral on collision. */
  preferredPort?: number;
  /** Cache TTL for the CLI hook plugin install verdict — defaults to 7 days. */
  cacheTtlMs?: number;
  /** Pluggable env-context resolver (mainly for tests). */
  envContext?: (agentKind: AgentKind, projectLocation?: ProjectLocation) => AgentEnvContext;
  /**
   * Optional WSL hook bridge manager. When provided, WSL spawns are routed
   * through a per-distro `bridge.mjs` (see `WslBridgeServer`) instead
   * of the Windows-host `HookIngress`, which a WSL2 NAT loopback would not
   * reach.
   */
  wslHookBridge?: WslBridgeServer;
}

const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Placeholder `pluginVersion` returned by `readBundled*PluginVersion()` when
 * the plugin manifest cannot be resolved at module load. Entries written with
 * this version are artifacts of a half-initialized environment (e.g. the
 * plugin source tree didn't exist yet) — not real negative verdicts. We treat
 * cached entries bearing it as stale on read, and refuse to write new ones so
 * the next app session gets a clean retry.
 */
const PLUGIN_VERSION_UNKNOWN = "0.0.0";

/**
 * Provider-agnostic orchestrator for **CLI hook plugin** status detection
 * (accurate lifecycle events from the agent CLI via HTTP hooks). The
 * supervisor instantiates a single coordinator at boot:
 *
 *   1. It owns the singleton `HookIngress` (HTTP server on 127.0.0.1) used
 *      by Windows / macOS / Linux agent processes.
 *   2. It optionally owns a `WslBridgeServer` for routing WSL spawns
 *      through an in-distro `bridge.mjs` (WSL2 loopback can't reach the
 *      Windows-host ingress).
 *   3. It iterates installed adapters and asks any that implement
 *      `AgentCliHookPluginSupport` to install/refresh their plugin.
 *   4. It maintains a per-AgentKind + per-environment cache in shared
 *      settings keyed by the agent binary version + plugin version +
 *      protocol version + platform, so subsequent supervisor runs skip the
 *      install probe entirely. The env-key segment ensures a "hook plugin
 *      unsupported" verdict for one distro doesn't poison the entry for the
 *      Windows-side install (or vice versa).
 *   5. It exposes `resolvePluginEnvForSpawn` which the
 *      `ThreadSessionManager` calls per spawn to obtain the env vars + extra
 *      args the agent process needs to load the plugin.
 *
 * The runtime never branches on `agentKind`. Add a new provider with a plugin
 * by simply implementing the `AgentCliHookPluginSupport` slice on its adapter.
 */
export class CliHookPluginCoordinator {
  private readonly ingress: HookIngress;
  private readonly cacheTtlMs: number;
  private readonly envContext: (
    agentKind: AgentKind,
    projectLocation?: ProjectLocation,
  ) => AgentEnvContext;
  private readonly installPromises = new Map<string, Promise<InstallOutcome>>();
  private wslHookBridge: WslBridgeServer | undefined;

  constructor(
    private readonly options: CliHookPluginCoordinatorOptions,
    onEvent: import("./hookIngress").HookEventReceiver,
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const baseDir = options.baseDir;
    const resolveEnvContext = options.envContext ?? defaultEnvContext;
    this.envContext = (agentKind, projectLocation) => {
      const ctx = resolveEnvContext(agentKind, projectLocation);
      if (ctx.baseDir !== undefined || baseDir === undefined) return ctx;
      return { ...ctx, baseDir };
    };
    this.wslHookBridge = options.wslHookBridge;
    const ingressOptions: import("./hookIngress").HookIngressOptions = {
      onEvent,
      onError: (message, error) => {
        if (isLightcodeHookDebug()) {
          console.warn(`[supervisor] hook-debug: ${message}`, error);
        }
      },
    };
    if (options.preferredPort !== undefined) {
      ingressOptions.preferredPort = options.preferredPort;
    }
    this.ingress = new HookIngress(ingressOptions);
  }

  /**
   * Synchronously expose the supervisor's hook bearer secret. Used by the
   * supervisor when constructing the optional WSL hook bridge so both
   * transports authenticate against the same token.
   */
  getHookSecret(): string {
    return this.ingress.getSecret();
  }

  /** Synchronously expose the protocol version the ingress was built with. */
  getProtocolVersion(): number {
    return this.ingress.getProtocolVersion();
  }

  /**
   * Late-bind the WSL hook bridge. Call once during supervisor boot after
   * constructing the bridge with this coordinator's hook secret. Replacing
   * a previously-set bridge is a programming error and is ignored.
   */
  setWslHookBridge(bridge: WslBridgeServer): void {
    if (this.wslHookBridge && this.wslHookBridge !== bridge) {
      throw new Error("CliHookPluginCoordinator already has a WslBridgeServer");
    }
    this.wslHookBridge = bridge;
  }

  /** Begin listening as a background task. Safe to call from supervisor boot. */
  startIngress(): void {
    this.ingress.start();
    void this.ingress.ready
      .then((info) => {
        if (isLightcodeHookDebug()) {
          console.log(`[supervisor] hook-debug: HookIngress listening ${info.url}`);
        }
      })
      .catch((error) => {
        console.warn("[supervisor] hook ingress failed to start:", error);
      });
  }

  /** Wait for the ingress to be ready (used at thread-spawn time). */
  ready(): Promise<HookIngressBootInfo> {
    return this.ingress.ready;
  }

  async dispose(): Promise<void> {
    await this.ingress.dispose();
    if (this.wslHookBridge) {
      await this.wslHookBridge.dispose();
    }
  }

  /**
   * Resolve the env + extra args to inject into a thread's PTY so the agent
   * picks up the CLI hook plugin. Returns `undefined` when the agent has no
   * hook-plugin support, the cache says it failed to install on this machine,
   * or the required transport (HookIngress for native, WslHookBridge for WSL)
   * isn't available — the caller falls back to terminal parsing (L2) silently.
   */
  async resolvePluginEnvForSpawn(input: {
    threadId: string;
    agentKind: AgentKind;
    projectLocation?: ProjectLocation;
    browserMcpEnabled?: boolean;
    browserMcp?: BrowserMcpHttpConfig;
    computerUseMcpEnabled?: boolean;
    computerUseMcp?: ComputerUseMcpHttpConfig;
  }): Promise<{ env: Record<string, string>; extraArgs: string[] } | undefined> {
    // The `disableCliHookPlugin` dev toggle is handled in the supervisor's
    // hook dispatcher (envelopes are dropped on receive). Install, launch
    // extras (`--settings <path>`), and hook env vars stay unchanged so
    // `preferredNotifChannel: "iterm2"` keeps flowing and L2 can drive status.
    const adapter = this.options.adapters.get(input.agentKind);
    const slice = adapter ? toCliHookPluginSlice(adapter) : undefined;
    if (!adapter || !slice) {
      return undefined;
    }

    // CLI hook plugins apply only to terminal-driven agents. ACP/SDK/server-controlled
    // agents already emit structured status over their control channel, so
    // injecting a second signal would double-count turns and confuse the
    // dispatcher. A server-controlled adapter short-circuits here before we
    // pay the install/transport cost.
    if (!isTerminalLiveInput(adapter)) {
      return undefined;
    }

    const ctx = this.envContext(input.agentKind, input.projectLocation);
    if (input.browserMcpEnabled !== undefined) ctx.browserMcpEnabled = input.browserMcpEnabled;
    if (input.browserMcp) ctx.browserMcp = input.browserMcp;
    if (input.computerUseMcpEnabled !== undefined) {
      ctx.computerUseMcpEnabled = input.computerUseMcpEnabled;
    }
    if (input.computerUseMcp) ctx.computerUseMcp = input.computerUseMcp;
    const outcome = await this.ensureInstalledOrUpdated(adapter, slice, ctx);
    if (!outcome.ok) {
      return undefined;
    }

    const transport = await this.resolveTransport(ctx);
    if (!transport) {
      return undefined;
    }

    const launchExtras = (await slice.pluginLaunchExtras?.(ctx)) ?? {};

    const env: Record<string, string> = {
      LIGHTCODE_HOOK_URL: transport.url,
      LIGHTCODE_HOOK_SECRET: transport.secret,
      // Some agent CLIs sanitize the hook subprocess env, dropping any var whose
      // NAME matches a secret denylist (command-code strips /SECRET|TOKEN|AUTH|
      // KEY|.../). That removes LIGHTCODE_HOOK_SECRET and leaves the forwarder
      // unable to authenticate its POST (it requires url && secret), so status
      // intents never arrive. Carry the same value under a neutral name the
      // denylist doesn't match; the shared forwarder falls back to it.
      LIGHTCODE_HOOK_NONCE: transport.secret,
      LIGHTCODE_HOOK_PROTOCOL_VERSION: String(transport.protocolVersion),
      LIGHTCODE_THREAD_ID: input.threadId,
      LIGHTCODE_AGENT_KIND: input.agentKind,
      ...(launchExtras.env ?? {}),
    };
    return { env, extraArgs: launchExtras.args ?? [] };
  }

  /**
   * Install (or confirm install of) every adapter's NATIVE plugin. WSL
   * installs are deferred to first use because they need a per-distro
   * context that the boot path doesn't have. Errors are recorded in the
   * cache and never thrown.
   */
  async installAll(): Promise<void> {
    const tasks = [...this.options.adapters.values()].map(async (adapter) => {
      const slice = toCliHookPluginSlice(adapter);
      if (!slice) return;
      // Skip server-controlled adapters entirely — see the matching check
      // in `resolvePluginEnvForSpawn`. Installing their plugin would be
      // wasted I/O because the runtime never injects the env/args for them.
      if (!isTerminalLiveInput(adapter)) return;
      const ctx = this.envContext(adapter.kind);
      await this.ensureInstalledOrUpdated(adapter, slice, ctx);
    });
    await Promise.allSettled(tasks);
  }

  async getStatuses(input: GetAgentHookPluginStatusesPayload): Promise<AgentHookPluginStatus[]> {
    return Promise.all(input.envs.map((env) => this.getStatus(input.agentKind, env)));
  }

  async installPlugin(input: {
    agentKind: AgentKind;
    env: AgentHookPluginEnv;
  }): Promise<AgentHookPluginMutationResult> {
    const adapter = this.options.adapters.get(input.agentKind);
    const slice = adapter ? toCliHookPluginSlice(adapter) : undefined;
    if (!adapter || !slice || !isTerminalLiveInput(adapter)) {
      throw new Error(`CLI hook plugin is not supported for ${input.agentKind}.`);
    }
    const ctx = this.contextForEnv(input.env);
    const supported = (await slice.isPluginSupported?.(ctx)) ?? true;
    if (!supported) {
      throw new Error(`CLI hook plugin is not supported in this environment.`);
    }
    const result = await slice.installPlugin(ctx);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    const cacheKey = composeCacheKey(input.agentKind, ctx);
    this.installPromises.delete(cacheKey);
    this.writeCacheEntry(cacheKey, {
      agentBinaryVersion: "n/a",
      pluginVersion: result.version,
      protocolVersion: slice.minProtocolVersion,
      platform: process.platform,
      verifiedAt: new Date().toISOString(),
      supportsL1: true,
    });
    return { status: await this.getStatus(input.agentKind, input.env) };
  }

  async uninstallPlugin(input: {
    agentKind: AgentKind;
    env: AgentHookPluginEnv;
  }): Promise<AgentHookPluginMutationResult> {
    const adapter = this.options.adapters.get(input.agentKind);
    const slice = adapter ? toCliHookPluginSlice(adapter) : undefined;
    if (!adapter || !slice || !isTerminalLiveInput(adapter)) {
      throw new Error(`CLI hook plugin is not supported for ${input.agentKind}.`);
    }
    if (!slice.uninstallPlugin) {
      throw new Error(`${adapter.label} does not support hook plugin uninstall.`);
    }
    const ctx = this.contextForEnv(input.env);
    await slice.uninstallPlugin(ctx);
    const cacheKey = composeCacheKey(input.agentKind, ctx);
    this.installPromises.delete(cacheKey);
    this.deleteCacheEntry(cacheKey);
    return { status: await this.getStatus(input.agentKind, input.env) };
  }

  private async resolveTransport(
    ctx: AgentEnvContext,
  ): Promise<{ url: string; secret: string; protocolVersion: number } | undefined> {
    if (ctx.envKind === "wsl") {
      if (!this.wslHookBridge || !ctx.wslDistro) return undefined;
      const handle = await this.wslHookBridge.ensureBridge(ctx.wslDistro);
      if (!handle) return undefined;
      // Bridge inherits the supervisor's secret + protocol via spawn env.
      const info = await this.ingress.ready;
      return { url: handle.hookUrl, secret: info.secret, protocolVersion: info.protocolVersion };
    }
    const info = await this.ingress.ready;
    return { url: info.url, secret: info.secret, protocolVersion: info.protocolVersion };
  }

  private async ensureInstalledOrUpdated(
    adapter: AgentAdapter,
    slice: AgentCliHookPluginSupport,
    ctx: AgentEnvContext,
  ): Promise<InstallOutcome> {
    const key = composeCacheKey(adapter.kind, ctx);
    const existing = this.installPromises.get(key);
    if (existing) {
      const outcome = await existing;
      if (outcome.ok) return outcome;
      // Last attempt failed. Always drop the in-memory failure and re-check on
      // the next spawn: the environment may have changed since boot (for
      // example, the user upgraded the CLI inside WSL), and a stale failed
      // promise should not pin the whole session to L2 until restart.
      this.installPromises.delete(key);
    }
    const task = this.runInstall(adapter, slice, ctx, key).catch(
      (error): InstallOutcome => ({ ok: false, reason: errorMessage(error) }),
    );
    this.installPromises.set(key, task);
    return task;
  }

  private async runInstall(
    adapter: AgentAdapter,
    slice: AgentCliHookPluginSupport,
    ctx: AgentEnvContext,
    cacheKey: string,
  ): Promise<InstallOutcome> {
    const supported = (await slice.isPluginSupported?.(ctx)) ?? true;
    if (!supported) {
      this.writeNegativeCacheEntry(cacheKey, slice, "unsupported environment");
      return { ok: false, reason: "unsupported environment" };
    }
    await warmWslHomeCache(ctx);

    const settings = readSharedSettings(this.options.settingsPath);
    const cached = settings.agentHookSupport[cacheKey];

    if (
      cached &&
      cached.platform === process.platform &&
      cached.pluginVersion === slice.pluginVersion &&
      cached.pluginVersion !== PLUGIN_VERSION_UNKNOWN &&
      cached.protocolVersion === slice.minProtocolVersion &&
      Date.now() - Date.parse(cached.verifiedAt) < this.cacheTtlMs
    ) {
      const installed = await slice.isPluginInstalled(ctx);
      // Cache hit. For both positive and negative entries, re-check the staged
      // files before trusting the cache: the user may have repaired or removed
      // ~/.poracode/agent-plugins/ and the provider's generated hook config
      // out of band.
      if (installed.installed) {
        if (installed.version !== undefined && installed.version !== slice.pluginVersion) {
          const result = await slice.installPlugin(ctx);
          if (!result.ok) {
            this.writeNegativeCacheEntry(cacheKey, slice, result.reason);
            return result;
          }
          this.writeCacheEntry(cacheKey, {
            agentBinaryVersion: "n/a",
            pluginVersion: result.version,
            protocolVersion: slice.minProtocolVersion,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: true,
          });
          return { ok: true, version: result.version };
        }
        if (!cached.supportsL1) {
          this.writeCacheEntry(cacheKey, {
            agentBinaryVersion: "n/a",
            pluginVersion: installed.version ?? cached.pluginVersion,
            protocolVersion: slice.minProtocolVersion,
            platform: process.platform,
            verifiedAt: new Date().toISOString(),
            supportsL1: true,
          });
        }
        return { ok: true, version: installed.version ?? cached.pluginVersion };
      }
    }

    const installed = await slice.isPluginInstalled(ctx);
    if (!installed.installed) {
      return { ok: false, reason: "not installed" };
    }

    let installedVersion = installed.version;
    if (installedVersion !== slice.pluginVersion) {
      const result = await slice.installPlugin(ctx);
      if (!result.ok) {
        this.writeNegativeCacheEntry(cacheKey, slice, result.reason);
        return result;
      }
      installedVersion = result.version;
    }

    this.writeCacheEntry(cacheKey, {
      agentBinaryVersion: "n/a",
      pluginVersion: installedVersion ?? slice.pluginVersion,
      protocolVersion: slice.minProtocolVersion,
      platform: process.platform,
      verifiedAt: new Date().toISOString(),
      supportsL1: true,
    });
    return { ok: true, version: installedVersion ?? slice.pluginVersion };
  }

  /**
   * Write a `supportsL1: false` cache entry, or skip when the slice's
   * `pluginVersion` is the `"0.0.0"` sentinel — those verdicts reflect a
   * transient "manifest unreadable at module load" state, not a real negative,
   * and would otherwise block hook install until the next cache TTL expiry.
   */
  private writeNegativeCacheEntry(
    cacheKey: string,
    slice: AgentCliHookPluginSupport,
    reason: string,
  ): void {
    if (slice.pluginVersion === PLUGIN_VERSION_UNKNOWN) {
      console.warn(
        `[supervisor] not caching hook install failure for ${cacheKey} ` +
          `(reason: ${reason}): plugin manifest not readable — will retry next session`,
      );
      return;
    }
    console.warn(
      `[supervisor] hook install for ${cacheKey} failed (reason: ${reason}); ` +
        `thread will fall back to L2 terminal parsing`,
    );
    this.writeCacheEntry(cacheKey, {
      agentBinaryVersion: "n/a",
      pluginVersion: slice.pluginVersion,
      protocolVersion: slice.minProtocolVersion,
      platform: process.platform,
      verifiedAt: new Date().toISOString(),
      supportsL1: false,
    });
  }

  private writeCacheEntry(cacheKey: string, entry: AgentHookSupportEntry): void {
    const settings = readSharedSettings(this.options.settingsPath);
    const next = {
      ...settings,
      agentHookSupport: { ...settings.agentHookSupport, [cacheKey]: entry },
    };
    try {
      mkdirSync(dirname(this.options.settingsPath), { recursive: true });
      writeFileSync(this.options.settingsPath, JSON.stringify(next, null, 2), "utf8");
    } catch (error) {
      console.warn("[supervisor] failed to persist agentHookSupport cache:", error);
    }
  }

  private deleteCacheEntry(cacheKey: string): void {
    const settings = readSharedSettings(this.options.settingsPath);
    const nextSupport = { ...settings.agentHookSupport };
    delete nextSupport[cacheKey];
    try {
      mkdirSync(dirname(this.options.settingsPath), { recursive: true });
      writeFileSync(
        this.options.settingsPath,
        JSON.stringify({ ...settings, agentHookSupport: nextSupport }, null, 2),
        "utf8",
      );
    } catch (error) {
      console.warn("[supervisor] failed to remove agentHookSupport cache:", error);
    }
  }

  private contextForEnv(env: AgentHookPluginEnv): AgentEnvContext {
    const nativeKind = process.platform === "win32" ? "windows" : "posix";
    const ctx: AgentEnvContext =
      env.kind === "wsl" ? { envKind: "wsl", wslDistro: env.distro } : { envKind: nativeKind };
    const baseDir = this.options.baseDir;
    if (ctx.baseDir !== undefined || baseDir === undefined) return ctx;
    return { ...ctx, baseDir };
  }

  private async getStatus(
    agentKind: AgentKind,
    env: AgentHookPluginEnv,
  ): Promise<AgentHookPluginStatus> {
    const adapter = this.options.adapters.get(agentKind);
    const slice = adapter ? toCliHookPluginSlice(adapter) : undefined;
    if (!adapter || !slice || !isTerminalLiveInput(adapter)) {
      return {
        agentKind,
        env,
        supported: false,
        installed: false,
        bundledVersion: "0.0.0",
        canUninstall: false,
        reason: "unsupported provider",
      };
    }
    const ctx = this.contextForEnv(env);
    await warmWslHomeCache(ctx);
    // Probe support and install state in parallel — they have no data
    // dependency and each can incur a WSL round trip when env.kind === "wsl".
    const [supportedResult, installedResult] = await Promise.all([
      Promise.resolve(slice.isPluginSupported?.(ctx) ?? true).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
      slice.isPluginInstalled(ctx).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    ]);
    let supported = true;
    let reason: string | undefined;
    if (supportedResult.ok) {
      supported = supportedResult.value;
      if (!supported) reason = "unsupported environment";
    } else {
      supported = false;
      reason = errorMessage(supportedResult.error);
    }
    const installed: Awaited<ReturnType<AgentCliHookPluginSupport["isPluginInstalled"]>> =
      installedResult.ok ? installedResult.value : { installed: false };
    if (!installedResult.ok) {
      reason = errorMessage(installedResult.error);
    }
    return {
      agentKind,
      env,
      supported,
      installed: installed.installed,
      ...(installed.version ? { version: installed.version } : {}),
      bundledVersion: slice.pluginVersion,
      canUninstall: Boolean(slice.uninstallPlugin),
      ...(reason ? { reason } : {}),
    };
  }
}

type InstallOutcome = { ok: true; version: string } | { ok: false; reason: string };

/**
 * Compose the per-environment cache key. Native (windows/posix) keeps the
 * bare `AgentKind` so existing on-disk cache entries continue to be valid.
 * WSL gets a per-distro suffix so a verdict for `Ubuntu` doesn't shadow
 * one for `Debian` — Node availability and plugin install state can differ
 * between distros on the same host.
 */
function composeCacheKey(kind: AgentKind, ctx: AgentEnvContext): string {
  if (ctx.envKind === "wsl" && ctx.wslDistro) {
    return `${kind}::wsl::${ctx.wslDistro}`;
  }
  return kind;
}

async function warmWslHomeCache(ctx: AgentEnvContext): Promise<void> {
  if (ctx.envKind !== "wsl" || !ctx.wslDistro) return;
  await resolveWslHomeDirectoryAsync(ctx.wslDistro);
}

function defaultEnvContext(
  _agentKind: AgentKind,
  projectLocation?: ProjectLocation,
): AgentEnvContext {
  if (projectLocation?.kind === "wsl") {
    return { envKind: "wsl", wslDistro: projectLocation.distro };
  }
  if (projectLocation?.kind === "windows") {
    return { envKind: "windows" };
  }
  if (projectLocation?.kind === "posix") {
    return { envKind: "posix" };
  }
  return process.platform === "win32" ? { envKind: "windows" } : { envKind: "posix" };
}

/**
 * Guard against enabling CLI hook plugins for server-controlled agents (ACP, SDK,
 * vendor daemons). Those adapters surface status through their own control
 * channel — layering a hook plugin on top only produces duplicate events.
 * A missing `liveInputMode` defaults to terminal for backward compatibility
 * with older adapter fixtures in tests.
 */
function isTerminalLiveInput(adapter: AgentAdapter): boolean {
  const mode = adapter.capabilities?.liveInputMode;
  return mode === undefined || mode === "terminal";
}

function toCliHookPluginSlice(adapter: AgentAdapter): AgentCliHookPluginSupport | undefined {
  if (
    !adapter.installPlugin ||
    !adapter.isPluginInstalled ||
    !adapter.pluginId ||
    !adapter.pluginVersion
  ) {
    return undefined;
  }
  // The slice fields are all `Partial`'d on `AgentAdapter`; once the required
  // ones are present we can safely treat the adapter as the full interface.
  return adapter as unknown as AgentCliHookPluginSupport;
}

function readSharedSettings(path: string) {
  if (!existsSync(path)) return { ...defaultSharedSettings };
  try {
    const raw = readFileSync(path, "utf8");
    return normalizeSharedSettings(JSON.parse(raw));
  } catch {
    return { ...defaultSharedSettings };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
