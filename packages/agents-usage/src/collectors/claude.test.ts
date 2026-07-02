import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import {
  CLAUDE_OAUTH_BETA,
  CLAUDE_OAUTH_CLIENT_ID,
  CLAUDE_OAUTH_TOKEN_ENDPOINT,
  CLAUDE_RATE_LIMIT_COOLDOWN_MS,
  CLAUDE_USAGE_ENDPOINT,
  collectClaude,
  formatClaudePlan,
  parseClaudeRefreshResponse,
  parseClaudeUsage,
  refreshClaudeOAuthToken,
} from "./claude";

// The Claude /api/oauth/usage endpoint reports `utilization` in percent (0-100)
// for every window, not as a 0-1 fraction. These values mirror a real response.
const FIXTURE = {
  five_hour: { utilization: 21, resets_at: "2026-05-29T12:00:00Z" },
  seven_day: { utilization: 1, resets_at: "2026-06-01T00:00:00Z" },
  seven_day_opus: { utilization: 10, resets_at: "2026-06-01T00:00:00Z" },
  seven_day_fable: { utilization: 25, resets_at: "2026-06-01T00:00:00Z" },
  extra_usage: {
    is_enabled: true,
    monthly_limit: 25000,
    used_credits: 7836,
    utilization: 31,
    currency: "USD",
  },
};

describe("formatClaudePlan", () => {
  it("title-cases and appends Subscription when absent", () => {
    expect(formatClaudePlan("claude_pro")).toBe("Claude Pro Subscription");
    expect(formatClaudePlan("Max Subscription")).toBe("Max Subscription");
    expect(formatClaudePlan(undefined)).toBeUndefined();
  });
});

