import type { RuntimeEvent } from "@/shared/contracts";
import { dbAppendUsageEvents, dbGetThread } from "../db";
import { getSqlite } from "../db/connection";
import type { UsageEventInput } from "../db/usageEvents";

/**
 * Main-process token ledger: turns canonical `usage.spent` events into durable
 * `usage_events` rows (kind="tokens_v2"). Lives in main (not the renderer) so
 * recording works with the window closed and on headless hosts — every
 * supervisor event already routes through runtimePersistence on both.
 *
 * Semantics per `usageSpentSchema`:
 * - cumulative: counter state keyed by (provider, scopeId, epoch) in
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
    "SELECT last_counter FROM usage_token_ledger WHERE provider = ? AND scope_id = ? AND epoch = ?",
  );
  const writeLedger = sqlite.prepare(
    `INSERT INTO usage_token_ledger (provider, scope_id, epoch, last_counter) VALUES (?, ?, ?, ?)
     ON CONFLICT(provider, scope_id, epoch) DO UPDATE SET last_counter = excluded.last_counter`,
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
        if (usage.counterKind === "cumulative") {
          const existing = readLedger.get(provider, usage.scopeId, usage.epoch) as
            | { last_counter: number }
            | undefined;
          if (!existing) {
            writeLedger.run(provider, usage.scopeId, usage.epoch, usage.counter);
            amount = usage.fresh === true ? usage.counter : 0;
          } else {
            const delta = usage.counter - existing.last_counter;
            if (delta > 0) {
              writeLedger.run(provider, usage.scopeId, usage.epoch, usage.counter);
              amount = delta;
            }
            // Equal/out-of-order samples count nothing and leave state untouched.
          }
        } else {
          // per-call: counted only when the dedup insert actually happened.
          const inserted = insertSample.run(usage.sampleId, ts);
          amount = inserted.changes === 1 ? usage.counter : 0;
        }
        if (amount <= 0) continue;
        rows.push({
          ts,
          kind: "tokens_v2",
          provider,
          model: usage.model ?? thread.config.model ?? null,
          value: amount,
        });
      }
      dbAppendUsageEvents(rows);
    })
    .immediate();
}
