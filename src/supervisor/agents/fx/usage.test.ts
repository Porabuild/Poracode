import { describe, expect, it } from "vitest";
import { FX_USAGE_PROVIDER_ID, parseFxUsageJson, scanFxUsage, type FxUsageScanDeps } from "./usage";

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function usageJson(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    kind: "usage",
    schema_version: 2,
    source: "ai_gateway",
    period: "month",
    status: "ready",
    reason: null,
    fetched_at_ms: NOW,
    budget: null,
    totals: {
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      request_count: 0,
      spend: 0,
    },
    models: [],
    codex: null,
    grok: null,
    ...overrides,
  });
}

describe("parseFxUsageJson chatgpt", () => {
  it("maps limit windows to 5h/weekly and honors unlimited credits", () => {
    const snapshot = parseFxUsageJson(
      usageJson({
        source: "chatgpt",
        codex: {
          plan: "pro",
          limits: [
            {
              name: "codex",
              primary: {
                used_percent: 42,
                window_seconds: 18_000,
                resets_at_ms: NOW + 3_600_000,
              },
              secondary: { used_percent: 61, window_seconds: 604_800 },
            },
          ],
          credits: { has_credits: true, unlimited: true, balance: "0" },
        },
      }),
      NOW,
    );

    expect(snapshot).toEqual({
      providerId: FX_USAGE_PROVIDER_ID,
      status: "ok",
      plan: "ChatGPT Pro 20x",
      windows: [
        {
          id: "session-5h",
          label: "Session (5h)",
          usedPercent: 42,
          resetsAt: NOW + 3_600_000,
        },
        { id: "weekly", label: "Weekly", usedPercent: 61 },
      ],
      credits: { balance: 0, unlimited: true },
      fetchedAt: NOW,
    });
  });

  it("uses a numeric credit balance and disambiguates duplicate window ids", () => {
    const snapshot = parseFxUsageJson(
      usageJson({
        source: "chatgpt",
        codex: {
          limits: [
            {
              name: "codex",
              primary: { used_percent: 10, window_seconds: 18_000 },
              secondary: null,
            },
            {
              name: "review",
              primary: { used_percent: 5, window_seconds: 18_000 },
              secondary: null,
            },
          ],
          credits: { has_credits: true, unlimited: false, balance: "12.50" },
        },
      }),
      NOW,
    );

    expect(snapshot.windows).toEqual([
      { id: "session-5h", label: "Session (5h)", usedPercent: 10 },
      { id: "codex:review-18000", label: "Session (5h)", usedPercent: 5 },
    ]);
    expect(snapshot.credits).toEqual({ balance: 12.5 });
  });

  it("suffixes repeated nameless limits until every window id is unique", () => {
    const snapshot = parseFxUsageJson(
      usageJson({
        source: "chatgpt",
        codex: {
          limits: [
            { name: "", primary: { used_percent: 10, window_seconds: 18_000 }, secondary: null },
            { name: "", primary: { used_percent: 20, window_seconds: 18_000 }, secondary: null },
            { name: "", primary: { used_percent: 30, window_seconds: 18_000 }, secondary: null },
          ],
        },
      }),
      NOW,
    );

    expect(snapshot.windows.map((window) => window.id)).toEqual([
      "session-5h",
      "codex:-18000",
      "codex:-18000-2",
    ]);
  });
});

describe("parseFxUsageJson ai_gateway", () => {
  it("maps a monthly budget, spend, and token totals", () => {
    const snapshot = parseFxUsageJson(
      usageJson({
        budget: { limit: 100, spent: 25, period: "monthly" },
        totals: {
          total_tokens: 1200,
          input_tokens: 1000,
          output_tokens: 200,
          cache_read_tokens: 50,
          cache_write_tokens: 10,
          reasoning_tokens: 0,
          request_count: 2,
          spend: 12.5,
        },
      }),
      NOW,
    );

    expect(snapshot).toEqual({
      providerId: FX_USAGE_PROVIDER_ID,
      status: "ok",
      windows: [
        {
          id: "monthly",
          label: "Budget",
          usedPercent: 25,
          used: 25,
          limit: 100,
          unit: "usd",
          currency: "USD",
          resetsAt: Date.UTC(2026, 1, 1),
        },
      ],
      cost: { currency: "USD", amount: 12.5, period: "cycle", estimated: false },
      tokens: {
        total: 1200,
        input: 1000,
        output: 200,
        cacheRead: 50,
        cacheWrite: 10,
        period: "cycle",
      },
      fetchedAt: NOW,
    });
  });

  it("reports remaining budget as credits when the budget has no period", () => {
    const snapshot = parseFxUsageJson(
      usageJson({ budget: { limit: 50, spent: 12, period: "none" } }),
      NOW,
    );

    expect(snapshot.windows).toEqual([]);
    expect(snapshot.credits).toEqual({
      balance: 38,
      currency: "USD",
      label: "Budget left",
    });
  });

  it("uses the next UTC midnight for a daily budget and omits weekly resets", () => {
    const daily = parseFxUsageJson(
      usageJson({ budget: { limit: 10, spent: 5, period: "daily" } }),
      NOW,
    );
    expect(daily.windows[0]?.resetsAt).toBe(Date.UTC(2026, 0, 16));

    const weekly = parseFxUsageJson(
      usageJson({ budget: { limit: 10, spent: 5, period: "weekly" } }),
      NOW,
    );
    expect(weekly.windows[0]).not.toHaveProperty("resetsAt");
  });
});

