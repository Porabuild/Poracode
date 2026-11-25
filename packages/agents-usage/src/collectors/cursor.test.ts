import { describe, expect, it } from "vitest";
import type { HostPort, OAuthToken } from "../host";
import { usageSnapshotSchema } from "../types";
import {
  collectCursor,
  collectCursorFromApiKey,
  CURSOR_AGGREGATED_USAGE_ENDPOINT,
  CURSOR_API_KEY_EXCHANGE_ENDPOINT,
  CURSOR_PERIOD_USAGE_ENDPOINT,
  CURSOR_PLAN_INFO_ENDPOINT,
  CURSOR_SHARED_USAGE_ENDPOINT,
  CURSOR_BILLING_USAGE_ENDPOINT,
  parseCursorPeriodUsage,
  parseCursorUsage,
} from "./cursor";

const NOW = 1_717_000_000_000;
const SHARED_USAGE = {
  isUnified: true,
  usagePercent: 8.927,
  hasNonZeroIncludedLimit: true,
  nextResetTimestampUtc: new Date(NOW + 3 * 86_400_000).toISOString(),
};
const BILLING_USAGE = {
  availability: "available",
  monthlyUsage: {
    usedCents: 725,
    limitCents: 1000,
    periodStart: new Date(NOW - 86_400_000).toISOString(),
    resetsAt: new Date(NOW + 20 * 86_400_000).toISOString(),
  },
};

/** Minimal host that captures the outgoing request and returns a canned body. */
function fakeHost(token: OAuthToken | undefined): {
  host: HostPort;
  sent: { cookie: string | undefined };
} {
  const sent: { cookie: string | undefined } = { cookie: undefined };
  const host: HostPort = {
    now: () => NOW,
    credentials: {
      getOAuthToken: async () => token,
      getSecret: async () => undefined,
    },
    http: {
      request: async (req) => {
        sent.cookie = req.headers?.Cookie;
        return { status: 200, headers: {}, body: JSON.stringify({ membershipType: "pro" }) };
      },
    },
  };
  return { host, sent };
}

