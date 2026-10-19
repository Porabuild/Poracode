import { baseAgentKind, type RuntimeEvent } from "@/shared/contracts";
// Direct module imports (not the `../db` barrel): the runtime items writer
// calls this from inside its own transaction, and routing through the barrel
// would make that path cycle through `runtimeItems`.
import { dbGetThread } from "../db/projectsThreads";
import { dbAppendUsageEvents, type UsageEventInput } from "../db/usageEvents";
import { getSqlite } from "../db/connection";
import { historicalTokenEstimate } from "@poracode/agents-usage/historical-pricing";
import {
  usageCostRecordSchema,
  type UsageCostRecord,
  type UsageTokenCategories,
} from "@/shared/contracts/costHistory";

/**
 * Main-process token ledger: turns canonical `usage.spent` events into durable
 * `usage_events` rows (kind="tokens_v2"). Lives in main (not the renderer) so
 * recording works with the window closed and on headless hosts — every
 * supervisor event already routes through runtimePersistence on both.
 *
 * Semantics per `usageSpentSchema`:
 * - cumulative: counter state keyed by (base provider, scopeId, epoch) in
 *   `usage_token_ledger`. First sample establishes the baseline (counts 0,
 *   resume-safe) unless the adapter marks the scope `fresh` (baseline 0, first
 *   counter counts in full). Increases count the delta; equal/lower samples
 *   count 0 (out-of-order safe). Resets are signalled by an epoch bump, never
 *   inferred from a decrease.
 * - per-call: each sample sums directly, deduped exact-once by `sampleId` in
 *   `usage_token_samples` (replay-safe).
 *
 * The whole event batch — ledger-state updates, sample inserts, and the
 * usage_events append — commits in ONE sqlite transaction (dbAppendUsageEvents
 * nests via savepoint), so a crash can never count without persisting state or
 * vice versa.
 */

type UsageSpentEvent = Extract<RuntimeEvent, { type: "usage.spent" }>;

// Threads legitimately disappear (delete) while a supervisor stream is still
// flushing. Log a missing thread once per process, not per event.
const loggedMissingThreads = new Set<string>();

