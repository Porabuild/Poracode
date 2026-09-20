import { describe, expect, it } from "vitest";
import type { HttpRequest } from "../host";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import { collectMuse } from "./muse";
import { museSpendWindow, parseMuseQuotaWindows, parseMuseSpend } from "./museDashboard";

const TEAM = "team-123";
const PORTAL = "https://dev.meta.ai/api/portal";
const QUOTA_URL = `${PORTAL}/teams/${TEAM}/subscription-quota`;
const span = museSpendWindow(FAKE_NOW_MS);
const SPEND_URL = `${PORTAL}/teams/${TEAM}/usage?metric=USAGE_BILLABLE_COST&start_date=${span.start}&end_date=${span.end}&timezone=UTC`;
const SECRETS = { muse: { cookie: "llm_sess=test", teamId: TEAM } };
// Sanitized portal response: decimal-string weights and Unix-second resets.
const QUOTA = {
  subscription_quota: {
    tier: "Muse Code Everyday Usage",
    window_weighted_used: "2627853460",
    window_weighted_limit: "20000000000",
    window_duration_secs: 18000,
    window_resets_at: 1788558965,
    weekly_weighted_used: "5163363880",
    weekly_weighted_limit: "60000000000",
    weekly_resets_at: 1788739200,
  },
};
const SPEND = {
  metric: "usage_billable_cost",
  series: [
    {
      type: "PER_MODEL",
      identifier: "model-a",
      data_points: [{ date: "2026-09-01", value: 101000000 }],
    },
    {
      type: "PER_MODEL",
      identifier: "model-b",
      data_points: [{ date: "2026-09-01", value: 40000000 }],
    },
  ],
};
const json = (payload: unknown) => ({ status: 200, body: JSON.stringify(payload) });

describe("Muse portal parsers", () => {
  it("uses an inclusive trailing 30-day UTC window", () => {
    expect(museSpendWindow(Date.UTC(2026, 8, 4))).toEqual({
      start: "2026-08-06",
      end: "2026-09-04",
    });
  });

  it("maps weighted quota windows and reset times", () => {
    expect(parseMuseQuotaWindows(QUOTA)).toEqual([
      {
        id: "session-5h",
        label: "Current usage",
        usedPercent: (2627853460 / 20000000000) * 100,
        unit: "percent",
        resetsAt: 1788558965000,
      },
      {
        id: "weekly",
        label: "Weekly limit",
        usedPercent: (5163363880 / 60000000000) * 100,
        unit: "percent",
        resetsAt: 1788739200000,
      },
    ]);
  });

  it("preserves zero usage, skips missing limits, and does not invent a reset", () => {
    expect(
      parseMuseQuotaWindows({
        subscription_quota: {
          window_weighted_used: "0",
          window_weighted_limit: "10",
          weekly_weighted_used: "1",
          weekly_weighted_limit: "0",
        },
      }),
    ).toEqual([{ id: "session-5h", label: "Current usage", usedPercent: 0, unit: "percent" }]);
  });

  it("clamps usage and rejects malformed quota", () => {
    expect(
      parseMuseQuotaWindows({
        subscription_quota: {
          ...QUOTA.subscription_quota,
          window_weighted_used: "-1",
          weekly_weighted_used: "999999999999",
        },
      }).map((w) => w.usedPercent),
    ).toEqual([0, 100]);
    for (const value of [
      null,
      {},
      { subscription_quota: [] },
      { subscription_quota: { window_weighted_used: true, window_weighted_limit: 10 } },
    ]) {
      expect(parseMuseQuotaWindows(value)).toEqual([]);
    }
  });

  it("sums billable model series in 1e-8 USD units", () => {
    expect(parseMuseSpend(SPEND)).toBe(1.41);
  });

  it("prefers TOTAL to prevent double counting model series", () => {
    expect(
      parseMuseSpend({
        ...SPEND,
        series: [...SPEND.series, { type: "TOTAL", data_points: [{ value: 141000000 }] }],
      }),
    ).toBe(1.41);
  });

  it("supports the dashboard's formatted and raw money objects", () => {
    expect(
      parseMuseSpend({
        ...SPEND,
        series: [
          {
            type: "TOTAL",
            data_points: [
              { value: { formatted_amount: "$1.01" } },
              { value: { amount: "30000000" } },
              { value: { value: 10000000 } },
            ],
          },
        ],
      }),
    ).toBe(1.41);
  });

  it("distinguishes empty usage from missing or invalid spend data", () => {
    expect(parseMuseSpend({ metric: "usage_billable_cost", series: [] })).toBe(0);
    for (const value of [
      {},
      null,
      { ...SPEND, metric: "output_tokens" },
      { ...SPEND, series: [{}] },
      { ...SPEND, series: [{ data_points: [{ value: "bad" }] }] },
    ]) {
      expect(parseMuseSpend(value)).toBeUndefined();
    }
  });
});

