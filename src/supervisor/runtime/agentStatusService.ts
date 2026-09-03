import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { z } from "zod";
import {
  agentCapabilitySchema,
  agentProviderMetadataSchema,
  agentSettingDefSchema,
  agentStatusSchema,
  type AgentCapability,
  type AgentKind,
  type AgentStatus,
  type AgentStatusesResponse,
  type GetAgentStatusesPayload,
  type RefreshAgentScope,
  type RefreshAgentScopeEnv,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { effectiveAgentSettings } from "@/shared/machineSettings";
import { localMachineKey, type AgentEnv } from "@/shared/machines";
import { normalizeSharedSettings } from "@/shared/settings";
import {
  getWindowsSystemCommand,
  invalidateExecutablePathCache,
  primeExecutablePathCache,
  type AgentAdapter,
  type AgentEnvContext,
} from "../agents/base";
import { clearFastModeCache } from "../agents/claude/fastModeCache";
import { readSupervisorSharedSettings } from "./supervisorSharedSettings";

const execFileAsync = promisify(execFile);

/**
 * Bump whenever a cached `AgentStatus` field's shape or derivation changes so
 * that previously-saved caches are invalidated and a fresh detection runs. v2
 * coincides with `DetectionSpec.loginCommand` becoming a function that depends
 * on the project location (e.g. `grok login --device-auth` on WSL). v3 adds
 * `AgentCapability.fastDisabledReason` (Claude fast-mode org gating). v4 adds
 * `AgentCapability.supportsOneShot` (so one-shot-only AI settings selectors can
 * hide interactive-only provider instances). v5 adds
 * `AgentStatus.preferTerminalLogin` (probe-reported; replaces the renderer's
 * hardcoded Grok check) and `AgentCapability.mcpScope` (adapter-declared;
 * replaces renderer shadow tables).
 * v6 adds structured skill command metadata. v7 makes provider detection
 * depend on provider-global settings (for example Cursor's selected structured
 * runtime), so statuses written before that setting was supplied must not be
 * reused. v8 adds independently cached runtime variants and session-id routing
 * so existing threads remain pinned when a provider's default runtime changes.
 * v9 refreshes ACP-derived model capabilities after adding support for model
 * lists advertised through initialize metadata (used by Grok 0.2.x). v10
 * invalidates v9 results whose macOS Grok probe could not find Node because
 * the login-shell environment was not forwarded to the ACP child process.
 * v11 adds Codex context-window sizes (272k/400k/1m plus a user-editable list)
 * so cached statuses without those capability fields are not reused. v12
 * records successful ACP session setup separately from authentication so
 * advertised auth methods do not create a false Login requirement. v13
 * normalizes ACP mode labels for display, so statuses cached with raw ids
 * (`smart_approve`) as approval-policy labels must be re-probed.
 * v14 derives terminal auth-method `env` from `DetectionSpec.baseSpawnEnv`
 * during status assembly, so statuses cached before that derivation (e.g.
 * antigravity login without `AGY_CLI_DISABLE_AUTO_UPDATE`) must be re-probed
 * or the login command runs without the provider's base env.
 * v15 adds ACP-derived per-model thinking toggles and normalizes provider model
 * capability maps, so statuses cached before those capability semantics changed
 * must be re-probed.
 * v16 makes Cursor profiles SDK-only (no CLI/ACP probe or shared login), so
 * statuses that advertised profile CLI login/ACP variants must be re-probed.
 * v17 adds per-runtime `providerMetadata` so Cursor SDK can show the API-key
 * account email without overwriting the CLI login identity.
 * v18 regroups Cursor first-party models (Grok, Composer, future Cursor ids)
 * into the Cursor Models pool by denylisting known third-party vendor prefixes
 * instead of allowlisting first-party families.
 * v19 replaces Command Code's curated fallback model tables/static efforts
 * (and its `defaultEffort`) with live-only discovery, so cached statuses from
 * before the switch would keep serving a stale deepseek-era picker.
 * v20 resolves per-machine agent-setting overrides (`machineSettings`) into
 * detection, so statuses cached under kind-global settings must be re-probed.
 * v21 adds Antigravity's independently detected terminal and ACP runtimes and
 * ACP-probed resume capability, so terminal-only cached statuses are invalid.
 * v22 adds Muse's `authLogoutSupported` (the `muse logout` Settings action),
 * so cached Muse statuses that hide the logout button must be re-probed.
 */
export const STATUS_CACHE_VERSION = 22;
const WSL_AGENT_DETECTION_TIMEOUT_MS = 60_000;
const WSL_LXSS_REGISTRY_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss";

/**
 * Agent settings effective for a local env's machine, or undefined when no
 * value exists — detection contexts historically omit `agentSettings` rather
 * than passing an empty object.
 */
function machineAgentSettingsFor(
  settings: Pick<
    ReturnType<typeof normalizeSharedSettings>,
    | "agentSettings"
    | "machineScopeModes"
    | "machineSettings"
    | "providerOrder"
    | "hiddenModels"
    | "disabledAgents"
  >,
  env: AgentEnv,
  agentKind: string,
): Record<string, boolean | string> | undefined {
  const merged = effectiveAgentSettings(settings, localMachineKey(env), agentKind);
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function migrateSettingDef(definition: Record<string, unknown>): Record<string, unknown> {
  if (definition.type === "toggle" || definition.type === "select") {
    return definition;
  }
  if (typeof definition.default === "boolean") {
    const env =
      typeof definition.envVar === "string"
        ? { [definition.envVar]: "1" }
        : typeof definition.env === "object" && definition.env !== null
          ? definition.env
          : {};
    return { ...definition, type: "toggle", env };
  }
  return definition;
}

const cachedAgentStatusSchema = agentStatusSchema.extend({
  capabilities: agentCapabilitySchema.extend({
    settingDefs: z.array(agentSettingDefSchema).catch([]),
  }),
});

function parseCachedStatuses(entries: unknown[] | undefined): AgentStatus[] {
  if (!entries) {
    return [];
  }

  const results: AgentStatus[] = [];
  for (const entry of entries) {
    if (entry != null && typeof entry === "object") {
      const capabilities = (entry as Record<string, unknown>).capabilities;
      if (capabilities != null && typeof capabilities === "object") {
        const capRecord = capabilities as Record<string, unknown>;
        if (Array.isArray(capRecord.settingDefs)) {
          capRecord.settingDefs = capRecord.settingDefs.map((definition: unknown) =>
            definition != null && typeof definition === "object"
              ? migrateSettingDef(definition as Record<string, unknown>)
              : definition,
          );
        }
      }
      const record = entry as Record<string, unknown>;
      if ("providerMetadata" in record) {
        const metadata = agentProviderMetadataSchema.safeParse(record.providerMetadata);
        if (metadata.success) {
          record.providerMetadata = metadata.data;
        } else {
          delete record.providerMetadata;
        }
      }
    }

    const parsed = cachedAgentStatusSchema.safeParse(entry);
    if (parsed.success) {
      results.push(parsed.data);
    }
  }
  return results;
}

function filterWslStatusesForDistros(
  statuses: readonly AgentStatus[],
  distros: readonly string[],
): AgentStatus[] {
  if (distros.length === 0) {
    return [];
  }
  const distroSet = new Set(distros);
  return statuses.filter(
    (status) => status.envDistro !== undefined && distroSet.has(status.envDistro),
  );
}

function statusEnvKey(status: AgentStatus): string {
  return `${status.kind}|${status.envKind ?? ""}|${status.envDistro ?? ""}`;
}

function mergeScopedStatuses(
  existingWindows: readonly AgentStatus[],
  existingWsl: readonly AgentStatus[],
  probed: readonly AgentStatus[],
): { windows: AgentStatus[]; wsl: AgentStatus[] } {
  const byKey = new Map<string, AgentStatus>();
  for (const status of existingWindows) byKey.set(statusEnvKey(status), status);
  for (const status of existingWsl) byKey.set(statusEnvKey(status), status);
  for (const status of probed) byKey.set(statusEnvKey(status), status);

  const windows: AgentStatus[] = [];
  const wsl: AgentStatus[] = [];
  for (const status of byKey.values()) {
    if (status.envKind === "wsl") {
      wsl.push(status);
    } else {
      windows.push(status);
    }
  }
  return { windows, wsl };
}

export async function detectWslAgentStatuses(
  adapters: Iterable<AgentAdapter>,
  distros: readonly string[],
  disabled?: ReadonlySet<string>,
  onStatus?: (status: AgentStatus) => void,
  agentSettingsFor?: (
    agentKind: string,
    distro: string,
  ) => Record<string, boolean | string> | undefined,
): Promise<AgentStatus[]> {
  const adapterList = [...adapters];
  const statuses = await Promise.all(
    distros.map(async (distro) => {
      return Promise.all(
        adapterList.map(async (adapter) => {
          const settings = agentSettingsFor?.(adapter.kind, distro);
          const ctx: AgentEnvContext = {
            envKind: "wsl",
            wslDistro: distro,
            ...(settings ? { agentSettings: settings } : {}),
          };
          let status: AgentStatus;
          if (disabled?.has(adapter.kind)) {
            status = {
              kind: adapter.kind,
              label: adapter.label,
              installed: true,
              authState: "unknown" as const,
              capabilities: adapter.capabilities,
              ...(adapter.update ? { update: adapter.update } : {}),
              envKind: "wsl" as const,
              envDistro: distro,
            };
          } else {
            try {
              let timeout: NodeJS.Timeout | undefined;
              const abort = new AbortController();
              const detected = await Promise.race([
                adapter.detectInstall({ ...ctx, signal: abort.signal }),
                new Promise<never>((_, reject) => {
                  timeout = setTimeout(() => {
                    abort.abort();
                    reject(
                      new Error(
                        `detectInstall(${adapter.kind}, wsl:${distro}) timed out after ${WSL_AGENT_DETECTION_TIMEOUT_MS}ms`,
                      ),
                    );
                  }, WSL_AGENT_DETECTION_TIMEOUT_MS);
                  if (typeof timeout.unref === "function") timeout.unref();
                }),
              ]).finally(() => {
                if (timeout) clearTimeout(timeout);
              });
              status = { ...detected, envKind: "wsl" as const, envDistro: distro };
            } catch (error) {
              console.error(
                `[supervisor] detectInstall(${adapter.kind}, wsl:${distro}) failed`,
                error,
              );
              status = {
                kind: adapter.kind,
                label: adapter.label,
                installed: false,
                authState: "unknown" as const,
                capabilities: adapter.capabilities,
                ...(adapter.update ? { update: adapter.update } : {}),
                envKind: "wsl" as const,
                envDistro: distro,
              };
            }
          }
          onStatus?.(status);
          return status;
        }),
      );
    }),
  );

  return statuses.flat();
}

export interface AgentStatusServiceOptions {
  adapters: Map<string, AgentAdapter>;
  settingsPath: string;
  statusCachePath: string;
  emit(event: SupervisorEvent): void;
}

interface DetectionResults {
  windows: AgentStatus[];
  wsl: AgentStatus[];
}

export function parseWslRegistryDistributionNames(stdout: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/g)) {
    const match = line.match(/^\s*DistributionName\s+REG_\w+\s+(.+?)\s*$/u);
    const name = match?.[1]?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

const WSL_DISTRO_CACHE_TTL_MS = 30_000;

export class AgentStatusService {
  private pendingDetection: Promise<DetectionResults> | undefined;
  private startupDetectionLaunched = false;
  private startupDetectionWslDistros = new Set<string>();
  private pendingWslDistroList: Promise<string[]> | undefined;
  private wslDistroCache: { value: string[]; expiresAt: number } | undefined;

  constructor(private readonly options: AgentStatusServiceOptions) {}

  async listWslDistros(): Promise<string[]> {
    if (process.platform !== "win32") return [];
    const now = Date.now();
    if (this.wslDistroCache && this.wslDistroCache.expiresAt > now) {
      return [...this.wslDistroCache.value];
    }
    if (this.pendingWslDistroList) {
      return [...(await this.pendingWslDistroList)];
    }

    const startedAt = now;
    const pending = (async () => {
      try {
        const { stdout } = await execFileAsync(
          getWindowsSystemCommand("reg.exe"),
          ["query", WSL_LXSS_REGISTRY_KEY, "/s", "/v", "DistributionName"],
          {
            encoding: "utf8",
            windowsHide: true,
            timeout: 5_000,
          },
        );
        console.log(`[supervisor] listWslDistros: ${Date.now() - startedAt}ms`);
        return parseWslRegistryDistributionNames(stdout ?? "");
      } catch {
        console.log(`[supervisor] listWslDistros: failed (${Date.now() - startedAt}ms)`);
        return [];
      }
    })();
    this.pendingWslDistroList = pending;
    try {
      const value = await pending;
      this.wslDistroCache = { value, expiresAt: Date.now() + WSL_DISTRO_CACHE_TTL_MS };
      return [...value];
    } finally {
      if (this.pendingWslDistroList === pending) {
        this.pendingWslDistroList = undefined;
      }
    }
  }

  async getAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    const wslDistros = [...new Set(payload.wslDistros)];
    const cached = this.readCachedStatuses(wslDistros);
    this.detectStartupAgentStatusesBackground(wslDistros);
    return cached;
  }

  /**
   * Synchronous view of one provider's native capabilities as the last
   * detection sweep persisted them — the same source `getAgentStatuses` serves
   * the renderer composer and the Crossagents MCP roster from. The subagent
   * spawn/create_thread paths validate against this so a selection accepted by
   * `list_agents`/`get_agent` is accepted by the executor too, instead of
   * racing the adapter's in-memory capabilities (which stay at their empty
   * defaults until this session's probe completes). Returns `undefined` when
   * there is no cache entry or the provider isn't installed + authenticated in
   * it. Returns `null` when a populated cache says the provider is unavailable,
   * and `undefined` only when no cache exists yet.
   */
  getCachedCapabilities(kind: AgentKind): AgentCapability | null | undefined {
    const { windows, fromCache } = this.readCachedStatuses([]);
    if (!fromCache) return undefined;
    const status = windows.find(
      (s) => s.kind === kind && s.installed && s.authState === "authenticated",
    );
    return status?.capabilities ?? null;
  }

  /** Return the last detected installed version for one native or WSL provider. */
  getCachedVersion(kind: AgentKind, wslDistro?: string): string | undefined {
    const cached = this.readCachedStatuses(wslDistro ? [wslDistro] : []);
    if (!cached.fromCache) return undefined;
    const statuses = wslDistro ? cached.wsl : cached.windows;
    return statuses.find(
      (status) =>
        status.kind === kind &&
        status.installed &&
        (wslDistro === undefined || status.envDistro?.toLowerCase() === wslDistro.toLowerCase()),
    )?.version;
  }

  async refreshAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    const wslDistros = [...new Set(payload.wslDistros)];
    // An explicit refresh is the signal that something changed on disk (an
    // install/update just ran), so bypass the binary-path TTL cache and re-read
    // PATH (including the registry-backed Windows user/machine PATH) fresh.
    invalidateExecutablePathCache();
    // Also re-check Claude's per-account fast-mode availability (an org may have
    // since enabled/disabled it); the next capabilities probe repopulates it.
    void clearFastModeCache();
    if (payload.scope) {
      return this.runScopedDetection(wslDistros, payload.scope);
    }
    this.startupDetectionLaunched = true;
    for (const distro of wslDistros) {
      this.startupDetectionWslDistros.add(distro);
    }
    const previousDetection = this.pendingDetection;
    const fresh = await this.runDetectionTask(async () => {
      if (previousDetection) {
        await previousDetection.catch(() => ({ windows: [], wsl: [] }));
      }
      return this.runDetection(wslDistros);
    });
    return { ...fresh, fromCache: false };
  }

  /**
   * Probes only the (adapter × env) combinations named in `scope`, then merges
   * the freshly-probed statuses into the on-disk cache. Avoids re-running the
   * full N-adapter × M-env detection sweep after an install or login.
   *
   * Per-status updates are streamed via `agent-status-updated` events so the
   * renderer can upsert into its store without overwriting unrelated entries.
   * The returned response contains the merged full lists so awaiters that
   * inspect the response (e.g. install flows checking `authState`) keep
   * working.
   */
  private async runScopedDetection(
    wslDistros: readonly string[],
    scope: RefreshAgentScope,
  ): Promise<AgentStatusesResponse> {
    const existing = this.readCachedStatuses(wslDistros);
    // Without a baseline cache we have no merge target — fall back to a full
    // detection so the renderer ends up with a complete list. Callers
    // typically hit this path well after startup, so this is rare.
    if (!existing.fromCache) {
      this.startupDetectionLaunched = true;
      const fresh = await this.runDetectionTask(() => this.runDetection(wslDistros));
      return { ...fresh, fromCache: false };
    }

    const allAdapters = [...this.options.adapters.values()];
    const adapterByKind = new Map(allAdapters.map((adapter) => [adapter.kind, adapter]));
    const targetAdapters = scope.agentKinds
      .map((kind) => adapterByKind.get(kind))
      .filter((adapter): adapter is AgentAdapter => adapter !== undefined);

    const targetEnvs = this.resolveScopedEnvs(scope.envs, wslDistros);
    const settings = this.readSettings();
    const disabled = new Set(settings.disabledAgents);

    const probed = await Promise.all(
      targetAdapters.flatMap((adapter) =>
        targetEnvs.map((env) =>
          this.probeScopedStatus(
            adapter,
            env,
            disabled,
            machineAgentSettingsFor(settings, env, adapter.kind),
          ),
        ),
      ),
    );

    for (const status of probed) {
      this.options.emit({ type: "agent-status-updated", status });
    }

    const merged = mergeScopedStatuses(existing.windows, existing.wsl, probed);
    this.writeDiskCache(merged.windows, merged.wsl);
    return { ...merged, fromCache: false };
  }

  private resolveScopedEnvs(
    envs: RefreshAgentScope["envs"],
    wslDistros: readonly string[],
  ): RefreshAgentScopeEnv[] {
    if (envs && envs.length > 0) {
      return envs;
    }
    const nativeEnv: RefreshAgentScopeEnv = { kind: "native" };
    return [
      nativeEnv,
      ...wslDistros.map<RefreshAgentScopeEnv>((distro) => ({ kind: "wsl", distro })),
    ];
  }

  private async probeScopedStatus(
    adapter: AgentAdapter,
    env: RefreshAgentScopeEnv,
    disabled: ReadonlySet<string>,
    agentSettings: Record<string, boolean | string> | undefined,
  ): Promise<AgentStatus> {
    const isWsl = env.kind === "wsl";
    const nativeEnvKind: "windows" | "posix" = process.platform === "win32" ? "windows" : "posix";
    const envKind: "windows" | "posix" | "wsl" = isWsl ? "wsl" : nativeEnvKind;
    const envDistro = isWsl ? env.distro : undefined;

    if (disabled.has(adapter.kind)) {
      return {
        kind: adapter.kind,
        label: adapter.label,
        installed: true,
        authState: "unknown",
        capabilities: adapter.capabilities,
        ...(adapter.update ? { update: adapter.update } : {}),
        envKind,
        ...(envDistro ? { envDistro } : {}),
      };
    }
    const ctx: AgentEnvContext = isWsl
      ? {
          envKind: "wsl",
          wslDistro: env.distro,
          ...(agentSettings ? { agentSettings } : {}),
        }
      : {
          envKind: nativeEnvKind,
          ...(agentSettings ? { agentSettings } : {}),
        };
    try {
      const detected = await adapter.detectInstall(ctx);
      return {
        ...detected,
        envKind,
        ...(envDistro ? { envDistro } : {}),
      };
    } catch (error) {
      const where = isWsl ? `wsl:${env.distro}` : "native";
      console.error(`[supervisor] scoped detectInstall(${adapter.kind}, ${where}) failed`, error);
      return {
        kind: adapter.kind,
        label: adapter.label,
        installed: false,
        authState: "unknown",
        capabilities: adapter.capabilities,
        ...(adapter.update ? { update: adapter.update } : {}),
        envKind,
        ...(envDistro ? { envDistro } : {}),
      };
    }
  }

  /**
   * Reads the on-disk status cache and returns parsed statuses.  Returns
   * `fromCache: false` when no cache file exists (first launch) or when the
   * cache is unreadable — callers should show a detecting/loading state until
   * fresh detection events arrive.
   *
   * Returning the cache directly from the RPC (instead of emitting it as an
   * event) avoids a startup race where the ThreadDraft renders "No supported
   * agents detected" before the cache event is received.
   */
  private readCachedStatuses(wslDistros: readonly string[]): AgentStatusesResponse {
    try {
      const raw = readFileSync(this.options.statusCachePath, "utf8");
      const cache = JSON.parse(raw) as {
        version?: number;
        windows?: unknown[];
        wsl?: unknown[];
      };

      // Cache version is bumped whenever derived fields like `loginCommand`
      // change shape (e.g. when an adapter's static string becomes a function
      // that depends on the project location). Stale caches would otherwise
      // hand back pre-bump values that no longer match what fresh detection
      // would compute.
      if (cache.version !== STATUS_CACHE_VERSION) {
        return { windows: [], wsl: [], fromCache: false };
      }

      const windows = parseCachedStatuses(cache.windows)
        .filter((status) => status.envKind !== "wsl")
        .map((status) => this.withCachedCapabilityDefaults(status));
      const wsl = filterWslStatusesForDistros(parseCachedStatuses(cache.wsl), wslDistros).map(
        (status) => this.withCachedCapabilityDefaults(status),
      );

      return { windows, wsl, fromCache: true };
    } catch {
      return { windows: [], wsl: [], fromCache: false };
    }
  }

  private withCachedCapabilityDefaults(status: AgentStatus): AgentStatus {
    const adapter = this.options.adapters.get(status.kind);
    const fallbackSlashCommands = adapter?.capabilities.slashCommands;
    const fallbackUpdate = adapter?.update;
    if (
      (status.capabilities.slashCommands !== undefined || fallbackSlashCommands === undefined) &&
      (status.update !== undefined || fallbackUpdate === undefined)
    ) {
      return status;
    }
    return {
      ...status,
      ...(status.update === undefined && fallbackUpdate ? { update: fallbackUpdate } : {}),
      capabilities: {
        ...status.capabilities,
        ...(status.capabilities.slashCommands === undefined && fallbackSlashCommands
          ? { slashCommands: fallbackSlashCommands }
          : {}),
      },
    };
  }

  private writeDiskCache(windows: AgentStatus[], wsl: AgentStatus[]): void {
    try {
      writeFileSync(
        this.options.statusCachePath,
        JSON.stringify({
          version: STATUS_CACHE_VERSION,
          windows,
          wsl,
          savedAt: new Date().toISOString(),
        }),
        "utf8",
      );
    } catch {
      // best-effort cache
    }
  }

  private readSettings(): ReturnType<typeof normalizeSharedSettings> {
    return readSupervisorSharedSettings(this.options.settingsPath);
  }

  private runDetectionTask(task: () => Promise<DetectionResults>): Promise<DetectionResults> {
    const pending = task().finally(() => {
      if (this.pendingDetection === pending) {
        this.pendingDetection = undefined;
      }
    });
    this.pendingDetection = pending;
    return pending;
  }

  private detectStartupAgentStatusesBackground(wslDistros: readonly string[]): void {
    const newWslDistros = wslDistros.filter(
      (distro) => !this.startupDetectionWslDistros.has(distro),
    );
    if (this.startupDetectionLaunched && newWslDistros.length === 0) {
      return;
    }
    this.startupDetectionLaunched = true;
    for (const distro of newWslDistros) {
      this.startupDetectionWslDistros.add(distro);
    }
    const detectionWslDistros = [...this.startupDetectionWslDistros];
    const previousDetection = this.pendingDetection;
    void this.runDetectionTask(async () => {
      if (previousDetection) {
        await previousDetection.catch(() => ({ windows: [], wsl: [] }));
      }
      return this.runDetection(detectionWslDistros);
    });
  }

  private async runDetection(wslDistros: readonly string[]): Promise<DetectionResults> {
    const adapters = [...this.options.adapters.values()];
    const settings = this.readSettings();
    const disabled = new Set(settings.disabledAgents);

    // Native detection on macOS spawns the user's interactive login shell
    // once per binary lookup (nvm + plugin-heavy zshrc ≈ 2-3s each). N
    // parallel adapters then push individual probes past their 5s timeout
    // and a random subset is marked missing. Pay the shell startup once
    // by batching every adapter's binary into a single shell invocation.
    if (process.platform !== "win32") {
      const enabledBinaries = adapters
        .filter((adapter) => !disabled.has(adapter.kind))
        .map((adapter) => adapter.binary)
        .filter((binary): binary is string => typeof binary === "string");
      // copilot's auth probe additionally resolves `gh` — prime it too so
      // we don't fall back to a per-call shell spawn.
      await primeExecutablePathCache([...enabledBinaries, "gh"]);
    }

    const nativeEnvKind: "windows" | "posix" = process.platform === "win32" ? "windows" : "posix";
    const nativePromise = Promise.all(
      adapters.map(async (adapter) => {
        let status: AgentStatus;
        if (disabled.has(adapter.kind)) {
          status = {
            kind: adapter.kind,
            label: adapter.label,
            installed: true,
            authState: "unknown",
            capabilities: adapter.capabilities,
            envKind: nativeEnvKind,
          };
        } else {
          try {
            const agentSettings = machineAgentSettingsFor(
              settings,
              { kind: "native" },
              adapter.kind,
            );
            const detected = await adapter.detectInstall({
              envKind: nativeEnvKind,
              ...(agentSettings ? { agentSettings } : {}),
            });
            status = { ...detected, envKind: nativeEnvKind };
          } catch (error) {
            console.error(`[supervisor] detectInstall(${adapter.kind}) failed`, error);
            status = {
              kind: adapter.kind,
              label: adapter.label,
              installed: false,
              authState: "unknown",
              capabilities: adapter.capabilities,
              envKind: nativeEnvKind,
            };
          }
        }
        // Stream per adapter so the first-launch discovery screen can reveal
        // tiles in real time. The terminal `windows-agent-statuses` event
        // still fires below with the full list.
        this.options.emit({ type: "agent-detected", status });
        return status;
      }),
    ).then((statuses) => {
      this.options.emit({ type: "windows-agent-statuses", statuses });
      return statuses;
    });

    const wslPromise = detectWslAgentStatuses(
      adapters,
      wslDistros,
      disabled,
      (status) => {
        this.options.emit({ type: "agent-detected", status });
      },
      (agentKind, distro) => machineAgentSettingsFor(settings, { kind: "wsl", distro }, agentKind),
    )
      .then((statuses) => {
        this.options.emit({ type: "wsl-agent-statuses", statuses });
        return statuses;
      })
      .catch((error) => {
        // Ensure the renderer always gets a terminal event for WSL — otherwise
        // its loading state would hang forever on detection failure. Emit an
        // empty list and surface the error in logs.
        console.error("[supervisor] detectWslAgentStatuses failed", error);
        this.options.emit({ type: "wsl-agent-statuses", statuses: [] });
        return [] as AgentStatus[];
      });

    const [nativeResult, wslResult] = await Promise.allSettled([nativePromise, wslPromise]);
    const nativeStatuses = nativeResult.status === "fulfilled" ? nativeResult.value : [];
    const wslStatuses = wslResult.status === "fulfilled" ? wslResult.value : [];

    // Native detection may have thrown before emitting — ensure the renderer
    // always gets a terminal windows-agent-statuses event.
    if (nativeResult.status === "rejected") {
      console.error("[supervisor] native detection failed", nativeResult.reason);
      this.options.emit({ type: "windows-agent-statuses", statuses: [] });
    }

    if (wslDistros.length === 0) {
      this.options.emit({ type: "wsl-agent-statuses", statuses: [] });
    }

    this.writeDiskCache(nativeStatuses, wslStatuses);
    return { windows: nativeStatuses, wsl: wslStatuses };
  }
}
