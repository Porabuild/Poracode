import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MUSE_KEY_ENDPOINT, type HostPort } from "@poracode/agents-usage";
import { UsageService } from "../../runtime/usageService";

const NOW = 1_700_000_000_000;
const CLI = {
  subs_tier_name: "CLI plan",
  user_email: "cli@example.com",
  subs_usage: { weekly: { used_percent: 30 } },
};
const directories: string[] = [];
const services: UsageService[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.stop();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(options: { cookie?: string; previousVersion?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "muse-usage-"));
  directories.push(directory);
  const cachePath = join(directory, "usage.json");
  const settingsPath = join(directory, "settings.json");
  if (options.previousVersion !== undefined) {
    writeFileSync(
      cachePath,
      JSON.stringify({
        version: options.previousVersion,
        snapshots: [
          {
            providerId: "muse",
            status: "ok",
            windows: [{ id: "weekly", label: "Weekly", usedPercent: 30 }],
            authenticatedAs: "cli@example.com",
            fetchedAt: NOW,
          },
        ],
      }),
    );
  }
  const secrets: Record<string, string> = {
    teamId: "team-1",
    ...(options.cookie ? { cookie: options.cookie } : {}),
  };
  let portalStatus = 200;
  let cliStatus = 200;
  let now = NOW;
  let retryAfter: string | undefined = "300";
  const getOAuthToken = vi.fn<HostPort["credentials"]["getOAuthToken"]>(async () => ({
    accessToken: "dca:cli",
  }));
  const request = vi.fn<HostPort["http"]["request"]>(async (req) => {
    const isCli = req.url === MUSE_KEY_ENDPOINT;
    const status = isCli ? cliStatus : portalStatus;
    return {
      status,
      headers: status === 429 && retryAfter ? { "retry-after": retryAfter } : {},
      body: JSON.stringify(
        status !== 200
          ? {}
          : isCli
            ? CLI
            : req.url.endsWith("/subscription-quota")
              ? {
                  subscription_quota: {
                    tier: "Browser plan",
                    weekly_weighted_used: "90",
                    weekly_weighted_limit: "100",
                  },
                }
              : {
                  metric: "usage_billable_cost",
                  series: [{ type: "TOTAL", data_points: [{ value: 142000000 }] }],
                },
      ),
    };
  });
  const host: HostPort = {
    now: () => now,
    credentials: {
      getOAuthToken,
      getSecret: async (id, key) => (id === "muse" ? secrets[key] : undefined),
    },
    http: { request },
  };
  const serviceOptions = {
    cachePath,
    settingsPath,
    emit: () => {},
    host,
    providerIds: ["muse"],
    localCollectors: [],
  };
  let service = new UsageService(serviceOptions);
  services.push(service);
  return {
    get service() {
      return service;
    },
    cachePath,
    secrets,
    getOAuthToken,
    request,
    advance(minutes: number) {
      now += minutes * 60_000;
    },
    setRetryAfter(value: string | undefined) {
      retryAfter = value;
    },
    setIntervals(global: number, override?: number) {
      writeFileSync(
        settingsPath,
        JSON.stringify({
          usage: {
            refreshIntervalMinutes: global,
            providerRefreshIntervals: override === undefined ? {} : { muse: override },
          },
        }),
      );
    },
    restart() {
      service.stop();
      service = new UsageService(serviceOptions);
      services.push(service);
    },
    setPortalStatus(status: number) {
      portalStatus = status;
    },
    setCliStatus(status: number) {
      cliStatus = status;
    },
    refresh: () => service.refreshProviderUsage({ providerIds: ["muse"], force: true }),
    read: () => service.getProviderUsage({ providerIds: ["muse"] }),
  };
}

