import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import {
  CLAUDE_OAUTH_BETA,
  CLAUDE_USAGE_ENDPOINT,
  collectClaude,
  formatClaudePlan,
  parseClaudeUsage,
} from "./claude";

// The Claude /api/oauth/usage endpoint reports `utilization` in percent (0-100)
// for every window, not as a 0-1 fraction. These values mirror a real response.
const FIXTURE = {
  five_hour: { utilization: 21, resets_at: "2026-05-29T12:00:00Z" },
  seven_day: { utilization: 1, resets_at: "2026-06-01T00:00:00Z" },
  seven_day_opus: { utilization: 10, resets_at: "2026-06-01T00:00:00Z" },
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

    const unauth = await collectClaude(
      createFakeHost({
        tokens: { claude: { accessToken: "tok" } },
        routes: { [CLAUDE_USAGE_ENDPOINT]: { status: 401 } },
      }),
    );
    expect(unauth.status).toBe("auth-missing");
  });
});