describe("collectCursor cookie", () => {
  it("composes WorkosCursorSessionToken as userId::jwt when accountId is present", async () => {
    const { host, sent } = fakeHost({ accessToken: "jwt-abc", accountId: "user_01ABC" });
    await collectCursor(host);
    expect(sent.cookie).toBe("WorkosCursorSessionToken=user_01ABC%3A%3Ajwt-abc");
  });

  it("falls back to the bare token when accountId is absent", async () => {
    const { host, sent } = fakeHost({ accessToken: "jwt-abc" });
    await collectCursor(host);
    expect(sent.cookie).toBe("WorkosCursorSessionToken=jwt-abc");
  });

  it.each([false, true])(
    "collects shared quota for CLI or API-key accounts (API key: %s)",
    async (apiKey) => {
      const token = `header.${Buffer.from(JSON.stringify({ sub: "auth0|fixture-user", email: "work@example.com" })).toString("base64url")}.sig`;
      const requests: Array<{ url: string; method?: string; headers?: Record<string, string> }> =
        [];
      const host: HostPort = {
        now: () => NOW,
        credentials: {
          getOAuthToken: async () => ({ accessToken: token, accountId: "fixture-user" }),
          getSecret: async () => undefined,
        },
        http: {
          request: async (req) => {
            requests.push(req);
            const bodies: Record<string, unknown> = {
              [CURSOR_API_KEY_EXCHANGE_ENDPOINT]: { accessToken: token },
              [CURSOR_PLAN_INFO_ENDPOINT]: { planInfo: { planName: "premium" } },
              [CURSOR_PERIOD_USAGE_ENDPOINT]: {
                planUsage: { autoPercentUsed: 0, apiPercentUsed: 0 },
              },
              "https://cursor.com/api/usage-summary": {
                membershipType: "premium",
                individualUsage: { plan: { autoPercentUsed: 0, apiPercentUsed: 0 } },
              },
              [CURSOR_SHARED_USAGE_ENDPOINT]: SHARED_USAGE,
              [CURSOR_BILLING_USAGE_ENDPOINT]: BILLING_USAGE,
            };
            if (!(req.url in bodies)) throw new Error(`unexpected URL: ${req.url}`);
            return { status: 200, headers: {}, body: JSON.stringify(bodies[req.url]) };
          },
        },
      };
      const snap = apiKey
        ? await collectCursorFromApiKey(host, "crsr_work", "cursor:work")
        : await collectCursor(host);
      expect(snap.providerId).toBe(apiKey ? "cursor:work" : "cursor");
      expect(snap.plan).toBe("Cursor Premium");
      expect(snap.windows.map((w) => w.id)).toEqual(["weekly", "extra-usage"]);
      const sharedRequest = requests.find((req) => req.url === CURSOR_SHARED_USAGE_ENDPOINT);
      expect(sharedRequest?.method).toBe("POST");
      expect(sharedRequest?.headers).toMatchObject({
        Origin: "https://cursor.com",
        Cookie: `WorkosCursorSessionToken=fixture-user%3A%3A${token}`,
      });
      expect(requests.find((req) => req.url === CURSOR_BILLING_USAGE_ENDPOINT)?.method).toBe("GET");
    },
  );

  it("keeps legacy usage when the optional shared-pool request fails", async () => {
    const { host } = fakeHost({ accessToken: "fixture" });
    host.http.request = async (req) => {
      if (req.url === CURSOR_SHARED_USAGE_ENDPOINT) throw new Error("unavailable");
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          membershipType: "pro",
          individualUsage: { plan: { autoPercentUsed: 20, apiPercentUsed: 30 } },
        }),
      };
    };
    const snap = await collectCursor(host);
    expect(snap.status).toBe("ok");
    expect(snap.windows.map((w) => w.id)).toEqual(["cursor-auto", "cursor-api"]);
  });

  it.each([false, true])(
    "splits Cursor Models and API spend via aggregated usage events for legacy plans (API key: %s)",
    async (apiKey) => {
      const token = `header.${Buffer.from(JSON.stringify({ sub: "github|fixture-user", email: "work@example.com" })).toString("base64url")}.sig`;
      const requests: Array<{
        url: string;
        method?: string;
        body?: string;
        authorization?: string;
      }> = [];
      const aggregatedBody = {
        aggregations: [
          { modelIntent: "cursor-model-a", tier: 2, totalCents: 70677.27911 },
          { modelIntent: "api-model-a", tier: 1, totalCents: 18362.01214 },
        ],
      };
      const host: HostPort = {
        // Inside the fixture's November 2026 billing cycle, so aggregated usage
        // is requested through the current moment rather than the future reset.
        now: () => 1_795_608_000_000,
        credentials: {
          getOAuthToken: async () => ({ accessToken: token, accountId: "fixture-user" }),
          getSecret: async () => undefined,
        },
        http: {
          request: async (req) => {
            requests.push({
              url: req.url,
              ...(req.method ? { method: req.method } : {}),
              ...(req.body ? { body: req.body } : {}),
              ...(req.headers?.Authorization ? { authorization: req.headers.Authorization } : {}),
            });
            const bodies: Record<string, unknown> = {
              [CURSOR_API_KEY_EXCHANGE_ENDPOINT]: { accessToken: token },
              [CURSOR_PLAN_INFO_ENDPOINT]: { planInfo: { planName: "team" } },
              [CURSOR_PERIOD_USAGE_ENDPOINT]: {
                billingCycleStart: "1793734540000",
                billingCycleEnd: "1796326540000",
                planUsage: {
                  totalSpend: 90814,
                  includedSpend: 2000,
                  limit: 2000,
                  autoPercentUsed: 67.41428571428571,
                  apiPercentUsed: 100,
                },
                spendLimitUsage: {
                  individualUsed: 102042,
                  pooledLimit: "105000",
                  pooledRemaining: "0",
                  pooledUsed: 105185,
                  totalSpend: 105185,
                },
              },
              "https://cursor.com/api/usage-summary": {
                billingCycleStart: "2026-11-03T19:35:40.000Z",
                billingCycleEnd: "2026-12-03T19:35:40.000Z",
                membershipType: "team",
                individualUsage: {
                  plan: {
                    used: 2000,
                    limit: 2000,
                    breakdown: { included: 2000, bonus: 88814, total: 90814 },
                    autoPercentUsed: 67.41428571428571,
                    apiPercentUsed: 100,
                  },
                  onDemand: { enabled: true, limit: null, used: 102042 },
                },
                teamUsage: {
                  onDemand: { enabled: true, limit: 105000, used: 105185 },
                },
              },
              [CURSOR_SHARED_USAGE_ENDPOINT]: { isUnified: false },
              [CURSOR_AGGREGATED_USAGE_ENDPOINT]: aggregatedBody,
            };
            if (!(req.url in bodies)) throw new Error(`unexpected URL: ${req.url}`);
            return { status: 200, headers: {}, body: JSON.stringify(bodies[req.url]) };
          },
        },
      };

      const snap = apiKey
        ? await collectCursorFromApiKey(host, "crsr_work", "cursor:work")
        : await collectCursor(host);

      const aggReq = requests.find((req) => req.url === CURSOR_AGGREGATED_USAGE_ENDPOINT);
      expect(aggReq?.method).toBe("POST");
      expect(JSON.parse(aggReq?.body ?? "{}")).toEqual({
        startDate: "1793734540000",
        endDate: "1795608000000",
      });
      expect(aggReq?.authorization).toBe(`Bearer ${token}`);

      expect(snap.windows.find((w) => w.id === "cursor-auto")).toMatchObject({
        usedPercent: 67.41428571428571,
        currency: "USD",
        used: 706.77,
      });
      expect(snap.windows.find((w) => w.id === "cursor-auto")?.limit).toBeUndefined();
      expect(snap.windows.find((w) => w.id === "cursor-api")).toMatchObject({
        usedPercent: 100,
        currency: "USD",
        used: 183.62,
      });
      expect(snap.windows.find((w) => w.id === "cursor-api")?.limit).toBeUndefined();
      const onDemand = snap.windows.find((w) => w.id === "extra-usage");
      expect(onDemand).toMatchObject({
        label: "On-demand",
        unit: "usd",
        currency: "USD",
        used: 1051.85,
        limit: 1050,
      });
      expect(onDemand?.usedPercent).toBe(100);
    },
  );
});

