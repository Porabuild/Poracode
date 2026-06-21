import { describe, expect, it } from "vitest";
import type { HostPort } from "../host";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import {
  collectFactory,
  FACTORY_AUTH_ME_ENDPOINT,
  FACTORY_BILLING_LIMITS_ENDPOINT,
  FACTORY_USAGE_ENDPOINT,
  formatFactoryPlanLabel,
  isFactoryAccessTokenLive,
  parseFactoryUsage,
  refreshWorkOSToken,
} from "./factory";

const WEEKLY_RESET_ISO = "2023-11-20T00:00:00.000Z";

const AUTH_BODY = {
  organization: {
    name: "Acme",
    subscription: { factoryTier: "pro", orbSubscription: { plan: { name: "Starter" } } },
  },
  userProfile: { id: "user_123", email: "dev@acme.test" },
};

const MODERN_LIMITS_BODY = {
  usesTokenRateLimitsBilling: true,
  extraUsageBalanceCents: 250,
  overagePreference: "allow",
  limits: {
    standard: {
      fiveHour: { usedPercent: 42.5, secondsRemaining: 3600 },
      weekly: { usedPercent: 10, windowEnd: WEEKLY_RESET_ISO },
      monthly: { usedPercent: 0, windowEnd: null, secondsRemaining: null },
    },
    core: {
      fiveHour: { usedPercent: 5, secondsRemaining: 1800 },
      weekly: { usedPercent: 0 },
      monthly: { usedPercent: 0 },
    },
  },
};

const LEGACY_AUTH_BODY = {
  organization: { name: "Acme", subscription: { factoryTier: "team" } },
};

const LEGACY_USAGE_BODY = {
  usage: {
    startDate: 1_699_000_000_000,
    endDate: 1_701_000_000_000,
    standard: { userTokens: 50, totalAllowance: 200, usedRatio: 0.25 },
    premium: { userTokens: 10, totalAllowance: 100, usedRatio: 0.1 },
  },
};

describe("formatFactoryPlanLabel", () => {
  it("joins tier and Orb plan name", () => {
    expect(formatFactoryPlanLabel(AUTH_BODY)).toBe("Factory Pro - Starter");
  });

  it("uses the tier alone when no Orb plan is present", () => {
    expect(formatFactoryPlanLabel(LEGACY_AUTH_BODY)).toBe("Factory Team");
  });

  it("drops a redundant Orb plan name that already mentions Factory", () => {
    expect(
      formatFactoryPlanLabel({
        organization: {
          subscription: { factoryTier: "pro", orbSubscription: { plan: { name: "Factory Pro" } } },
        },
      }),
    ).toBe("Factory Pro");
  });

  it("returns undefined when there is no tier or plan", () => {
    expect(formatFactoryPlanLabel(undefined)).toBeUndefined();
    expect(formatFactoryPlanLabel({})).toBeUndefined();
  });
});

