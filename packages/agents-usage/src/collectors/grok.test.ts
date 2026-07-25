import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import {
  collectGrok,
  GROK_BILLING_ENDPOINT,
  GROK_OAUTH_TOKEN_ENDPOINT,
  GROK_SETTINGS_ENDPOINT,
  parseGrokRefreshResponse,
  parseGrokUsage,
  refreshGrokOAuthToken,
} from "./grok";
import { GROK_GRPC_EMPTY_FRAME_BASE64, GROK_GRPC_ENDPOINT } from "./grokGrpc";

const NOW = 1_717_000_000_000;

function varint(value: number): number[] {
  const out: number[] = [];
  let next = value >>> 0;
  while (next >= 0x80) {
    out.push((next & 0x7f) | 0x80);
    next >>>= 7;
  }
  out.push(next);
  return out;
}

function frame(message: Uint8Array, flags = 0): Uint8Array {
  const header = Buffer.alloc(5);
  header[0] = flags;
  header.writeUInt32BE(message.length, 1);
  return Uint8Array.from(Buffer.concat([header, message]));
}

function creditsPayload(usedPercent: number, resetEpoch: number): Uint8Array {
  const percent = Buffer.alloc(4);
  percent.writeFloatLE(usedPercent, 0);
  return Uint8Array.from([0x0d, ...percent, 0x10, ...varint(resetEpoch)]);
}

const LIVE_GRPC_BODY = frame(creditsPayload(42.5, 1_800_000_000));

describe("parseGrokUsage", () => {
  it("maps the /billing config block to a monthly credits window", () => {
    const billing = {
      config: {
        monthlyLimit: { val: 60_000 },
        used: { val: 4277 },
        onDemandCap: { val: 0 },
        billingPeriodStart: "2026-05-01T00:00:00+00:00",
        billingPeriodEnd: "2026-06-01T00:00:00+00:00",
      },
    };
    const settings = { subscription_tier_display: "SuperGrok" };
    const snap = parseGrokUsage(billing, settings, NOW);

    expect(snap.providerId).toBe("grok");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("SuperGrok");

    const w = snap.windows[0]!;
    expect(w.id).toBe("monthly");
    expect(w.unit).toBe("credits");
    expect(w.used).toBe(4277);
    expect(w.limit).toBe(60_000);
    expect(w.usedPercent).toBeCloseTo((4277 / 60_000) * 100);
    expect(w.resetsAt).toBe(Date.parse("2026-06-01T00:00:00+00:00"));
  });

  it("handles a missing config without throwing", () => {
    const snap = parseGrokUsage({}, undefined, NOW);
    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.usedPercent).toBe(0);
    expect(snap.plan).toBeUndefined();
  });
});