describe("Muse usage source custody", () => {
  it.each([
    [5, undefined, 15],
    [30, undefined, 30],
    [5, 2, 2],
  ])(
    "uses a conservative cadence with global %i and override %s",
    async (global, override, expected) => {
      const f = fixture({ cookie: "llm_sess=test" });
      f.setIntervals(global!, override);
      await f.refresh();
      f.advance(expected! - 1);
      expect(await f.service.refreshDueProviders()).toEqual([]);
      expect(f.request).toHaveBeenCalledTimes(2);
      f.advance(1);
      expect(await f.service.refreshDueProviders()).toEqual(["muse"]);
      expect(f.request).toHaveBeenCalledTimes(4);
    },
  );

  it("backs off bare 429s across restarts, guards manual refreshes, and resets after success", async () => {
    const f = fixture({ cookie: "llm_sess=test" });
    const good = (await f.refresh()).snapshots[0];
    f.setRetryAfter(undefined);
    f.setPortalStatus(429);
    for (const [index, minutes] of [15, 30, 60, 60].entries()) {
      const now = NOW + [0, 15, 45, 105][index]! * 60_000;
      const result = (await f.refresh()).snapshots[0];
      expect(result).toEqual({
        ...good,
        status: "rate-limited",
        rateLimitedUntil: now + minutes * 60_000,
      });
      const calls = f.request.mock.calls.length;
      f.restart();
      expect((await f.refresh()).snapshots[0]).toEqual(result);
      expect((await f.read()).snapshots[0]).toEqual(result);
      expect(await f.service.refreshDueProviders()).toEqual([]);
      expect(f.request).toHaveBeenCalledTimes(calls);
      f.advance(minutes);
    }
    f.setPortalStatus(200);
    expect((await f.refresh()).snapshots[0]?.status).toBe("ok");
    f.setPortalStatus(429);
    expect((await f.refresh()).snapshots[0]?.rateLimitedUntil).toBe(NOW + 180 * 60_000);
  });

  it("keeps a longer server Retry-After", async () => {
    const f = fixture({ cookie: "llm_sess=test" });
    f.setPortalStatus(429);
    f.setRetryAfter("7200");
    expect((await f.refresh()).snapshots[0]?.rateLimitedUntil).toBe(NOW + 120 * 60_000);
  });

  it.each(["cookie", "teamId"])(
    "clears the previous source's cooldown when %s changes",
    async (key) => {
      const f = fixture({ cookie: "llm_sess=test" });
      f.setPortalStatus(429);
      await f.refresh();
      f.advance(15);
      await f.refresh();
      f.secrets[key] = "replacement";
      expect((await f.refresh()).snapshots[0]?.rateLimitedUntil).toBe(NOW + 30 * 60_000);
      expect(f.request).toHaveBeenCalledTimes(6);
    },
  );

  it("keeps a v13 cooldown when the cache has no attempt counts", async () => {
    const f = fixture({ cookie: "llm_sess=test" });
    f.setPortalStatus(429);
    const snapshot = (await f.refresh()).snapshots[0];
    const cache = JSON.parse(readFileSync(f.cachePath, "utf8"));
    delete cache.rateLimitAttempts;
    writeFileSync(f.cachePath, JSON.stringify(cache));
    f.restart();
    expect((await f.refresh()).snapshots[0]).toEqual(snapshot);
    expect(f.request).toHaveBeenCalledTimes(2);
    f.advance(15);
    expect((await f.refresh()).snapshots[0]?.rateLimitedUntil).toBe(NOW + 30 * 60_000);
  });

  it("replaces previous CLI-account usage with browser usage without requesting CLI credentials", async () => {
    const f = fixture({ cookie: "llm_sess=test", previousVersion: 10 });
    expect(await f.read()).toEqual({ snapshots: [], fromCache: false });
    const refreshed = await f.refresh();
    expect(refreshed.snapshots).toEqual([
      {
        providerId: "muse",
        status: "ok",
        windows: [{ id: "weekly", label: "Weekly limit", usedPercent: 90, unit: "percent" }],
        plan: "Browser plan",
        cost: { currency: "USD", amount: 1.42, period: "30d", estimated: false },
        fetchedAt: NOW,
      },
    ]);
    expect(f.getOAuthToken).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(readFileSync(f.cachePath, "utf8"))).toMatchObject({
      version: 14,
      snapshots: refreshed.snapshots,
    });
    expect(readFileSync(f.cachePath, "utf8")).not.toContain("llm_sess=test");
  });

  it.each([500, 429])(
    "does not preserve CLI quota when a new browser session fails with %i",
    async (status) => {
      const f = fixture();
      expect((await f.refresh()).snapshots[0]).toMatchObject({
        authenticatedAs: "cli@example.com",
        windows: [{ usedPercent: 30 }],
      });
      f.secrets.cookie = "llm_sess=test";
      f.setPortalStatus(status);
      expect((await f.refresh()).snapshots).toEqual([
        expect.objectContaining({
          status: status === 429 ? "rate-limited" : "error",
          windows: [],
        }),
      ]);
      expect((await f.read()).snapshots[0]?.authenticatedAs).toBeUndefined();
      expect(f.getOAuthToken).toHaveBeenCalledOnce();
    },
  );

  it("keeps last good browser usage and reports a failure of the same session", async () => {
    const f = fixture({ cookie: "llm_sess=test" });
    const good = await f.refresh();
    f.setPortalStatus(500);
    expect((await f.refresh()).snapshots).toEqual(
      good.snapshots.map((snapshot) => ({ ...snapshot, status: "error" })),
    );
    expect(f.getOAuthToken).not.toHaveBeenCalled();
  });

  it.each(["cookie", "teamId"])(
    "retires cached browser usage when %s changes before a cached read",
    async (key) => {
      const f = fixture({ cookie: "llm_sess=test" });
      expect((await f.refresh()).snapshots[0]?.windows).toHaveLength(1);
      f.secrets[key] = "replacement";
      expect(await f.read()).toEqual({ snapshots: [], fromCache: false });
      expect(f.getOAuthToken).not.toHaveBeenCalled();
    },
  );

  it("does not preserve browser billing after signing out when CLI usage fails", async () => {
    const f = fixture({ cookie: "llm_sess=test" });
    expect((await f.refresh()).snapshots[0]?.cost?.amount).toBe(1.42);
    delete f.secrets.cookie;
    f.setCliStatus(500);
    const result = await f.refresh();
    expect(result.snapshots[0]).toMatchObject({ status: "error", windows: [] });
    expect(result.snapshots[0]?.cost).toBeUndefined();
    expect(f.getOAuthToken).toHaveBeenCalledOnce();
  });
});
