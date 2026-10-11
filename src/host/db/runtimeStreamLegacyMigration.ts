import type Database from "better-sqlite3";
import { appendStreamDelta } from "./runtimeStreamStore";

/**
 * Published migration 36's whole-value split into JSON heads and retained tails.
 * Keep this owner on the legacy append primitive: schema 53's live writer needs
 * tables that do not exist when an older profile reaches migration 36.
 */
export function writeLegacyMigrationItemStreams(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  itemId: string,
  streams: Record<string, string>,
): void {
  const heads: Record<string, string> = {};
  for (const [stream, text] of Object.entries(streams)) {
    if (typeof text !== "string") continue;
    const result = appendStreamDelta(sqlite, { threadId, itemId, stream, delta: text, head: "" });
    heads[stream] = result.head ?? "";
  }
  sqlite
    .prepare("UPDATE thread_runtime_items SET streams = ? WHERE thread_id = ? AND item_id = ?")
    .run(JSON.stringify(heads), threadId, itemId);
}
