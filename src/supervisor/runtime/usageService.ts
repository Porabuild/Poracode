import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  allUsageProviderDescriptors,
  createUsageCollectorRegistry,
  type HostPort,
  type UsageCollectorRegistry,
  type UsageSnapshot,
} from "@poracode/agents-usage";
import { coalesceByKey } from "@/shared/coalesce";
import type { ProviderUsagePayload, ProviderUsageResponse } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  type SharedSettings,
  type UsageSettings,
} from "@/shared/settings";
import {
  collectClaudeProfile,
  readClaudeUsageProfiles,
  shouldPreserveClaudeAuthMiss,
  withClaudeEstimatedCost,
  type ClaudeUsageProfile,
} from "../agents/claude/claudeUsageProfiles";
import { createLocalUsageCollectors, type LocalUsageCollector } from "./localUsageCollectors";
import { createNodeUsageHost } from "./usageHost";

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
/**
 * Fallback backoff for a provider reporting `rate-limited` without an explicit
 * `rateLimitedUntil` deadline (e.g. a 429 with no Retry-After, or a non-Claude
 * collector). Longer than the 2-min floor so a throttled endpoint is given room
 * to recover instead of being re-hit every cycle.
 */
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

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

function hasDisplayableUsage(snapshot: UsageSnapshot): boolean {
  return (
    snapshot.windows.length > 0 ||
    snapshot.cost !== undefined ||
    snapshot.tokens !== undefined ||
    snapshot.credits !== undefined
  );
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
    const baseIds = [...(this.options.providerIds ?? DEFAULT_PROVIDER_IDS)];
    if (this.options.providerIds) return baseIds;
    return [...baseIds, ...this.claudeUsageProfiles().keys()];
  }

  /** Read shared settings from disk (defaults if absent). */
  private readSharedSettings(): SharedSettings {
    if (!this.options.settingsPath) return defaultSharedSettings;
    try {
      return normalizeSharedSettings(JSON.parse(readFileSync(this.options.settingsPath, "utf8")));
    } catch {
      return defaultSharedSettings;
    }
  }

  /** Read the usage policy from the shared settings file (defaults if absent). */
  private readUsageSettings(): UsageSettings {
    return this.readSharedSettings().usage;
  }

  private claudeUsageProfiles(): Map<string, ClaudeUsageProfile> {
    return readClaudeUsageProfiles(this.readSharedSettings());
  }

  /** A provider id this service can collect (package registry or supervisor-local). */
  private isSupported(id: string): boolean {
    return (
      this.registry.has(id) || this.localCollectors.has(id) || this.claudeUsageProfiles().has(id)
    );
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

  /**
   * Epoch ms before which a snapshot should not be re-polled because the
   * provider is rate-limited: its explicit `rateLimitedUntil` (from a 429's
   * Retry-After) when present, else a default cooldown after a bare
   * `rate-limited` status. Undefined when no backoff applies.
   */
  private rateLimitDeadline(snap: UsageSnapshot): number | undefined {
    if (snap.rateLimitedUntil !== undefined) return snap.rateLimitedUntil;
    if (snap.status === "rate-limited") return snap.fetchedAt + DEFAULT_RATE_LIMIT_COOLDOWN_MS;
    return undefined;
  }

  /** True while a provider is inside its rate-limit backoff window. */
  private isRateLimited(snap: UsageSnapshot | undefined, now: number): boolean {
    if (!snap) return false;
    const deadline = this.rateLimitDeadline(snap);
    return deadline !== undefined && deadline > now;
  }

  private isStale(id: string): boolean {
    const snap = this.snapshots.get(id);
    if (!snap) return true;
    const now = this.host.now();
    // Honor a server-requested backoff: a rate-limited provider is not "stale",
    // so a cache read won't kick off a background refresh that just re-hits the
    // throttled endpoint. A user-initiated refresh bypasses this (it goes
    // straight to refreshProviderUsage, not through here).
    if (this.isRateLimited(snap, now)) return false;
    return now - snap.fetchedAt >= MIN_REFRESH_INTERVAL_MS;
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

    // Refresh only the stale ids — never the whole requested set — so a single
    // stale provider doesn't drag a still-rate-limited sibling back into a 429.
    const stale = ids.filter((id) => this.isStale(id));
    if (stale.length > 0) {
      void this.refreshProviderUsage({ providerIds: stale }).catch((error) => {
        // Errors surface as per-provider error snapshots; log for diagnostics.
        console.warn("[usage] background refresh failed:", error);
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
    return coalesceByKey(this.refreshesInFlight, key, () => this.runRefresh(ids));
  }

  private async runRefresh(ids: string[]): Promise<ProviderUsageResponse> {
    const claudeProfiles = this.claudeUsageProfiles();
    const registryIds = ids.filter((id) => this.registry.has(id));
    const localIds = ids.filter((id) => this.localCollectors.has(id));
    const claudeProfileIds = ids.filter((id) => claudeProfiles.has(id));
    // The registry HTTP batch and the supervisor-local collectors are independent
    // of each other, so run both groups concurrently rather than waiting out the
    // (rate-limited, slow) HTTP batch before starting the local scans.
    const [registrySnaps, localSnaps, claudeProfileSnaps] = await Promise.all([
      this.registry.collectAll(registryIds, this.host),
      Promise.all(localIds.map((id) => this.collectLocal(id))),
      Promise.all(
        claudeProfileIds.flatMap((id) => {
          const profile = claudeProfiles.get(id);
          return profile ? [collectClaudeProfile(profile, this.host)] : [];
        }),
      ),
    ]);
    let snapshots = [...registrySnaps, ...localSnaps, ...claudeProfileSnaps].map((snap) =>
      this.preserveOnTransientFailure(snap),
    );
    if (this.readUsageSettings().showEstimatedCost) {
      snapshots = await this.withEstimatedCost(snapshots, claudeProfiles);
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
   * On a transient failure (rate-limit / error) keep the last-known usage
   * snapshot instead of flushing the UI to empty.
   *
   * Provider auth-miss preservation (currently Claude-only, see
   * `shouldPreserveClaudeAuthMiss`) matches the stale-while-revalidate
   * behavior of comparable usage tools for auth-missing after a prior
   * successful read. First-time auth-missing still renders as not signed in.
   */
  private preserveOnTransientFailure(snap: UsageSnapshot): UsageSnapshot {
    const preserveClaudeAuthMiss = shouldPreserveClaudeAuthMiss(snap);
    if (snap.status !== "rate-limited" && snap.status !== "error" && !preserveClaudeAuthMiss) {
      return snap;
    }
    const prev = this.snapshots.get(snap.providerId);
    if (!prev || !hasDisplayableUsage(prev)) return snap;
    // Rate-limited: keep showing the last good windows, but adopt the new fetch
    // time and rate-limit deadline so the poller still honors the backoff —
    // otherwise the preserved snapshot's old `fetchedAt` would read as "due" and
    // immediately re-hit the 429.
    if (snap.status === "rate-limited") {
      return {
        ...prev,
        status: snap.status,
        fetchedAt: snap.fetchedAt,
        ...(snap.rateLimitedUntil !== undefined ? { rateLimitedUntil: snap.rateLimitedUntil } : {}),
      };
    }
    // Claude auth misses after a prior good read are treated like transient
    // stale-while-revalidate failures. Keep the old fetchedAt so the footer
    // still reflects when the displayed numbers were actually obtained and the
    // next refresh cycle keeps trying to recover.
    if (preserveClaudeAuthMiss) return prev;
    // Plain transient error: keep the prior snapshot unchanged.
    return prev;
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
   * Merge estimated 30-day cost + tokens (from local logs at API rates) into
   * Claude snapshots. Best-effort and cached; never throws into the refresh.
   */
  private async withEstimatedCost(
    snapshots: UsageSnapshot[],
    profiles: Map<string, ClaudeUsageProfile>,
  ): Promise<UsageSnapshot[]> {
    return Promise.all(
      snapshots.map((snapshot) => withClaudeEstimatedCost(snapshot, profiles, this.host.now())),
    );
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
    this.scheduleNextTick(this.nextTickDelayMs(this.readUsageSettings()));
  }

  stop(): void {
    this.stopped = true;
    if (this.autoRefreshTimer) clearTimeout(this.autoRefreshTimer);
    this.autoRefreshTimer = undefined;
  }

  /** Global default cadence (minutes → ms), floored at the rate-limit minimum. */
  private intervalMs(settings: UsageSettings): number {
    return Math.max(2, settings.refreshIntervalMinutes) * 60_000;
  }

  /**
   * A single provider's effective cadence: its own `providerRefreshIntervals`
   * override when present, otherwise the global default. Floored at the 2-minute
   * rate-limit minimum either way.
   */
  private effectiveIntervalMs(settings: UsageSettings, providerId: string): number {
    const override = settings.providerRefreshIntervals[providerId];
    const minutes = override ?? settings.refreshIntervalMinutes;
    return Math.max(2, minutes) * 60_000;
  }

  /**
   * Enabled providers whose own cadence has elapsed since their last fetch (or
   * that have never been fetched). Each provider runs on its own clock derived
   * from the snapshot's `fetchedAt`, so one tick can refresh a fast provider
   * while leaving a slow one untouched.
   */
  private dueProviderIds(settings: UsageSettings): string[] {
    const now = this.host.now();
    return this.enabledProviderIds(settings.disabledProviders).filter((id) => {
      const snap = this.snapshots.get(id);
      if (!snap) return true;
      // Skip providers inside their rate-limit backoff so the auto-refresh tick
      // doesn't re-hit a throttled endpoint before its Retry-After clears.
      if (this.isRateLimited(snap, now)) return false;
      return now - snap.fetchedAt >= this.effectiveIntervalMs(settings, id);
    });
  }

  /**
   * Delay until the next tick: the shortest effective cadence among enabled
   * providers (so a provider on a 2-minute interval is honored even when others
   * are slower). Falls back to the global default when nothing is enabled, which
   * keeps the loop alive so re-enabling resumes without a restart.
   */
  private nextTickDelayMs(settings: UsageSettings): number {
    let min = Infinity;
    for (const id of this.enabledProviderIds(settings.disabledProviders)) {
      min = Math.min(min, this.effectiveIntervalMs(settings, id));
    }
    return Number.isFinite(min) ? min : this.intervalMs(settings);
  }

  /**
   * Refresh every provider whose per-provider cadence has elapsed. Exposed
   * (beyond the private tick) so the timer behavior is unit-testable without
   * driving real `setTimeout`s. Returns the ids that were refreshed.
   */
  async refreshDueProviders(): Promise<string[]> {
    if (this.stopped) return [];
    const settings = this.readUsageSettings();
    if (!settings.autoRefresh) return [];
    const ids = this.dueProviderIds(settings);
    if (ids.length === 0) return [];
    try {
      await this.refreshProviderUsage({ providerIds: ids });
    } catch {
      // Per-provider errors are already captured as error snapshots.
    }
    return ids;
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
    await this.refreshDueProviders();
    // Keep the loop alive even when auto-refresh is off so re-enabling (or an
    // interval change) resumes without a restart.
    this.scheduleNextTick(this.nextTickDelayMs(this.readUsageSettings()));
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
