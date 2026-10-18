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
  const getOAuthToken = vi.fn<HostPort["credentials"]["getOAuthToken"]>(async () => ({
    accessToken: "dca:cli",
  }));
  const request = vi.fn<HostPort["http"]["request"]>(async (req) => {
    const isCli = req.url === MUSE_KEY_ENDPOINT;
    const status = isCli ? cliStatus : portalStatus;
    return {
      status,
      headers: status === 429 ? { "retry-after": "300" } : {},
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
    now: () => NOW,
    credentials: {
      getOAuthToken,
      getSecret: async (id, key) => (id === "muse" ? secrets[key] : undefined),
    },
    http: { request },
  };
  const service = new UsageService({
    cachePath,
    emit: () => {},
    host,
    providerIds: ["muse"],
    localCollectors: [],
  });
  services.push(service);
  return {
    service,
    cachePath,
    secrets,
    getOAuthToken,
    request,
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
      version: 12,
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
