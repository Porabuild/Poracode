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
  type ProjectLocation,
  type RefreshAgentScope,
  type RefreshAgentScopeEnv,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { normalizeSharedSettings } from "@/shared/settings";
import { normalizeWslListOutput } from "@/shared/wsl";
import {
  invalidateExecutablePathCache,
  primeExecutablePathCache,
  type AgentAdapter,
  type AgentEnvContext,
  getWslCommand,
} from "../agents/base";
import { clearFastModeCache } from "../agents/claude/fastModeCache";

const execFileAsync = promisify(execFile);

/**
 * Bump whenever a cached `AgentStatus` field's shape or derivation changes so
 * that previously-saved caches are invalidated and a fresh detection runs. v2
 * coincides with `DetectionSpec.loginCommand` becoming a function that depends
 * on the project location (e.g. `grok login --device-auth` on WSL). v3 adds
 * `AgentCapability.fastDisabledReason` (Claude fast-mode org gating).
 */
export const STATUS_CACHE_VERSION = 3;
const WSL_AGENT_DETECTION_TIMEOUT_MS = 60_000;
const SSH_AGENT_DETECTION_TIMEOUT_MS = 60_000;

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

function uniqueSshProjects(
  locations: readonly Extract<ProjectLocation, { kind: "ssh" }>[],
): Extract<ProjectLocation, { kind: "ssh" }>[] {
  const byHost = new Map<string, Extract<ProjectLocation, { kind: "ssh" }>>();
  for (const location of locations) {
    if (!byHost.has(location.host)) byHost.set(location.host, location);
  }
  return [...byHost.values()];
}

function filterSshStatusesForHosts(
  statuses: readonly AgentStatus[],
  locations: readonly Extract<ProjectLocation, { kind: "ssh" }>[],
): AgentStatus[] {
  if (locations.length === 0) {
    return [];
  }
  const hosts = new Set(locations.map((location) => location.host));
  return statuses.filter((status) => status.envHost !== undefined && hosts.has(status.envHost));
}

function statusEnvKey(status: AgentStatus): string {
  return `${status.kind}|${status.envKind ?? ""}|${status.envDistro ?? ""}|${status.envHost ?? ""}`;
}

