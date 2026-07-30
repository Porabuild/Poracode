import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import {
  collectCommandCode,
  COMMANDCODE_BILLING_CREDITS_ENDPOINT,
  COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT,
  COMMANDCODE_USAGE_SUMMARY_ENDPOINT,
  COMMANDCODE_WHOAMI_ENDPOINT,
  formatCommandCodePlanLabel,
  parseCommandCodeUsage,
} from "./commandcode";

const PERIOD_START = "2026-06-01T03:37:07.000Z";
const PERIOD_END = "2026-07-01T03:37:07.000Z";

const CREDITS_BODY = JSON.stringify({
  credits: {
    belowThreshold: false,
    creditThreshold: 0,
    monthlyCredits: 9.9924,
    purchasedCredits: 0,
    freeCredits: 0,
  },
});

const SUMMARY_BODY = JSON.stringify({
  totalCount: 25,
  totalCost: 0.0076,
  totalTokensIn: "172284",
  totalTokensOut: "1787",
  totalTokens: "174071",
});

const SUBSCRIPTIONS_BODY = JSON.stringify({
  success: true,
  data: {
    status: "active",
    planId: "individual-go",
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
  },
});

function endpointWith(endpoint: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return `${endpoint}?${query.toString()}`;
}

describe("formatCommandCodePlanLabel", () => {
  it("maps the v1.4.1 plan ids to CLI display names", () => {
    expect(formatCommandCodePlanLabel("individual-go")).toBe("Go");
    expect(formatCommandCodePlanLabel("individual-provider")).toBe("Provider");
    expect(formatCommandCodePlanLabel("individual-ultra")).toBe("Ultra");
    expect(formatCommandCodePlanLabel("teams-pro")).toBe("Teams Pro");
    expect(formatCommandCodePlanLabel("individual_go_annual")).toBe("Go");
  });

  it("falls back to the raw value for unknown plan ids", () => {
    expect(formatCommandCodePlanLabel("weird-plan")).toBe("weird-plan");
    expect(formatCommandCodePlanLabel(undefined)).toBeUndefined();
  });
});

describe("parseCommandCodeUsage", () => {
  it("mirrors the CLI's active-plan credit-pool calculation", () => {
    const snap = parseCommandCodeUsage(
      JSON.parse(CREDITS_BODY),
      JSON.parse(SUMMARY_BODY),
      JSON.parse(SUBSCRIPTIONS_BODY),
      FAKE_NOW_MS,
      { user: { email: "dev@example.com" } },
    );

    expect(snap).toMatchObject({
      providerId: "commandcode",
      status: "ok",
      plan: "Go",
      authenticatedAs: "dev@example.com",
    });
    const window = snap.windows[0]!;
    expect(window.id).toBe("monthly");
    expect(window.unit).toBe("usd");
    expect(window.currency).toBe("USD");
    expect(window.used).toBeCloseTo(0.0076);
    expect(window.limit).toBe(10);
    expect(window.usedPercent).toBeCloseTo(0.076);
    expect(window.resetsAt).toBe(Date.parse(PERIOD_END));
    expect(snap.credits).toBeUndefined();
    expect(snap.cost).toBeUndefined();
    expect(snap.tokens).toBeUndefined();
  });

  it("reconstructs an unknown plan pool from remaining credits plus spend", () => {
    const snap = parseCommandCodeUsage(
      { credits: { monthlyCredits: 5, purchasedCredits: 1, freeCredits: 0.5 } },
      { totalCost: 2.5 },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.plan).toBeUndefined();
    expect(snap.windows[0]!.used).toBe(2.5);
    expect(snap.windows[0]!.limit).toBe(9);
  });

  it("tolerates completely missing bodies without throwing", () => {
    const snap = parseCommandCodeUsage(undefined, undefined, undefined, FAKE_NOW_MS);
    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.usedPercent).toBe(0);
    expect(snap.windows[0]!.used).toBeUndefined();
    expect(snap.windows[0]!.limit).toBeUndefined();
  });
});

