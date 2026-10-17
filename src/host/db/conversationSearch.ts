import {
  conversationSearchQuerySchema,
  type ConversationSearchQuery,
} from "@/shared/conversationSearch";
import { readDatabaseAsync } from "./asyncReads";
import { INLINE_VISUAL_SEARCH_VERSION } from "@/shared/inlineVisuals";
import { getSqlite } from "./connection";
import {
  CONVERSATION_SEARCH_INDEX_GENERATION,
  CONVERSATION_SEARCH_INDEX_POLICY_VERSION,
  readConversationSearchBatch,
  readConversationSearchPage,
} from "./conversationSearchReads";
import { withRuntimeBusyTimeout } from "./runtimeBusyTimeout";

/** Atomic invalidation lives in schema triggers; only the owning host writes. */
export function ensureConversationSearchGeneration(): void {
  const sqlite = getSqlite();
  const meta = sqlite
    .prepare("SELECT generation FROM conversation_search_meta WHERE id = 1")
    .get() as { generation: string };
  if (meta.generation === CONVERSATION_SEARCH_INDEX_GENERATION) return;
  if (meta.generation) {
    const previous = /^([1-9]\d*)\.visual([1-9]\d*)$/.exec(meta.generation);
    if (
      !previous ||
      Number(previous[1]) > CONVERSATION_SEARCH_INDEX_POLICY_VERSION ||
      Number(previous[2]) > INLINE_VISUAL_SEARCH_VERSION
    )
      throw new Error("Conversation search index has a newer or unknown generation.");
  }
  withRuntimeBusyTimeout(() =>
    sqlite
      .transaction(() => {
        sqlite.exec(
          "DELETE FROM conversation_search_documents; DELETE FROM conversation_search_pending;",
        );
        // Metadata-only backfill. Text is decoded in bounded worker batches on demand.
        sqlite.exec(`INSERT INTO conversation_search_pending(thread_id, item_id)
      SELECT thread_id, item_id FROM thread_runtime_items
      WHERE parent_item_id IS NULL AND type IN ('user_message', 'assistant_message') ORDER BY rowid ASC`);
        sqlite
          .prepare("UPDATE conversation_search_meta SET generation = ? WHERE id = 1")
          .run(CONVERSATION_SEARCH_INDEX_GENERATION);
      })
      .immediate(),
  );
}

export async function dbSearchConversations(input: ConversationSearchQuery) {
  const query = conversationSearchQuerySchema.parse(input);
  ensureConversationSearchGeneration();
  const sqlite = getSqlite();
  const documents = await readDatabaseAsync(
    "conversationSearchBatch",
    [],
    readConversationSearchBatch,
  );
  if (getSqlite() !== sqlite)
    throw new Error("Conversation search database changed during indexing.");
  withRuntimeBusyTimeout(() =>
    sqlite
      .transaction(() => {
        const current = sqlite.prepare(
          "SELECT revision FROM conversation_search_pending WHERE thread_id = ? AND item_id = ?",
        );
        const remove = sqlite.prepare(
          "DELETE FROM conversation_search_documents WHERE thread_id = ? AND item_id = ?",
        );
        const insert =
          sqlite.prepare(`INSERT INTO conversation_search_documents(id, thread_id, item_id, text)
      SELECT rowid, thread_id, item_id, ? FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?`);
        const complete = sqlite.prepare(
          "DELETE FROM conversation_search_pending WHERE thread_id = ? AND item_id = ?",
        );
        for (const document of documents) {
          const pending = current.get(document.threadId, document.itemId) as
            | { revision: number }
            | undefined;
          // A stream append or replacement during the worker snapshot wins.
          if (pending?.revision !== document.revision) continue;
          remove.run(document.threadId, document.itemId);
          if (document.text.trim()) insert.run(document.text, document.threadId, document.itemId);
          complete.run(document.threadId, document.itemId);
        }
      })
      .immediate(),
  );
  return readDatabaseAsync("conversationSearch", [query], () => readConversationSearchPage(query));
}