function mergeScopedStatuses(
  existingWindows: readonly AgentStatus[],
  existingWsl: readonly AgentStatus[],
  existingSsh: readonly AgentStatus[],
  probed: readonly AgentStatus[],
): { windows: AgentStatus[]; wsl: AgentStatus[]; ssh: AgentStatus[] } {
  const byKey = new Map<string, AgentStatus>();
  for (const status of existingWindows) byKey.set(statusEnvKey(status), status);
  for (const status of existingWsl) byKey.set(statusEnvKey(status), status);
  for (const status of existingSsh) byKey.set(statusEnvKey(status), status);
  for (const status of probed) byKey.set(statusEnvKey(status), status);

  const windows: AgentStatus[] = [];
  const wsl: AgentStatus[] = [];
  const ssh: AgentStatus[] = [];
  for (const status of byKey.values()) {
    if (status.envKind === "wsl") {
      wsl.push(status);
    } else if (status.envKind === "ssh") {
      ssh.push(status);
    } else {
      windows.push(status);
    }
  }
  return { windows, wsl, ssh };
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
              let timeout: NodeJS.Timeout | undefined;
              const detected = await Promise.race([
                adapter.detectInstall(ctx),
                new Promise<never>((_, reject) => {
                  timeout = setTimeout(() => {
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

export async function detectSshAgentStatuses(
  adapters: Iterable<AgentAdapter>,
  locations: readonly Extract<ProjectLocation, { kind: "ssh" }>[],
  disabled?: ReadonlySet<string>,
  onStatus?: (status: AgentStatus) => void,
): Promise<AgentStatus[]> {
  const adapterList = [...adapters];
  const statuses = await Promise.all(
    uniqueSshProjects(locations).map(async (location) => {
      const ctx: AgentEnvContext = {
        envKind: "ssh",
        sshHost: location.host,
        sshPath: location.path,
      };
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
              envKind: "ssh" as const,
              envHost: location.host,
            };
          } else {
            try {
              let timeout: NodeJS.Timeout | undefined;
              const detected = await Promise.race([
                adapter.detectInstall(ctx),
                new Promise<never>((_, reject) => {
                  timeout = setTimeout(() => {
                    reject(
                      new Error(
                        `detectInstall(${adapter.kind}, ssh:${location.host}) timed out after ${SSH_AGENT_DETECTION_TIMEOUT_MS}ms`,
                      ),
                    );
                  }, SSH_AGENT_DETECTION_TIMEOUT_MS);
                  if (typeof timeout.unref === "function") timeout.unref();
                }),
              ]).finally(() => {
                if (timeout) clearTimeout(timeout);
              });
              status = { ...detected, envKind: "ssh" as const, envHost: location.host };
            } catch (error) {
              console.error(
                `[supervisor] detectInstall(${adapter.kind}, ssh:${location.host}) failed`,
                error,
              );
              status = {
                kind: adapter.kind,
                label: adapter.label,
                installed: false,
                authState: "unknown" as const,
                capabilities: adapter.capabilities,
                ...(adapter.update ? { update: adapter.update } : {}),
                envKind: "ssh" as const,
                envHost: location.host,
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
  ssh: AgentStatus[];
}

export class AgentStatusService {
  private pendingDetection: Promise<DetectionResults> | undefined;
  private startupDetectionLaunched = false;
  private startupDetectionWslDistros = new Set<string>();
  private startupDetectionSshHosts = new Set<string>();

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
    const sshProjects = uniqueSshProjects(payload.sshProjects ?? []);
    const cached = this.readCachedStatuses(wslDistros, sshProjects);
    this.detectStartupAgentStatusesBackground(wslDistros, sshProjects);
    return cached;
  }

  async refreshAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    const wslDistros = [...new Set(payload.wslDistros)];
    const sshProjects = uniqueSshProjects(payload.sshProjects ?? []);
    // An explicit refresh is the signal that something changed on disk (an
    // install/update just ran), so bypass the binary-path TTL cache and re-read
    // PATH (including the registry-backed Windows user/machine PATH) fresh.
    invalidateExecutablePathCache();
    // Also re-check Claude's per-account fast-mode availability (an org may have
    // since enabled/disabled it); the next capabilities probe repopulates it.
    void clearFastModeCache();
    if (payload.scope) {
      return this.runScopedDetection(wslDistros, sshProjects, payload.scope);
    }
    this.startupDetectionLaunched = true;
    for (const distro of wslDistros) {
      this.startupDetectionWslDistros.add(distro);
    }
    for (const project of sshProjects) {
      this.startupDetectionSshHosts.add(project.host);
    }
    const previousDetection = this.pendingDetection;
    const fresh = await this.runDetectionTask(async () => {
      if (previousDetection)
        await previousDetection.catch(() => ({ windows: [], wsl: [], ssh: [] }));
      return this.runDetection(wslDistros, sshProjects);
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
    sshProjects: readonly Extract<ProjectLocation, { kind: "ssh" }>[],
    scope: RefreshAgentScope,
  ): Promise<AgentStatusesResponse> {
    const existing = this.readCachedStatuses(wslDistros, sshProjects);
    // Without a baseline cache we have no merge target — fall back to a full
    // detection so the renderer ends up with a complete list. Callers
    // typically hit this path well after startup, so this is rare.
    if (!existing.fromCache) {
      this.startupDetectionLaunched = true;
      const fresh = await this.runDetectionTask(() => this.runDetection(wslDistros, sshProjects));
      return { ...fresh, fromCache: false };
    }

    const allAdapters = [...this.options.adapters.values()];
    const adapterByKind = new Map(allAdapters.map((adapter) => [adapter.kind, adapter]));
    const targetAdapters = scope.agentKinds
      .map((kind) => adapterByKind.get(kind))
      .filter((adapter): adapter is AgentAdapter => adapter !== undefined);

    const targetEnvs = this.resolveScopedEnvs(scope.envs, wslDistros, sshProjects);
    const disabled = this.readDisabledAgents();

    const probed = await Promise.all(
      targetAdapters.flatMap((adapter) =>
        targetEnvs.map((env) => this.probeScopedStatus(adapter, env, disabled)),
      ),
    );

    for (const status of probed) {
      this.options.emit({ type: "agent-status-updated", status });
    }

    const merged = mergeScopedStatuses(existing.windows, existing.wsl, existing.ssh, probed);

    // Persist into the FULL on-disk cache, not the scope-filtered `existing`.
    // `readCachedStatuses` filters `wsl`/`ssh` down to the requested
    // distros/hosts, so callers that pass a partial list (e.g. an SSH-only
    // refresh with `wslDistros: []`, or a WSL/native refresh that omits
    // `sshProjects`) would otherwise rewrite the other environment's bucket as
    // empty and wipe its cached agents. Merging the probe into the unfiltered
    // cache keeps environments outside this scope intact.
    const fullCache = this.readRawCachedStatuses() ?? { windows: [], wsl: [], ssh: [] };
    const persisted = mergeScopedStatuses(fullCache.windows, fullCache.wsl, fullCache.ssh, probed);
    this.writeDiskCache(persisted.windows, persisted.wsl, persisted.ssh);
    return { ...merged, fromCache: false };
  }

  /**
   * Reads and parses the raw on-disk cache lists without filtering by the
   * currently-requested distros/hosts. Used as the merge base when persisting
   * a scoped detection so unrelated environments are preserved. Returns
   * `undefined` when no cache exists or its version is stale.
   */
  private readRawCachedStatuses(): DetectionResults | undefined {
    try {
      const raw = readFileSync(this.options.statusCachePath, "utf8");
      const cache = JSON.parse(raw) as {
        version?: number;
        windows?: unknown[];
        wsl?: unknown[];
        ssh?: unknown[];
      };
      if (cache.version !== STATUS_CACHE_VERSION) {
        return undefined;
      }
      return {
        windows: parseCachedStatuses(cache.windows),
        wsl: parseCachedStatuses(cache.wsl),
        ssh: parseCachedStatuses(cache.ssh),
      };
    } catch {
      return undefined;
    }
  }

  private resolveScopedEnvs(
    envs: RefreshAgentScope["envs"],
    wslDistros: readonly string[],
    sshProjects: readonly Extract<ProjectLocation, { kind: "ssh" }>[],
  ): RefreshAgentScopeEnv[] {
    if (envs && envs.length > 0) {
      return envs;
    }
    const nativeEnv: RefreshAgentScopeEnv = { kind: "native" };
    return [
      nativeEnv,
      ...wslDistros.map<RefreshAgentScopeEnv>((distro) => ({ kind: "wsl", distro })),
      ...sshProjects.map<RefreshAgentScopeEnv>((project) => ({
        kind: "ssh",
        host: project.host,
        path: project.path,
      })),
    ];
  }

  private async probeScopedStatus(
    adapter: AgentAdapter,
    env: RefreshAgentScopeEnv,
    disabled: ReadonlySet<string>,
  ): Promise<AgentStatus> {
    const isWsl = env.kind === "wsl";
    const isSsh = env.kind === "ssh";
    const nativeEnvKind: "windows" | "posix" = process.platform === "win32" ? "windows" : "posix";
    const envKind: "windows" | "posix" | "wsl" | "ssh" = isSsh
      ? "ssh"
      : isWsl
        ? "wsl"
        : nativeEnvKind;
    const envDistro = isWsl ? env.distro : undefined;
    const envHost = isSsh ? env.host : undefined;

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
        ...(envHost ? { envHost } : {}),
      };
    }
    const ctx: AgentEnvContext | undefined = isSsh
      ? { envKind: "ssh", sshHost: env.host, sshPath: env.path }
      : isWsl
        ? { envKind: "wsl", wslDistro: env.distro }
        : undefined;
    try {
      const detected = ctx ? await adapter.detectInstall(ctx) : await adapter.detectInstall();
      return {
        ...detected,
        envKind,
        ...(envDistro ? { envDistro } : {}),
        ...(envHost ? { envHost } : {}),
      };
    } catch (error) {
      const where = isSsh ? `ssh:${env.host}` : isWsl ? `wsl:${env.distro}` : "native";
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
        ...(envHost ? { envHost } : {}),
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
  private readCachedStatuses(
    wslDistros: readonly string[],
    sshProjects: readonly Extract<ProjectLocation, { kind: "ssh" }>[] = [],
  ): AgentStatusesResponse {
    try {
      const raw = readFileSync(this.options.statusCachePath, "utf8");
      const cache = JSON.parse(raw) as {
        version?: number;
        windows?: unknown[];
        wsl?: unknown[];
        ssh?: unknown[];
      };

      // Cache version is bumped whenever derived fields like `loginCommand`
      // change shape (e.g. when an adapter's static string becomes a function
      // that depends on the project location). Stale caches would otherwise
      // hand back pre-bump values that no longer match what fresh detection
      // would compute.
      if (cache.version !== STATUS_CACHE_VERSION) {
        return { windows: [], wsl: [], ssh: [], fromCache: false };
      }

      const windows = parseCachedStatuses(cache.windows)
        .filter((status) => status.envKind !== "wsl")
        .map((status) => this.withCachedCapabilityDefaults(status));
      const wsl = filterWslStatusesForDistros(parseCachedStatuses(cache.wsl), wslDistros).map(
        (status) => this.withCachedCapabilityDefaults(status),
      );
      const ssh = filterSshStatusesForHosts(parseCachedStatuses(cache.ssh), sshProjects).map(
        (status) => this.withCachedCapabilityDefaults(status),
      );

      return { windows, wsl, ssh, fromCache: true };
    } catch {
      return { windows: [], wsl: [], ssh: [], fromCache: false };
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

  private writeDiskCache(windows: AgentStatus[], wsl: AgentStatus[], ssh: AgentStatus[]): void {
    try {
      writeFileSync(
        this.options.statusCachePath,
        JSON.stringify({
          version: STATUS_CACHE_VERSION,
          windows,
          wsl,
          ssh,
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

  private detectStartupAgentStatusesBackground(
    wslDistros: readonly string[],
    sshProjects: readonly Extract<ProjectLocation, { kind: "ssh" }>[],
  ): void {
    const newWslDistros = wslDistros.filter(
      (distro) => !this.startupDetectionWslDistros.has(distro),
    );
    const newSshProjects = sshProjects.filter(
      (project) => !this.startupDetectionSshHosts.has(project.host),
    );
    if (
      this.startupDetectionLaunched &&
      newWslDistros.length === 0 &&
      newSshProjects.length === 0
    ) {
      return;
    }
    this.startupDetectionLaunched = true;
    for (const distro of newWslDistros) {
      this.startupDetectionWslDistros.add(distro);
    }
    for (const project of newSshProjects) {
      this.startupDetectionSshHosts.add(project.host);
    }
    const detectionWslDistros = [...this.startupDetectionWslDistros];
    const detectionSshProjects = uniqueSshProjects([...sshProjects]);
    const previousDetection = this.pendingDetection;
    void this.runDetectionTask(async () => {
      if (previousDetection) {
        await previousDetection.catch(() => ({ windows: [], wsl: [], ssh: [] }));
      }
      return this.runDetection(detectionWslDistros, detectionSshProjects);
    });
  }

  private async runDetection(
    wslDistros: readonly string[],
    sshProjects: readonly Extract<ProjectLocation, { kind: "ssh" }>[],
  ): Promise<DetectionResults> {
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

    const sshPromise = detectSshAgentStatuses(adapters, sshProjects, disabled, (status) => {
      this.options.emit({ type: "agent-detected", status });
    })
      .then((statuses) => {
        this.options.emit({ type: "ssh-agent-statuses", statuses });
        return statuses;
      })
      .catch((error) => {
        console.error("[supervisor] detectSshAgentStatuses failed", error);
        this.options.emit({ type: "ssh-agent-statuses", statuses: [] });
        return [] as AgentStatus[];
      });

    const [nativeResult, wslResult, sshResult] = await Promise.allSettled([
      nativePromise,
      wslPromise,
      sshPromise,
    ]);
    const nativeStatuses = nativeResult.status === "fulfilled" ? nativeResult.value : [];
    const wslStatuses = wslResult.status === "fulfilled" ? wslResult.value : [];
    const sshStatuses = sshResult.status === "fulfilled" ? sshResult.value : [];

    // Native detection may have thrown before emitting — ensure the renderer
    // always gets a terminal windows-agent-statuses event.
    if (nativeResult.status === "rejected") {
      console.error("[supervisor] native detection failed", nativeResult.reason);
      this.options.emit({ type: "windows-agent-statuses", statuses: [] });
    }

    if (wslDistros.length === 0) {
      this.options.emit({ type: "wsl-agent-statuses", statuses: [] });
    }
    if (sshProjects.length === 0) {
      this.options.emit({ type: "ssh-agent-statuses", statuses: [] });
    }

    this.writeDiskCache(nativeStatuses, wslStatuses, sshStatuses);
    return { windows: nativeStatuses, wsl: wslStatuses, ssh: sshStatuses };
  }
}
