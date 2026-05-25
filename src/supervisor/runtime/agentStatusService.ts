import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { z } from "zod";
import {
  agentCapabilitySchema,
  agentProviderMetadataSchema,
  agentSettingDefSchema,
  agentStatusSchema,
  type AgentStatus,
  type AgentStatusesResponse,
  type GetAgentStatusesPayload,
  type RefreshAgentScope,
  type RefreshAgentScopeEnv,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { normalizeSharedSettings } from "@/shared/settings";
import { normalizeWslListOutput } from "@/shared/wsl";
import {
  primeExecutablePathCache,
  type AgentAdapter,
  type AgentEnvContext,
  getWslCommand,
} from "../agents/base";

const execFileAsync = promisify(execFile);

/**
 * Bump whenever a cached `AgentStatus` field's shape or derivation changes so
 * that previously-saved caches are invalidated and a fresh detection runs. v2
 * coincides with `DetectionSpec.loginCommand` becoming a function that depends
 * on the project location (e.g. `grok login --device-auth` on WSL).
 */
const STATUS_CACHE_VERSION = 2;

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
): Promise<AgentStatus[]> {
  const adapterList = [...adapters];
  const statuses = await Promise.all(
    distros.map(async (distro) => {
      const ctx: AgentEnvContext = { envKind: "wsl", wslDistro: distro };
      return Promise.all(
        adapterList.map(async (adapter) => {
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
              const detected = await adapter.detectInstall(ctx);
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

export class AgentStatusService {
  private pendingDetection: Promise<DetectionResults> | undefined;
  private startupDetectionLaunched = false;
  private startupDetectionWslDistros = new Set<string>();

  constructor(private readonly options: AgentStatusServiceOptions) {}

  async listWslDistros(): Promise<string[]> {
    const startedAt = Date.now();
    try {
      const { stdout } = await execFileAsync(getWslCommand(), ["-l", "-q"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5_000,
      });
      console.log(`[supervisor] listWslDistros: ${Date.now() - startedAt}ms`);
      return normalizeWslListOutput(stdout ?? "");
    } catch {
      console.log(`[supervisor] listWslDistros: failed (${Date.now() - startedAt}ms)`);
      return [];
    }
  }

  async getAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    const wslDistros = [...new Set(payload.wslDistros)];
    const cached = this.readCachedStatuses(wslDistros);
    this.detectStartupAgentStatusesBackground(wslDistros);
    return cached;
  }

  async refreshAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    const wslDistros = [...new Set(payload.wslDistros)];
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
    const disabled = this.readDisabledAgents();

    const probed = await Promise.all(
      targetAdapters.flatMap((adapter) =>
        targetEnvs.map((env) => this.probeScopedStatus(adapter, env, disabled)),
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
    const ctx: AgentEnvContext | undefined = isWsl
      ? { envKind: "wsl", wslDistro: env.distro }
      : undefined;
    try {
      const detected = ctx ? await adapter.detectInstall(ctx) : await adapter.detectInstall();
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

  private readDisabledAgents(): Set<string> {
    try {
      const raw = readFileSync(this.options.settingsPath, "utf8");
      const settings = normalizeSharedSettings(JSON.parse(raw));
      return new Set(settings.disabledAgents);
    } catch {
      return new Set();
    }
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
    const disabled = this.readDisabledAgents();

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
            const detected = await adapter.detectInstall();
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

    const wslPromise = detectWslAgentStatuses(adapters, wslDistros, disabled, (status) => {
      this.options.emit({ type: "agent-detected", status });
    })
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
