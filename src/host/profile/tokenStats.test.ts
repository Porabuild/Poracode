import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getProfileDataGeneration, getSqlite, initDatabase } from "../db/connection";
import { dbAppendUsageEvents } from "../db/usageEvents";
import { computeProfileTokenStats } from "./tokenStats";
import { historicalTokenEstimate } from "@poracode/agents-usage";

// node_modules/better-sqlite3 may be compiled for Electron's ABI. Fall back to
// the Node-ABI binding used by the headless server (mirrors src/main/db tests).
const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBindingEnv: string | undefined;

function databaseOpens(nativeBinding?: string): boolean {
  if (nativeBinding && !existsSync(nativeBinding)) return false;
  try {
    const database = nativeBinding
      ? new Database(":memory:", { nativeBinding })
      : new Database(":memory:");
    database.close();
    return true;
  } catch {
    return false;
  }
}

if (!databaseOpens()) {
  if (!databaseOpens(serverNativeBinding)) {
    execFileSync(process.execPath, [join(process.cwd(), "scripts", "prepare-server-native.mjs")], {
      stdio: "inherit",
    });
  }
  if (!databaseOpens(serverNativeBinding)) {
    throw new Error("Unable to prepare a Node-compatible better-sqlite3 binding for tests.");
  }
  nativeBindingEnv = serverNativeBinding;
}