describe("collectGrok cookie session", () => {
  it("collects credits usage from a captured browser cookie", async () => {
    const seen: Array<{ body?: string; headers?: Record<string, string> }> = [];
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=abc" } },
      routes: { [GROK_GRPC_ENDPOINT]: { bodyBytes: LIVE_GRPC_BODY } },
      onRequest: (req) => {
        seen.push({
          ...(req.body ? { body: req.body } : {}),
          ...(req.headers ? { headers: req.headers } : {}),
        });
      },
    });

    const snap = await collectGrok(host);

    expect(snap.status).toBe("ok");
    expect(snap.windows[0]).toMatchObject({
      id: "monthly",
      unit: "credits",
      usedPercent: 42.5,
      resetsAt: 1_800_000_000_000,
    });
    expect(seen[0]?.body).toBe(GROK_GRPC_EMPTY_FRAME_BASE64);
    expect(seen[0]?.headers).toMatchObject({
      Cookie: "sso=abc",
      Origin: "https://grok.com",
      Referer: "https://grok.com/?_s=usage",
      Accept: "*/*",
      "Content-Type": "application/grpc-web-text",
      "x-grpc-web": "1",
      "x-user-agent": "connect-es/2.1.1",
    });
    // No CLI token on disk: no plan chip, and a reset far outside a plausible
    // billing cycle stays on the bare label.
    expect(snap.plan).toBeUndefined();
    expect(snap.windows[0]!.label).toBe("Credits");
  });

  it("labels the window monthly when the reset is further out than a weekly cycle", async () => {
    const resetEpoch = FAKE_NOW_MS / 1000 + 20 * 86_400;
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=abc" } },
      routes: { [GROK_GRPC_ENDPOINT]: { bodyBytes: frame(creditsPayload(16, resetEpoch)) } },
    });

    const snap = await collectGrok(host);

    expect(snap.windows[0]).toMatchObject({
      label: "Monthly credits",
      usedPercent: 16,
      resetsAt: resetEpoch * 1000,
    });
  });

  it("borrows the plan for cookie usage when the token path fails", async () => {
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=abc" } },
      tokens: { grok: { accessToken: "cli-token" } },
      routes: {
        [GROK_BILLING_ENDPOINT]: { status: 500 },
        [GROK_GRPC_ENDPOINT]: { bodyBytes: LIVE_GRPC_BODY },
        [GROK_SETTINGS_ENDPOINT]: {
          body: JSON.stringify({ subscription_tier_display: "SuperGrok Heavy" }),
        },
      },
    });

    const snap = await collectGrok(host);

    expect(snap.status).toBe("ok");
    // Cookie stays the usage source; the token only supplies the tier.
    expect(snap.windows[0]!.usedPercent).toBe(42.5);
    expect(snap.plan).toBe("SuperGrok Heavy");
  });

  it("keeps cookie usage when the plan lookup fails", async () => {
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=abc" } },
      tokens: { grok: { accessToken: "cli-token" } },
      routes: {
        [GROK_BILLING_ENDPOINT]: { status: 500 },
        [GROK_GRPC_ENDPOINT]: { bodyBytes: LIVE_GRPC_BODY },
        [GROK_SETTINGS_ENDPOINT]: { status: 500 },
      },
    });

    const snap = await collectGrok(host);

    expect(snap.status).toBe("ok");
    expect(snap.plan).toBeUndefined();
    expect(snap.windows[0]!.usedPercent).toBe(42.5);
  });

  it("keeps the stored session on a transient failure (no token to fall back to)", async () => {
    // A stored grok.com cookie whose check 5xx's, with no CLI token. This must
    // not read as signed out: report a preserved `error`, not auth-missing, so a
    // blip (e.g. a not-yet-ready network at startup) never forces a re-login.
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=abc" } },
      routes: { [GROK_GRPC_ENDPOINT]: { status: 500 } },
    });
    const snap = await collectGrok(host);
    expect(snap.status).toBe("error");
    expect(snap.windows).toEqual([]);
  });

  it("surfaces the gRPC status in the error when the edge rejects the request shape", async () => {
    // The regression that broke the card: HTTP 200 with a non-zero gRPC status in
    // the headers, which is how grok.com answers a request encoding it will not
    // accept. The reason has to reach the card, or the failure is undiagnosable.
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=abc" } },
      routes: {
        [GROK_GRPC_ENDPOINT]: {
          headers: { "grpc-status": "13", "grpc-message": "Missing%20request%20message." },
        },
      },
    });

    const snap = await collectGrok(host);

    expect(snap.status).toBe("error");
    expect(snap.error).toBe("grok.com session check failed (grpc 13: Missing request message.)");
  });

  it("reports auth-missing when the cookie is hard-rejected and there is no token", async () => {
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=expired" } },
      routes: { [GROK_GRPC_ENDPOINT]: { status: 401 } },
    });
    const snap = await collectGrok(host);
    expect(snap.status).toBe("auth-missing");
  });
});

const BILLING_BODY = JSON.stringify({
  config: {
    monthlyLimit: { val: 60_000 },
    used: { val: 9600 },
    billingPeriodStart: "2024-05-01T00:00:00Z",
    billingPeriodEnd: "2024-06-01T00:00:00Z",
  },
});

describe("collectGrok token path", () => {
  it("prefers the CLI proxy over the cookie and reports plan plus credit amounts", async () => {
    const urls: string[] = [];
    const host = createFakeHost({
      nowMs: NOW,
      tokens: { grok: { accessToken: "cli-token" } },
      secrets: { grok: { cookie: "sso=abc" } },
      routes: {
        [GROK_BILLING_ENDPOINT]: { body: BILLING_BODY },
        // The field the live proxy returns, verbatim.
        [GROK_SETTINGS_ENDPOINT]: {
          body: JSON.stringify({ allow_access: true, subscription_tier_display: "X Premium+" }),
        },
      },
      onRequest: (req) => urls.push(req.url),
    });

    const snap = await collectGrok(host);

    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("X Premium+");
    expect(snap.windows[0]).toMatchObject({
      label: "Monthly credits",
      used: 9600,
      limit: 60_000,
      unit: "credits",
    });
    // The cookie path is never touched when the token path answers.
    expect(urls).not.toContain(GROK_GRPC_ENDPOINT);
  });

  it("refreshes a rejected token through the host and retries once", async () => {
    const seen: string[] = [];
    const host = createFakeHost({
      nowMs: NOW,
      tokens: { grok: { accessToken: "stale", refreshToken: "r1" } },
      routes: {
        [GROK_BILLING_ENDPOINT]: { status: 401 },
        [GROK_SETTINGS_ENDPOINT]: { body: "{}" },
      },
      refreshOAuthToken: (providerId, token) => {
        seen.push(`${providerId}:${token.accessToken}`);
        return Promise.resolve({ accessToken: "fresh" });
      },
    });
    // Serve billing only to the refreshed token.
    const inner = host.http.request;
    host.http.request = (req) =>
      req.url === GROK_BILLING_ENDPOINT && req.headers?.Authorization === "Bearer fresh"
        ? Promise.resolve({ status: 200, headers: {}, body: BILLING_BODY })
        : inner(req);

    const snap = await collectGrok(host);

    expect(seen).toEqual(["grok:stale"]);
    expect(snap.status).toBe("ok");
    expect(snap.windows[0]).toMatchObject({ used: 9600, limit: 60_000 });
  });

  it("reports auth-missing when no refreshed token is available", async () => {
    const host = createFakeHost({
      nowMs: NOW,
      tokens: { grok: { accessToken: "stale" } },
      routes: { [GROK_BILLING_ENDPOINT]: { status: 401 } },
    });

    const snap = await collectGrok(host);

    expect(snap.status).toBe("auth-missing");
    expect(snap.error).toBe("token rejected (401)");
  });

  it("falls back to the cookie when billing carries no credit fields", async () => {
    // The proxy's on-demand view: real billing dates, no allowance. Verbatim
    // shape from the live `?format=credits` response — it must not read as 0%.
    const host = createFakeHost({
      nowMs: NOW,
      tokens: { grok: { accessToken: "cli-token" } },
      secrets: { grok: { cookie: "sso=abc" } },
      routes: {
        [GROK_BILLING_ENDPOINT]: {
          body: JSON.stringify({
            config: {
              currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY" },
              onDemandCap: { val: 0 },
              onDemandUsed: { val: 0 },
              billingPeriodStart: "2026-07-23T19:11:31Z",
              billingPeriodEnd: "2026-07-30T19:11:31Z",
            },
          }),
        },
        [GROK_GRPC_ENDPOINT]: { bodyBytes: LIVE_GRPC_BODY },
      },
    });

    const snap = await collectGrok(host);

    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.usedPercent).toBe(42.5);
  });

  it("surfaces the billing failure when there is no cookie to fall back to", async () => {
    const host = createFakeHost({
      nowMs: NOW,
      tokens: { grok: { accessToken: "cli-token" } },
      routes: { [GROK_BILLING_ENDPOINT]: { status: 503 } },
    });

    const snap = await collectGrok(host);

    expect(snap.status).toBe("error");
    expect(snap.error).toBe("grok billing check failed (HTTP 503)");
  });

  it("reports auth-missing with neither credential", async () => {
    const snap = await collectGrok(createFakeHost({ nowMs: NOW }));
    expect(snap.status).toBe("auth-missing");
  });
});

