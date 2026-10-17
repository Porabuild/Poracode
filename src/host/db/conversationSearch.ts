import {
  conversationSearchQuerySchema,
  type ConversationSearchQuery,
} from "@/shared/conversationSearch";
import { readDatabaseAsync } from "./asyncReads";
import { getSqlite } from "./connection";
import { readConversationSearchBatch, readConversationSearchPage } from "./conversationSearchReads";
import { withRuntimeBusyTimeout } from "./runtimeBusyTimeout";
import { ensureConversationSearchGeneration } from "./conversationSearchSchema";

export async function dbSearchConversations(input: ConversationSearchQuery) {
  const query = conversationSearchQuerySchema.parse(input);
  const sqlite = getSqlite();
  withRuntimeBusyTimeout(() => ensureConversationSearchGeneration(sqlite));
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
