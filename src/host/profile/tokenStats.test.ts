import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "../db/connection";
import { dbAppendUsageEvents } from "../db/usageEvents";
import { computeProfileTokenStats } from "./tokenStats";

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