export function recordUsageSpentFromRuntimeEvents(
  threadId: string,
  events: readonly RuntimeEvent[],
): void {
  const spentEvents: UsageSpentEvent[] = [];
  for (const event of events) {
    if (event.type === "usage.spent") spentEvents.push(event);
  }
  if (spentEvents.length === 0) return;

  const thread = dbGetThread(threadId);
  if (!thread) {
    if (!loggedMissingThreads.has(threadId)) {
      loggedMissingThreads.add(threadId);
      console.warn(`[usage-ledger] skipping usage.spent for unknown thread ${threadId}`);
    }
    return;
  }
  // Full account-scoped kind (e.g. "claude:work"), matching existing
  // usage_events conventions; the global rollup folds to the base provider.
  const provider = thread.agentKind;

  const sqlite = getSqlite();
  const readLedger = sqlite.prepare(
    `SELECT last_counter, cost_details FROM usage_token_ledger
     WHERE scope_id = ? AND epoch = ?
       AND (provider = ? OR substr(provider, 1, instr(provider, ':') - 1) = ?)
     ORDER BY last_counter DESC`,
  );
  const writeLedger = sqlite.prepare(
    `INSERT INTO usage_token_ledger (provider, scope_id, epoch, last_counter, cost_details) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider, scope_id, epoch) DO UPDATE SET last_counter = excluded.last_counter, cost_details = excluded.cost_details`,
  );
  const insertSample = sqlite.prepare(
    "INSERT OR IGNORE INTO usage_token_samples (sample_id, ts) VALUES (?, ?)",
  );

  sqlite
    .transaction(() => {
      const rows: UsageEventInput[] = [];
      for (const event of spentEvents) {
        const usage = event.usage;
        const ts = usage.occurredAt ?? Date.now();
        let amount = 0;
        let tokens = usage.tokens;
        let observed = usage.cost;
        if (usage.counterKind === "cumulative") {
          // Keep old account-keyed baselines, but share the high-water mark when
          // the same provider session is imported through a second account alias.
          const base = baseAgentKind(provider);
          const baselines = readLedger.all(usage.scopeId, usage.epoch, base, base) as Array<{
            last_counter: number;
            cost_details: string | null;
          }>;
          const existing = baselines[0];
          if (!existing) {
            writeLedger.run(
              provider,
              usage.scopeId,
              usage.epoch,
              usage.counter,
              JSON.stringify({ version: 1, tokens, observed }),
            );
            amount = usage.fresh === true ? usage.counter : 0;
          } else {
            const delta = usage.counter - existing.last_counter;
            if (delta > 0) {
              const metadata = baselines.map(({ cost_details }) =>
                cost_details
                  ? usageCostRecordSchema.safeParse(JSON.parse(cost_details))
                  : undefined,
              );
              // A future alias may own the write target or an accounting basis below the maximum.
              if (metadata.some((parsed) => parsed && !parsed.success)) continue;
              const parsed = metadata[0];
              const previous = parsed?.success ? parsed.data : undefined;
              tokens = tokenDelta(usage.tokens, previous?.tokens);
              observed =
                usage.cost &&
                previous?.observed &&
                usage.cost.currency === previous.observed.currency &&
                usage.cost.amount >= previous.observed.amount
                  ? {
                      currency: usage.cost.currency,
                      amount: usage.cost.amount - previous.observed.amount,
                    }
                  : undefined;
              writeLedger.run(
                provider,
                usage.scopeId,
                usage.epoch,
                usage.counter,
                JSON.stringify({ version: 1, tokens: usage.tokens, observed: usage.cost }),
              );
              amount = delta;
            }
            // Equal/out-of-order samples count nothing and leave state untouched.
          }
        } else {
          // per-call: counted only when the dedup insert actually happened.
          const inserted = insertSample.run(usage.sampleId, ts);
          if (inserted.changes !== 1) continue;
          amount = usage.counter;
        }
        if (amount < 0 || (amount === 0 && (usage.counterKind === "cumulative" || !observed)))
          continue;
        // Categories are useful for pricing only when they reconcile to the admitted
        // token delta. Older baselines and incomplete/upstream mixed counters stay unknown.
        if (
          tokens &&
          tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite !== amount
        ) {
          tokens = undefined;
        }
        const model = usage.model ?? thread.config.model ?? null;
        // Selected thread settings do not prove which model served a child call.
        const estimate = tokens ? historicalTokenEstimate(usage.model, tokens, ts) : undefined;
        const costDetails: UsageCostRecord = {
          version: 1,
          ...(usage.model ? { model: usage.model } : {}),
          ...(tokens ? { tokens } : {}),
          ...(observed ? { observed } : {}),
          ...(estimate ? { estimate } : {}),
        };
        rows.push({
          ts,
          kind: "tokens_v2",
          provider,
          model,
          value: amount,
          costDetails,
        });
      }
      dbAppendUsageEvents(rows);
    })
    .immediate();
}

function tokenDelta(
  current: UsageTokenCategories | undefined,
  previous: UsageTokenCategories | undefined,
): UsageTokenCategories | undefined {
  if (!current || !previous) return undefined;
  const delta: UsageTokenCategories = {
    input: current.input - previous.input,
    output: current.output - previous.output,
    cacheRead: current.cacheRead - previous.cacheRead,
    cacheWrite: current.cacheWrite - previous.cacheWrite,
    ...(current.cacheWrite1h !== undefined && previous.cacheWrite1h !== undefined
      ? { cacheWrite1h: current.cacheWrite1h - previous.cacheWrite1h }
      : {}),
  };
  return Object.values(delta).some((value) => value !== undefined && value < 0) ? undefined : delta;
}