describe("parseCursorUsage", () => {
  it.each(["premium", "super", "ultra", "unified_ultra"])(
    "uses the shared weekly pool and separate paid spend for %s",
    (membershipType) => {
      const snap = parseCursorUsage(
        {
          membershipType,
          billingCycleEnd: BILLING_USAGE.monthlyUsage.resetsAt,
          individualUsage: {
            plan: { autoPercentUsed: 0, apiPercentUsed: 0 },
            onDemand: { enabled: false, used: 0 },
          },
        },
        {},
        NOW,
        { shared: SHARED_USAGE, billing: BILLING_USAGE },
      );
      expect(snap.status).toBe("ok");
      expect(snap.windows).toEqual([
        {
          id: "weekly",
          label: "Weekly",
          usedPercent: 8.927,
          unit: "percent",
          resetsAt: NOW + 3 * 86_400_000,
        },
        {
          id: "extra-usage",
          label: "Extra usage",
          unit: "usd",
          currency: "USD",
          used: 7.25,
          limit: 10,
          usedPercent: 72.5,
          resetsAt: NOW + 20 * 86_400_000,
        },
      ]);
    },
  );

  it("omits unused paid usage without a spending cap", () => {
    const snap = parseCursorUsage({ membershipType: "premium" }, {}, NOW, {
      shared: SHARED_USAGE,
      billing: {
        ...BILLING_USAGE,
        monthlyUsage: { ...BILLING_USAGE.monthlyUsage, usedCents: 0, limitCents: null },
      },
    });
    expect(snap.plan).toBe("Cursor Premium");
    expect(snap.windows.map((w) => w.id)).toEqual(["weekly"]);
  });

  it("shows paid usage without inventing a credit balance or spending cap", () => {
    const snap = parseCursorUsage({}, {}, NOW, {
      shared: SHARED_USAGE,
      billing: {
        ...BILLING_USAGE,
        monthlyUsage: { ...BILLING_USAGE.monthlyUsage, limitCents: null },
      },
    });
    expect(snap.windows.map((w) => w.id)).toEqual(["weekly"]);
    expect(snap.cost).toEqual({ amount: 7.25, currency: "USD", period: "cycle", estimated: false });
    expect(snap.credits).toBeUndefined();
  });

  it.each([
    {},
    { availability: "identity_unlinked" },
    { ...BILLING_USAGE, monthlyUsage: { ...BILLING_USAGE.monthlyUsage, usedCents: -1 } },
    {
      ...BILLING_USAGE,
      monthlyUsage: { ...BILLING_USAGE.monthlyUsage, periodStart: new Date(NOW + 1).toISOString() },
    },
    {
      ...BILLING_USAGE,
      monthlyUsage: { ...BILLING_USAGE.monthlyUsage, resetsAt: new Date(NOW).toISOString() },
    },
  ])("does not present unavailable or invalid paid usage as zero: %j", (billing) => {
    const snap = parseCursorUsage({}, {}, NOW, { shared: SHARED_USAGE, billing });
    expect(snap.status).toBe("ok");
    expect(snap.windows.map((w) => w.id)).toEqual(["weekly"]);
  });

  it.each([
    undefined,
    { ...SHARED_USAGE, usagePercent: null },
    { ...SHARED_USAGE, nextResetTimestampUtc: "bad-date" },
    { ...SHARED_USAGE, nextResetTimestampUtc: new Date(NOW).toISOString() },
    { ...SHARED_USAGE, includedLimitZero: true },
  ])("does not revive legacy bars when shared usage is unavailable: %j", (shared) => {
    const snap = parseCursorUsage(
      {
        membershipType: "premium",
        individualUsage: {
          plan: { autoPercentUsed: 0, apiPercentUsed: 0 },
        },
      },
      {},
      NOW,
      { shared },
    );
    expect(snap.status).toBe("error");
    expect(snap.windows).toEqual([]);
  });

  it("keeps legacy Ultra's monthly pools when the Bot pool is not unified", () => {
    const snap = parseCursorUsage(
      {
        membershipType: "ultra",
        individualUsage: {
          plan: { autoPercentUsed: 20, apiPercentUsed: 30 },
        },
      },
      {},
      NOW,
      { shared: { ...SHARED_USAGE, isUnified: false }, billing: BILLING_USAGE },
    );
    expect(snap.windows.map((w) => w.id)).toEqual(["cursor-auto", "cursor-api"]);
  });

  it("maps usage-summary to Auto / API windows with reset but without inventing API spend", () => {
    const body = {
      billingCycleEnd: "1719600000000",
      membershipType: "pro",
      individualUsage: {
        plan: {
          used: 9347, // cents
          limit: 25000, // cents
          totalPercentUsed: 49,
          autoPercentUsed: 34,
          apiPercentUsed: 37.4, // agrees with 9347/25000 → dollars pass through
        },
        onDemand: { used: 0, limit: 0, enabled: false },
      },
    };
    const snap = parseCursorUsage(body, { email: "dev@example.com" }, NOW);

    expect(snap.providerId).toBe("cursor");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Cursor Pro");
    expect(snap.authenticatedAs).toBe("dev@example.com");
    expect(snap.windows).toHaveLength(2); // on-demand disabled → no extra window

    const auto = snap.windows.find((w) => w.id === "cursor-auto")!;
    expect(auto.label).toBe("Cursor Models");
    expect(auto.usedPercent).toBe(34);
    expect(auto.resetsAt).toBe(1_719_600_000_000);
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.usedPercent).toBeCloseTo(37.4);
    expect(api.used).toBeUndefined();
    expect(api.limit).toBeUndefined();
    expect(api.resetsAt).toBe(1_719_600_000_000);
  });

  it("does not attribute combined breakdown.total spend to API", () => {
    // Live payload: used/limit clamp at included $20 while breakdown.total is
    // combined Cursor Models + API spend ($20 included + $8.75 bonus = $28.75).
    // Without aggregated per-model rows there is no honest API dollar split.
    const body = {
      membershipType: "pro",
      individualUsage: {
        plan: {
          used: 2000,
          limit: 2000,
          remaining: 0,
          breakdown: { included: 2000, bonus: 875, total: 2875 },
          autoPercentUsed: 2.65,
          apiPercentUsed: 55.07,
        },
      },
    };
    const snap = parseCursorUsage(body, {}, NOW);
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.usedPercent).toBeCloseTo(55.07);
    expect(api.used).toBeUndefined();
    expect(api.limit).toBeUndefined();
  });

  it("omits plan dollars when they cannot be split by model", () => {
    // Clamped plan price $20/$20 is combined usage, not API spend or an API cap.
    const body = {
      membershipType: "pro",
      individualUsage: {
        plan: { used: 2000, limit: 2000, autoPercentUsed: 3, apiPercentUsed: 44 },
      },
    };
    const snap = parseCursorUsage(body, {}, NOW);
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.usedPercent).toBe(44);
    expect(api.used).toBeUndefined();
    expect(api.limit).toBeUndefined();
  });

  it("does not show combined overspend as API spend", () => {
    // User case: ~$35.61 combined cost, $20 Pro included, API bar ~4.5%.
    // Dollars stay hidden unless aggregated events identify the API portion.
    const body = {
      membershipType: "pro",
      individualUsage: {
        plan: {
          used: 2000,
          limit: 2000,
          breakdown: { included: 2000, bonus: 1561, total: 3561 },
          autoPercentUsed: 22.37,
          apiPercentUsed: 4.555,
        },
      },
    };
    const snap = parseCursorUsage(body, {}, NOW);
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.usedPercent).toBeCloseTo(4.555);
    expect(api.used).toBeUndefined();
    expect(api.limit).toBeUndefined();
  });

  it("does not use the vendor plan price as an API limit even when the ratio agrees", () => {
    const body = {
      individualUsage: { plan: { used: 9347, limit: 25000, apiPercentUsed: 37.39 } },
    };
    const snap = parseCursorUsage(body, {}, NOW);
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.used).toBeUndefined();
    expect(api.limit).toBeUndefined();
  });

  it("separates Cursor Models and API spend using aggregated event tiers", () => {
    const body = {
      membershipType: "enterprise",
      individualUsage: {
        plan: {
          used: 2000,
          limit: 2000,
          breakdown: { included: 2000, bonus: 88814, total: 90814 },
          autoPercentUsed: 67.41,
          apiPercentUsed: 100,
        },
      },
    };
    const snap = parseCursorUsage(body, {}, NOW, {
      aggregated: {
        aggregations: [
          { modelIntent: "cursor-fast", tier: 2, totalCents: 35418.8822 },
          { modelIntent: "cursor-std", tier: 2, totalCents: 35258.39691 },
          { modelIntent: "named-high", tier: 1, totalCents: 10578.274155 },
          { modelIntent: "named-med", tier: 1, totalCents: 7783.737985 },
        ],
      },
    });
    const auto = snap.windows.find((w) => w.id === "cursor-auto")!;
    expect(auto.currency).toBe("USD");
    expect(auto.used).toBe(706.77);
    expect(auto.limit).toBeUndefined();
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.currency).toBe("USD");
    expect(api.used).toBe(183.62);
    expect(api.limit).toBeUndefined();
  });

  it("falls back to autoBucketModels when aggregated rows omit tier", () => {
    const snap = parseCursorUsage(
      {
        autoBucketModels: ["auto-model-a"],
        individualUsage: {
          plan: { used: 2000, limit: 2000, autoPercentUsed: 10, apiPercentUsed: 5 },
        },
      },
      {},
      NOW,
      {
        aggregated: {
          aggregations: [
            { modelIntent: "auto-model-a", totalCents: 1500 },
            { modelIntent: "api-model-b", totalCents: 450 },
          ],
        },
      },
    );
    expect(snap.windows.find((w) => w.id === "cursor-auto")).toMatchObject({
      currency: "USD",
      used: 15,
    });
    expect(snap.windows.find((w) => w.id === "cursor-api")).toMatchObject({
      currency: "USD",
      used: 4.5,
    });
  });

  it("reports $0 API spend when aggregated events only contain Cursor Models", () => {
    const snap = parseCursorUsage(
      {
        individualUsage: {
          plan: {
            used: 2000,
            limit: 2000,
            breakdown: { included: 2000, bonus: 3000, total: 5000 },
            autoPercentUsed: 15,
            apiPercentUsed: 0,
          },
        },
      },
      {},
      NOW,
      {
        aggregated: {
          aggregations: [{ modelIntent: "cursor-model", tier: 2, totalCents: 5000 }],
        },
      },
    );
    expect(snap.windows.find((w) => w.id === "cursor-auto")).toMatchObject({
      currency: "USD",
      used: 50,
    });
    expect(snap.windows.find((w) => w.id === "cursor-api")).toMatchObject({
      currency: "USD",
      used: 0,
    });
  });

  it("omits Cursor Models spend when only API models were used, and omits dollars when aggregated is unusable", () => {
    const apiOnly = parseCursorUsage(
      {
        individualUsage: {
          plan: { used: 1200, limit: 2000, autoPercentUsed: 0, apiPercentUsed: 60 },
        },
      },
      {},
      NOW,
      {
        aggregated: {
          aggregations: [{ modelIntent: "api-model", tier: 1, totalCents: 1200 }],
        },
      },
    );
    expect(apiOnly.windows.find((w) => w.id === "cursor-auto")?.used).toBeUndefined();
    expect(apiOnly.windows.find((w) => w.id === "cursor-api")?.used).toBe(12);

    const emptyAgg = parseCursorUsage(
      {
        individualUsage: {
          plan: {
            used: 2000,
            limit: 2000,
            breakdown: { included: 2000, bonus: 875, total: 2875 },
            autoPercentUsed: 2.65,
            apiPercentUsed: 55.07,
          },
        },
      },
      {},
      NOW,
      { aggregated: { aggregations: [] } },
    );
    expect(emptyAgg.windows.find((w) => w.id === "cursor-auto")?.used).toBeUndefined();
    expect(emptyAgg.windows.find((w) => w.id === "cursor-api")?.used).toBeUndefined();
    expect(emptyAgg.windows.find((w) => w.id === "cursor-api")?.limit).toBeUndefined();
  });

  it("adds an on-demand window when enabled", () => {
    const body = {
      membershipType: "pro",
      individualUsage: {
        plan: { totalPercentUsed: 10 },
        onDemand: { used: 500, limit: 2000, enabled: true },
      },
    };
    const snap = parseCursorUsage(body, {}, NOW);
    const onDemand = snap.windows.find((w) => w.id === "extra-usage");
    expect(onDemand?.label).toBe("On-demand");
    expect(onDemand?.unit).toBe("usd");
    expect(onDemand?.used).toBeCloseTo(5);
    expect(onDemand?.limit).toBeCloseTo(20);
    expect(onDemand?.usedPercent).toBeCloseTo(25);
  });

  it("uses team on-demand usage and limit when individual on-demand limit is null", () => {
    const snap = parseCursorUsage(
      {
        membershipType: "enterprise",
        individualUsage: {
          plan: { apiPercentUsed: 100 },
          onDemand: { enabled: true, limit: null, used: 102042 },
        },
        teamUsage: {
          onDemand: { enabled: true, limit: 105000, used: 105185 },
        },
      },
      {},
      NOW,
    );
    const onDemand = snap.windows.find((w) => w.id === "extra-usage")!;
    expect(onDemand.used).toBeCloseTo(1051.85);
    expect(onDemand.limit).toBeCloseTo(1050);
    expect(onDemand.usedPercent).toBe(100);
  });

  it("shows on-demand when it is enabled but unused", () => {
    const snap = parseCursorUsage(
      {
        individualUsage: {
          plan: { apiPercentUsed: 10 },
          onDemand: { used: 0, limit: 5000, enabled: true },
        },
      },
      {},
      NOW,
    );
    expect(snap.windows.find((w) => w.id === "extra-usage")).toMatchObject({
      used: 0,
      limit: 50,
      usedPercent: 0,
    });
  });

  it("uses spend-limit usage when the individual on-demand bucket is empty", () => {
    const snap = parseCursorUsage(
      {
        individualUsage: { plan: { apiPercentUsed: 99.8 } },
        spendLimitUsage: { totalSpend: 6887, pooledUsed: 6887, pooledLimit: 75000 },
      },
      {},
      NOW,
    );
    const onDemand = snap.windows.find((w) => w.id === "extra-usage")!;
    expect(onDemand.used).toBeCloseTo(68.87);
    expect(onDemand.limit).toBeCloseTo(750);
    expect(onDemand.usedPercent).toBeCloseTo(9.182666, 2);
  });

  it("parses stringified int64 spendLimitUsage limits from ConnectRPC JSON", () => {
    const snap = parseCursorUsage(
      {
        individualUsage: { plan: { apiPercentUsed: 100 } },
        spendLimitUsage: {
          individualUsed: 102042,
          pooledUsed: 105185,
          pooledLimit: "105000",
          totalSpend: 105185,
        },
      },
      {},
      NOW,
    );
    const onDemand = snap.windows.find((w) => w.id === "extra-usage")!;
    expect(onDemand.used).toBeCloseTo(1051.85);
    expect(onDemand.limit).toBeCloseTo(1050);
    expect(onDemand.usedPercent).toBe(100);
  });

  it.each([{ totalSpend: 0, pooledLimit: 75000 }, { pooledLimit: 75000 }])(
    "shows an unused period allowance: %j",
    (spendLimitUsage) => {
      const snap = parseCursorUsage({ spendLimitUsage }, {}, NOW);
      expect(snap.windows.find((w) => w.id === "extra-usage")).toMatchObject({
        used: 0,
        limit: 750,
        usedPercent: 0,
      });
    },
  );

  it.each([
    { totalSpend: 500 },
    { totalSpend: 500, pooledLimit: 0 },
    { totalSpend: 500, pooledLimit: "0" },
  ])("hides period spend without an allowance: %j", (spendLimitUsage) => {
    const snap = parseCursorUsage({ spendLimitUsage }, {}, NOW);
    expect(snap.windows.find((w) => w.id === "extra-usage")).toBeUndefined();
  });

  it.each([0, "0"])(
    "uses the pooled team allowance when the individual cap is zero (%j)",
    (individualLimit) => {
      const snap = parseCursorUsage(
        {
          spendLimitUsage: {
            totalSpend: 500,
            individualLimit,
            individualUsed: 500,
            pooledLimit: 75000,
            pooledUsed: 750,
          },
        },
        {},
        NOW,
      );
      expect(snap.windows.find((w) => w.id === "extra-usage")).toMatchObject({
        used: 7.5,
        limit: 750,
        usedPercent: 1,
      });
    },
  );

  it("honors an explicit user-scoped spend limit without mixing in pooled usage", () => {
    const snap = parseCursorUsage(
      {
        spendLimitUsage: {
          limitType: "user",
          totalSpend: 105185,
          individualLimit: 100000,
          individualUsed: 102042,
          pooledLimit: "105000",
          pooledUsed: 105185,
        },
      },
      {},
      NOW,
    );
    expect(snap.windows.find((w) => w.id === "extra-usage")).toMatchObject({
      used: 1020.42,
      limit: 1000,
    });
  });

  it("honors disabled on-demand despite period allowance and past spend", () => {
    const snap = parseCursorUsage(
      {
        individualUsage: { onDemand: { enabled: false, used: 500, limit: 2000 } },
        spendLimitUsage: { totalSpend: 500, pooledLimit: 75000 },
      },
      {},
      NOW,
    );
    expect(snap.windows.find((w) => w.id === "extra-usage")).toBeUndefined();
  });

  it("does not throw on an empty body", () => {
    const snap = parseCursorUsage({}, {}, NOW);
    expect(snap.status).toBe("ok");
    expect(snap.windows).toHaveLength(0);
  });
});

