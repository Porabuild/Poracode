import { describe, expect, it } from "vitest";
import type { HostPort, OAuthToken } from "../host";
import {
  collectCursor,
  collectCursorFromApiKey,
  CURSOR_API_KEY_EXCHANGE_ENDPOINT,
  CURSOR_PERIOD_USAGE_ENDPOINT,
  CURSOR_PLAN_INFO_ENDPOINT,
  parseCursorPeriodUsage,
  parseCursorUsage,
} from "./cursor";

const NOW = 1_717_000_000_000;

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
});

describe("parseCursorUsage", () => {
  it("maps usage-summary to Auto / API windows with API spend + reset", () => {
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
    expect(auto.usedPercent).toBe(34);
    expect(auto.resetsAt).toBe(1_719_600_000_000);
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.usedPercent).toBeCloseTo(37.4);
    expect(api.used).toBeCloseTo(93.47);
    expect(api.limit).toBeCloseTo(250);
    expect(api.resetsAt).toBe(1_719_600_000_000);
  });

  it("treats breakdown.total as real spend against the vendor plan limit", () => {
    // Live payload: used/limit clamp at included $20 while breakdown.total is
    // real spend ($20 included + $8.75 bonus = $28.75). API % is a separate
    // meter — do not invent limit = spend / percent ($28.75 / 55% ≈ $52).
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
    expect(api.used).toBeCloseTo(28.75);
    expect(api.limit).toBeCloseTo(20);
  });

  it("keeps plan dollars when they disagree with API percent (no breakdown)", () => {
    // Clamped plan price $20/$20; API bar can still be 44% of a different pool.
    const body = {
      membershipType: "pro",
      individualUsage: {
        plan: { used: 2000, limit: 2000, autoPercentUsed: 3, apiPercentUsed: 44 },
      },
    };
    const snap = parseCursorUsage(body, {}, NOW);
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.usedPercent).toBe(44);
    expect(api.used).toBeCloseTo(20);
    expect(api.limit).toBeCloseTo(20);
  });

  it("shows overspend past the plan limit without inventing a percent-derived ceiling", () => {
    // User case: ~$35.61 total cost, $20 Pro included, API bar ~4.5%.
    // Old math: $35.61 / 0.04555 ≈ $782 nonsense allowance.
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
    expect(api.used).toBeCloseTo(35.61);
    expect(api.limit).toBeCloseTo(20);
  });

  it("keeps the vendor limit when the dollars already agree with the percent", () => {
    const body = {
      individualUsage: { plan: { used: 9347, limit: 25000, apiPercentUsed: 37.39 } },
    };
    const snap = parseCursorUsage(body, {}, NOW);
    const api = snap.windows.find((w) => w.id === "cursor-api")!;
    expect(api.used).toBeCloseTo(93.47);
    expect(api.limit).toBeCloseTo(250);
  });

  it("adds an on-demand window only when enabled", () => {
    const body = {
      membershipType: "pro",
      individualUsage: {
        plan: { totalPercentUsed: 10 },
        onDemand: { used: 500, limit: 2000, enabled: true },
      },
    };
    const snap = parseCursorUsage(body, {}, NOW);
    const onDemand = snap.windows.find((w) => w.id === "extra-usage");
    expect(onDemand?.unit).toBe("usd");
    expect(onDemand?.used).toBeCloseTo(5);
    expect(onDemand?.limit).toBeCloseTo(20);
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
    expect(api.used).toBeCloseTo(28.75);
    expect(api.limit).toBeCloseTo(20);
  });
});

describe("collectCursorFromApiKey", () => {
  function jwtWithEmail(email: string): string {
    const payload = Buffer.from(JSON.stringify({ email })).toString("base64url");
    return `header.${payload}.sig`;
  }

  it("exchanges the user API key then reads period usage for that account", async () => {
    const urls: string[] = [];
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
              body: JSON.stringify({ planInfo: { planName: "enterprise" } }),
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
    expect(snap.providerId).toBe("cursor:work");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Cursor Enterprise");
    expect(snap.authenticatedAs).toBe("work@example.com");
    expect(snap.windows.find((w) => w.id === "cursor-auto")?.usedPercent).toBe(34);
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
