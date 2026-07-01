import { describe, expect, it } from "vitest";
import { dbReadThreadRuntimeSummaries } from "./db";

describe("dbReadThreadRuntimeSummaries", () => {
  it("returns item counts, latest item metadata, and context usage without full item reads", () => {
    const calls: Array<{ sql: string; params: string[] }> = [];
    const queryRunner = {
      prepare: (sql: string) => ({
        all: (...params: string[]) => {
          calls.push({ sql, params });
          if (sql.includes("FROM thread_runtime_items")) {
            return [
              {
                thread_id: "thread-with-items",
                item_count: 2,
                item_id: "item-2",
                type: "assistant_message",
                state: "completed",
              },
            ];
          }
          if (sql.includes("FROM thread_context_usage")) {
            return [
              {
                thread_id: "thread-with-items",
                usage: JSON.stringify({ usedTokens: 42, maxTokens: 1000 }),
              },
              {
                thread_id: "thread-context-only",
                usage: JSON.stringify({ usedTokens: 7, maxTokens: 100 }),
              },
            ];
          }
          return [];
        },
      }),
    };

    const summaries = dbReadThreadRuntimeSummaries(queryRunner, [
      "thread-with-items",
      "thread-context-only",
      "missing-thread",
      "thread-with-items",
      "",
    ]);

    expect(summaries["thread-with-items"]).toEqual({
      itemCount: 2,
      latestItemId: "item-2",
      latestItemType: "assistant_message",
      latestItemState: "completed",
      contextUsage: { usedTokens: 42, maxTokens: 1000 },
    });
    expect(summaries["thread-context-only"]).toEqual({
      itemCount: 0,
      contextUsage: { usedTokens: 7, maxTokens: 100 },
    });
    expect(summaries["missing-thread"]).toEqual({ itemCount: 0 });

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.params)).toEqual([
      ["thread-with-items", "thread-context-only", "missing-thread"],
      ["thread-with-items", "thread-context-only", "missing-thread"],
    ]);

    const runtimeSql = calls[0]?.sql ?? "";
    expect(runtimeSql).toContain("COUNT(*) OVER");
    expect(runtimeSql).toContain("ROW_NUMBER() OVER");
    expect(runtimeSql).not.toContain("payload");
    expect(runtimeSql).not.toContain("streams");
  });
});
