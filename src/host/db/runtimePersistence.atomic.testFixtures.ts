import type { RuntimeEvent } from "@/shared/contracts";
import { getSqlite } from "./connection";

export function started(threadId: string, itemId = "item"): RuntimeEvent {
  return { type: "item.started", threadId, itemId, itemType: "assistant_message" };
}

export function delta(threadId: string, text: string, itemId = "item"): RuntimeEvent {
  return { type: "content.delta", threadId, itemId, stream: "assistant_text", delta: text };
}

export function eventsWithUsage(threadId: string): RuntimeEvent[] {
  return [
    started(threadId),
    delta(threadId, "x".repeat(40_000)),
    delta(threadId, ":tail"),
    { type: "context.updated", threadId, usage: { usedTokens: 30, maxTokens: 100 } },
    {
      type: "usage.spent",
      threadId,
      usage: {
        counterKind: "cumulative",
        scopeId: threadId,
        epoch: 0,
        sampleId: `${threadId}-cumulative`,
        counter: 100,
        fresh: true,
      },
    },
    {
      type: "usage.spent",
      threadId,
      usage: {
        counterKind: "per-call",
        scopeId: threadId,
        epoch: 0,
        sampleId: `${threadId}-call`,
        counter: 19,
      },
    },
    { type: "item.completed", threadId, itemId: "item" },
  ];
}

/** All durable structures a canonical write can change, including usage dedupe. */
export function durableRuntimeRows(): unknown[][] {
  return [
    "thread_runtime_items",
    "thread_runtime_item_stream_chunks",
    "thread_runtime_item_stream_state",
    "thread_context_usage",
    "usage_token_ledger",
    "usage_token_samples",
    "usage_events",
  ].map((table) => getSqlite().prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
}

/** The violation is accepted by every statement/savepoint, then rejected at COMMIT. */
export function installDeferredCommitFailure(onTail: () => void): void {
  const sqlite = getSqlite();
  sqlite.function("atomic_test_tail", () => {
    onTail();
    return 0;
  });
  sqlite.exec(`
    CREATE TABLE atomic_test_parent (id INTEGER PRIMARY KEY);
    CREATE TABLE atomic_test_child (
      parent_id INTEGER REFERENCES atomic_test_parent(id) DEFERRABLE INITIALLY DEFERRED
    );
    CREATE TRIGGER atomic_test_failure AFTER INSERT ON usage_events
    WHEN NEW.kind = 'tokens_v2' AND NEW.value = 19 BEGIN
      INSERT INTO atomic_test_child VALUES (999);
      SELECT atomic_test_tail();
    END;
  `);
}