describe("collectMuse via the portal session", () => {
  it("returns quota, plan and billed spend using the saved session and team", async () => {
    const requests: HttpRequest[] = [];
    const host = createFakeHost({
      secrets: SECRETS,
      onRequest: (req) => requests.push(req),
      routes: { [QUOTA_URL]: json(QUOTA), [SPEND_URL]: json(SPEND) },
    });
    expect(await collectMuse(host)).toEqual({
      providerId: "muse",
      status: "ok",
      windows: parseMuseQuotaWindows(QUOTA),
      plan: "Muse Code Everyday Usage",
      cost: { currency: "USD", amount: 1.41, period: "30d", estimated: false },
      fetchedAt: FAKE_NOW_MS,
    });
    expect(requests.map((req) => req.url)).toEqual([QUOTA_URL, SPEND_URL]);
    for (const req of requests) {
      expect(req.headers).toMatchObject({ Cookie: "llm_sess=test", Accept: "application/json" });
      expect(req.method ?? "GET").toBe("GET");
      expect(req.timeoutMs).toBe(15000);
    }
  });

  it("recovers the only team for an older cookie-only session", async () => {
    const host = createFakeHost({
      secrets: { muse: { cookie: "llm_sess=test" } },
      routes: {
        [`${PORTAL}/teams`]: json({ teams: [{ team_id: TEAM }] }),
        [QUOTA_URL]: json(QUOTA),
        [SPEND_URL]: json(SPEND),
      },
    });
    expect((await collectMuse(host)).status).toBe("ok");
  });

  it.each([[], [{ team_id: TEAM }, { team_id: "other" }], [{ team_id: 123 }]])(
    "requires team selection for ambiguous or unavailable teams: %j",
    async (...teams) => {
      // Each table row is the teams array (Vitest spreads array rows).
      const host = createFakeHost({
        secrets: { muse: { cookie: "llm_sess=test" } },
        routes: { [`${PORTAL}/teams`]: json({ teams }) },
      });
      expect((await collectMuse(host)).status).toBe("auth-missing");
    },
  );

  it.each([401, 403, 429, 500])("classifies team lookup HTTP %i", async (status) => {
    const host = createFakeHost({
      secrets: { muse: { cookie: "llm_sess=test" } },
      routes: { [`${PORTAL}/teams`]: { status } },
    });
    expect((await collectMuse(host)).status).toBe(
      status === 429 ? "rate-limited" : status === 500 ? "error" : "auth-missing",
    );
  });

  it.each([QUOTA_URL, SPEND_URL])(
    "rejects an expired session even if the other endpoint succeeds: %s",
    async (url) => {
      for (const status of [401, 403]) {
        const host = createFakeHost({
          secrets: SECRETS,
          routes: { [QUOTA_URL]: json(QUOTA), [SPEND_URL]: json(SPEND), [url]: { status } },
        });
        expect(await collectMuse(host)).toEqual({
          providerId: "muse",
          status: "auth-missing",
          windows: [],
          fetchedAt: FAKE_NOW_MS,
        });
      }
    },
  );

  it("retains quota during spend failure without inventing a zero cost", async () => {
    const host = createFakeHost({
      secrets: SECRETS,
      routes: { [QUOTA_URL]: json(QUOTA), [SPEND_URL]: { status: 500 } },
    });
    const result = await collectMuse(host);
    expect(result.status).toBe("ok");
    expect(result.windows).toHaveLength(2);
    expect(result.cost).toBeUndefined();
  });

  it("supports pay-as-you-go accounts with spend but no subscription quota", async () => {
    const host = createFakeHost({
      secrets: SECRETS,
      routes: { [QUOTA_URL]: json({ subscription_quota: null }), [SPEND_URL]: json(SPEND) },
    });
    expect(await collectMuse(host)).toMatchObject({
      status: "ok",
      windows: [],
      cost: { amount: 1.41 },
    });
  });

  it("preserves rate limiting and Retry-After even with partial data", async () => {
    const host = createFakeHost({
      secrets: SECRETS,
      routes: {
        [QUOTA_URL]: json(QUOTA),
        [SPEND_URL]: { status: 429, headers: { "retry-after": "300" } },
      },
    });
    expect(await collectMuse(host)).toMatchObject({
      status: "rate-limited",
      windows: parseMuseQuotaWindows(QUOTA),
      rateLimitedUntil: FAKE_NOW_MS + 300000,
    });
  });

  it.each(["<html>login</html>", "{}", '{"error":"unavailable"}'])(
    "does not treat malformed/unknown responses as healthy zero usage: %s",
    async (body) => {
      const host = createFakeHost({
        secrets: SECRETS,
        routes: { [QUOTA_URL]: { body }, [SPEND_URL]: { body } },
      });
      expect(await collectMuse(host)).toMatchObject({ status: "error", windows: [] });
    },
  );

  it.each(["300", undefined])(
    "honors the longest endpoint cooldown when quota Retry-After is %s",
    async (quotaRetry) => {
      const host = createFakeHost({
        secrets: SECRETS,
        routes: {
          [QUOTA_URL]: {
            status: 429,
            headers: quotaRetry === undefined ? {} : { "retry-after": quotaRetry },
          },
          [SPEND_URL]: { status: 429, headers: { "retry-after": "3600" } },
        },
      });
      expect(await collectMuse(host)).toMatchObject({
        status: "rate-limited",
        rateLimitedUntil: FAKE_NOW_MS + 3600000,
      });
    },
  );

  it("handles network failures", async () => {
    const host = createFakeHost({ secrets: SECRETS });
    host.http.request = async () => {
      throw new Error("offline");
    };
    expect((await collectMuse(host)).status).toBe("error");
  });

  it("encodes the saved team as one path segment", async () => {
    const requests: HttpRequest[] = [];
    await collectMuse(
      createFakeHost({
        secrets: { muse: { cookie: "llm_sess=test", teamId: "team/with?chars" } },
        onRequest: (req) => requests.push(req),
      }),
    );
    expect(
      requests.every((req) => req.url.startsWith(`${PORTAL}/teams/team%2Fwith%3Fchars/`)),
    ).toBe(true);
  });
});