describe("computeProfileTokenStats (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "lc-tokenstats-test-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it.each([0, 1.25])(
    "keeps zero-token reported cost %s distinct from missing observations",
    (amount) => {
      dbAppendUsageEvents([
        { ts: Date.now(), kind: "tokens", provider: "fixture:deleted", value: 0 },
        {
          ts: Date.now(),
          kind: "tokens_v2",
          provider: "fixture:deleted",
          value: 0,
          costDetails: { version: 1, observed: { amount, currency: "USD" } },
        },
      ]);
      const stats = computeProfileTokenStats({
        utcOffsetMinutes: 0,
        provider: "fixture:deleted",
        window: "7d",
      });
      expect(stats.costs?.totals).toMatchObject({
        tokens: 0,
        unpricedTokens: 0,
        observedSamples: 1,
        observedTokens: 0,
        observed: [{ amount, currency: "USD" }],
        estimatedSamples: 0,
      });
      expect(stats.costs?.accounts).toHaveLength(1);
      expect(stats.available).toBe(false);
      expect(stats.providers).toEqual([]);
      expect(stats.accounts).toEqual([]);
      expect(stats.models).toEqual([]);
    },
  );

  it.each([0, 100])(
    "admits a future %s-token cost row at its timestamp without another SQL scan",
    (value) => {
      const now = Date.parse("2026-10-17T12:00:00Z");
      const clock = vi.spyOn(Date, "now").mockReturnValue(now);
      dbAppendUsageEvents([
        {
          ts: now + 60_000,
          kind: "tokens_v2",
          provider: "fixture:selected",
          value,
          costDetails: { version: 1, observed: { amount: 1, currency: "USD" } },
        },
        { ts: now + 30_000, kind: "tokens_v2", provider: "fixture:other", value: 10 },
        { ts: now + 86_400_000, kind: "tokens_v2", provider: "fixture:selected", value: 1000 },
      ]);
      const prepare = vi.spyOn(getSqlite(), "prepare");
      const req = { utcOffsetMinutes: 0, provider: "fixture:selected", window: "7d" as const };
      const early = computeProfileTokenStats(req);
      const generation = getProfileDataGeneration();
      expect(early.costs?.totals.observedSamples).toBe(0);
      clock.mockReturnValue(now + 59_999);
      expect(computeProfileTokenStats(req)).toBe(early);
      clock.mockReturnValue(now + 60_000);
      const current = computeProfileTokenStats(req);
      expect(current.costs?.totals).toMatchObject({
        tokens: value,
        observedSamples: 1,
        observed: [{ amount: 1, currency: "USD" }],
      });
      expect(getProfileDataGeneration()).toBe(generation);
      clock.mockReturnValue(now + 60_001);
      expect(computeProfileTokenStats(req)).toBe(current);
      expect(
        prepare.mock.calls.filter(([sql]) => sql.startsWith("SELECT ts, kind, provider")),
      ).toHaveLength(1);
    },
  );

  it("excludes newly future rows after the clock moves backwards within a day", () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    dbAppendUsageEvents([{ ts: now, kind: "tokens_v2", provider: "fixture", value: 100 }]);
    const req = { utcOffsetMinutes: 0, window: "7d" as const };
    expect(computeProfileTokenStats(req).lifetimeTokens).toBe(100);
    const generation = getProfileDataGeneration();
    clock.mockReturnValue(now - 1);
    expect(computeProfileTokenStats(req).lifetimeTokens).toBe(0);
    expect(getProfileDataGeneration()).toBe(generation);
    clock.mockReturnValue(now);
    expect(computeProfileTokenStats(req).lifetimeTokens).toBe(100);
  });

  it("keeps observed currencies, API equivalents and unknown legacy history separate without thread joins", () => {
    const ts = Date.now();
    const tokens = { input: 100, output: 10, cacheRead: 50, cacheWrite: 0 };
    const estimate = historicalTokenEstimate("claude-sonnet-4-6", tokens, ts)!;
    dbAppendUsageEvents([
      {
        ts,
        kind: "tokens_v2",
        provider: "claude:deleted",
        model: "claude-sonnet-4-6",
        value: 160,
        costDetails: { version: 1, tokens, estimate, observed: { amount: 2, currency: "EUR" } },
      },
      {
        ts,
        kind: "tokens_v2",
        provider: "claude:work",
        model: "model-unknown",
        value: 100,
        costDetails: { version: 1, observed: { amount: 3, currency: "USD" } },
      },
      { ts, kind: "tokens", provider: "claude:deleted", model: "claude-sonnet-4-6", value: 500 },
    ]);
    const stats = computeProfileTokenStats({ utcOffsetMinutes: 0 });
    expect(stats.costs?.totals).toMatchObject({
      tokens: 760,
      unpricedTokens: 500,
      categorizedTokens: 160,
      observedTokens: 260,
      estimatedTokens: 160,
      observed: [
        { amount: 2, currency: "EUR" },
        { amount: 3, currency: "USD" },
      ],
      estimatedUsd: estimate.amount,
      estimatedSamples: 1,
      observedSamples: 2,
    });
    expect(stats.costs?.providers).toHaveLength(1);
    expect(stats.costs?.accounts).toHaveLength(2);
    expect(stats.costs?.pricing).toEqual([estimate.pricing]);
    const account = computeProfileTokenStats({
      utcOffsetMinutes: 0,
      provider: "claude:deleted",
      window: "7d",
    });
    expect(account.costs?.totals.tokens).toBe(660);
    expect(account.costs?.totals.observed).toEqual([{ amount: 2, currency: "EUR" }]);
    expect(account.costs?.days).toHaveLength(7);
    const otherDevice = computeProfileTokenStats({ utcOffsetMinutes: 0, deviceId: "another-host" });
    expect(otherDevice.costs?.totals.tokens).toBe(0);
  });

  it("buckets cost by the requested timezone and rejects future and out-of-range usage", () => {
    const ts = Date.now();
    dbAppendUsageEvents([
      {
        ts,
        kind: "tokens_v2",
        provider: "fixture",
        value: 100,
        costDetails: { version: 1, observed: { amount: 0, currency: "USD" } },
      },
      { ts: ts - 10 * 86_400_000, kind: "tokens", provider: "fixture", value: 500 },
      { ts: ts + 86_400_000, kind: "tokens_v2", provider: "fixture", value: 1000 },
    ]);
    const stats = computeProfileTokenStats({ utcOffsetMinutes: 840, window: "7d" });
    const day = new Date(ts + 840 * 60_000).toISOString().slice(0, 10);
    expect(stats.costs?.totals).toMatchObject({
      tokens: 100,
      unpricedTokens: 0,
      observedSamples: 1,
    });
    expect(stats.costs?.days.find((entry) => entry.day === day)?.totals.observed).toEqual([
      { amount: 0, currency: "USD" },
    ]);
    expect(stats.costs?.days).toHaveLength(7);
  });

  it("conserves disjoint tokens and separate money across every cost breakdown", () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const claude = {
      input: 1_000_000,
      output: 100_000,
      cacheRead: 500_000,
      cacheWrite: 1_000_000,
      cacheWrite1h: 400_000,
    };
    const codex = { input: 100_000, output: 10_000, cacheRead: 50_000, cacheWrite: 0 };
    dbAppendUsageEvents([
      {
        ts: now - 86_400_000,
        kind: "tokens_v2",
        provider: "claude:deleted",
        model: "claude-sonnet-4-6",
        value: 2_600_000,
        costDetails: {
          version: 1,
          model: "claude-sonnet-4-6",
          tokens: claude,
          estimate: historicalTokenEstimate("claude-sonnet-4-6", claude, now)!,
          observed: { amount: 2.5, currency: "EUR" },
        },
      },
      {
        ts: now,
        kind: "tokens_v2",
        provider: "codex:work",
        model: "gpt-5.3-codex",
        value: 160_000,
        costDetails: {
          version: 1,
          model: "gpt-5.3-codex",
          tokens: codex,
          estimate: historicalTokenEstimate("gpt-5.3-codex", codex, now)!,
        },
      },
      { ts: now, kind: "tokens", provider: "claude:deleted", value: 500 },
      {
        ts: now,
        kind: "tokens_v2",
        provider: "fixture:zero",
        value: 0,
        costDetails: { version: 1, observed: { amount: 0, currency: "USD" } },
      },
    ]);
    const stats = computeProfileTokenStats({ utcOffsetMinutes: 0, window: "7d" });
    const costs = stats.costs!;
    expect(stats.lifetimeTokens).toBe(2_760_500);
    expect(costs.totals).toMatchObject({
      tokens: 2_760_500,
      categorizedTokens: 2_760_000,
      unpricedTokens: 500,
      estimatedTokens: 2_760_000,
      observedTokens: 2_600_000,
      estimatedSamples: 2,
      observedSamples: 2,
      observed: [
        { amount: 2.5, currency: "EUR" },
        { amount: 0, currency: "USD" },
      ],
      categories: { input: 1_100_000, output: 110_000, cacheRead: 550_000, cacheWrite: 1_000_000 },
    });
    expect(costs.totals.estimatedUsd).toBeCloseTo(9.62375, 10);
    expect(
      (["input", "output", "cacheRead", "cacheWrite"] as const).reduce(
        (sum, key) => sum + costs.totals.categories[key],
        0,
      ),
    ).toBe(costs.totals.categorizedTokens);
    for (const entries of [costs.days, costs.providers, costs.models, costs.accounts]) {
      for (const field of [
        "tokens",
        "categorizedTokens",
        "unpricedTokens",
        "estimatedTokens",
        "observedTokens",
        "estimatedSamples",
        "observedSamples",
        "estimatedUsd",
      ] as const) {
        expect(entries.reduce((sum, entry) => sum + entry.totals[field], 0)).toBeCloseTo(
          costs.totals[field],
          10,
        );
      }
      for (const currency of ["EUR", "USD"]) {
        expect(
          entries.reduce(
            (sum, entry) =>
              sum +
              (entry.totals.observed.find((money) => money.currency === currency)?.amount ?? 0),
            0,
          ),
        ).toBe(costs.totals.observed.find((money) => money.currency === currency)!.amount);
      }
    }
    expect(
      computeProfileTokenStats({ utcOffsetMinutes: 0, provider: "claude:deleted", window: "7d" })
        .costs?.totals.tokens,
    ).toBe(2_600_500);
  });

  it("sums legacy tokens and exact tokens_v2 rows together", () => {
    const now = Date.now();
    dbAppendUsageEvents([
      { ts: now, kind: "tokens", provider: "claude", value: 100 },
      { ts: now, kind: "tokens_v2", provider: "claude", value: 25 },
      { ts: now, kind: "tokens_v2", provider: "codex", value: 50 },
      // Zero/negative deltas and unrelated kinds never reach the sums.
      { ts: now, kind: "tokens_v2", provider: "codex", value: 0 },
      { ts: now, kind: "turn", provider: "codex", value: 4000 },
    ]);

    const stats = computeProfileTokenStats({ utcOffsetMinutes: 0 });
    expect(stats.available).toBe(true);
    expect(stats.lifetimeTokens).toBe(175);
    expect(stats.providers.find((p) => p.provider === "claude")?.tokens).toBe(125);
    expect(stats.providers.find((p) => p.provider === "codex")?.tokens).toBe(50);
  });

  it("lists base providers with activity but no tokens_v2 rows as unavailable", () => {
    const now = Date.now();
    dbAppendUsageEvents([
      { ts: now, kind: "tokens_v2", provider: "claude", value: 10 },
      { ts: now, kind: "thread_started", provider: "claude" },
      { ts: now, kind: "thread_started", provider: "kimi" },
      { ts: now, kind: "turn", provider: "qwen", value: 5000 },
      // Account-scoped kinds fold to their base provider for the honesty list.
      { ts: now, kind: "turn", provider: "kimi:for-coding", value: 3000 },
      // A zero-value tokens_v2 row still proves exact coverage.
      { ts: now, kind: "thread_started", provider: "codex" },
      { ts: now, kind: "tokens_v2", provider: "codex", value: 0 },
    ]);

    const stats = computeProfileTokenStats({ utcOffsetMinutes: 0 });
    expect(stats.unavailableProviders).toEqual(["kimi", "qwen"]);
  });

  it("reports no unavailable providers when the log has no token rows", () => {
    dbAppendUsageEvents([{ ts: Date.now(), kind: "message", provider: "claude" }]);

    const stats = computeProfileTokenStats({ utcOffsetMinutes: 0 });
    expect(stats.available).toBe(false);
    expect(stats.lifetimeTokens).toBe(0);
    expect(stats.unavailableProviders).toEqual([]);
  });

  it("ignores activity from before the first exact (tokens_v2) row", () => {
    const now = Date.now();
    const day = 86_400_000;
    dbAppendUsageEvents([
      // Pre-ledger-era activity: qwen ran before any exact telemetry existed on
      // this device — not evidence of missing coverage.
      { ts: now - 10 * day, kind: "thread_started", provider: "qwen" },
      { ts: now - 10 * day, kind: "turn", provider: "qwen", value: 5000 },
      // Ledger era starts here.
      { ts: now - day, kind: "tokens_v2", provider: "claude", value: 10 },
      // kimi ran in the exact era but produced no exact rows.
      { ts: now, kind: "thread_started", provider: "kimi" },
    ]);

    const stats = computeProfileTokenStats({ utcOffsetMinutes: 0 });
    expect(stats.unavailableProviders).toEqual(["kimi"]);
  });
});
