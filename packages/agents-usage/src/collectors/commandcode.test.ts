import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import {
  collectCommandCode,
  COMMANDCODE_AUTH_SESSION_ENDPOINT,
  COMMANDCODE_BILLING_CREDITS_ENDPOINT,
  COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT,
  COMMANDCODE_USAGE_SUMMARY_ENDPOINT,
  formatCommandCodePlanLabel,
  isCommandCodeSessionLive,
  parseCommandCodeUsage,
} from "./commandcode";

const CREDITS_BODY = JSON.stringify({
  credits: {
    belowThreshold: false,
    creditThreshold: 0,
    monthlyCredits: 9.9924,
    purchasedCredits: 0,
    premiumMonthlyCredits: 0,
    opensourceMonthlyCredits: 9.9924,
  },
});

const SUMMARY_BODY = JSON.stringify({
  totalCount: 25,
  totalCost: 0.0076,
  averageCost: 0.000304,
  successRate: 100,
  completedCount: 25,
  failedCount: 0,
  totalTokensIn: "172284",
  totalTokensOut: "1787",
  totalTokens: "174071",
  totalCredits: 0.0076,
  totalFreeCredits: 0,
  totalMonthlyCredits: 0.0076,
  totalPurchasedCredits: 0,
});

const SUBSCRIPTIONS_BODY = JSON.stringify({
  success: true,
  data: {
    status: "active",
    planId: "individual-go",
    currentPeriodStart: "2026-06-01T03:37:07.000Z",
    currentPeriodEnd: "2026-07-01T03:37:07.000Z",
    cancelAtPeriodEnd: false,
  },
});

describe("formatCommandCodePlanLabel", () => {
  it("maps known planIds to display names", () => {
    expect(formatCommandCodePlanLabel("individual-go")).toBe("Go");
    expect(formatCommandCodePlanLabel("individual-pro")).toBe("Pro");
    expect(formatCommandCodePlanLabel("individual-max")).toBe("Max");
  });

  it("falls back to the raw value for unknown planIds", () => {
    expect(formatCommandCodePlanLabel("weird-plan")).toBe("weird-plan");
  });

  it("returns undefined for missing/blank input", () => {
    expect(formatCommandCodePlanLabel(undefined)).toBeUndefined();
    expect(formatCommandCodePlanLabel("  ")).toBeUndefined();
  });
});

describe("parseCommandCodeUsage", () => {
  it("maps the studio responses into a single monthly usd bar", () => {
    const snap = parseCommandCodeUsage(
      JSON.parse(CREDITS_BODY),
      JSON.parse(SUMMARY_BODY),
      JSON.parse(SUBSCRIPTIONS_BODY),
      FAKE_NOW_MS,
    );

    expect(snap.providerId).toBe("commandcode");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");

    const w = snap.windows[0]!;
    expect(w.id).toBe("monthly");
    expect(w.unit).toBe("usd");
    expect(w.currency).toBe("USD");
    expect(w.used).toBeCloseTo(0.0076);
    expect(w.limit).toBeCloseTo(10.0);
    expect(w.usedPercent).toBeCloseTo(0.076);
    expect(w.resetsAt).toBe(Date.parse("2026-07-01T03:37:07.000Z"));

    // The bar already conveys the full picture, so the snapshot intentionally
    // carries no `cost`/`credits`/`tokens` fields — surfacing them in the
    // panel's meta block would duplicate the bar.
    expect(snap.credits).toBeUndefined();
    expect(snap.cost).toBeUndefined();
    expect(snap.tokens).toBeUndefined();
  });

  it("emits only the window when the plan is missing", () => {
    const snap = parseCommandCodeUsage(
      { credits: { monthlyCredits: 5 } },
      { totalCost: 2.5 },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBeUndefined();
    expect(snap.windows[0]!.used).toBe(2.5);
    expect(snap.windows[0]!.limit).toBe(7.5);
    expect(snap.credits).toBeUndefined();
    expect(snap.cost).toBeUndefined();
  });

  it("tolerates completely missing bodies without throwing", () => {
    const snap = parseCommandCodeUsage(undefined, undefined, undefined, FAKE_NOW_MS);
    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.usedPercent).toBe(0);
    expect(snap.windows[0]!.used).toBeUndefined();
    expect(snap.windows[0]!.limit).toBeUndefined();
    expect(snap.credits).toBeUndefined();
    expect(snap.cost).toBeUndefined();
    expect(snap.tokens).toBeUndefined();
  });
});

describe("isCommandCodeSessionLive", () => {
  it("returns true when /auth/get-session returns a non-null JSON object", async () => {
    const host = createFakeHost({
      routes: {
        [COMMANDCODE_AUTH_SESSION_ENDPOINT]: {
          body: JSON.stringify({ user: { id: "u1" }, plan: "go" }),
        },
      },
    });
    await expect(isCommandCodeSessionLive(host.http, "cc_session=abc")).resolves.toBe(true);
  });

  it("returns false on a 200 + null body (signed out)", async () => {
    const host = createFakeHost({
      routes: { [COMMANDCODE_AUTH_SESSION_ENDPOINT]: { body: "null" } },
    });
    await expect(isCommandCodeSessionLive(host.http, "cc_session=abc")).resolves.toBe(false);
  });

  it("returns false on a 401", async () => {
    const host = createFakeHost({
      routes: { [COMMANDCODE_AUTH_SESSION_ENDPOINT]: { status: 401, body: "" } },
    });
    await expect(isCommandCodeSessionLive(host.http, "cc_session=abc")).resolves.toBe(false);
  });

  it("returns false on an empty cookie", async () => {
    const host = createFakeHost();
    await expect(isCommandCodeSessionLive(host.http, "")).resolves.toBe(false);
  });
});

describe("collectCommandCode", () => {
  it("returns auth-missing when no cookie has been stored", async () => {
    const host = createFakeHost();
    const snap = await collectCommandCode(host);
    expect(snap.status).toBe("auth-missing");
    expect(snap.windows).toEqual([]);
  });

  it("collects usage from the studio endpoints when a live cookie is present", async () => {
    const host = createFakeHost({
      secrets: { commandcode: { cookie: "cc_session=abc" } },
      routes: {
        [COMMANDCODE_AUTH_SESSION_ENDPOINT]: {
          body: JSON.stringify({ user: { id: "u1" } }),
        },
        [COMMANDCODE_BILLING_CREDITS_ENDPOINT]: { body: CREDITS_BODY },
        [COMMANDCODE_USAGE_SUMMARY_ENDPOINT]: { body: SUMMARY_BODY },
        [COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT]: { body: SUBSCRIPTIONS_BODY },
      },
    });
    const snap = await collectCommandCode(host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows[0]!.unit).toBe("usd");
    expect(snap.windows[0]!.used).toBeCloseTo(0.0076);
    expect(snap.windows[0]!.limit).toBeCloseTo(10.0);
    expect(snap.credits).toBeUndefined();
  });

  it("returns auth-missing when the session probe fails (expired cookie)", async () => {
    const host = createFakeHost({
      secrets: { commandcode: { cookie: "cc_session=expired" } },
      routes: { [COMMANDCODE_AUTH_SESSION_ENDPOINT]: { status: 401, body: "" } },
    });
    const snap = await collectCommandCode(host);
    expect(snap.status).toBe("auth-missing");
  });
});
