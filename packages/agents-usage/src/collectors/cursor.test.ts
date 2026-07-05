import { describe, expect, it } from "vitest";
import type { HostPort, OAuthToken } from "../host";
import { collectCursor, parseCursorUsage } from "./cursor";

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

  it("treats breakdown.total as real spend and derives the allowance from the percent", () => {
    // Live payload shape: used/limit/remaining clamp at the included $20 while
    // breakdown.total carries the real spend ($20 included + $8.75 bonus
    // consumed = $28.75). The authoritative 55.07% then implies a ~$52.21
    // allowance (28.75 / 0.5507), keeping the dollars consistent with the bar.
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
    expect(api.limit).toBeCloseTo(52.21, 1);
  });

  it("derives the allowance when the clamped dollars disagree with the percent (no breakdown)", () => {
    // Older payloads without a breakdown: used/limit cap at the plan price
    // ($20/$20) while the percent says 44% consumed → allowance ≈ $45.45.
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
    expect(api.limit).toBeCloseTo(45.45, 1);
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