describe("parseFactoryUsage (modern token-rate-limits)", () => {
  it("maps the standard pool to canonical windows and the core pool to factory: ids", () => {
    const snap = parseFactoryUsage(AUTH_BODY, MODERN_LIMITS_BODY, undefined, FAKE_NOW_MS);

    expect(snap.providerId).toBe("factory");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Factory Pro - Starter");
    expect(snap.authenticatedAs).toBe("dev@acme.test");

    const byId = new Map(snap.windows.map((w) => [w.id, w]));
    // Core weekly/monthly are 0% with no reset → individually gated out; only the
    // in-use Core (5h) window surfaces alongside the standard pool.
    expect([...byId.keys()]).toEqual([
      "session-5h",
      "weekly",
      "monthly",
      "factory:core:session-5h",
    ]);

    const session = byId.get("session-5h")!;
    expect(session.usedPercent).toBe(42.5);
    expect(session.unit).toBe("percent");
    expect(session.resetsAt).toBe(FAKE_NOW_MS + 3_600_000);

    const weekly = byId.get("weekly")!;
    expect(weekly.usedPercent).toBe(10);
    expect(weekly.resetsAt).toBe(Date.parse(WEEKLY_RESET_ISO));

    // monthly has no resolvable reset and 0% — emitted but without resetsAt.
    const monthly = byId.get("monthly")!;
    expect(monthly.usedPercent).toBe(0);
    expect(monthly.resetsAt).toBeUndefined();

    expect(byId.get("factory:core:session-5h")!.usedPercent).toBe(5);
  });

  it("omits the core pool entirely when it carries no usage", () => {
    const snap = parseFactoryUsage(
      AUTH_BODY,
      {
        usesTokenRateLimitsBilling: true,
        limits: {
          standard: { fiveHour: { usedPercent: 1, secondsRemaining: 60 }, weekly: {}, monthly: {} },
          core: {
            fiveHour: { usedPercent: 0 },
            weekly: { usedPercent: 0 },
            monthly: { usedPercent: 0 },
          },
        },
      },
      undefined,
      FAKE_NOW_MS,
    );
    expect(snap.windows.some((w) => w.id.startsWith("factory:core"))).toBe(false);
  });

  it("zeroes a stale window whose end is in the past with no secondsRemaining", () => {
    const snap = parseFactoryUsage(
      AUTH_BODY,
      {
        usesTokenRateLimitsBilling: true,
        limits: {
          standard: {
            fiveHour: { usedPercent: 80, windowEnd: "2020-01-01T00:00:00.000Z" },
            weekly: {},
            monthly: {},
          },
        },
      },
      undefined,
      FAKE_NOW_MS,
    );
    const session = snap.windows.find((w) => w.id === "session-5h")!;
    expect(session.usedPercent).toBe(0);
    expect(session.resetsAt).toBeUndefined();
  });

  it("emits only the core windows that individually carry usage", () => {
    const snap = parseFactoryUsage(
      AUTH_BODY,
      {
        usesTokenRateLimitsBilling: true,
        limits: {
          standard: { fiveHour: { usedPercent: 0 }, weekly: {}, monthly: {} },
          core: {
            fiveHour: { usedPercent: 0 },
            weekly: { usedPercent: 0 },
            monthly: { usedPercent: 34, secondsRemaining: 600_000 },
          },
        },
      },
      undefined,
      FAKE_NOW_MS,
    );
    const coreIds = snap.windows.filter((w) => w.id.startsWith("factory:core")).map((w) => w.id);
    expect(coreIds).toEqual(["factory:core:monthly"]);
    expect(snap.windows.find((w) => w.id === "factory:core:monthly")!.usedPercent).toBe(34);
  });

  it("preserves a window whose windowEnd is an all-digit epoch STRING", () => {
    const futureMs = String(FAKE_NOW_MS + 3_600_000);
    const snap = parseFactoryUsage(
      AUTH_BODY,
      {
        usesTokenRateLimitsBilling: true,
        limits: {
          standard: {
            fiveHour: { usedPercent: 30, windowEnd: futureMs },
            weekly: {},
            monthly: {},
          },
        },
      },
      undefined,
      FAKE_NOW_MS,
    );
    const session = snap.windows.find((w) => w.id === "session-5h")!;
    expect(session.usedPercent).toBe(30);
    expect(session.resetsAt).toBe(FAKE_NOW_MS + 3_600_000);
  });
});

describe("parseFactoryUsage (legacy per-cycle)", () => {
  it("maps standard tokens to monthly and premium tokens to factory:premium", () => {
    const snap = parseFactoryUsage(LEGACY_AUTH_BODY, {}, LEGACY_USAGE_BODY, FAKE_NOW_MS);

    expect(snap.plan).toBe("Factory Team");
    const byId = new Map(snap.windows.map((w) => [w.id, w]));

    const standard = byId.get("monthly")!;
    expect(standard.label).toBe("Standard");
    expect(standard.usedPercent).toBe(25);
    expect(standard.resetsAt).toBe(1_701_000_000_000);

    const premium = byId.get("factory:premium")!;
    expect(premium.label).toBe("Premium");
    expect(premium.usedPercent).toBe(10);
  });

  it("falls back to used/allowance when no ratio is provided", () => {
    const snap = parseFactoryUsage(
      LEGACY_AUTH_BODY,
      {},
      { usage: { standard: { userTokens: 30, totalAllowance: 120 } } },
      FAKE_NOW_MS,
    );
    expect(snap.windows.find((w) => w.id === "monthly")!.usedPercent).toBe(25);
  });

  it("omits the premium window when the account has no premium pool", () => {
    const snap = parseFactoryUsage(
      LEGACY_AUTH_BODY,
      {},
      { usage: { standard: { userTokens: 1, totalAllowance: 10 } } },
      FAKE_NOW_MS,
    );
    expect(snap.windows.some((w) => w.id === "factory:premium")).toBe(false);
  });

  it("tolerates completely missing bodies without throwing", () => {
    const snap = parseFactoryUsage(undefined, undefined, undefined, FAKE_NOW_MS);
    expect(snap.status).toBe("ok");
    expect(snap.windows.find((w) => w.id === "monthly")!.usedPercent).toBe(0);
  });
});

const WORKOS_AUTH_ENDPOINT = "https://api.workos.com/user_management/authenticate";
const bearer = (req: { headers?: Record<string, string> }) =>
  req.headers?.Authorization?.replace(/^Bearer /, "");

