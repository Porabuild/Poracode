import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  allUsageProviderDescriptors,
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
import { createLocalUsageCollectors, type LocalUsageCollector } from "./localUsageCollectors";
import { createNodeUsageHost } from "./usageHost";
import { scanClaudeCost } from "./usageCostScanner";

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
/** The full default provider set, from the package catalog (single source of truth). */
const DEFAULT_PROVIDER_IDS: readonly string[] = allUsageProviderDescriptors().map((d) => d.id);
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
  /** Supervisor-local collectors (opencode, antigravity); injectable in tests. */
  localCollectors?: LocalUsageCollector[];
}

interface UsageCacheFile {
  version?: number;
  snapshots?: UsageSnapshot[];
}

export class UsageService {
  private readonly registry: UsageCollectorRegistry = createUsageCollectorRegistry();
  private readonly localCollectors: Map<string, LocalUsageCollector>;
  private readonly host: HostPort;
  private readonly snapshots = new Map<string, UsageSnapshot>();
  private loadedFromCache = false;
  /** In-flight refreshes keyed by their sorted id-set, so identical concurrent refreshes coalesce. */
  private readonly refreshesInFlight = new Map<string, Promise<ProviderUsageResponse>>();
  private autoRefreshTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly options: UsageServiceOptions) {
    this.host = options.host ?? createNodeUsageHost(options.cacheDir);
    this.localCollectors = new Map(
      (options.localCollectors ?? createLocalUsageCollectors()).map((c) => [c.id, c]),
    );
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
    return this.registry.has(id) || this.localCollectors.has(id);
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

    // Coalesce identical concurrent refreshes by their id-set so two triggers
    // (e.g. the sidebar rail and the docked panel both calling getProviderUsage,
    // or a background tick racing a manual refresh) don't double-hit rate-limited
    // endpoints. Keyed by the sorted ids so it holds for any subset, not just the
    // full default set.
    const key = [...ids].sort().join(",");
    const existing = this.refreshesInFlight.get(key);
    if (existing) return existing;

    // Track the SAME promise we store so the finally clears the right entry.
    const tracked: Promise<ProviderUsageResponse> = this.runRefresh(ids).finally(() => {
      if (this.refreshesInFlight.get(key) === tracked) this.refreshesInFlight.delete(key);
    });
    this.refreshesInFlight.set(key, tracked);
    return tracked;
  }

  private async runRefresh(ids: string[]): Promise<ProviderUsageResponse> {
    const registryIds = ids.filter((id) => this.registry.has(id));
    const localIds = ids.filter((id) => this.localCollectors.has(id));
    // The registry HTTP batch and the supervisor-local collectors are independent
    // of each other, so run both groups concurrently rather than waiting out the
    // (rate-limited, slow) HTTP batch before starting the local scans.
    const [registrySnaps, localSnaps] = await Promise.all([
      this.registry.collectAll(registryIds, this.host),
      Promise.all(localIds.map((id) => this.collectLocal(id))),
    ]);
    let snapshots = [...registrySnaps, ...localSnaps].map((snap) =>
      this.preserveOnTransientFailure(snap),
    );
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

  /** Collect a supervisor-local (SQLite/process-backed) provider; never throws into the refresh. */
  private async collectLocal(id: string): Promise<UsageSnapshot> {
    const now = this.host.now();
    try {
      const collector = this.localCollectors.get(id);
      if (collector) return await collector.collect(now, this.host);
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
