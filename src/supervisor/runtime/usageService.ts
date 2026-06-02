import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  createUsageCollectorRegistry,
  type HostPort,
  type UsageCollectorRegistry,
  type UsageSnapshot,
} from "@lightcode/agents-usage";
import type { ProviderUsagePayload, ProviderUsageResponse } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  type UsageSettings,
} from "@/shared/settings";
import { createNodeUsageHost } from "./usageHost";
import { scanClaudeCost } from "./usageCostScanner";
import { scanOpenCodeUsage } from "./openCodeUsageScanner";
import { scanAntigravityUsage } from "./antigravityUsageScanner";

/**
 * Periodic/on-demand provider usage collection, modeled on AgentStatusService:
 * returns cached snapshots immediately and streams fresh ones via events
 * (`provider-usage` per provider, then a terminal `provider-usage-all`).
 *
 * Endpoints rate-limit aggressively (Claude/Codex 429), so collection is cached
 * + throttled and the auto-refresh timer is slow + settings-driven (default
 * 5 min, 2 min floor) — never a fast poll.
 */

/** Bump when the cached snapshot shape changes so stale caches are discarded. */
const USAGE_CACHE_VERSION = 2;
const DEFAULT_PROVIDER_IDS = [
  "claude",
  "codex",
  "copilot",
  "cursor",
  "grok",
  "gemini",
  "antigravity",
  "opencode",
] as const;
/**
 * Providers collected supervisor-side (need process/SQLite access the pure HTTP
 * registry can't do), not via `registry.collectAll`. `opencode` reads a local
 * SQLite store; `antigravity` probes its local language server.
 */
const LOCAL_PROVIDER_IDS = new Set<string>(["opencode", "antigravity"]);
const MIN_REFRESH_INTERVAL_MS = 2 * 60_000;

export interface UsageServiceOptions {
  emit(event: SupervisorEvent): void;
  cachePath: string;
  /** Cache dir; backs the captured-secret store read by the credential host. */
  cacheDir?: string;
  /** Shared settings file, read for the usage auto-refresh policy. Omitted in tests. */
  settingsPath?: string;
  /** Injectable for tests; defaults to the Node fetch/credential host. */
  host?: HostPort;
  /** Restrict the default provider set (tests / future config). */
  providerIds?: readonly string[];
  /** Override supervisor-local collection (opencode) — injected in tests. */
  collectLocal?: (id: string, nowMs: number) => Promise<UsageSnapshot>;
}

interface UsageCacheFile {
  version?: number;
  snapshots?: UsageSnapshot[];
}

