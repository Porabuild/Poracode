import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import { CODEX_USAGE_ENDPOINT, collectCodex, parseCodexUsage } from "./codex";

describe("parseCodexUsage", () => {
  it("maps primary->session and secondary->weekly with epoch-second resets", () => {
    const resetSec = Math.floor(FAKE_NOW_MS / 1000) + 3600;
    const body = {
      plan_type: "pro",
      rate_limit: {
        primary_window: { used_percent: 42, reset_at: resetSec },
        secondary_window: { used_percent: 8, reset_at: resetSec },
      },
      credits: { has_credits: true, balance: 12.5 },
    };
    const snap = parseCodexUsage(body, {}, FAKE_NOW_MS);
    const session = snap.windows.find((w) => w.id === "session-5h");
    expect(session?.usedPercent).toBe(42);
    expect(session?.resetsAt).toBe(resetSec * 1000);
    expect(snap.windows.find((w) => w.id === "weekly")?.usedPercent).toBe(8);
    expect(snap.plan).toBe("ChatGPT Pro 20x");
    expect(snap.credits?.balance).toBe(12.5);
  });

  it("keeps Codex used_percent values as 0-100 percentages", () => {
    const snap = parseCodexUsage(
      { rate_limit: { secondary_window: { used_percent: 1 } } },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.windows.find((w) => w.id === "weekly")?.usedPercent).toBe(1);
  });

  it("maps a weekly-only primary window by duration", () => {
    const snap = parseCodexUsage(
      {
        rate_limit: {
          primary_window: { used_percent: 1, limit_window_seconds: 7 * 24 * 60 * 60 },
          secondary_window: null,
        },
      },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.windows).toEqual([
      expect.objectContaining({ id: "weekly", label: "Weekly", usedPercent: 1 }),
    ]);
  });

  it("keeps omitted windows absent while exposing the separate credit balance", () => {
    const snap = parseCodexUsage(
      { plan_type: "team", credits: { has_credits: true, balance: "796" } },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.windows).toEqual([]);
    expect(snap.credits?.balance).toBe(796);
    expect(snap.plan).toBe("ChatGPT Team");
  });

  it("maps a session-only primary window without adding a weekly bar", () => {
    const snap = parseCodexUsage(
      { rate_limit: { primary_window: { used_percent: 3 }, secondary_window: null } },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.windows).toEqual([
      expect.objectContaining({ id: "session-5h", label: "Session (5h)", usedPercent: 3 }),
    ]);
  });

  it("reads a zero credit balance when credits are unavailable", () => {
    const snap = parseCodexUsage({ credits: { has_credits: false } }, {}, FAKE_NOW_MS);
    expect(snap.credits?.balance).toBe(0);
  });

  it("falls back to the credit balance response header", () => {
    const snap = parseCodexUsage(
      { credits: { has_credits: true } },
      { "X-Codex-Credits-Balance": "128" },
      FAKE_NOW_MS,
    );
    expect(snap.credits?.balance).toBe(128);
  });

  it("surfaces unlimited credits without a balance", () => {
    const snap = parseCodexUsage({ credits: { unlimited: true } }, {}, FAKE_NOW_MS);
    expect(snap.credits).toEqual({ balance: 0, unlimited: true });
  });

  it("coerces numeric-string window fields", () => {
    const snap = parseCodexUsage(
      {
        rate_limit: {
          primary_window: {
            used_percent: "42",
            reset_after_seconds: "3600",
            limit_window_seconds: "18000",
          },
        },
      },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.windows).toEqual([expect.objectContaining({ id: "session-5h", usedPercent: 42 })]);
    expect(snap.windows[0]?.resetsAt).toBe(FAKE_NOW_MS + 3600 * 1000);
  });

  it("maps a numeric-string weekly cadence from window_minutes", () => {
    const snap = parseCodexUsage(
      { rate_limit: { primary_window: { used_percent: 1, window_minutes: "10080" } } },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.windows).toEqual([
      expect.objectContaining({ id: "weekly", label: "Weekly", usedPercent: 1 }),
    ]);
  });

  it("maps additional model-specific Codex limits", () => {
    const snap = parseCodexUsage(
      {
        additional_rate_limits: [
          {
            limit_name: "GPT-5.3-Codex-Spark",
            metered_feature: "codex_bengalfox",
            rate_limit: {
              primary_window: { used_percent: 0 },
              secondary_window: { used_percent: 10 },
            },
          },
        ],
      },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.windows.find((w) => w.id === "codex:codex-bengalfox:session-5h")).toMatchObject({
      label: "Codex 5.3 Spark (5h)",
      usedPercent: 0,
    });
    expect(snap.windows.find((w) => w.id === "codex:codex-bengalfox:weekly")).toMatchObject({
      label: "Codex 5.3 Spark Weekly",
      usedPercent: 10,
    });
  });

  it("maps a weekly-only additional limit by duration", () => {
    const snap = parseCodexUsage(
      {
        additional_rate_limits: [
          {
            limit_name: "GPT-5.3-Codex-Spark",
            metered_feature: "codex_bengalfox",
            rate_limit: {
              primary_window: { used_percent: 0, window_minutes: 10_080 },
              secondary_window: null,
            },
          },
        ],
      },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.windows).toEqual([
      expect.objectContaining({
        id: "codex:codex-bengalfox:weekly",
        label: "Codex 5.3 Spark Weekly",
        usedPercent: 0,
      }),
    ]);
  });

  it("labels the GPT reserve weekly limit", () => {
    const snap = parseCodexUsage(
      {
        additional_rate_limits: [
          {
            limit_name: "gpt-reserve",
            rate_limit: {
              primary_window: { used_percent: 0, window_minutes: 10_080 },
            },
          },
        ],
      },
      {},
      FAKE_NOW_MS,
    );
    expect(snap.windows).toEqual([
      expect.objectContaining({
        id: "codex:gpt-reserve:weekly",
        label: "Reserve Weekly",
        usedPercent: 0,
      }),
    ]);
  });

  it("falls back to x-codex-* headers when the body omits percents", () => {
    const snap = parseCodexUsage(
      { rate_limit: {} },
      { "x-codex-primary-used-percent": "73" },
      FAKE_NOW_MS,
    );
    expect(snap.windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(73);
    expect(snap.windows.find((w) => w.id === "weekly")).toBeUndefined();
  });
});

describe("collectCodex", () => {
  it("returns auth-missing without a token", async () => {
    expect((await collectCodex(createFakeHost())).status).toBe("auth-missing");
  });

  it("sends the account id header and parses an ok response", async () => {
    let captured: Record<string, string> | undefined;
    const host = createFakeHost({
      tokens: { codex: { accessToken: "t", accountId: "acc-1" } },
      routes: {
        [CODEX_USAGE_ENDPOINT]: {
          body: JSON.stringify({
            plan_type: "plus",
            rate_limit: { primary_window: { used_percent: 10 } },
          }),
        },
      },
      onRequest: (req) => {
        captured = req.headers;
      },
    });
    const snap = await collectCodex(host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("ChatGPT Plus");
    expect(captured?.["ChatGPT-Account-Id"]).toBe("acc-1");
    expect(captured?.Authorization).toBe("Bearer t");
  });
});
