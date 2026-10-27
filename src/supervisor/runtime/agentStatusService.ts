import {
  cachedAgentStatusSchema,
  decodeAgentStatusCache,
  STATUS_CACHE_VERSION,
} from "@/shared/agentStatusCache";
import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  type AgentCapability,
  type AgentKind,
  type AgentStatus,
  type AgentStatusesResponse,
  type GetAgentStatusesPayload,
  type RefreshAgentScope,
  type RefreshAgentScopeEnv,
  selectedAgentProbePayloadSchema,
  selectedAgentProbeResultSchema,
  type SelectedAgentProbePayload,
  type SelectedAgentProbeResult,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { effectiveAgentSettings, effectiveDisabledAgents } from "@/shared/machineSettings";
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
import {
  AgentStatusPublication,
  type AgentStatusPublicationTicket,
  type AgentStatusTarget,
} from "./agentStatusPublication";
import { readSupervisorSharedSettings } from "./supervisorSharedSettings";

import { AgentDiscoveryCancelledError, runAbortableDetection } from "./agentDetectionCancellation";

const execFileAsync = promisify(execFile);

/**
 * Cache version history (the codec/version live in shared/agentStatusCache.ts).
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
 * v23 lets adapters route native Windows projects through WSL and adds Muse's
 * MSP-backed GUI presentation, so native terminal-only caches must be re-probed.
 * v24 preserves model prefixes in generic ACP labels; re-probe labels previously
 * shortened by the shared provider-specific formatter.
 */
// v25 discards terminal auth environments with obsolete updater-disable values.
// v26 refreshes model aliases and configured profile labels.
// v27 coalesces resolved model aliases with their selectable catalog entries.
// v28 re-probes live voice instead of retaining old capability negatives.
// v29 advertises session-local MCP tools for Command Code.
// v30 refreshes terminal MCP capabilities across supported CLIs.
// v32 invalidates capabilities from the removed persistent MCP proxy prototype.
// v33 combines V2 model family/pricing metadata with MCP and live-voice capabilities.
// v34 re-probes the Cursor SDK once so its resolved installation gets recorded:
// an SDK variant can now report `installed` from that record with an unknown
// auth state instead of losing the install when a probe reaches no verdict.
// v35 invalidates both pre-merge parents: V2 v34 lacks OpenCode 2 discovery,
// while master v33 lacks V2's resolved SDK installation and capability metadata.
// v36 re-probes Muse on Windows natively: cached statuses that reported
// `installed: false` because detection routed through WSL must be re-probed
// against the Windows host now that Muse ships a native Windows build.
// v37 rebuilds Cursor ACP GUI capabilities: parameterized model picker
// exposes bare model ids plus Effort / Fast / Context / Thinking controls.
// v38 refreshes derived model catalogs and their declared Fast capabilities.
// v39 adds provider-declared `threadTitleCommands` (Muse `/goal <objective>`),
// so cached statuses without them would keep titling goal threads raw.
// v40 invalidates the post-v35 parents: V2 v39 caches still hold skill
// invocations in the pre-`invocationForSkill` form, and master v34 lacks V2's
// SDK installation and capability metadata, so every cache below v40 re-probes.
// v41 refreshes profile-scoped auth, native resource discovery, negotiated modes
// and model identities that older snapshots collapsed into family defaults.
// v42 preserves adapter identities in profile detection; inventories that
// omitted profiles after rejecting a base identity must be re-probed.
// v43 refreshes negotiated reasoning controls previously suppressed in GUI inventories.
// v44 refreshes raw flat composite model inventories and their legacy composite
// Fast declarations: family-relation projection derives from fresh capability
// data, so caches carrying the stale flat composite rows must re-probe.
// v46 refreshes presentation-scoped family relations and provider default visibility.
// Older valid-shaped snapshots must not retain obsolete menus or control bindings.
// v47 refreshes surface-scoped family intent declarations before deliberate edits.
// v48 re-probes confirmed empty per-model effort ladders so models without
// an effort selector cannot inherit unsupported global/CLI choices. This also
// invalidates the integrated v47 inventory and the prior branch's v41 cache.
// v49 combines native-account catalogs and the current provider protocol with
// V2 model-family/effort metadata. Both integrated parents (v48 and v36) must
// re-probe; renderer persisted copy advances independently to v45.
// v50 discovers Command Code's native ACP Chat surface and session MCP support.
// v51 completes native effort catalogs, including models beyond the ACP sweep.
// v52 refreshes structured-runtime readiness after the minimum SDK and worker capabilities advance.
// v53 refreshes restricted working-window choices while retaining native model defaults.
// v54 refreshes editable working-window catalogs from provider settings.
// v55 publishes context-reload consequences for every composer surface.
// v56 discards model catalogs that included disconnected configured providers.
// v57 refreshes installer commands that explicitly finish and verify package setup.
// v58 re-probes catalog-native reasoning choices and current MSP model metadata.
// v59 derives accepted-model Fast availability (including composite pairs)
// and orders permissions least to most permissive, preserving v58 catalogs.
// v60 advertises Muse's launch-scoped MCP wiring in both presentations, so
// cached Muse statuses that hid every MCP toggle must be re-probed.
// v61 re-detects native Windows providers whose resolved absolute executable
// was incorrectly passed back through PATH lookup and cached as missing.
// v62 refreshes Windows update policies shared by execution and command previews.
// v63 re-probes native ACP model and effort controls previously discarded by normalization.
// v64 refreshes model sub-provider grouping for newly recognized third-party families.
// v65 refreshes the built-in provider inventory after adding DeepSeek Harness.
// v66 refreshes the three distinct approval/sandbox postures.
// v67 refreshes native Auto Review permissions and their default.
// v68 re-probes Claude so statuses cached without the read-only one-shot workspace capability
// (needed to offer it as a review-guide writer) are not reused.
// v69 re-probes Devin so cached statuses gain the `/goal <objective>` thread-title command.
// v70 re-probes Claude so cached statuses default to the 400k context window, not 1M.
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

