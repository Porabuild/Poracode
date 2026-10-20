import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent, Thread, UsageSpent } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "../db/connection";
import { dbUpsertProject, dbUpsertThread } from "../db/projectsThreads";
import { recordUsageSpentFromRuntimeEvents } from "./usageLedger";
import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import { createClaudeUsageSpentEvent } from "@/supervisor/agents/claude/canonicalMapping/usageSpent";
import { createCodexUsageSpentEvent } from "@/supervisor/agents/codex/canonicalMapping/usage";
import { computeProfileTokenStats } from "./tokenStats";
import { dbGetAllUsageEvents } from "../db/usageEvents";

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

  it("retains category and price provenance exactly once across replayed account aliases", () => {
    const event = spent({
      counterKind: "per-call",
      counter: 160,
      sampleId: "cost-call",
      model: "claude-sonnet-4-6",
      occurredAt: Date.parse("2026-10-16T12:00:00Z"),
      tokens: { input: 100, output: 10, cacheRead: 50, cacheWrite: 0 },
      cost: { amount: 0.005, currency: "EUR" },
    });
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [event]);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [event]);
    dbUpsertThread({ ...testThread(), agentKind: "claude:other" }, 0);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [event]);
    const rows = dbGetAllUsageEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "claude:work",
      value: 160,
      costDetails: {
        version: 1,
        tokens: { input: 100, output: 10, cacheRead: 50, cacheWrite: 0 },
        observed: { amount: 0.005, currency: "EUR" },
        estimate: {
          amount: 0.000465,
          pricing: { model: "claude-sonnet-4-6", reviewedAt: "2026-10-16" },
        },
      },
    });
  });

  it("preserves independently calculated API costs from native counters through SQLite reopen", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-19T12:00:00Z"));
    const native = {
      type: "assistant",
      uuid: "native-cost",
      request_id: "request-cost",
      message: {
        id: "msg-cost",
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 100_000,
          output_tokens: 10_000,
          cache_read_input_tokens: 50_000,
          cache_creation_input_tokens: 20_000,
          cache_creation: { ephemeral_1h_input_tokens: 5_000, ephemeral_5m_input_tokens: 15_000 },
          output_tokens_details: { thinking_tokens: 6_000 },
        },
      },
    } as unknown as SDKAssistantMessage;
    const claude = createClaudeUsageSpentEvent(THREAD_ID, native, {
      scopeId: "native-claude",
      epoch: 0,
      fresh: true,
    })!;
    if (claude.type !== "usage.spent") throw new Error("Expected usage sample");
    claude.usage.cost = { amount: 2.5, currency: "EUR" };
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [claude, claude]);
    const partial = createClaudeUsageSpentEvent(
      THREAD_ID,
      {
        ...native,
        uuid: "partial",
        request_id: "partial-request",
        message: {
          ...native.message,
          id: "partial",
          usage: {
            input_tokens: 100,
            output_tokens: 10,
            cache_read_input_tokens: 50,
          },
        },
      } as unknown as SDKAssistantMessage,
      { scopeId: "native-claude", epoch: 0 },
    )!;
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [partial]);
    const codexThread = "codex-cost";
    dbUpsertThread({ ...testThread(), id: codexThread, agentKind: "codex:work" }, 0);
    for (const [input, cached, output, reasoning, fresh] of [
      [160_000, 50_000, 20_000, 12_000, true],
      [190_000, 60_000, 25_000, 16_000, false],
    ] as const) {
      const event = createCodexUsageSpentEvent(
        codexThread,
        {
          tokenUsage: {
            total: {
              inputTokens: input,
              cachedInputTokens: cached,
              outputTokens: output,
              reasoningOutputTokens: reasoning,
              totalTokens: input + output,
            },
          },
        },
        { scopeId: "native-codex", epoch: 0, fresh, model: "gpt-5.3-codex" },
      )!;
      recordUsageSpentFromRuntimeEvents(codexThread, [event, event]);
    }
    const readSaved = () =>
      getSqlite().prepare("SELECT cost_details FROM usage_events ORDER BY id").all();
    const saved = readSaved();
    const rows = dbGetAllUsageEvents();
    expect(rows.map((row) => row.value)).toEqual([180_000, 160, 180_000, 35_000]);
    expect(rows[0]?.costDetails?.estimate?.amount).toBeCloseTo(0.55125, 12);
    expect(rows[1]?.costDetails).toEqual({ version: 1, model: "claude-sonnet-4-6" });
    expect(rows[2]?.costDetails?.estimate?.amount).toBeCloseTo(0.48125, 12);
    expect(rows[3]?.costDetails?.estimate?.amount).toBeCloseTo(0.10675, 12);
    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));
    expect(readSaved()).toEqual(saved);
    const costs = computeProfileTokenStats({ utcOffsetMinutes: 0, window: "7d" }).costs!;
    expect(costs.totals).toMatchObject({
      tokens: 395_160,
      estimatedTokens: 395_000,
      unpricedTokens: 160,
      estimatedSamples: 3,
      observedSamples: 1,
      observed: [{ currency: "EUR", amount: 2.5 }],
    });
    expect(costs.totals.estimatedUsd).toBeCloseTo(1.13925, 12);
    for (const entries of [costs.days, costs.providers, costs.models, costs.accounts]) {
      expect(entries.reduce((sum, entry) => sum + entry.totals.estimatedUsd, 0)).toBeCloseTo(
        1.13925,
        12,
      );
      expect(entries.reduce((sum, entry) => sum + entry.totals.tokens, 0)).toBe(395_160);
    }
  });

  it("does not invent categories or cost for a pre-upgrade cumulative baseline", () => {
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 100, fresh: true })]);
    const current = { input: 150, output: 50, cacheRead: 0, cacheWrite: 0 };
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({ counter: 200, tokens: current, cost: { amount: 5, currency: "USD" } }),
    ]);
    expect(dbGetAllUsageEvents()[1]?.costDetails).toEqual({ version: 1 });
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({
        counter: 240,
        tokens: { ...current, input: 180, output: 60 },
        cost: { amount: 6, currency: "USD" },
      }),
    ]);
    expect(dbGetAllUsageEvents()[2]?.costDetails).toMatchObject({
      tokens: { input: 30, output: 10, cacheRead: 0, cacheWrite: 0 },
      observed: { amount: 1, currency: "USD" },
    });
  });

  it("leaves inconsistent categories unpriced and never differences currencies", () => {
    const initial = { input: 100, output: 0, cacheRead: 0, cacheWrite: 0 };
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({ counter: 100, fresh: true, tokens: initial, cost: { amount: 5, currency: "USD" } }),
    ]);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({
        counter: 150,
        tokens: { ...initial, input: 110 },
        cost: { amount: 6, currency: "EUR" },
      }),
    ]);
    expect(dbGetAllUsageEvents()[1]?.costDetails).toEqual({ version: 1 });
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 140, tokens: initial })]);
    expect(dbGetAllUsageEvents()).toHaveLength(2);
  });

  it("refuses future ledger metadata without changing its counter or persisted bytes", () => {
    const metadata = JSON.stringify({ version: 2, unknown: true });
    getSqlite()
      .prepare(
        "INSERT INTO usage_token_ledger (provider,scope_id,epoch,last_counter,cost_details) VALUES (?,?,?,?,?)",
      )
      .run("claude:work", "scope-1", 0, 100, metadata);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({
        counter: 150,
        tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
        cost: { amount: 6, currency: "USD" },
      }),
    ]);
    expect(tokenRows()).toEqual([]);
    expect(ledgerCounter("scope-1", 0)).toBe(100);
    expect(getSqlite().prepare("SELECT cost_details FROM usage_token_ledger").get()).toEqual({
      cost_details: metadata,
    });
  });

  it.each([
    { current: 100, alias: 200, future: "claude:work" },
    { current: 200, alias: 100, future: "claude:work" },
    { current: 200, alias: 200, future: "claude:work" },
    { current: 100, alias: 200, future: "claude:alias" },
    { current: 200, alias: 100, future: "claude:alias" },
    { current: 200, alias: 200, future: "claude:alias" },
  ])(
    "fences future $future metadata across alias counters $current/$alias",
    ({ current, alias, future }) => {
      const metadata = '{ "version": 2, "unknown": true }';
      const insert = getSqlite().prepare(
        "INSERT INTO usage_token_ledger (provider,scope_id,epoch,last_counter,cost_details) VALUES (?,?,?,?,?)",
      );
      for (const [provider, counter] of [
        ["claude:alias", alias],
        ["claude:work", current],
      ] as const) {
        insert.run(
          provider,
          "scope-1",
          0,
          counter,
          provider === future ? metadata : '{"version":1}',
        );
      }
      const read = getSqlite().prepare(
        "SELECT provider,last_counter,cost_details FROM usage_token_ledger ORDER BY provider",
      );
      const before = read.all();
      recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 250 })]);
      expect(read.all()).toEqual(before);
      expect(tokenRows()).toEqual([]);
    },
  );

  it("keeps future metadata fences scoped to the provider session and epoch", () => {
    const insert = getSqlite().prepare(
      "INSERT INTO usage_token_ledger (provider,scope_id,epoch,last_counter,cost_details) VALUES (?,?,?,?,?)",
    );
    const metadata = '{"version":2,"unknown":true}';
    insert.run("claude:alias", "scope-1", 1, 999, metadata);
    insert.run("claude:alias", "other-scope", 0, 999, metadata);
    insert.run("fixture:alias", "scope-1", 0, 999, metadata);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 100, fresh: true })]);
    dbUpsertThread({ ...testThread(), agentKind: "claude:alias" }, 0);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 120 })]);
    expect(tokenRows().map((row) => row.value)).toEqual([100, 20]);
    expect(
      getSqlite()
        .prepare("SELECT cost_details FROM usage_token_ledger WHERE last_counter = 999")
        .all(),
    ).toEqual([{ cost_details: metadata }, { cost_details: metadata }, { cost_details: metadata }]);
  });

  it.each([0, 1.25])(
    "retains a zero-token per-call observation of %s exactly once across aliases",
    (amount) => {
      const event = spent({
        counterKind: "per-call",
        counter: 0,
        sampleId: "zero-token-call",
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        cost: { amount, currency: "USD" },
      });
      recordUsageSpentFromRuntimeEvents(THREAD_ID, [event]);
      recordUsageSpentFromRuntimeEvents(THREAD_ID, [event]);
      dbUpsertThread({ ...testThread(), agentKind: "claude:alias" }, 0);
      recordUsageSpentFromRuntimeEvents(THREAD_ID, [event]);
      expect(sampleCount()).toBe(1);
      expect(dbGetAllUsageEvents()).toHaveLength(1);
      expect(dbGetAllUsageEvents()[0]).toMatchObject({
        provider: "claude:work",
        value: 0,
        costDetails: {
          version: 1,
          observed: { amount, currency: "USD" },
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
      });
    },
  );

  it("does not invent zero costs or admit monetary-only cumulative updates", () => {
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({ counterKind: "per-call", counter: 0, sampleId: "missing-cost" }),
      spent({ counter: 0, fresh: true, cost: { amount: 0, currency: "USD" } }),
      spent({ counter: 0, cost: { amount: 5, currency: "USD" } }),
    ]);
    expect(tokenRows()).toEqual([]);
    expect(sampleCount()).toBe(1);
    expect(ledgerCounter("scope-1", 0)).toBe(0);
  });

  it("never prices a call with unknown model using the parent thread's selected model", () => {
    dbUpsertThread({ ...testThread(), config: { model: "gpt-5.3-codex" } }, 0);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({
        counterKind: "per-call",
        counter: 1000,
        tokens: { input: 900, output: 100, cacheRead: 0, cacheWrite: 0 },
        occurredAt: Date.parse("2026-10-16T12:00:00Z"),
      }),
    ]);
    expect(dbGetAllUsageEvents()[0]?.costDetails?.estimate).toBeUndefined();
    expect(dbGetAllUsageEvents()[0]?.costDetails?.model).toBeUndefined();
  });

  it("deduplicates a cumulative provider session imported under another account alias", () => {
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 100, fresh: true })]);
    dbUpsertThread({ ...testThread(), agentKind: "claude:alias" }, 0);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 100, fresh: true })]);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [spent({ counter: 140 })]);
    expect(tokenRows().map((row) => [row.provider, row.value])).toEqual([
      ["claude:work", 100],
      ["claude:alias", 40],
    ]);
  });

  it("preserves an older cumulative baseline when a producer starts reporting per-call samples", () => {
    dbUpsertThread(
      { ...testThread(), agentKind: "fixture:work", config: { model: "fixture-model" } },
      0,
    );
    recordUsageSpentFromRuntimeEvents(THREAD_ID, [
      spent({ counter: 1200, fresh: true, sampleId: "scope-1:0:1200" }),
    ]);
    const newCalls = [
      spent({ counterKind: "per-call", counter: 1200, sampleId: "acp-prompt-v1:scope-1:0:turn-a" }),
      spent({ counterKind: "per-call", counter: 900, sampleId: "acp-prompt-v1:scope-1:0:turn-b" }),
    ];
    recordUsageSpentFromRuntimeEvents(THREAD_ID, newCalls);
    recordUsageSpentFromRuntimeEvents(THREAD_ID, newCalls);
    expect(tokenRows().map((row) => row.value)).toEqual([1200, 1200, 900]);
    expect(sampleCount()).toBe(2);
    const oldBaseline = getSqlite()
      .prepare(
        "SELECT last_counter FROM usage_token_ledger WHERE provider = ? AND scope_id = ? AND epoch = ?",
      )
      .get("fixture:work", "scope-1", 0) as { last_counter: number };
    expect(oldBaseline.last_counter).toBe(1200);
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