describe("parseFxUsageJson grok", () => {
  it("maps the allowance, on-demand spend, and prepaid balance", () => {
    const snapshot = parseFxUsageJson(
      usageJson({
        source: "grok",
        grok: {
          used_percent: 30,
          period: "weekly",
          resets_at_ms: NOW + 86_400_000,
          on_demand_cap_cents: 10_000,
          on_demand_used_cents: 2_500,
          prepaid_cents: 1_234,
          settings: { plan: "SuperGrok" },
        },
      }),
      NOW,
    );

    expect(snapshot).toEqual({
      providerId: FX_USAGE_PROVIDER_ID,
      status: "ok",
      plan: "SuperGrok",
      windows: [
        { id: "weekly", label: "Weekly", usedPercent: 30, resetsAt: NOW + 86_400_000 },
        {
          id: "extra-usage",
          label: "On-demand",
          usedPercent: 25,
          used: 25,
          limit: 100,
          unit: "usd",
          currency: "USD",
        },
      ],
      credits: { balance: 12.34, currency: "USD", label: "Prepaid" },
      fetchedAt: NOW,
    });
  });

  it("falls back to the monthly allowance window", () => {
    const snapshot = parseFxUsageJson(
      usageJson({ source: "grok", grok: { used_percent: 120, period: "monthly" } }),
      NOW,
    );
    expect(snapshot.windows).toEqual([{ id: "monthly", label: "Monthly", usedPercent: 100 }]);
  });
});

describe("parseFxUsageJson statuses", () => {
  it("maps failed to an error with the provider reason", () => {
    expect(
      parseFxUsageJson(usageJson({ status: "failed", reason: "refresh_failed" }), NOW),
    ).toEqual({
      providerId: FX_USAGE_PROVIDER_ID,
      status: "error",
      windows: [],
      fetchedAt: NOW,
      error: "fx usage could not refresh (refresh_failed)",
    });
  });

  it("maps sign-in reasons to auth-missing and other reasons to unsupported", () => {
    for (const reason of ["no_gateway_sign_in", "no_team", "refresh_needed"]) {
      expect(parseFxUsageJson(usageJson({ status: "unavailable", reason }), NOW).status).toBe(
        "auth-missing",
      );
    }
    expect(
      parseFxUsageJson(usageJson({ status: "unavailable", reason: "unsupported_provider" }), NOW)
        .status,
    ).toBe("unsupported");
    expect(parseFxUsageJson(usageJson({ status: "unavailable" }), NOW).status).toBe("unsupported");
  });

  it("returns an error for unreadable output and falls back to nowMs", () => {
    expect(parseFxUsageJson("not json", NOW)).toEqual({
      providerId: FX_USAGE_PROVIDER_ID,
      status: "error",
      windows: [],
      fetchedAt: NOW,
      error: "fx usage returned unreadable output",
    });
    expect(parseFxUsageJson(JSON.stringify({ kind: "status" }), NOW).status).toBe("error");
    expect(parseFxUsageJson(usageJson({ fetched_at_ms: -1 }), NOW).fetchedAt).toBe(NOW);
  });
});

describe("scanFxUsage", () => {
  function deps(overrides: Partial<FxUsageScanDeps>): FxUsageScanDeps {
    return {
      platform: "darwin",
      resolveBinary: async () => "/usr/local/bin/fx",
      runUsage: async () => ({ ok: true, stdout: usageJson({}) }),
      ...overrides,
    };
  }

  it("reports unsupported on Windows without spawning", async () => {
    const snapshot = await scanFxUsage(
      NOW,
      deps({
        platform: "win32",
        resolveBinary: async () => {
          throw new Error("should not resolve");
        },
      }),
    );
    expect(snapshot).toEqual({
      providerId: FX_USAGE_PROVIDER_ID,
      status: "unsupported",
      windows: [],
      fetchedAt: NOW,
    });
  });

  it("reports app-not-running when fx is not installed", async () => {
    expect(await scanFxUsage(NOW, deps({ resolveBinary: async () => undefined }))).toEqual({
      providerId: FX_USAGE_PROVIDER_ID,
      status: "app-not-running",
      windows: [],
      fetchedAt: NOW,
      error: "fx is not installed",
    });
  });

  it("parses a successful run", async () => {
    const snapshot = await scanFxUsage(
      NOW,
      deps({
        runUsage: async () => ({
          ok: true,
          stdout: usageJson({ budget: { limit: 100, spent: 50, period: "monthly" } }),
        }),
      }),
    );
    expect(snapshot.status).toBe("ok");
    expect(snapshot.windows[0]?.usedPercent).toBe(50);
  });

  it("parses JSON from a failed run when available, else reports failure", async () => {
    const parsed = await scanFxUsage(
      NOW,
      deps({
        runUsage: async () => ({ ok: false, stdout: usageJson({ status: "failed", reason: "x" }) }),
      }),
    );
    expect(parsed.status).toBe("error");
    expect(parsed.error).toBe("fx usage could not refresh (x)");

    const failed = await scanFxUsage(
      NOW,
      deps({ runUsage: async () => ({ ok: false, stdout: "boom" }) }),
    );
    expect(failed.error).toBe("fx usage failed");

    const thrown = await scanFxUsage(
      NOW,
      deps({
        runUsage: async () => {
          throw new Error("spawn failed");
        },
      }),
    );
    expect(thrown.status).toBe("error");
    expect(thrown.error).toBe("fx usage failed");
  });
});
