import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import type { SupervisorEvent } from "@/shared/ipc";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import { readSupervisorSharedSettings } from "./supervisorSharedSettings";
import { UsageService, type UsageServiceOptions } from "./usageService";
import type { UsageProfileCollector } from "./usageProfileTypes";

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  existsSync: vi.fn<typeof existsSync>(),
  readFileSync: vi.fn<typeof readFileSync>(),
  writeFileSync: vi.fn<typeof writeFileSync>(),
}));
vi.mock("./supervisorSharedSettings", () => ({
  readSupervisorSharedSettings: vi.fn<typeof readSupervisorSharedSettings>(),
}));

const NOW = 1_700_000_000_000;
const CACHE_PATH = "/synthetic/usage.json";
const services: UsageService[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.stop();
  vi.useRealTimers();
  vi.resetAllMocks();
});

function snapshot(providerId: string, fetchedAt = NOW): UsageSnapshot {
  return {
    providerId,
    status: "ok",
    fetchedAt,
    windows: [{ id: "weekly", label: "Weekly", usedPercent: 25 }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(
  count = 8,
  options: {
    autoRefresh?: boolean;
    collectionEnabled?: boolean;
    restrictedDefaults?: boolean;
  } = {},
) {
  vi.useFakeTimers();
  const ids = Array.from({ length: count }, (_, index) => `fixture:profile-${index}`);
  const identities = ids.map((id) =>
    vi.fn<NonNullable<UsageProfileCollector["cacheIdentity"]>>(async () => `source:${id}`),
  );
  const now = vi.fn<HostPort["now"]>(() => NOW);
  const collect = ids.map((id) =>
    vi.fn<UsageProfileCollector["collect"]>(async () => snapshot(id, now())),
  );
  const cadence = ids.map(() => vi.fn<() => number>(() => 5));
  const intervals: Record<string, number> = {};
  ids.forEach((id, index) => Object.defineProperty(intervals, id, { get: cadence[index]! }));
  let settings: SharedSettings = {
    ...defaultSharedSettings,
    usage: {
      ...defaultSharedSettings.usage,
      autoRefresh: options.autoRefresh ?? true,
      disabledProviders: [],
      providerRefreshIntervals: intervals,
      showEstimatedCost: false,
    },
  };
  let collectors: UsageProfileCollector[] = ids.map((id, index) => ({
    providerId: id,
    collect: collect[index]!,
    cacheIdentity: identities[index]!,
  }));
  const profileSources = vi.fn<NonNullable<UsageServiceOptions["profileSources"]>>(() => [
    { collectors },
  ]);
  const getOAuthToken = vi.fn<HostPort["credentials"]["getOAuthToken"]>(async () => undefined);
  const getSecret = vi.fn<HostPort["credentials"]["getSecret"]>(async () => undefined);
  const request = vi.fn<HostPort["http"]["request"]>(async () => {
    throw new Error("Unexpected HTTP request");
  });
  const host: HostPort = {
    now,
    credentials: { getOAuthToken, getSecret },
    http: { request },
  };
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const cache = JSON.stringify({
    version: 10,
    snapshots: ids.map((id) => snapshot(id)),
    profileIdentities: Object.fromEntries(ids.map((id) => [id, `source:${id}`])),
  });
  vi.mocked(existsSync).mockImplementation((path) => path === CACHE_PATH);
  vi.mocked(readFileSync).mockReturnValue(cache);
  vi.mocked(readSupervisorSharedSettings).mockImplementation(() => settings);
  const service = new UsageService({
    cachePath: CACHE_PATH,
    settingsPath: "/synthetic/settings.json",
    host,
    emit,
    localCollectors: [],
    profileSources,
    ...(options.restrictedDefaults ? { providerIds: ids.slice(0, -1) } : {}),
    ...(options.collectionEnabled === undefined
      ? {}
      : { collectionEnabled: options.collectionEnabled }),
  });
  services.push(service);
  return {
    service,
    ids,
    identities,
    collect,
    cadence,
    profileSources,
    getOAuthToken,
    getSecret,
    request,
    now,
    emit,
    setSettings(usage: Partial<SharedSettings["usage"]>) {
      settings = { ...settings, usage: { ...settings.usage, ...usage } };
    },
    removeCollector(id: string) {
      collectors = collectors.filter((collector) => collector.providerId !== id);
    },
    counts() {
      return {
        settingsReads: vi.mocked(readSupervisorSharedSettings).mock.calls.length,
        profileDiscoveries: profileSources.mock.calls.length,
        profileCadenceChecks: cadence.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
        identityReads: identities.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
        collections: collect.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
        http: request.mock.calls.length,
        timers: vi.getTimerCount(),
        cacheWrites: vi.mocked(writeFileSync).mock.calls.length,
      };
    },
  };
}

describe("usage synchronous read scopes", () => {
  it.each([3, 8])("bounds a targeted cached read with %i profile collectors", async (count) => {
    const f = fixture(count);
    const id = f.ids[0]!;
    expect(await f.service.getProviderUsage({ providerIds: [id, id, "unknown"] })).toEqual({
      snapshots: [snapshot(id)],
      fromCache: true,
    });
    expect(f.counts()).toEqual({
      settingsReads: 2,
      profileDiscoveries: 2,
      profileCadenceChecks: 1,
      identityReads: 1,
      collections: 0,
      http: 0,
      timers: 0,
      cacheWrites: 0,
    });
  });

  it("keeps broad discovery and identity retirement when automatic collection is off", async () => {
    const f = fixture(8, { autoRefresh: false });
    expect(await f.service.getProviderUsage({})).toEqual({
      snapshots: f.ids.map((id) => snapshot(id)),
      fromCache: true,
    });
    expect(f.counts()).toEqual({
      settingsReads: 2,
      profileDiscoveries: 1,
      profileCadenceChecks: 0,
      identityReads: 8,
      collections: 0,
      http: 0,
      timers: 0,
      cacheWrites: 0,
    });
    expect(await f.service.refreshDueProviders()).toEqual([]);
    f.identities[0]!.mockResolvedValue("replacement-source");
    expect((await f.service.getProviderUsage({ providerIds: [f.ids[0]!] })).snapshots).toEqual([]);
    expect(f.collect.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(
      (await f.service.refreshProviderUsage({ providerIds: [f.ids[0]!], force: true })).snapshots,
    ).toEqual([snapshot(f.ids[0]!)]);
    expect(f.collect[0]).toHaveBeenCalledOnce();
  });

  it("limits targeted due checks while preserving opt-outs, backoff and restricted defaults", async () => {
    const f = fixture(6, { restrictedDefaults: true });
    f.now.mockReturnValue(NOW + 600_000);
    f.setSettings({
      disabledProviders: [f.ids[2]!],
      providerRefreshIntervals: { [f.ids[3]!]: 20 },
    });
    // A forced collection seeds explicit backoff without accessing any real endpoint.
    f.collect[1]!.mockResolvedValue({
      ...snapshot(f.ids[1]!),
      status: "rate-limited",
      rateLimitedUntil: NOW + 900_000,
    });
    await f.service.refreshProviderUsage({ providerIds: [f.ids[1]!] });
    f.collect.forEach((spy) => spy.mockClear());
    await f.service.getProviderUsage({
      providerIds: [f.ids[0]!, f.ids[1]!, f.ids[2]!, f.ids[3]!, f.ids[5]!],
    });
    // Join the already-started background refresh rather than starting a second collection.
    await f.service.refreshProviderUsage({ providerIds: [f.ids[0]!] });
    expect(f.collect.map((spy) => spy.mock.calls.length)).toEqual([1, 0, 0, 0, 0, 0]);
    // The broad poll still finds a due sibling omitted from the targeted read.
    expect(await f.service.refreshDueProviders()).toEqual([f.ids[4]]);
    expect(f.collect.map((spy) => spy.mock.calls.length)).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it("re-reads policy after asynchronous identity synchronization", async () => {
    const f = fixture();
    f.now.mockReturnValue(NOW + 600_000);
    const entered = deferred<void>();
    const identity = deferred<string>();
    f.identities[0]!.mockImplementationOnce(() => {
      entered.resolve();
      return identity.promise;
    });
    const pending = f.service.getProviderUsage({ providerIds: [f.ids[0]!] });
    await entered.promise;
    f.setSettings({ autoRefresh: false });
    identity.resolve(`source:${f.ids[0]}`);
    expect((await pending).snapshots).toEqual([snapshot(f.ids[0]!)]);
    expect(f.collect.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(readSupervisorSharedSettings).toHaveBeenCalledTimes(2);
  });

  it("revalidates collector membership after an awaited commit identity check", async () => {
    const f = fixture(3, { autoRefresh: false });
    const entered = deferred<void>();
    const identity = deferred<string>();
    f.identities[0]!.mockResolvedValueOnce(`source:${f.ids[0]}`).mockImplementationOnce(() => {
      entered.resolve();
      return identity.promise;
    });
    const pending = f.service.refreshProviderUsage({ providerIds: [f.ids[0]!] });
    await entered.promise;
    f.removeCollector(f.ids[0]!);
    identity.resolve(`source:${f.ids[0]}`);
    expect((await pending).snapshots).toEqual([]);
    expect(f.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: "provider-usage" }));
    expect(
      (await f.service.getProviderUsage({})).snapshots.map((value) => value.providerId),
    ).toEqual(f.ids.slice(1));
  });

  it("admits no work or cache writes when collection is disabled", async () => {
    const f = fixture(8, { collectionEnabled: false });
    f.service.startAutoRefresh();
    f.service.startAutoRefresh();
    for (const providerIds of [undefined, [f.ids[0]!]]) {
      const payload = providerIds ? { providerIds } : {};
      expect(await f.service.getProviderUsage(payload)).toEqual({
        snapshots: [],
        fromCache: false,
      });
      expect(await f.service.refreshProviderUsage({ ...payload, force: true })).toEqual({
        snapshots: [],
        fromCache: false,
      });
    }
    expect(await f.service.refreshDueProviders()).toEqual([]);
    await f.service.reconcileProfileSources();
    expect(f.counts()).toEqual({
      settingsReads: 0,
      profileDiscoveries: 0,
      profileCadenceChecks: 0,
      identityReads: 0,
      collections: 0,
      http: 0,
      timers: 0,
      cacheWrites: 0,
    });
    for (const spy of [f.getOAuthToken, f.getSecret, f.now, f.emit])
      expect(spy).not.toHaveBeenCalled();
  });
});