/** A minimal JWT carrying just an `exp` claim (ms → seconds), for exp-gating. */
function jwtWithExp(expMs: number): string {
  const seg = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${seg({ alg: "none" })}.${seg({ exp: Math.floor(expMs / 1000) })}.sig`;
}

describe("isFactoryAccessTokenLive", () => {
  it("returns true when /auth/me returns a JSON object for the token", async () => {
    const host = createFakeHost({
      routes: { [FACTORY_AUTH_ME_ENDPOINT]: { body: JSON.stringify(AUTH_BODY) } },
    });
    await expect(isFactoryAccessTokenLive(host.http, "at0")).resolves.toBe(true);
  });

  it("returns false on a 200 + null body, a 401, and an empty token", async () => {
    const nullBody = createFakeHost({ routes: { [FACTORY_AUTH_ME_ENDPOINT]: { body: "null" } } });
    await expect(isFactoryAccessTokenLive(nullBody.http, "at0")).resolves.toBe(false);
    const unauth = createFakeHost({
      routes: { [FACTORY_AUTH_ME_ENDPOINT]: { status: 401, body: "" } },
    });
    await expect(isFactoryAccessTokenLive(unauth.http, "at0")).resolves.toBe(false);
    await expect(isFactoryAccessTokenLive(createFakeHost().http, "")).resolves.toBe(false);
  });
});

describe("refreshWorkOSToken", () => {
  it("returns the new access + rotated refresh token on success", async () => {
    const host = createFakeHost({
      routes: {
        [WORKOS_AUTH_ENDPOINT]: {
          body: JSON.stringify({ access_token: "at1", refresh_token: "rt1" }),
        },
      },
    });
    await expect(refreshWorkOSToken(host.http, "rt0")).resolves.toEqual({
      kind: "ok",
      accessToken: "at1",
      refreshToken: "rt1",
    });
  });

  it("maps a 400 (dead refresh token) to invalid and a 503 to transient", async () => {
    const dead = createFakeHost({
      routes: { [WORKOS_AUTH_ENDPOINT]: { status: 400, body: "{}" } },
    });
    await expect(refreshWorkOSToken(dead.http, "rt0")).resolves.toEqual({ kind: "invalid" });
    const down = createFakeHost({ routes: { [WORKOS_AUTH_ENDPOINT]: { status: 503, body: "" } } });
    await expect(refreshWorkOSToken(down.http, "rt0")).resolves.toEqual({ kind: "transient" });
  });
});

describe("collectFactory", () => {
  it("returns auth-missing when no refresh token has been stored", async () => {
    const host = createFakeHost();
    const snap = await collectFactory(host);
    expect(snap.status).toBe("auth-missing");
    expect(snap.windows).toEqual([]);
  });

  it("uses the droid CLI access token (read-only) when it is valid, no login needed", async () => {
    let workosCalls = 0;
    const host = createFakeHost({
      tokens: { factory: { accessToken: jwtWithExp(FAKE_NOW_MS + 3_600_000) } },
      onRequest: (req) => {
        if (req.url === WORKOS_AUTH_ENDPOINT) workosCalls += 1;
      },
      routes: {
        [FACTORY_AUTH_ME_ENDPOINT]: { body: JSON.stringify(AUTH_BODY) },
        [FACTORY_BILLING_LIMITS_ENDPOINT]: { body: JSON.stringify(MODERN_LIMITS_BODY) },
      },
    });
    const snap = await collectFactory(host);
    expect(snap.status).toBe("ok");
    expect(snap.windows.find((w) => w.id === "session-5h")!.usedPercent).toBe(42.5);
    expect(workosCalls).toBe(0); // never touched the refresh token / WorkOS
  });

  it("falls back to the captured login when the CLI token is expired", async () => {
    const host = createFakeHost({
      tokens: { factory: { accessToken: jwtWithExp(FAKE_NOW_MS - 1_000) } }, // expired
      secrets: { factory: { "refresh-token": "rt0", "access-token": "at0" } },
      routes: {
        [FACTORY_AUTH_ME_ENDPOINT]: { body: JSON.stringify(AUTH_BODY) },
        [FACTORY_BILLING_LIMITS_ENDPOINT]: { body: JSON.stringify(MODERN_LIMITS_BODY) },
      },
    });
    const snap = await collectFactory(host);
    expect(snap.status).toBe("ok");
    expect(snap.windows.find((w) => w.id === "session-5h")!.usedPercent).toBe(42.5);
  });

  it("uses a cached access token without a WorkOS round-trip", async () => {
    let workosCalls = 0;
    const host = createFakeHost({
      secrets: { factory: { "refresh-token": "rt0", "access-token": "at0" } },
      onRequest: (req) => {
        if (req.url === WORKOS_AUTH_ENDPOINT) workosCalls += 1;
      },
      routes: {
        [FACTORY_AUTH_ME_ENDPOINT]: { body: JSON.stringify(AUTH_BODY) },
        [FACTORY_BILLING_LIMITS_ENDPOINT]: { body: JSON.stringify(MODERN_LIMITS_BODY) },
      },
    });
    const snap = await collectFactory(host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Factory Pro - Starter");
    expect(snap.windows.find((w) => w.id === "session-5h")!.usedPercent).toBe(42.5);
    expect(workosCalls).toBe(0);
  });

  it("refreshes via WorkOS when no access token is cached and persists rotated tokens", async () => {
    const persisted: Array<[string, string]> = [];
    const host = createFakeHost({
      secrets: { factory: { "refresh-token": "rt0" } },
      onSetSecret: (_id, key, value) => persisted.push([key, value]),
      routes: {
        [WORKOS_AUTH_ENDPOINT]: {
          body: JSON.stringify({ access_token: "at1", refresh_token: "rt1" }),
        },
        [FACTORY_AUTH_ME_ENDPOINT]: { body: JSON.stringify(AUTH_BODY) },
        [FACTORY_BILLING_LIMITS_ENDPOINT]: { body: JSON.stringify(MODERN_LIMITS_BODY) },
      },
    });
    const snap = await collectFactory(host);
    expect(snap.status).toBe("ok");
    expect(persisted).toContainEqual(["access-token", "at1"]);
    expect(persisted).toContainEqual(["refresh-token", "rt1"]);
  });

  it("refreshes once when the cached access token is expired, then collects", async () => {
    // auth/me 401s for the stale token and 200s for the refreshed one.
    const host: HostPort = {
      now: () => FAKE_NOW_MS,
      credentials: {
        getOAuthToken: () => Promise.resolve(undefined),
        getSecret: (id, key) =>
          Promise.resolve(
            id === "factory"
              ? key === "refresh-token"
                ? "rt0"
                : key === "access-token"
                  ? "stale"
                  : undefined
              : undefined,
          ),
        setSecret: () => Promise.resolve(),
      },
      http: {
        request: (req) => {
          if (req.url === WORKOS_AUTH_ENDPOINT) {
            return Promise.resolve({
              status: 200,
              headers: {},
              body: JSON.stringify({ access_token: "fresh", refresh_token: "rt1" }),
            });
          }
          const valid = bearer(req) === "fresh";
          if (req.url === FACTORY_AUTH_ME_ENDPOINT) {
            return Promise.resolve({
              status: valid ? 200 : 401,
              headers: {},
              body: valid ? JSON.stringify(AUTH_BODY) : "",
            });
          }
          if (req.url === FACTORY_BILLING_LIMITS_ENDPOINT) {
            return Promise.resolve({
              status: valid ? 200 : 401,
              headers: {},
              body: valid ? JSON.stringify(MODERN_LIMITS_BODY) : "",
            });
          }
          return Promise.resolve({ status: 200, headers: {}, body: "{}" });
        },
      },
    };
    const snap = await collectFactory(host);
    expect(snap.status).toBe("ok");
    expect(snap.windows.find((w) => w.id === "session-5h")!.usedPercent).toBe(42.5);
  });

  it("falls back to the legacy usage endpoint when not on token-rate-limit billing", async () => {
    const host = createFakeHost({
      secrets: { factory: { "refresh-token": "rt0", "access-token": "at0" } },
      routes: {
        // No userProfile.id → the legacy URL omits the userId query param.
        [FACTORY_AUTH_ME_ENDPOINT]: { body: JSON.stringify(LEGACY_AUTH_BODY) },
        [FACTORY_BILLING_LIMITS_ENDPOINT]: {
          body: JSON.stringify({ usesTokenRateLimitsBilling: false }),
        },
        [`${FACTORY_USAGE_ENDPOINT}?useCache=true`]: { body: JSON.stringify(LEGACY_USAGE_BODY) },
      },
    });
    const snap = await collectFactory(host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Factory Team");
    expect(snap.windows.find((w) => w.id === "monthly")!.usedPercent).toBe(25);
    expect(snap.windows.find((w) => w.id === "factory:premium")!.usedPercent).toBe(10);
  });

  it("returns auth-missing when the refresh token is dead", async () => {
    const host = createFakeHost({
      secrets: { factory: { "refresh-token": "dead" } },
      routes: { [WORKOS_AUTH_ENDPOINT]: { status: 400, body: "{}" } },
    });
    const snap = await collectFactory(host);
    expect(snap.status).toBe("auth-missing");
  });
});
