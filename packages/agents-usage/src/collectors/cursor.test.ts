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
          apiPercentUsed: 100,
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
    expect(api.usedPercent).toBe(100);
    expect(api.used).toBeCloseTo(93.47);
    expect(api.limit).toBeCloseTo(250);
    expect(api.resetsAt).toBe(1_719_600_000_000);
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