export async function detectWslAgentStatuses(
  adapters: Iterable<AgentAdapter>,
  distros: readonly string[],
  disabled?: ReadonlySet<string>,
  onStatus?: (status: AgentStatus) => void,
  agentSettingsFor?: (
    agentKind: string,
    distro: string,
  ) => Record<string, boolean | string> | undefined,
  signal?: AbortSignal,
): Promise<AgentStatus[]> {
  const adapterList = [...adapters];
  const statuses = await Promise.all(
    distros.map(async (distro) => {
      return Promise.all(
        adapterList.map(async (adapter) => {
          signal?.throwIfAborted();
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
                runAbortableDetection(
                  () =>
                    adapter.detectInstall({
                      ...ctx,
                      signal: signal ? AbortSignal.any([signal, abort.signal]) : abort.signal,
                    }),
                  signal,
                ),
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
              if (signal?.aborted) throw error;
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
  /** Repair recorded WSL installations only when detection actually probes their distro. */
  prepareWslEnvironment?: (distro: string) => Promise<void>;
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
  private readonly publication = new AgentStatusPublication();
  private registryPublicationPending = false;
  private readonly fullDetectionJobs = new Map<AgentStatusPublicationTicket, AbortController>();
  private readonly scopedDetectionJobs = new Set<{ ticket: AgentStatusPublicationTicket }>();
  private pendingDetection: Promise<DetectionResults> | undefined;
  private startupDetectionLaunched = false;
  private startupDetectionWslDistros = new Set<string>();
  private pendingWslDistroList: Promise<string[]> | undefined;
  private wslDistroCache: { value: string[]; expiresAt: number } | undefined;

  private cacheText: string | undefined;
  private cacheGeneration = 0;
  private cacheIo: Promise<void> = Promise.resolve();
  private cacheLoaded = false;
  readonly ready: Promise<void>;

  constructor(private readonly options: AgentStatusServiceOptions) {
    const generation = this.cacheGeneration;
    this.ready = readFile(options.statusCachePath, "utf8")
      .then((text) => {
        if (this.cacheGeneration === generation) this.cacheText = text;
      })
      .catch(() => {})
      .then(() => {
        this.cacheLoaded = true;
      });
  }

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
    if (!this.cacheLoaded) await this.ready;
    const wslDistros = [...new Set(payload.wslDistros)];
    const accepted = this.readAcceptedStatuses(wslDistros);
    this.detectStartupAgentStatusesBackground(wslDistros);
    return accepted;
  }

  /**
   * The same accepted native view served to GUI/REST/MCP consumers, including
   * completed probes while other adapters or WSL are still detecting. The
   * owned snapshot never exposes mutable adapter capabilities. Undefined means
   * no verdict for this target; null means an accepted unavailable verdict.
   */
  getCachedCapabilities(kind: AgentKind): AgentCapability | null | undefined {
    const status = this.readAcceptedStatuses([]).windows.find((entry) => entry.kind === kind);
    if (!status) return undefined;
    return status.installed && status.authState === "authenticated" ? status.capabilities : null;
  }

  /** Return the last detected installed version for one native or WSL provider. */
  getCachedVersion(kind: AgentKind, wslDistro?: string): string | undefined {
    const cached = this.readAcceptedStatuses();
    const statuses = wslDistro ? cached.wsl : cached.windows;
    return statuses.find(
      (status) =>
        status.kind === kind &&
        status.installed &&
        (wslDistro === undefined || status.envDistro?.toLowerCase() === wslDistro.toLowerCase()),
    )?.version;
  }

  /** Registry changes retire both active probes and the previously ready view. */
  invalidateAgentStatuses(): void {
    this.publication.invalidate();
    this.clearDiskCache();
    this.startupDetectionLaunched = false;
    this.startupDetectionWslDistros.clear();
  }

  reconcileAgentRegistry(changedKinds: readonly string[]): void {
    if (!this.cacheLoaded) {
      void this.ready.then(() => this.reconcileAgentRegistry(changedKinds));
      return;
    }
    const baseline = this.readAcceptedStatuses();
    const affected = new Set([
      ...changedKinds,
      ...[...baseline.windows, ...baseline.wsl]
        .filter((status) => !this.options.adapters.has(status.kind))
        .map((status) => status.kind),
    ]);
    if (affected.size === 0) return;
    this.publication.discardKinds(affected, baseline, [
      ...this.fullDetectionJobs.keys(),
      ...[...this.scopedDetectionJobs].map((job) => job.ticket),
    ]);
    this.clearDiskCache(this.readAcceptedStatuses());
    this.registryPublicationPending = true;
    this.publishRegistryStatuses();
  }

  private publishRegistryStatuses(): void {
    // Bulk events complete discovery in clients. Metadata reconciliation must
    // not finish a still-running sweep or a sweep started by an event handler.
    if (this.fullDetectionJobs.size > 0) return;
    this.registryPublicationPending = false;
    this.options.emit({
      type: "windows-agent-statuses",
      statuses: this.readAcceptedStatuses().windows,
    });
    if (this.fullDetectionJobs.size > 0) {
      this.registryPublicationPending = true;
      return;
    }
    this.options.emit({ type: "wsl-agent-statuses", statuses: this.readAcceptedStatuses().wsl });
  }

  /** Cancel full discovery sweeps without interrupting scoped install/login probes. */
  cancelAgentDiscovery(): AgentStatusesResponse {
    const cancelled = this.fullDetectionJobs.size > 0;
    for (const [ticket, controller] of this.fullDetectionJobs) {
      this.publication.retire(ticket);
      controller.abort(new AgentDiscoveryCancelledError());
    }
    if (cancelled) {
      this.startupDetectionLaunched = false;
      this.startupDetectionWslDistros.clear();
      // A queued full sweep may have superseded an in-flight install/login
      // probe. Restore only targets no longer claimed by another request.
      for (const job of [...this.scopedDetectionJobs].reverse())
        job.ticket = this.publication.resumeUnclaimed(job.ticket);
    }
    return this.readAcceptedStatuses();
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
    // Full Settings refresh must not keep serving the previous sweep. Drop the
    // on-disk status file first so `getAgentStatuses` / `getCachedCapabilities`
    // cannot return stale models while the new probe runs, then rewrite it.
    const retained = this.publication.invalidate(
      [...this.scopedDetectionJobs].map((job) => job.ticket),
    );
    for (const job of this.scopedDetectionJobs) job.ticket = retained.get(job.ticket) ?? job.ticket;
    this.clearDiskCache();
    this.startupDetectionWslDistros.clear();
    this.startupDetectionLaunched = true;
    for (const distro of wslDistros) {
      this.startupDetectionWslDistros.add(distro);
    }
    await this.queueFullDetection(wslDistros);
    return { ...this.readAcceptedStatuses(wslDistros), fromCache: false };
  }

  /** A native selected read has no cache/publication or automatic-install effects. */
  async probeSelectedAgent(input: SelectedAgentProbePayload): Promise<SelectedAgentProbeResult> {
    const payload = selectedAgentProbePayloadSchema.parse(input);
    const adapter = this.options.adapters.get(payload.agentKind);
    if (!adapter) return { ...payload, environment: "native", status: null };
    invalidateExecutablePathCache();
    const result = await this.runDetectionTask(async () => {
      if (this.options.adapters.get(payload.agentKind) !== adapter)
        throw new Error("The selected provider changed before its probe. Retry explicitly.");
      const settings = this.readSettings();
      const env = { kind: "native" as const };
      const status = await this.probeScopedStatus(
        adapter,
        env,
        new Set(effectiveDisabledAgents(settings, localMachineKey(env))),
        machineAgentSettingsFor(settings, env, adapter.kind),
      );
      if (this.options.adapters.get(payload.agentKind) !== adapter)
        throw new Error("The selected provider changed during its probe. Retry explicitly.");
      return { windows: [status], wsl: [] };
    });
    return selectedAgentProbeResultSchema.parse({
      ...payload,
      environment: "native",
      status: result.windows[0],
    });
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
    const allAdapters = [...this.options.adapters.values()];
    const adapterByKind = new Map(allAdapters.map((adapter) => [adapter.kind, adapter]));
    const targetAdapters = [...new Set(scope.agentKinds)]
      .map((kind) => adapterByKind.get(kind))
      .filter((adapter): adapter is AgentAdapter => adapter !== undefined);

    const targetEnvs = this.resolveScopedEnvs(scope.envs, wslDistros);
    const job = {
      ticket: this.publication.begin(
        targetAdapters.flatMap((adapter) =>
          targetEnvs.map((env) => this.statusTarget(adapter, env)),
        ),
      ),
    };
    this.scopedDetectionJobs.add(job);
    try {
      await this.runDetectionTask(async () => {
        const settings = this.readSettings();
        const disabled = new Set(settings.disabledAgents);
        const results = await Promise.allSettled(
          targetAdapters.flatMap((adapter) =>
            targetEnvs.map(async (env) => {
              const target = this.statusTarget(adapter, env);
              if (!this.publication.owns(job.ticket, target)) return;
              const status = await this.probeScopedStatus(
                adapter,
                env,
                disabled,
                machineAgentSettingsFor(settings, env, adapter.kind),
              );
              this.publishStatus(job.ticket, adapter, target, status, "agent-status-updated");
            }),
          ),
        );
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length)
          throw new AggregateError(
            failures.map((result) => result.reason),
            "Scoped agent detection failed",
          );
        // A cold scoped result is useful live readiness, not a complete saved
        // inventory. Leave startup discovery eligible and retain partial rows
        // in memory until a full sweep can persist the complete baseline.
        await this.completeDetection(job.ticket);
        return this.readAcceptedStatuses();
      });
      return { ...this.readAcceptedStatuses(wslDistros), fromCache: false };
    } finally {
      this.scopedDetectionJobs.delete(job);
    }
  }

  private resolveScopedEnvs(
    envs: RefreshAgentScope["envs"],
    wslDistros: readonly string[],
  ): RefreshAgentScopeEnv[] {
    if (envs && envs.length > 0) {
      return [
        ...new Map(
          envs.map((env) => [
            JSON.stringify([env.kind, env.kind === "wsl" ? env.distro : null]),
            env,
          ]),
        ).values(),
      ];
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
    signal?: AbortSignal,
  ): Promise<AgentStatus> {
    signal?.throwIfAborted();
    if (env.kind === "wsl") {
      await this.options.prepareWslEnvironment?.(env.distro);
      signal?.throwIfAborted();
      // Scoped and full requests share a queue. Use the same bounded,
      // abortable WSL probe so a stalled scoped target cannot hold later jobs.
      const [status] = await detectWslAgentStatuses(
        [adapter],
        [env.distro],
        disabled,
        undefined,
        () => agentSettings,
      );
      if (!status) throw new Error("WSL detection returned no target status");
      return status;
    }
    const nativeEnvKind: "windows" | "posix" = process.platform === "win32" ? "windows" : "posix";

    if (disabled.has(adapter.kind)) {
      return {
        kind: adapter.kind,
        label: adapter.label,
        installed: true,
        authState: "unknown",
        capabilities: adapter.capabilities,
        ...(adapter.update ? { update: adapter.update } : {}),
        envKind: nativeEnvKind,
      };
    }
    const ctx: AgentEnvContext = {
      envKind: nativeEnvKind,
      ...(agentSettings ? { agentSettings } : {}),
    };
    try {
      const detected = await runAbortableDetection(
        () => adapter.detectInstall({ ...ctx, ...(signal ? { signal } : {}) }),
        signal,
      );
      return {
        ...detected,
        envKind: nativeEnvKind,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      console.error(`[supervisor] detectInstall(${adapter.kind}) failed`, error);
      return {
        kind: adapter.kind,
        label: adapter.label,
        installed: false,
        authState: "unknown",
        capabilities: adapter.capabilities,
        ...(adapter.update ? { update: adapter.update } : {}),
        envKind: nativeEnvKind,
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
  private readCachedStatuses(wslDistros?: readonly string[]): AgentStatusesResponse {
    try {
      const raw = this.cacheText;
      if (raw === undefined) return { windows: [], wsl: [], fromCache: false };
      const decoded = decodeAgentStatusCache(JSON.parse(raw));
      return {
        windows: decoded.statuses.windows.map((status) =>
          this.withCachedCapabilityDefaults(status),
        ),
        wsl: decoded.statuses.wsl
          .filter(
            (status) =>
              wslDistros === undefined ||
              (status.envDistro !== undefined && wslDistros.includes(status.envDistro)),
          )
          .map((status) => this.withCachedCapabilityDefaults(status)),
        fromCache: decoded.statuses.fromCache,
      };
    } catch {
      return { windows: [], wsl: [], fromCache: false };
    }
  }

  private readAcceptedStatuses(wslDistros?: readonly string[]): AgentStatusesResponse {
    return this.publication.view(this.readCachedStatuses(), wslDistros);
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

  private clearDiskCache(retained?: AgentStatusesResponse): void {
    this.cacheGeneration += 1;
    this.cacheText = retained?.fromCache
      ? JSON.stringify({
          version: STATUS_CACHE_VERSION,
          windows: retained.windows,
          wsl: retained.wsl,
        })
      : undefined;
    this.cacheIo = this.cacheIo.then(() => unlink(this.options.statusCachePath)).catch(() => {});
  }

  private readSettings(): ReturnType<typeof normalizeSharedSettings> {
    return readSupervisorSharedSettings(this.options.settingsPath);
  }

  private runDetectionTask(task: () => Promise<DetectionResults>): Promise<DetectionResults> {
    const previous = this.pendingDetection;
    // Set pending before the task can emit/reenter the service. Every request,
    // including scoped refresh, shares this queue; publication ownership has
    // already been reserved while earlier probes are still running.
    const pending = Promise.resolve()
      .then(async () => {
        if (previous) await previous.catch(() => ({ windows: [], wsl: [] }));
        await this.ready;
        await this.cacheIo;
        return task();
      })
      .finally(() => {
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
    void this.queueFullDetection(detectionWslDistros).catch((error) => {
      if (error instanceof AgentDiscoveryCancelledError) return;
      console.error("[supervisor] background agent detection failed", error);
    });
  }

  private statusTarget(adapter: AgentAdapter, env: RefreshAgentScopeEnv): AgentStatusTarget {
    return {
      kind: adapter.kind,
      envKind: env.kind === "wsl" ? "wsl" : process.platform === "win32" ? "windows" : "posix",
      ...(env.kind === "wsl" ? { envDistro: env.distro } : {}),
    };
  }

  private queueFullDetection(wslDistros: readonly string[]): Promise<DetectionResults> {
    const adapters = [...this.options.adapters.values()];
    const envs = this.resolveScopedEnvs(undefined, wslDistros);
    const ticket = this.publication.begin(
      adapters.flatMap((adapter) => envs.map((env) => this.statusTarget(adapter, env))),
    );
    const job = { ticket };
    const controller = new AbortController();
    this.fullDetectionJobs.set(ticket, controller);
    return this.runDetectionTask(() =>
      runAbortableDetection(
        () => this.runDetection(wslDistros, adapters, job, controller.signal),
        controller.signal,
      ),
    ).finally(() => {
      this.fullDetectionJobs.delete(ticket);
      if (this.registryPublicationPending) this.publishRegistryStatuses();
    });
  }

  private publishStatus(
    ticket: AgentStatusPublicationTicket,
    adapter: AgentAdapter,
    target: AgentStatusTarget,
    status: AgentStatus,
    eventType: "agent-detected" | "agent-status-updated",
  ): void {
    if (
      this.options.adapters.get(adapter.kind) !== adapter ||
      !this.publication.owns(ticket, target)
    )
      return;
    // Reuse the cache schema/defaults. Schema parsing copies known fields and
    // ignores adapter-private extras without mutating the adapter's object.
    const parsed = cachedAgentStatusSchema.safeParse(status);
    const accepted = this.publication.accept(
      ticket,
      target,
      parsed.success ? this.withCachedCapabilityDefaults(parsed.data) : undefined,
    );
    if (accepted) this.options.emit({ type: eventType, status: accepted });
  }

  private emitDetectionList(ticket: AgentStatusPublicationTicket, env: "native" | "wsl"): void {
    if (!this.publication.isActive(ticket)) return;
    const accepted = this.readAcceptedStatuses();
    this.options.emit(
      env === "native"
        ? { type: "windows-agent-statuses", statuses: accepted.windows }
        : { type: "wsl-agent-statuses", statuses: accepted.wsl },
    );
  }

  private async completeDetection(
    ticket: AgentStatusPublicationTicket,
    fullInventory = false,
  ): Promise<void> {
    this.publication.complete(ticket, fullInventory);
    const accepted = this.readAcceptedStatuses();
    if (!this.publication.canPersist(ticket, accepted.fromCache)) return;
    const generation = this.cacheGeneration;
    const text = JSON.stringify({
      version: STATUS_CACHE_VERSION,
      windows: accepted.windows,
      wsl: accepted.wsl,
      savedAt: new Date().toISOString(),
    });
    const write = this.cacheIo.then(async () => {
      if (!this.publication.canPersist(ticket, accepted.fromCache)) return;
      await writeFile(this.options.statusCachePath, text, "utf8");
      if (
        this.cacheGeneration !== generation ||
        !this.publication.canPersist(ticket, accepted.fromCache)
      )
        return;
      this.cacheText = text;
      this.publication.persisted(ticket, accepted.fromCache);
    });
    this.cacheIo = write.catch(() => {});
    await this.cacheIo;
    if (this.cacheGeneration !== generation) await this.cacheIo;
  }

  private async runDetection(
    wslDistros: readonly string[],
    adapters: readonly AgentAdapter[],
    job: { ticket: AgentStatusPublicationTicket },
    signal: AbortSignal,
  ): Promise<DetectionResults> {
    signal.throwIfAborted();
    if (!this.publication.isActive(job.ticket)) {
      // Newer scoped requests can own every target before this queued sweep
      // starts. Their joins still cover its complete inventory; retired or
      // invalidated tickets cannot grant persistence.
      await this.completeDetection(job.ticket, true);
      return this.readAcceptedStatuses();
    }
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

    signal.throwIfAborted();
    const nativePromise = Promise.allSettled(
      adapters.map(async (adapter) => {
        const env = { kind: "native" } as const;
        const target = this.statusTarget(adapter, env);
        if (!this.publication.owns(job.ticket, target)) return;
        const status = await this.probeScopedStatus(
          adapter,
          env,
          disabled,
          machineAgentSettingsFor(settings, env, adapter.kind),
          signal,
        );
        // Stream per adapter so the first-launch discovery screen can reveal
        // tiles in real time. The terminal `windows-agent-statuses` event
        // still fires below with the full list.
        this.publishStatus(job.ticket, adapter, target, status, "agent-detected");
      }),
    ).then((results) => {
      for (const result of results) {
        if (result.status === "rejected" && !signal.aborted)
          console.error("[supervisor] native detection failed", result.reason);
      }
      this.emitDetectionList(job.ticket, "native");
    });

    const wslPromise = Promise.allSettled(
      wslDistros.flatMap((distro) =>
        adapters.map(async (adapter) => {
          const env = { kind: "wsl", distro } as const;
          const target = this.statusTarget(adapter, env);
          if (!this.publication.owns(job.ticket, target)) return;
          await this.options.prepareWslEnvironment?.(distro);
          signal.throwIfAborted();
          if (!this.publication.owns(job.ticket, target)) return;
          await detectWslAgentStatuses(
            [adapter],
            [distro],
            disabled,
            (status) => this.publishStatus(job.ticket, adapter, target, status, "agent-detected"),
            (agentKind) => machineAgentSettingsFor(settings, env, agentKind),
            signal,
          );
        }),
      ),
    )
      .then((results) => {
        for (const result of results) {
          if (result.status === "rejected" && !signal.aborted)
            console.error("[supervisor] WSL detection failed", result.reason);
        }
        this.emitDetectionList(job.ticket, "wsl");
      })
      .catch((error) => {
        // Ensure the renderer always gets a terminal event for WSL — otherwise
        // its loading state would hang forever on detection failure. Emit an
        // empty list and surface the error in logs.
        console.error("[supervisor] detectWslAgentStatuses failed", error);
        this.emitDetectionList(job.ticket, "wsl");
      });

    const [nativeResult] = await Promise.allSettled([nativePromise, wslPromise]);

    // Native detection may have thrown before emitting — ensure the renderer
    // always gets a terminal windows-agent-statuses event.
    if (nativeResult.status === "rejected") {
      console.error("[supervisor] native detection failed", nativeResult.reason);
      this.emitDetectionList(job.ticket, "native");
    }

    await this.completeDetection(job.ticket, true);
    return this.readAcceptedStatuses();
  }
}