describe("collectCommandCode", () => {
  it("returns auth-missing when no CLI API key resolves", async () => {
    const snap = await collectCommandCode(createFakeHost());
    expect(snap.status).toBe("auth-missing");
    expect(snap.windows).toEqual([]);
  });

  it("uses the v1 bearer endpoints and current-period summary", async () => {
    const requests: Array<{ url: string; authorization?: string }> = [];
    const summaryEndpoint = endpointWith(COMMANDCODE_USAGE_SUMMARY_ENDPOINT, {
      since: PERIOD_START,
    });
    const host = createFakeHost({
      tokens: { commandcode: { accessToken: "cc-api-key" } },
      routes: {
        [COMMANDCODE_WHOAMI_ENDPOINT]: {
          body: JSON.stringify({ success: true, user: { userName: "dev" }, org: null }),
        },
        [COMMANDCODE_BILLING_CREDITS_ENDPOINT]: { body: CREDITS_BODY },
        [COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT]: { body: SUBSCRIPTIONS_BODY },
        [summaryEndpoint]: { body: SUMMARY_BODY },
      },
      onRequest: (request) => {
        const authorization = request.headers?.Authorization;
        requests.push({
          url: request.url,
          ...(authorization ? { authorization } : {}),
        });
      },
    });

    const snap = await collectCommandCode(host);

    expect(snap).toMatchObject({ status: "ok", plan: "Go", authenticatedAs: "dev" });
    expect(snap.windows[0]!.limit).toBe(10);
    expect(requests.map((request) => request.url)).toContain(summaryEndpoint);
    expect(requests.every((request) => request.authorization === "Bearer cc-api-key")).toBe(true);
  });

  it("adds orgId to organization billing requests", async () => {
    const orgId = "org-1";
    const creditsEndpoint = endpointWith(COMMANDCODE_BILLING_CREDITS_ENDPOINT, { orgId });
    const subscriptionsEndpoint = endpointWith(COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT, {
      orgId,
    });
    const summaryEndpoint = endpointWith(COMMANDCODE_USAGE_SUMMARY_ENDPOINT, {
      orgId,
      since: PERIOD_START,
    });
    const requested: string[] = [];
    const host = createFakeHost({
      tokens: { commandcode: { accessToken: "cc-api-key" } },
      routes: {
        [COMMANDCODE_WHOAMI_ENDPOINT]: {
          body: JSON.stringify({ user: { userName: "dev" }, org: { id: orgId } }),
        },
        [creditsEndpoint]: { body: CREDITS_BODY },
        [subscriptionsEndpoint]: { body: SUBSCRIPTIONS_BODY },
        [summaryEndpoint]: { body: SUMMARY_BODY },
      },
      onRequest: (request) => requested.push(request.url),
    });

    expect((await collectCommandCode(host)).status).toBe("ok");
    expect(requested).toEqual(
      expect.arrayContaining([creditsEndpoint, subscriptionsEndpoint, summaryEndpoint]),
    );
  });

  it.each([401, 403])("returns auth-missing when the API key is rejected (%s)", async (status) => {
    const host = createFakeHost({
      tokens: { commandcode: { accessToken: "expired" } },
      routes: { [COMMANDCODE_WHOAMI_ENDPOINT]: { status, body: "" } },
    });
    expect((await collectCommandCode(host)).status).toBe("auth-missing");
  });

  it("returns rate-limited on HTTP 429", async () => {
    const host = createFakeHost({
      tokens: { commandcode: { accessToken: "cc-api-key" } },
      routes: { [COMMANDCODE_WHOAMI_ENDPOINT]: { status: 429, body: "" } },
    });
    expect((await collectCommandCode(host)).status).toBe("rate-limited");
  });

  it("returns an error when an API endpoint returns invalid JSON", async () => {
    const host = createFakeHost({
      tokens: { commandcode: { accessToken: "cc-api-key" } },
      routes: { [COMMANDCODE_WHOAMI_ENDPOINT]: { body: "not-json" } },
    });
    expect(await collectCommandCode(host)).toMatchObject({
      status: "error",
      error: "invalid JSON response",
    });
  });
});