describe("parseCursorPeriodUsage", () => {
  it("maps GetCurrentPeriodUsage onto Auto / API windows", () => {
    const snap = parseCursorPeriodUsage(
      {
        billingCycleEnd: "1719600000000",
        planUsage: {
          totalSpend: 2875,
          includedSpend: 2000,
          limit: 2000,
          autoPercentUsed: 2.65,
          apiPercentUsed: 55.07,
        },
      },
      { plan: "Cursor Pro+", email: "work@example.com" },
      NOW,
      "cursor:work",
    );

    expect(snap.providerId).toBe("cursor:work");
    expect(snap.plan).toBe("Cursor Pro+");
    expect(snap.authenticatedAs).toBe("work@example.com");
    const auto = snap.windows.find((w) => w.id === "cursor-auto")!;
    expect(auto.usedPercent).toBeCloseTo(2.65);
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.usedPercent).toBeCloseTo(55.07);
    expect(api.used).toBeUndefined();
    expect(api.limit).toBeUndefined();
  });

  it("does not use the plan-info allowance as an API cap", () => {
    const snap = parseCursorPeriodUsage(
      {
        planUsage: {
          totalSpend: 11300,
          limit: 2000,
          autoPercentUsed: 11,
          apiPercentUsed: 1,
        },
      },
      { plan: "Cursor Team", email: "team@example.com" },
      NOW,
      "cursor:team",
      12000,
    );
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.used).toBeUndefined();
    expect(api.limit).toBeUndefined();
  });

  it("adds an on-demand bar from period spend-limit usage", () => {
    const snap = parseCursorPeriodUsage(
      {
        billingCycleEnd: "1791056140000",
        planUsage: {
          totalSpend: 57633,
          includedSpend: 2000,
          limit: 2000,
          autoPercentUsed: 35.87,
          apiPercentUsed: 99.825,
        },
        spendLimitUsage: {
          totalSpend: 6887,
          pooledUsed: 6887,
          pooledRemaining: 68113,
          pooledLimit: 75000,
        },
      },
      { plan: "Cursor Team" },
      NOW,
      "cursor:work",
    );
    const onDemand = snap.windows.find((w) => w.id === "extra-usage")!;
    expect(onDemand.used).toBeCloseTo(68.87);
    expect(onDemand.limit).toBeCloseTo(750);
    expect(onDemand.resetsAt).toBe(1_791_056_140_000);
    expect(snap.windows.find((w) => w.id === "extra-usage" && w.used === 0)).toBeUndefined();
  });

  it("splits period spend and surfaces string-capped on-demand usage from a live Team payload", () => {
    const snap = parseCursorPeriodUsage(
      {
        billingCycleStart: "1793734540000",
        billingCycleEnd: "1796326540000",
        autoBucketModels: ["cursor-a"],
        planUsage: {
          totalSpend: 90814,
          includedSpend: 2000,
          limit: 2000,
          autoPercentUsed: 67.41428571428571,
          apiPercentUsed: 100,
        },
        spendLimitUsage: {
          individualUsed: 102042,
          pooledUsed: 105185,
          pooledRemaining: "0",
          pooledLimit: "105000",
          totalSpend: 105185,
        },
      },
      { plan: "Cursor Team" },
      NOW,
      "cursor:work",
      undefined,
      {
        aggregated: {
          aggregations: [
            { modelIntent: "cursor-a", tier: 2, totalCents: 70677.27911 },
            { modelIntent: "api-a", tier: 1, totalCents: 18362.01214 },
          ],
        },
      },
    );
    expect(snap.windows.find((w) => w.id === "cursor-auto")).toMatchObject({
      used: 706.77,
      currency: "USD",
    });
    expect(snap.windows.find((w) => w.id === "cursor-api")).toMatchObject({
      used: 183.62,
      currency: "USD",
    });
    expect(snap.windows.find((w) => w.id === "cursor-api")?.limit).toBeUndefined();
    const onDemand = snap.windows.find((w) => w.id === "extra-usage")!;
    expect(onDemand).toMatchObject({
      label: "On-demand",
      used: 1051.85,
      limit: 1050,
    });
    expect(onDemand.usedPercent).toBe(100);
    expect(snap.windows.find((w) => w.id === "cursor-auto")?.breakdown).toEqual([
      { label: "cursor-a", used: 706.77, currency: "USD" },
    ]);
    expect(snap.windows.find((w) => w.id === "cursor-api")?.breakdown).toEqual([
      { label: "api-a", used: 183.62, currency: "USD" },
    ]);
    expect(onDemand.breakdown).toEqual([
      { label: "Personal", used: 1020.42, currency: "USD" },
      { label: "Team pooled", used: 1051.85, limit: 1050, currency: "USD" },
    ]);
  });
});