describe("parseClaudeUsage", () => {
  it("maps every Claude window as a direct percentage", () => {
    const snap = parseClaudeUsage(FIXTURE, FAKE_NOW_MS, { plan: "Claude Pro Subscription" });
    expect(snap.status).toBe("ok");
    const session = snap.windows.find((w) => w.id === "session-5h");
    expect(session?.usedPercent).toBe(21);
    expect(session?.resetsAt).toBe(Date.parse("2026-05-29T12:00:00Z"));
    expect(snap.windows.find((w) => w.id === "weekly")?.usedPercent).toBe(1);
    expect(snap.windows.find((w) => w.id === "weekly-opus")?.usedPercent).toBe(10);
    expect(snap.windows.find((w) => w.id === "weekly-fable")?.usedPercent).toBe(25);
    // extra_usage is pay-as-you-go overage, surfaced as a dollar "extra-usage"
    // line — never as a "monthly" rate window.
    expect(snap.windows.find((w) => w.id === "monthly")).toBeUndefined();
    const extra = snap.windows.find((w) => w.id === "extra-usage");
    expect(extra?.usedPercent).toBe(31);
    // Reported in cents (7836 / 25000) → dollars for display.
    expect(extra?.used).toBe(78.36);
    expect(extra?.limit).toBe(250);
    expect(extra?.unit).toBe("usd");
    expect(extra?.currency).toBe("USD");
    expect(snap.plan).toBe("Claude Pro Subscription");
  });

  it("omits windows the API does not report", () => {
    const snap = parseClaudeUsage({ five_hour: { utilization: 0.1 } }, FAKE_NOW_MS);
    expect(snap.windows.map((w) => w.id)).toEqual(["session-5h"]);
    expect(snap.windows.find((w) => w.id === "weekly-fable")).toBeUndefined();
  });

  it("treats session utilization as a direct percentage", () => {
    const snap = parseClaudeUsage({ five_hour: { utilization: 1 } }, FAKE_NOW_MS);
    expect(snap.windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(1);
  });

  it("treats weekly utilization as a direct percentage, not a 0-1 fraction", () => {
    // Regression: the API reports weekly utilization in percent like every other
    // window. A value of 1 means 1% and must not be read as the fraction 1.0 →
    // 100% (which rendered a freshly-reset weekly window as a full red bar).
    const snap = parseClaudeUsage(
      { seven_day: { utilization: 1 }, seven_day_sonnet: { utilization: 0.5 } },
      FAKE_NOW_MS,
    );
    expect(snap.windows.find((w) => w.id === "weekly")?.usedPercent).toBe(1);
    expect(snap.windows.find((w) => w.id === "weekly-sonnet")?.usedPercent).toBe(0.5);
  });

  it("accepts the alternate Fable weekly usage field name", () => {
    const snap = parseClaudeUsage(
      { seven_day_fable_5: { utilization: 17, resets_at: "2026-06-01T00:00:00Z" } },
      FAKE_NOW_MS,
    );
    const fable = snap.windows.find((w) => w.id === "weekly-fable");
    expect(fable?.label).toBe("Weekly (Fable)");
    expect(fable?.usedPercent).toBe(17);
  });
});

describe("collectClaude", () => {
  it("returns auth-missing when no token", async () => {
    const snap = await collectClaude(createFakeHost());
    expect(snap.status).toBe("auth-missing");
    expect(snap.windows).toHaveLength(0);
  });

  it("sends the mandatory headers and parses the body", async () => {
    let captured: Record<string, string> | undefined;
    const host = createFakeHost({
      tokens: { claude: { accessToken: "tok", subscriptionType: "claude_pro" } },
      routes: { [CLAUDE_USAGE_ENDPOINT]: { body: JSON.stringify(FIXTURE) } },
      onRequest: (req) => {
        captured = req.headers;
      },
    });
    const snap = await collectClaude(host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Claude Pro Subscription");
    expect(captured?.["anthropic-beta"]).toBe(CLAUDE_OAUTH_BETA);
    expect(captured?.["User-Agent"]).toMatch(/^claude-code\//);
    expect(captured?.Authorization).toBe("Bearer tok");
  });

  it("maps 429 to rate-limited and 401 to auth-missing", async () => {
    const rate = await collectClaude(
      createFakeHost({
        tokens: { claude: { accessToken: "tok" } },
        routes: { [CLAUDE_USAGE_ENDPOINT]: { status: 429 } },
      }),
    );
    expect(rate.status).toBe("rate-limited");
    // No Retry-After header → fall back to the default cooldown from now.
    expect(rate.rateLimitedUntil).toBe(FAKE_NOW_MS + CLAUDE_RATE_LIMIT_COOLDOWN_MS);

    const unauth = await collectClaude(
      createFakeHost({
        tokens: { claude: { accessToken: "tok" } },
        routes: { [CLAUDE_USAGE_ENDPOINT]: { status: 401 } },
      }),
    );
    expect(unauth.status).toBe("auth-missing");
  });

  it("refreshes and retries once after a 401 before reporting auth-missing", async () => {
    const authorizations: string[] = [];
    const host = createFakeHost({
      tokens: { claude: { accessToken: "old", refreshToken: "refresh", subscriptionType: "max" } },
      refreshOAuthToken: async (_providerId, token) =>
        token.accessToken === "old"
          ? { accessToken: "fresh", refreshToken: "rotated", subscriptionType: "max" }
          : undefined,
    });
    host.http.request = (req) => {
      if (req.headers?.Authorization) authorizations.push(req.headers.Authorization);
      return Promise.resolve(
        req.headers?.Authorization === "Bearer old"
          ? { status: 401, headers: {}, body: "{}" }
          : { status: 200, headers: {}, body: JSON.stringify(FIXTURE) },
      );
    };

    const snap = await collectClaude(host);

    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Max Subscription");
    expect(authorizations).toEqual(["Bearer old", "Bearer fresh"]);
  });

  it("also refreshes and retries after a 403", async () => {
    const host = createFakeHost({
      tokens: { claude: { accessToken: "old", refreshToken: "refresh" } },
      refreshOAuthToken: async () => ({ accessToken: "fresh" }),
    });
    host.http.request = (req) =>
      Promise.resolve(
        req.headers?.Authorization === "Bearer old"
          ? { status: 403, headers: {}, body: "{}" }
          : { status: 200, headers: {}, body: JSON.stringify(FIXTURE) },
      );

    const snap = await collectClaude(host);

    expect(snap.status).toBe("ok");
  });

  it("reports auth-missing when refresh returns the same rejected token", async () => {
    const host = createFakeHost({
      tokens: { claude: { accessToken: "old", refreshToken: "refresh" } },
      refreshOAuthToken: async (_providerId, token) => token,
      routes: { [CLAUDE_USAGE_ENDPOINT]: { status: 401 } },
    });

    const snap = await collectClaude(host);

    expect(snap.status).toBe("auth-missing");
    expect(snap.error).toBe("access token rejected (401)");
  });

  it("honors a Retry-After header on a 429 (backoff until the server says)", async () => {
    const rate = await collectClaude(
      createFakeHost({
        tokens: { claude: { accessToken: "tok" } },
        routes: {
          [CLAUDE_USAGE_ENDPOINT]: { status: 429, headers: { "retry-after": "1800" } },
        },
      }),
    );
    expect(rate.status).toBe("rate-limited");
    expect(rate.rateLimitedUntil).toBe(FAKE_NOW_MS + 1800 * 1000);
  });
});

describe("parseClaudeRefreshResponse", () => {
  it("maps the OAuth body and derives expiresAt from expires_in", () => {
    const got = parseClaudeRefreshResponse(
      { access_token: "new-acc", refresh_token: "new-ref", expires_in: 3600 },
      FAKE_NOW_MS,
      "old-ref",
    );
    expect(got).toEqual({
      accessToken: "new-acc",
      refreshToken: "new-ref",
      expiresAt: FAKE_NOW_MS + 3600 * 1000,
    });
  });

  it("retains the current refresh token when the body omits a new one", () => {
    const got = parseClaudeRefreshResponse(
      { access_token: "new-acc", expires_in: 100 },
      FAKE_NOW_MS,
      "keep-ref",
    );
    expect(got?.refreshToken).toBe("keep-ref");
  });

  it("returns undefined without an access token", () => {
    expect(parseClaudeRefreshResponse({ refresh_token: "r" }, FAKE_NOW_MS, "old")).toBeUndefined();
  });

  it("rejects a non-string access token rather than corrupting the creds file", () => {
    expect(
      parseClaudeRefreshResponse(
        { access_token: { nested: "oops" }, expires_in: 3600 },
        FAKE_NOW_MS,
        "old",
      ),
    ).toBeUndefined();
    expect(
      parseClaudeRefreshResponse({ access_token: 12345, expires_in: 3600 }, FAKE_NOW_MS, "old"),
    ).toBeUndefined();
  });

  it("rejects a missing or non-positive expires_in (would mark the token instantly stale)", () => {
    expect(parseClaudeRefreshResponse({ access_token: "a" }, FAKE_NOW_MS, "old")).toBeUndefined();
    expect(
      parseClaudeRefreshResponse({ access_token: "a", expires_in: "soon" }, FAKE_NOW_MS, "old"),
    ).toBeUndefined();
    expect(
      parseClaudeRefreshResponse({ access_token: "a", expires_in: 0 }, FAKE_NOW_MS, "old"),
    ).toBeUndefined();
  });

  it("falls back to the current refresh token when the body's is not a string", () => {
    const got = parseClaudeRefreshResponse(
      { access_token: "a", refresh_token: ["x"], expires_in: 100 },
      FAKE_NOW_MS,
      "keep-ref",
    );
    expect(got?.refreshToken).toBe("keep-ref");
  });
});

describe("refreshClaudeOAuthToken", () => {
  it("posts the refresh grant to the OAuth endpoint and returns the rotated token", async () => {
    let captured: {
      headers?: Record<string, string> | undefined;
      body?: string | undefined;
      method?: string | undefined;
    } = {};
    const host = createFakeHost({
      routes: {
        [CLAUDE_OAUTH_TOKEN_ENDPOINT]: {
          body: JSON.stringify({ access_token: "fresh", refresh_token: "rot", expires_in: 28800 }),
        },
      },
      onRequest: (req) => {
        captured = { headers: req.headers, body: req.body, method: req.method };
      },
    });
    const got = await refreshClaudeOAuthToken(host.http, "old-ref", FAKE_NOW_MS);
    expect(got).toEqual({
      accessToken: "fresh",
      refreshToken: "rot",
      expiresAt: FAKE_NOW_MS + 28800 * 1000,
    });
    expect(captured.method).toBe("POST");
    expect(captured.headers?.["Content-Type"]).toBe("application/json");
    expect(JSON.parse(captured.body ?? "{}")).toEqual({
      grant_type: "refresh_token",
      refresh_token: "old-ref",
      client_id: CLAUDE_OAUTH_CLIENT_ID,
    });
  });

  it("returns undefined on a non-2xx response", async () => {
    const host = createFakeHost({
      routes: { [CLAUDE_OAUTH_TOKEN_ENDPOINT]: { status: 400, body: "{}" } },
    });
    expect(await refreshClaudeOAuthToken(host.http, "old-ref", FAKE_NOW_MS)).toBeUndefined();
  });
});