export class UsageService {
  private readonly registry: UsageCollectorRegistry = createUsageCollectorRegistry();
  private readonly host: HostPort;
  private readonly snapshots = new Map<string, UsageSnapshot>();
  private loadedFromCache = false;
  private refreshInFlight: Promise<ProviderUsageResponse> | undefined;
  private autoRefreshTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly options: UsageServiceOptions) {
    this.host = options.host ?? createNodeUsageHost(options.cacheDir);
    this.loadCache();
  }

  private defaultProviderIds(): string[] {
    return [...(this.options.providerIds ?? DEFAULT_PROVIDER_IDS)];
  }

  /** Read the usage policy from the shared settings file (defaults if absent). */
  private readUsageSettings(): UsageSettings {
    if (!this.options.settingsPath) return defaultSharedSettings.usage;
    try {
      return normalizeSharedSettings(JSON.parse(readFileSync(this.options.settingsPath, "utf8")))
        .usage;
    } catch {
      return defaultSharedSettings.usage;
    }
  }

  /** A provider id this service can collect (package registry or supervisor-local). */
  private isSupported(id: string): boolean {
    return this.registry.has(id) || LOCAL_PROVIDER_IDS.has(id);
  }

  /** Default providers minus the user's per-provider opt-outs, intersected with what we support. */
  private enabledProviderIds(disabled: readonly string[]): string[] {
    return this.defaultProviderIds().filter((id) => !disabled.includes(id) && this.isSupported(id));
  }

  private resolveIds(payload: ProviderUsagePayload): string[] {
    if (payload.providerIds?.length) {
      return [...new Set(payload.providerIds)].filter((id) => this.isSupported(id));
    }
    return this.enabledProviderIds(this.readUsageSettings().disabledProviders);
  }

  private isStale(id: string): boolean {
    const snap = this.snapshots.get(id);
    if (!snap) return true;
    return this.host.now() - snap.fetchedAt >= MIN_REFRESH_INTERVAL_MS;
  }

  /**
   * Returns cached snapshots immediately and kicks off a background refresh when
   * any requested provider is stale. Mirrors `getAgentStatuses`.
   */
  async getProviderUsage(payload: ProviderUsagePayload): Promise<ProviderUsageResponse> {
    const ids = this.resolveIds(payload);
    const cached = ids
      .map((id) => this.snapshots.get(id))
      .filter((snap): snap is UsageSnapshot => snap !== undefined);

    if (ids.some((id) => this.isStale(id))) {
      void this.refreshProviderUsage({ providerIds: ids }).catch(() => {
        // Errors surface as per-provider error snapshots; nothing to do here.
      });
    }

    return { snapshots: cached, fromCache: this.loadedFromCache && cached.length > 0 };
  }

  /** Forces a live collection of the requested providers and emits the results. */
  async refreshProviderUsage(payload: ProviderUsagePayload): Promise<ProviderUsageResponse> {
    const ids = this.resolveIds(payload);
    if (ids.length === 0) {
      return { snapshots: [], fromCache: false };
    }

    // Coalesce concurrent full refreshes so a background trigger and a manual
    // refresh don't double-hit rate-limited endpoints.
    if (this.refreshInFlight && this.isFullSet(ids)) {
      return this.refreshInFlight;
    }

    if (!this.isFullSet(ids)) {
      return this.runRefresh(ids);
    }
    // Track the SAME promise we store so the finally can clear it. (Storing
    // `task.finally(...)` but comparing against `task` never matches, which
    // pins refreshInFlight forever and makes every later refresh a no-op.)
    const tracked: Promise<ProviderUsageResponse> = this.runRefresh(ids).finally(() => {
      if (this.refreshInFlight === tracked) this.refreshInFlight = undefined;
    });
    this.refreshInFlight = tracked;
    return tracked;
  }

  private isFullSet(ids: readonly string[]): boolean {
    const defaults = this.defaultProviderIds();
    return ids.length === defaults.length && defaults.every((id) => ids.includes(id));
  }

  private async runRefresh(ids: string[]): Promise<ProviderUsageResponse> {
    const registryIds = ids.filter((id) => this.registry.has(id));
    const localIds = ids.filter((id) => LOCAL_PROVIDER_IDS.has(id));
    let snapshots = await this.registry.collectAll(registryIds, this.host);
    // Local providers are independent of each other and of the registry set, so
    // collect them concurrently rather than serially.
    snapshots.push(...(await Promise.all(localIds.map((id) => this.collectLocal(id)))));
    snapshots = snapshots.map((snap) => this.preserveOnTransientFailure(snap));
    if (this.readUsageSettings().showEstimatedCost) {
      snapshots = await this.withEstimatedCost(snapshots);
    }
    for (const snapshot of snapshots) {
      this.snapshots.set(snapshot.providerId, snapshot);
      this.options.emit({ type: "provider-usage", snapshot });
    }
    this.options.emit({ type: "provider-usage-all", snapshots: [...this.snapshots.values()] });
    this.writeCache();
    return { snapshots, fromCache: false };
  }

  /**
   * On a transient failure (rate-limit / error) keep the last-known windowed
   * snapshot instead of flushing the UI to empty. Real states (auth-missing,
   * unsupported) are left to clear the windows.
   */
  private preserveOnTransientFailure(snap: UsageSnapshot): UsageSnapshot {
    if (snap.status !== "rate-limited" && snap.status !== "error") return snap;
    const prev = this.snapshots.get(snap.providerId);
    if (prev && prev.windows.length > 0) return prev;
    return snap;
  }

  /** Collect a supervisor-local (SQLite-backed) provider; never throws into the refresh. */
  private async collectLocal(id: string): Promise<UsageSnapshot> {
    const now = this.host.now();
    try {
      if (this.options.collectLocal) return await this.options.collectLocal(id, now);
      if (id === "opencode") return await scanOpenCodeUsage(now, this.host);
      if (id === "antigravity") return await scanAntigravityUsage(now);
    } catch {
      // fall through to an error snapshot
    }
    return { providerId: id, status: "error", windows: [], fetchedAt: now };
  }

  /**
   * Merge estimated 30-day cost + tokens (from local logs at API rates) into the
   * Claude snapshot. Best-effort and cached; never throws into the refresh.
   */
  private async withEstimatedCost(snapshots: UsageSnapshot[]): Promise<UsageSnapshot[]> {
    const index = snapshots.findIndex((s) => s.providerId === "claude");
    if (index === -1) return snapshots;
    try {
      const scan = await scanClaudeCost(this.host.now());
      if (!scan.estimate) return snapshots;
      const next = [...snapshots];
      next[index] = {
        ...next[index]!,
        cost: scan.estimate.cost,
        tokens: scan.estimate.tokens,
      };
      return next;
    } catch {
      return snapshots;
    }
  }

  /**
   * Start the background auto-refresh loop. The cadence + enabled providers are
   * re-read from settings on every tick, so changing them in the UI takes
   * effect on the next cycle without a restart. The timer is `unref`'d so it
   * never keeps the process alive, and ticks are serialized (the next is
   * scheduled only after the current completes).
   */
  startAutoRefresh(): void {
    if (this.autoRefreshTimer || this.stopped) return;
    this.scheduleNextTick(this.intervalMs(this.readUsageSettings()));
  }

  stop(): void {
    this.stopped = true;
    if (this.autoRefreshTimer) clearTimeout(this.autoRefreshTimer);
    this.autoRefreshTimer = undefined;
  }

  private intervalMs(settings: UsageSettings): number {
    return Math.max(2, settings.refreshIntervalMinutes) * 60_000;
  }

  private scheduleNextTick(delayMs: number): void {
    if (this.stopped) return;
    this.autoRefreshTimer = setTimeout(() => {
      void this.tick();
    }, delayMs);
    if (typeof this.autoRefreshTimer.unref === "function") this.autoRefreshTimer.unref();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const settings = this.readUsageSettings();
    if (settings.autoRefresh) {
      const ids = this.enabledProviderIds(settings.disabledProviders);
      if (ids.length > 0) {
        try {
          await this.refreshProviderUsage({ providerIds: ids });
        } catch {
          // Per-provider errors are already captured as error snapshots.
        }
      }
    }
    // Keep the loop alive even when auto-refresh is off so re-enabling (or an
    // interval change) resumes without a restart. Reuse the settings read at the
    // top of the tick rather than re-reading the file.
    this.scheduleNextTick(this.intervalMs(settings));
  }

  private loadCache(): void {
    try {
      if (!existsSync(this.options.cachePath)) return;
      const parsed = JSON.parse(readFileSync(this.options.cachePath, "utf8")) as UsageCacheFile;
      if (parsed.version !== USAGE_CACHE_VERSION || !Array.isArray(parsed.snapshots)) return;
      for (const snapshot of parsed.snapshots) {
        if (snapshot && typeof snapshot.providerId === "string") {
          this.snapshots.set(snapshot.providerId, snapshot);
        }
      }
      this.loadedFromCache = this.snapshots.size > 0;
    } catch {
      // best-effort cache
    }
  }

  private writeCache(): void {
    try {
      writeFileSync(
        this.options.cachePath,
        JSON.stringify({
          version: USAGE_CACHE_VERSION,
          snapshots: [...this.snapshots.values()],
          savedAt: new Date().toISOString(),
        }),
        "utf8",
      );
    } catch {
      // best-effort cache
    }
  }
}