describe("grok OAuth refresh", () => {
  it("maps a refresh response and retains an omitted refresh token", () => {
    expect(parseGrokRefreshResponse({ access_token: "a", expires_in: 3600 }, NOW, "keep")).toEqual({
      accessToken: "a",
      refreshToken: "keep",
      expiresAt: NOW + 3_600_000,
    });
    expect(
      parseGrokRefreshResponse({ access_token: "a", refresh_token: "b", expires_in: 60 }, NOW, "r"),
    ).toEqual({ accessToken: "a", refreshToken: "b", expiresAt: NOW + 60_000 });
  });

  it("rejects malformed bodies rather than writing garbage into the creds file", () => {
    expect(parseGrokRefreshResponse({ expires_in: 3600 }, NOW, "r")).toBeUndefined();
    expect(parseGrokRefreshResponse({ access_token: "a" }, NOW, "r")).toBeUndefined();
    expect(
      parseGrokRefreshResponse({ access_token: "a", expires_in: 0 }, NOW, "r"),
    ).toBeUndefined();
    expect(parseGrokRefreshResponse("nope", NOW, "r")).toBeUndefined();
  });

  it("posts the refresh_token grant with the creds file's client id", async () => {
    const seen: Array<{ url: string; body?: string; headers?: Record<string, string> }> = [];
    const host = createFakeHost({
      nowMs: NOW,
      routes: {
        [GROK_OAUTH_TOKEN_ENDPOINT]: {
          body: JSON.stringify({ access_token: "fresh", expires_in: 7200 }),
        },
      },
      onRequest: (req) =>
        seen.push({
          url: req.url,
          ...(req.body ? { body: req.body } : {}),
          ...(req.headers ? { headers: req.headers } : {}),
        }),
    });

    const refreshed = await refreshGrokOAuthToken(
      host.http,
      { refreshToken: "r1", clientId: "cli-client" },
      NOW,
    );

    expect(refreshed).toEqual({
      accessToken: "fresh",
      refreshToken: "r1",
      expiresAt: NOW + 7_200_000,
    });
    expect(seen[0]?.url).toBe(GROK_OAUTH_TOKEN_ENDPOINT);
    expect(seen[0]?.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(new URLSearchParams(seen[0]?.body ?? "")).toEqual(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "cli-client",
        refresh_token: "r1",
      }),
    );
  });

  it("returns undefined on a rejected or unparseable refresh", async () => {
    const failing = createFakeHost({
      routes: { [GROK_OAUTH_TOKEN_ENDPOINT]: { status: 400 } },
    });
    expect(
      await refreshGrokOAuthToken(failing.http, { refreshToken: "r", clientId: "c" }, NOW),
    ).toBeUndefined();

    const garbage = createFakeHost({
      routes: { [GROK_OAUTH_TOKEN_ENDPOINT]: { body: "<html>" } },
    });
    expect(
      await refreshGrokOAuthToken(garbage.http, { refreshToken: "r", clientId: "c" }, NOW),
    ).toBeUndefined();
  });
});
