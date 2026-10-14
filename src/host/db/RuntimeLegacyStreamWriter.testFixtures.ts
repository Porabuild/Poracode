import type Database from "better-sqlite3";
import type { RuntimeEvent } from "@/shared/contracts";
import { safeParse } from "./rowMappers";
import { appendStreamDelta } from "./runtimeStreamStore";

/** Independent pre-53 event path using the retained legacy append primitive. */
export function applyLegacyStreamEvents(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  events: readonly RuntimeEvent[],
): void {
  for (const event of events) {
    if (event.type === "item.completed") {
      sqlite
        .prepare(
          "UPDATE thread_runtime_items SET state = 'completed' WHERE thread_id = ? AND item_id = ?",
        )
        .run(threadId, event.itemId);
      continue;
    }
    if (event.type !== "content.delta") throw new Error("Unsupported legacy fixture event.");
    const row = sqlite
      .prepare(
        "SELECT state, streams FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
      )
      .get(threadId, event.itemId) as { state: string; streams: string | null } | undefined;
    if (!row) continue;
    let heads = row.streams ? (safeParse(row.streams) as Record<string, string>) : {};
    if (event.replace) {
      for (const table of [
        "thread_runtime_item_stream_chunks",
        "thread_runtime_item_stream_state",
      ]) {
        sqlite
          .prepare(`DELETE FROM ${table} WHERE thread_id = ? AND item_id = ? AND stream = ?`)
          .run(threadId, event.itemId, event.stream);
      }
      heads[event.stream] = "";
    }
    const appended = appendStreamDelta(sqlite, {
      threadId,
      itemId: event.itemId,
      stream: event.stream,
      delta: event.delta,
      head: heads[event.stream] ?? "",
    });
    const nextState = row.state === "completed" ? "completed" : "updated";
    if (appended.head === undefined && !event.replace) {
      if (row.state !== nextState) {
        sqlite
          .prepare("UPDATE thread_runtime_items SET state = ? WHERE thread_id = ? AND item_id = ?")
          .run(nextState, threadId, event.itemId);
      }
    } else {
      heads = { ...heads, [event.stream]: appended.head ?? "" };
      sqlite
        .prepare(
          "UPDATE thread_runtime_items SET state = ?, streams = ? WHERE thread_id = ? AND item_id = ?",
        )
        .run(nextState, JSON.stringify(heads), threadId, event.itemId);
    }
  }
}

export function streamWriteOutcome(write: () => void): {
  kind: string;
  name?: string;
  code?: unknown;
} {
  try {
    write();
    return { kind: "success" };
  } catch (error) {
    return {
      kind: "refused",
      name: error instanceof Error ? error.name : typeof error,
      ...(error instanceof Error && "code" in error ? { code: error.code } : {}),
    };
  }
}
