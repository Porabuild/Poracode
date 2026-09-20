import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent, Thread, UsageSpent } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "../db/connection";
import { dbUpsertProject, dbUpsertThread } from "../db/projectsThreads";
import { recordUsageSpentFromRuntimeEvents } from "./usageLedger";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBindingEnv: string | undefined;
let sqliteAvailable = true;
try {
  new Database(":memory:").close();
} catch {
  if (existsSync(serverNativeBinding)) {
    nativeBindingEnv = serverNativeBinding;
  } else {
    sqliteAvailable = false;
  }
}

const THREAD_ID = "thread-1";

function testThread(): Thread {
  return {
    id: THREAD_ID,
    projectId: "project-1",
    title: "Usage ledger",
    // Account-scoped kind on purpose: the ledger must keep the full kind so
    // different profiles of one provider are counted separately.
    agentKind: "claude:work",
    config: { model: "claude-sonnet-4" },
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

let seq = 0;
function spent(usage: Partial<UsageSpent> & { counter: number }): RuntimeEvent {
  seq += 1;
  return {
    type: "usage.spent",
    threadId: THREAD_ID,
    usage: {
      counterKind: "cumulative",
      scopeId: "scope-1",
      epoch: 0,
      sampleId: `sample-${seq}`,
      ...usage,
    },
  };
}

interface TokenRow {
  ts: number;
  kind: string;
  provider: string | null;
  model: string | null;
  value: number;
}

// Read rows straight from sqlite: dbGetAllUsageEvents caches on the (process-
// global) profile generation, which is not reset between this file's tests.
function tokenRows(): TokenRow[] {
  return getSqlite()
    .prepare("SELECT ts, kind, provider, model, value FROM usage_events ORDER BY id")
    .all() as TokenRow[];
}

function ledgerCounter(scopeId: string, epoch: number): number | undefined {
  const row = getSqlite()
    .prepare(
      "SELECT last_counter FROM usage_token_ledger WHERE provider = 'claude:work' AND scope_id = ? AND epoch = ?",
    )
    .get(scopeId, epoch) as { last_counter: number } | undefined;
  return row?.last_counter;
}

function sampleCount(): number {
  const row = getSqlite().prepare("SELECT COUNT(*) AS n FROM usage_token_samples").get() as {
    n: number;
  };
  return row.n;
}

describe.skipIf(!sqliteAvailable)("usageLedger (real sqlite round-trip)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    seq = 0;
    dir = mkdtempSync(join(tmpdir(), "poracode-usage-ledger-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    vi.restoreAllMocks();
  });

  it("counts the full first value for a fresh cumulative scope", () => {
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({ counter: 1200, fresh: true, occurredAt: 1000 }),
    ]);

    expect(tokenRows()).toEqual([
      {
        ts: 1000,
        kind: "tokens_v2",
        provider: "claude:work",
        model: "claude-sonnet-4",
        value: 1200,
      },
    ]);
    expect(ledgerCounter("scope-1", 0)).toBe(1200);
  });

  it("establishes a zero baseline for a non-fresh first sample (resume-safe)", () => {
    // A resumed scope's first counter reflects already-counted history, so it
    // only establishes the baseline; genuine growth after it counts the delta.
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 5000 })]);
    expect(tokenRows()).toEqual([]);
    expect(ledgerCounter("scope-1", 0)).toBe(5000);

    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 5200 })]);
    expect(tokenRows().map((row) => row.value)).toEqual([200]);
  });

  it("counts increases, and counts nothing for equal or decreased counters", () => {
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 1000, fresh: true })]);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 1600 })]); // +600
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 1600 })]); // equal: 0
    // Decrease: no reset heuristic — out-of-order/replayed samples count 0 and
    // the high-water mark stays, so the next increase is measured from 1600.
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 900 })]);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 1700 })]); // +100

    expect(tokenRows().map((row) => row.value)).toEqual([1000, 600, 100]);
    expect(ledgerCounter("scope-1", 0)).toBe(1700);
  });

  it("starts a fresh baseline when the epoch bumps for the same scope", () => {
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 1000, fresh: true })]);
    // New epoch, non-fresh: first sample in the new epoch is baseline-only
    // even though it is lower than the previous epoch's counter.
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 300, epoch: 1 })]);
    expect(tokenRows().map((row) => row.value)).toEqual([1000]);
    expect(ledgerCounter("scope-1", 1)).toBe(300);

    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 450, epoch: 1 })]);
    expect(tokenRows().map((row) => row.value)).toEqual([1000, 150]);
  });

  it("sums per-call samples and ignores replayed sample ids", () => {
    const batch = [
      spent({ counterKind: "per-call", counter: 100, sampleId: "call-1" }),
      spent({ counterKind: "per-call", counter: 200, sampleId: "call-2" }),
    ];
    recordUsageSpentFromRuntimeEvents(THREAD_ID, batch);
    // A replay of the same batch (e.g. after a resume) must count nothing.
    recordUsageSpentFromRuntimeEvents(THREAD_ID, batch);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({ counterKind: "per-call", counter: 50, sampleId: "call-3" }),
    ]);

    expect(tokenRows().map((row) => row.value)).toEqual([100, 200, 50]);
    expect(sampleCount()).toBe(3);
  });

  it("commits a mixed batch together and ignores non-usage events", () => {
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({
        counter: 800,
        fresh: true,
        scopeId: "scope-a",
        occurredAt: 5000,
        model: "claude-opus-4",
      }),
      spent({
        counterKind: "per-call",
        counter: 120,
        scopeId: "scope-b",
        sampleId: "call-x",
        occurredAt: 5001,
      }),
      {
        type: "item.started",
        threadId: THREAD_ID,
        itemId: "item-1",
        itemType: "assistant_message",
      },
      { type: "context.updated", threadId: THREAD_ID, usage: { usedTokens: 9999 } },
    ]);

    // Event-level model wins; without it the row falls back to the thread model.
    expect(tokenRows()).toEqual([
      {
        ts: 5000,
        kind: "tokens_v2",
        provider: "claude:work",
        model: "claude-opus-4",
        value: 800,
      },
      {
        ts: 5001,
        kind: "tokens_v2",
        provider: "claude:work",
        model: "claude-sonnet-4",
        value: 120,
      },
    ]);
    // Ledger state, dedup samples, and rows all committed from the one batch.
    expect(ledgerCounter("scope-a", 0)).toBe(800);
    expect(sampleCount()).toBe(1);
  });

  it("falls back to Date.now when occurredAt is absent", () => {
    vi.spyOn(Date, "now").mockReturnValue(42000);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 64, fresh: true })]);

    expect(tokenRows().map((row) => row.ts)).toEqual([42000]);
  });

  it("skips events for an unknown thread without throwing", () => {
    expect(() =>
      recordUsageSpentFromRuntimeEvents("missing-thread", [spent({ counter: 100, fresh: true })]),
    ).not.toThrow();

    expect(tokenRows()).toEqual([]);
    expect(sampleCount()).toBe(0);
  });
});
