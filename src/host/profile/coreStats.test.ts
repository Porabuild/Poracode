import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "../db/connection";
import { dbAppendUsageEvents, dbQueryUsageEventsBounds } from "../db/usageEvents";
import { computeProfileCoreStats } from "./coreStats";
import { setProfileIdentity } from "./identity";
import { getProfileCoreStats, getProfileTokenStats } from "./index";

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

describe("computeProfileCoreStats (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "lc-corestats-test-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("seeks usage bounds without scanning historical events", () => {
    const sqlite = getSqlite();
    const prepare = vi.spyOn(sqlite, "prepare");
    expect(dbQueryUsageEventsBounds()).toEqual({ minId: 0, maxId: 0 });
    const boundsSql = prepare.mock.calls[0]![0];
    const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${boundsSql}`).all() as { detail: string }[];
    expect(plan.filter((row) => row.detail.includes("SEARCH usage_events"))).toHaveLength(2);
    expect(plan.some((row) => row.detail.includes("SCAN usage_events"))).toBe(false);
  });

  it("reuses completed results across clients with different timezones", async () => {
    dbAppendUsageEvents([{ ts: Date.now(), kind: "turn", provider: "codex", value: 1000 }]);
    const requests = [{ utcOffsetMinutes: 0 }, { utcOffsetMinutes: 120 }];
    for (const req of requests) {
      await getProfileCoreStats(req);
      await getProfileTokenStats(req);
    }
    const prepare = vi.spyOn(getSqlite(), "prepare");
    for (const req of requests) {
      await getProfileCoreStats(req);
      await getProfileTokenStats(req);
    }
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("FROM usage_events"))).toBe(
      false,
    );
  });

  it("streams core activity without reading cost_details or scanning token payloads", () => {
    const now = Date.parse("2026-10-17T14:30:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const day = 86_400_000;

    dbAppendUsageEvents([
      { ts: now - 2 * day, kind: "thread_started", provider: "claude:work", mode: "chat" },
      { ts: now - day, kind: "thread_started", provider: "codex:personal", mode: "cli" },
      {
        ts: now - 2 * day,
        kind: "turn",
        provider: "claude:work",
        model: "claude-sonnet-4-6",
        fast: true,
        effort: "high",
        value: 12_000,
      },
      {
        ts: now - day,
        kind: "turn",
        provider: "claude:work",
        model: "claude-sonnet-4-6",
        fast: false,
        effort: "medium",
        value: 45_000,
      },
      {
        ts: now,
        kind: "turn",
        provider: "codex:personal",
        model: "gpt-5.3-codex",
        fast: true,
        effort: "high",
        value: 30_000,
      },
      { ts: now, kind: "message", provider: "claude:work" },
      { ts: now, kind: "goal", provider: "claude:work" },
      { ts: now, kind: "skill", provider: "claude:work", name: "verify" },
      { ts: now, kind: "skill", provider: "claude:work", name: "skill" },
      { ts: now, kind: "workflow", provider: "claude:work" },
      { ts: now, kind: "subagent", provider: "claude:work", name: "workflow" },
      { ts: now, kind: "subagent", provider: "claude:work", name: "explorer" },
      { ts: now, kind: "mcp", provider: "claude:work", name: "mcp_tool_call" },
      { ts: now, kind: "mcp", provider: "claude:work", name: "codex_apps" },
      { ts: now, kind: "mcp", provider: "claude:work", name: "github" },
      { ts: now, kind: "ai_commit", provider: "claude:work", model: "claude-sonnet-4-6" },
      { ts: now, kind: "ai_pr", provider: "codex:personal", model: "gpt-5.3-codex" },
    ]);

    // Insert token rows directly (including broken cost_details JSON) to verify
    // coreStats never selects or parses cost_details while still counting account frequency.
    const sqlite = getSqlite();
    sqlite
      .prepare(
        "INSERT INTO usage_events (ts, kind, provider, model, mode, fast, effort, name, value, cost_details) VALUES (?, ?, ?, ?, NULL, 0, NULL, NULL, ?, ?)",
      )
      .run(now, "tokens_v2", "token-only:acct", "model-x", 99_999, "{corrupt-cost-json");

    const prepare = vi.spyOn(sqlite, "prepare");
    const parseSpy = vi.spyOn(JSON, "parse");

    const stats = computeProfileCoreStats({ utcOffsetMinutes: 0, window: "7d" });

    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("cost_details"))).toBe(false);
    expect(parseSpy).not.toHaveBeenCalled();

    expect(stats.totals).toEqual({
      totalThreads: 2,
      totalPrompts: 3,
      messagesSent: 1,
      goalsSet: 1,
      longestTaskMs: 45_000,
      currentStreakDays: 3,
      longestStreakDays: 3,
      activeDays: 3,
    });
    expect(stats.modes.map((entry) => [entry.key, entry.count])).toEqual([
      ["chat", 1],
      ["cli", 1],
    ]);
    expect(stats.insights).toMatchObject({
      fastModePercent: 66.7,
      skillsExplored: 1,
      totalSkillsUsed: 1,
      workflowRuns: 2,
      subagentRuns: 1,
      mcpToolCalls: 2,
      mostActiveHour: { hour: 14, label: "2 PM", count: 3 },
    });
    expect(stats.insights.topReasoning?.key).toBe("high");
    expect(stats.skills.map((entry) => [entry.name, entry.runCount])).toEqual([["verify", 1]]);
    expect(stats.mcps.map((entry) => [entry.name, entry.runCount])).toEqual([["github", 1]]);
    expect(stats.aiActions.map((entry) => [entry.type, entry.count])).toEqual([
      ["commit", 1],
      ["pr", 1],
    ]);
    expect(stats.availableAccounts.map((entry) => entry.key)).toEqual([
      "claude:work",
      "codex:personal",
      "token-only:acct",
    ]);

    // Account filter scopes totals without collapsing availableAccounts.
    const filtered = computeProfileCoreStats({
      utcOffsetMinutes: 0,
      provider: "codex:personal",
      window: "7d",
    });
    expect(filtered.totals.totalThreads).toBe(1);
    expect(filtered.totals.totalPrompts).toBe(1);
    expect(filtered.availableAccounts.map((entry) => entry.key)).toEqual([
      "claude:work",
      "codex:personal",
      "token-only:acct",
    ]);
  });

  it("updates incrementally on new usage_events without rescanning historical rows or on identity edits", async () => {
    const now = Date.parse("2026-10-17T14:30:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);

    dbAppendUsageEvents([
      { ts: now, kind: "thread_started", provider: "claude:work", mode: "chat" },
      { ts: now, kind: "turn", provider: "claude:work", model: "claude-sonnet-4-6", value: 1000 },
      {
        ts: now,
        kind: "tokens_v2",
        provider: "claude:work",
        model: "claude-sonnet-4-6",
        value: 500,
      },
    ]);

    const first = await getProfileCoreStats({ utcOffsetMinutes: 0, window: "7d" });
    expect(first.totals.totalPrompts).toBe(1);
    const firstTokens = await getProfileTokenStats({ utcOffsetMinutes: 0, window: "7d" });
    expect(firstTokens.lifetimeTokens).toBe(500);

    // Edit identity — must update without re-scanning usage_events.
    const prepare = vi.spyOn(getSqlite(), "prepare");
    setProfileIdentity({
      name: "Grace Hopper",
      handle: "grace",
      avatarColor: "oklch(0.6 0.14 295)",
    });
    const afterIdentity = await getProfileCoreStats({ utcOffsetMinutes: 0, window: "7d" });
    expect(afterIdentity.identity.name).toBe("Grace Hopper");
    expect(afterIdentity.totals.totalPrompts).toBe(1);
    expect(
      prepare.mock.calls.some(([sql]) => String(sql).includes("usage_events WHERE id <=")),
    ).toBe(false);

    // Append incremental events — only reads id > lastRowId.
    prepare.mockClear();
    dbAppendUsageEvents([
      { ts: now, kind: "turn", provider: "codex:personal", model: "gpt-5.3-codex", value: 2000 },
      {
        ts: now,
        kind: "tokens_v2",
        provider: "codex:personal",
        model: "gpt-5.3-codex",
        value: 700,
      },
    ]);
    const second = await getProfileCoreStats({ utcOffsetMinutes: 0, window: "7d" });
    const secondTokens = await getProfileTokenStats({ utcOffsetMinutes: 0, window: "7d" });

    expect(second.totals.totalPrompts).toBe(2);
    expect(second.availableAccounts.map((a) => a.key)).toEqual(["claude:work", "codex:personal"]);
    expect(secondTokens.lifetimeTokens).toBe(1200);
    expect(
      prepare.mock.calls.some(([sql]) => String(sql).includes("WHERE id > ? AND id <= ?")),
    ).toBe(true);
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("WHERE id <= ?"))).toBe(false);
  });
});