describe("collectCursorFromApiKey", () => {
  function jwtWithEmail(email: string): string {
    const payload = Buffer.from(JSON.stringify({ email })).toString("base64url");
    return `header.${payload}.sig`;
  }

  it("exchanges the user API key then reads period usage for that account", async () => {
    const urls: string[] = [];
    const bodies: Array<string | undefined> = [];
    const authorizations: Array<string | undefined> = [];
    const host: HostPort = {
      now: () => NOW,
      credentials: {
        getOAuthToken: async () => undefined,
        getSecret: async () => undefined,
      },
      http: {
        request: async (req) => {
          urls.push(req.url);
          bodies.push(req.body);
          authorizations.push(req.headers?.Authorization);
          if (req.url === CURSOR_API_KEY_EXCHANGE_ENDPOINT) {
            return {
              status: 200,
              headers: {},
              body: JSON.stringify({ accessToken: jwtWithEmail("work@example.com") }),
            };
          }
          if (req.url === CURSOR_PERIOD_USAGE_ENDPOINT) {
            return {
              status: 200,
              headers: {},
              body: JSON.stringify({
                billingCycleEnd: "1719600000000",
                planUsage: {
                  totalSpend: 9347,
                  limit: 25000,
                  autoPercentUsed: 34,
                  apiPercentUsed: 37.4,
                },
              }),
            };
          }
          if (req.url === CURSOR_PLAN_INFO_ENDPOINT) {
            return {
              status: 200,
              headers: {},
              body: JSON.stringify({
                planInfo: { planName: "enterprise", includedAmountCents: 12000 },
              }),
            };
          }
          throw new Error(`unexpected url ${req.url}`);
        },
      },
    };

    const snap = await collectCursorFromApiKey(host, " crsr_work ", "cursor:work");
    expect(urls).toEqual([
      CURSOR_API_KEY_EXCHANGE_ENDPOINT,
      CURSOR_PERIOD_USAGE_ENDPOINT,
      CURSOR_PLAN_INFO_ENDPOINT,
    ]);
    expect(authorizations[0]).toBe("Bearer crsr_work");
    expect(JSON.parse(bodies[1] ?? "{}")).toEqual({ includePooledUsage: true });
    expect(snap.providerId).toBe("cursor:work");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Cursor Enterprise");
    expect(snap.authenticatedAs).toBe("work@example.com");
    expect(snap.windows.find((w) => w.id === "cursor-auto")?.usedPercent).toBe(34);
    expect(snap.windows.find((w) => w.id === "cursor-api")?.used).toBeUndefined();
    expect(snap.windows.find((w) => w.id === "cursor-api")?.limit).toBeUndefined();
  });

  it("maps a thrown usage request to an error snapshot", async () => {
    const host: HostPort = {
      now: () => NOW,
      credentials: {
        getOAuthToken: async () => undefined,
        getSecret: async () => undefined,
      },
      http: {
        request: async () => {
          throw new Error("network down");
        },
      },
    };
    const snap = await collectCursorFromApiKey(host, "crsr_work", "cursor:work");
    expect(snap).toMatchObject({
      providerId: "cursor:work",
      status: "error",
      error: "network down",
    });
  });

  it("treats a rejected API key as auth-missing", async () => {
    const host: HostPort = {
      now: () => NOW,
      credentials: {
        getOAuthToken: async () => undefined,
        getSecret: async () => undefined,
      },
      http: {
        request: async () => ({ status: 401, headers: {}, body: '{"message":"Invalid"}' }),
      },
    };
    const snap = await collectCursorFromApiKey(host, "crsr_bad", "cursor:work");
    expect(snap).toMatchObject({
      providerId: "cursor:work",
      status: "auth-missing",
    });
  });
});

