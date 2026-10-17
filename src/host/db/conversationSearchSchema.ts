import type Database from "better-sqlite3";

/** Disposable projection only; canonical history is never rewritten. */
export function createConversationSearchSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE conversation_search_meta (id INTEGER PRIMARY KEY CHECK(id = 1), generation TEXT NOT NULL);
    INSERT INTO conversation_search_meta VALUES (1, '');
    CREATE TABLE conversation_search_documents (
      id INTEGER PRIMARY KEY,
      thread_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      text TEXT NOT NULL,
      UNIQUE(thread_id, item_id),
      FOREIGN KEY(thread_id, item_id) REFERENCES thread_runtime_items(thread_id, item_id) ON DELETE CASCADE
    );
    CREATE VIRTUAL TABLE conversation_search_fts USING fts5(
      text, content='conversation_search_documents', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER conversation_search_insert AFTER INSERT ON conversation_search_documents BEGIN
      INSERT INTO conversation_search_fts(rowid, text) VALUES (NEW.id, NEW.text);
    END;
    CREATE TRIGGER conversation_search_delete AFTER DELETE ON conversation_search_documents BEGIN
      INSERT INTO conversation_search_fts(conversation_search_fts, rowid, text) VALUES ('delete', OLD.id, OLD.text);
    END;
    CREATE TABLE conversation_search_pending (
      thread_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      revision INTEGER PRIMARY KEY AUTOINCREMENT,
      UNIQUE(thread_id, item_id),
      FOREIGN KEY(thread_id, item_id) REFERENCES thread_runtime_items(thread_id, item_id) ON DELETE CASCADE
    );
  `);
  // Invalidate in the canonical transaction, including replacement, rollback,
  // stream-head blocks, legacy seeds and tails. The read worker builds prose;
  // triggers never parse payloads or duplicate tool/credential JSON.
  const dirty = (thread: string, item: string) => `
    DELETE FROM conversation_search_documents WHERE thread_id = ${thread} AND item_id = ${item};
    INSERT INTO conversation_search_pending(thread_id, item_id)
      SELECT thread_id, item_id FROM thread_runtime_items
      WHERE thread_id = ${thread} AND item_id = ${item}
        AND parent_item_id IS NULL AND type IN ('user_message', 'assistant_message')
      ON CONFLICT(thread_id, item_id) DO UPDATE SET revision = excluded.revision;`;
  for (const table of [
    "thread_runtime_items",
    "thread_runtime_item_stream_chunks",
    "thread_runtime_item_stream_heads",
  ]) {
    for (const action of ["INSERT", "UPDATE", "DELETE"]) {
      const row = action === "DELETE" ? "OLD" : "NEW";
      sqlite.exec(`CREATE TRIGGER search_${table}_${action} AFTER ${action} ON ${table} BEGIN
        ${dirty(`${row}.thread_id`, `${row}.item_id`)} END;`);
    }
  }
  for (const action of ["INSERT", "UPDATE", "DELETE"]) {
    const row = action === "DELETE" ? "OLD" : "NEW";
    const owner = (column: string) =>
      `(SELECT ${column} FROM thread_runtime_item_stream_heads WHERE head_id = ${row}.head_id)`;
    sqlite.exec(`CREATE TRIGGER search_head_block_${action}
      AFTER ${action} ON thread_runtime_item_stream_head_blocks BEGIN
      ${dirty(owner("thread_id"), owner("item_id"))} END;`);
  }
}
