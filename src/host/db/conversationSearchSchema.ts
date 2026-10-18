import type Database from "better-sqlite3";
import { INLINE_VISUAL_SEARCH_VERSION } from "@/shared/inlineVisuals";

// v4 installs key-move invalidation before any owning host exposes canonical writers.
export const CONVERSATION_SEARCH_INDEX_POLICY_VERSION = 4;
export const CONVERSATION_SEARCH_INDEX_GENERATION = `${CONVERSATION_SEARCH_INDEX_POLICY_VERSION}.visual${INLINE_VISUAL_SEARCH_VERSION}`;

function dirty(thread: string, item: string): string {
  return `
    DELETE FROM conversation_search_documents WHERE thread_id = ${thread} AND item_id = ${item};
    INSERT INTO conversation_search_pending(thread_id, item_id)
      SELECT thread_id, item_id FROM thread_runtime_items
      WHERE thread_id = ${thread} AND item_id = ${item}
        AND parent_item_id IS NULL AND type IN ('user_message', 'assistant_message')
      ON CONFLICT(thread_id, item_id) DO UPDATE SET revision = excluded.revision;`;
}

const KEY_MOVE_TRIGGERS = [
  "search_runtime_item_key_move",
  "search_thread_runtime_item_stream_chunks_owner_move",
  "search_thread_runtime_item_stream_heads_owner_move",
  "search_head_block_owner_move",
] as const;

function installKeyMoveTriggers(sqlite: Database.Database): void {
  sqlite.exec(`CREATE TRIGGER IF NOT EXISTS search_runtime_item_key_move
    BEFORE UPDATE OF thread_id, item_id ON thread_runtime_items
    WHEN OLD.thread_id != NEW.thread_id OR OLD.item_id != NEW.item_id BEGIN
      DELETE FROM conversation_search_documents WHERE thread_id = OLD.thread_id AND item_id = OLD.item_id;
      DELETE FROM conversation_search_pending WHERE thread_id = OLD.thread_id AND item_id = OLD.item_id;
    END;`);
  for (const table of ["thread_runtime_item_stream_chunks", "thread_runtime_item_stream_heads"]) {
    sqlite.exec(`CREATE TRIGGER IF NOT EXISTS search_${table}_owner_move
      BEFORE UPDATE OF thread_id, item_id ON ${table}
      WHEN OLD.thread_id != NEW.thread_id OR OLD.item_id != NEW.item_id BEGIN
        ${dirty("OLD.thread_id", "OLD.item_id")} END;`);
  }
  const owner = (column: string) =>
    `(SELECT ${column} FROM thread_runtime_item_stream_heads WHERE head_id = OLD.head_id)`;
  sqlite.exec(`CREATE TRIGGER IF NOT EXISTS search_head_block_owner_move
    BEFORE UPDATE OF head_id ON thread_runtime_item_stream_head_blocks
    WHEN OLD.head_id != NEW.head_id BEGIN
      ${dirty(owner("thread_id"), owner("item_id"))} END;`);
}

/** Read-only admission runs before even connection pragmas on an existing root. */
export function preflightConversationSearchGeneration(
  sqlite: Database.Database,
): string | undefined {
  const table = sqlite
    .prepare("SELECT type FROM sqlite_master WHERE name = 'conversation_search_meta'")
    .get() as { type: string } | undefined;
  if (!table) {
    const state = sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_state'")
      .get();
    const stored = state
      ? (sqlite.prepare("SELECT value FROM app_state WHERE key='schema_version'").get() as
          | { value: string }
          | undefined)
      : undefined;
    // Absence is expected before Search's schema63, not on an existing search root.
    if (stored && Number(stored.value) >= 63)
      throw new Error("Conversation search index metadata is missing.");
    return undefined;
  }
  const meta =
    table.type === "table"
      ? (sqlite.prepare("SELECT generation FROM conversation_search_meta WHERE id = 1").get() as
          | { generation: unknown }
          | undefined)
      : undefined;
  const generation = meta?.generation;
  if (typeof generation !== "string")
    throw new Error("Conversation search index metadata is incomplete or malformed.");
  if (generation !== "") {
    const previous = /^([1-9]\d*)\.visual([1-9]\d*)$/.exec(generation);
    if (
      !previous ||
      Number(previous[1]) > CONVERSATION_SEARCH_INDEX_POLICY_VERSION ||
      Number(previous[2]) > INLINE_VISUAL_SEARCH_VERSION
    )
      throw new Error("Conversation search index has a newer or unknown generation.");
  }
  return generation;
}

export function assertConversationSearchReady(sqlite: Database.Database): void {
  if (preflightConversationSearchGeneration(sqlite) !== CONVERSATION_SEARCH_INDEX_GENERATION)
    throw new Error("Conversation search projection requires an owning startup upgrade.");
  const trigger = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?");
  for (const name of KEY_MOVE_TRIGGERS) {
    if (!trigger.get(name)) throw new Error(`Conversation search projection is missing ${name}.`);
  }
}

/** Rebuild only this disposable projection; retain the pending sequence against ABA. */
export function ensureConversationSearchGeneration(sqlite: Database.Database): void {
  const generation = preflightConversationSearchGeneration(sqlite);
  if (generation === undefined) throw new Error("Conversation search index metadata is missing.");
  if (generation === CONVERSATION_SEARCH_INDEX_GENERATION) {
    assertConversationSearchReady(sqlite);
    return;
  }
  sqlite
    .transaction(() => {
      const current = preflightConversationSearchGeneration(sqlite);
      if (current === undefined) throw new Error("Conversation search index metadata is missing.");
      if (current === CONVERSATION_SEARCH_INDEX_GENERATION) {
        assertConversationSearchReady(sqlite);
        return;
      }
      installKeyMoveTriggers(sqlite);
      sqlite.exec(
        "DELETE FROM conversation_search_documents; DELETE FROM conversation_search_pending;",
      );
      sqlite.exec(`INSERT INTO conversation_search_pending(thread_id, item_id)
      SELECT thread_id, item_id FROM thread_runtime_items
      WHERE parent_item_id IS NULL AND type IN ('user_message', 'assistant_message') ORDER BY rowid ASC`);
      sqlite
        .prepare("UPDATE conversation_search_meta SET generation = ? WHERE id = 1")
        .run(CONVERSATION_SEARCH_INDEX_GENERATION);
    })
    .immediate();
}

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
  installKeyMoveTriggers(sqlite);
}