describe("Cursor window breakdowns and cycle tokens", () => {
  it("populates sorted per-model breakdowns and cycle tokens from aggregated usage events", () => {
    const snap = parseCursorUsage(
      {
        membershipType: "enterprise",
        billingCycleEnd: "2026-12-03T19:35:40.000Z",
        individualUsage: {
          plan: {
            used: 2000,
            limit: 2000,
            breakdown: { included: 2000, bonus: 88814, total: 90814 },
            autoPercentUsed: 67.41,
            apiPercentUsed: 100,
          },
          onDemand: { enabled: true, limit: null, used: 102042 },
        },
        teamUsage: {
          onDemand: { enabled: true, limit: 105000, used: 105185 },
        },
      },
      {},
      NOW,
      {
        aggregated: {
          totalInputTokens: "44405483",
          totalOutputTokens: "4370584",
          totalCacheReadTokens: "901200992",
          aggregations: [
            {
              modelIntent: "grok-4.7-high-fast",
              tier: 2,
              totalCents: 20753.2898,
              inputTokens: "5830332",
              outputTokens: "881073",
              cacheReadTokens: "141755776",
            },
            {
              modelIntent: "grok-4.7-xhigh-fast",
              tier: 2,
              totalCents: 35418.8822,
              inputTokens: "6225471",
              outputTokens: "1057936",
              cacheReadTokens: "256877952",
            },
            {
              modelIntent: "gemini-4-carbon-high",
              tier: 1,
              totalCents: 10578.274155,
              inputTokens: "12333139",
              outputTokens: "954370",
              cacheReadTokens: "195183698",
            },
          ],
        },
      },
    );

    expect(usageSnapshotSchema.parse(snap)).toEqual(snap);
    expect(snap.tokens).toEqual({
      total: 949_977_059,
      input: 44_405_483,
      output: 4_370_584,
      cacheRead: 901_200_992,
      period: "cycle",
    });

    const auto = snap.windows.find((w) => w.id === "cursor-auto")!;
    expect(auto.breakdown).toEqual([
      { label: "grok-4.7-xhigh-fast", used: 354.19, currency: "USD", tokens: 264_161_359 },
      { label: "grok-4.7-high-fast", used: 207.53, currency: "USD", tokens: 148_467_181 },
    ]);

    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.breakdown).toEqual([
      { label: "gemini-4-carbon-high", used: 105.78, currency: "USD", tokens: 208_471_207 },
    ]);

    const onDemand = snap.windows.find((w) => w.id === "extra-usage")!;
    expect(onDemand.breakdown).toEqual([
      { label: "Personal", used: 1020.42, currency: "USD" },
      { label: "Team pooled", used: 1051.85, limit: 1050, currency: "USD" },
    ]);
  });

  it("keeps pre-upgrade cached snapshots without window breakdown valid under usageSnapshotSchema", () => {
    const legacySnapshot = {
      providerId: "cursor:work",
      status: "ok",
      plan: "Cursor Team",
      fetchedAt: NOW,
      windows: [
        { id: "cursor-auto", label: "Cursor Models", usedPercent: 67.41, unit: "percent" },
        {
          id: "cursor-api",
          label: "API",
          usedPercent: 100,
          unit: "percent",
          currency: "USD",
          used: 908.14,
          limit: 20,
        },
      ],
    };
    expect(usageSnapshotSchema.parse(legacySnapshot)).toEqual(legacySnapshot);
  });

  it("falls back to per-row sums when top-level token totals are null or blank while respecting explicit 0", () => {
    const snap = parseCursorUsage(
      {
        membershipType: "pro",
        billingCycleEnd: "2026-12-03T19:35:40.000Z",
        individualUsage: {
          plan: { used: 1000, limit: 2000, autoPercentUsed: 10, apiPercentUsed: 50 },
          onDemand: { enabled: true, limit: 5000, used: 1200 },
        },
      },
      {},
      NOW,
      {
        aggregated: {
          totalInputTokens: null as unknown as string,
          totalOutputTokens: "",
          totalCacheReadTokens: "0",
          totalCacheWriteTokens: undefined,
          aggregations: [
            {
              modelIntent: "api-model",
              tier: 1,
              totalCents: 1000,
              inputTokens: "1200",
              outputTokens: "300",
              cacheReadTokens: "9999",
              cacheWriteTokens: "400",
            },
          ],
        },
      },
    );

    expect(snap.tokens).toEqual({
      total: 1900,
      input: 1200,
      output: 300,
      cacheRead: 0,
      cacheWrite: 400,
      period: "cycle",
    });
    // Non-pooled solo account omits Personal vs Team pooled breakdown.
    expect(snap.windows.find((w) => w.id === "extra-usage")?.breakdown).toBeUndefined();
  });

  it("omits API dollars when any positive-spend row cannot be classified", () => {
    const snap = parseCursorUsage(
      {
        membershipType: "enterprise",
        billingCycleEnd: "2026-12-03T19:35:40.000Z",
        individualUsage: {
          plan: {
            used: 2000,
            limit: 2000,
            breakdown: { included: 2000, bonus: 88814, total: 90814 },
            autoPercentUsed: 67.41,
            apiPercentUsed: 100,
          },
        },
      },
      {},
      NOW,
      {
        aggregated: {
          aggregations: [
            { modelIntent: "grok-fast", tier: 2, totalCents: 50000 },
            // No tier and no autoBucketModels -> unclassified positive spend invalidates the split.
            { modelIntent: "unknown-model", totalCents: 15000 },
          ],
        },
      },
    );

    expect(snap.windows.find((w) => w.id === "cursor-auto")?.used).toBeUndefined();
    expect(snap.windows.find((w) => w.id === "cursor-api")?.used).toBeUndefined();
    expect(snap.windows.find((w) => w.id === "cursor-api")?.limit).toBeUndefined();
  });

  it("retains proto3-omitted zero-cent rows with tokens alongside priced rows, and omits dollars when no row has spend", () => {
    const withPricedRow = parseCursorUsage(
      {
        membershipType: "pro",
        billingCycleEnd: "2026-12-03T19:35:40.000Z",
        individualUsage: {
          plan: { used: 2000, limit: 2000, autoPercentUsed: 20, apiPercentUsed: 100 },
        },
      },
      {},
      NOW,
      {
        aggregated: {
          aggregations: [
            {
              modelIntent: "free-cursor-model",
              tier: 2,
              inputTokens: "5000",
              outputTokens: "1000",
            },
            {
              modelIntent: "paid-api-model",
              tier: 1,
              totalCents: 2000,
              inputTokens: "2000",
              outputTokens: "500",
            },
          ],
        },
      },
    );

    expect(withPricedRow.tokens).toEqual({
      total: 8500,
      input: 7000,
      output: 1500,
      cacheRead: 0,
      period: "cycle",
    });
    expect(withPricedRow.windows.find((w) => w.id === "cursor-auto")?.breakdown).toEqual([
      { label: "free-cursor-model", tokens: 6000 },
    ]);
    expect(withPricedRow.windows.find((w) => w.id === "cursor-api")?.used).toBeCloseTo(20);

    const withoutAnySpend = parseCursorUsage(
      {
        membershipType: "pro",
        billingCycleEnd: "2026-12-03T19:35:40.000Z",
        individualUsage: {
          plan: { used: 1500, limit: 2000, autoPercentUsed: 20, apiPercentUsed: 75 },
        },
      },
      {},
      NOW,
      {
        aggregated: {
          aggregations: [
            {
              modelIntent: "free-cursor-model",
              tier: 2,
              inputTokens: "5000",
            },
          ],
        },
      },
    );
    expect(withoutAnySpend.windows.find((w) => w.id === "cursor-auto")?.used).toBeUndefined();
    expect(withoutAnySpend.windows.find((w) => w.id === "cursor-api")?.used).toBeUndefined();
    expect(withoutAnySpend.windows.find((w) => w.id === "cursor-api")?.limit).toBeUndefined();
  });
});
