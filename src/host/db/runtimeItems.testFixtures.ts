import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { Thread } from "@/shared/contracts";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
const { nativeBindingEnv, sqliteAvailable } = (() => {
  try {
    new Database(":memory:").close();
    return { nativeBindingEnv: undefined, sqliteAvailable: true };
  } catch {
    const available = existsSync(serverNativeBinding);
    return {
      nativeBindingEnv: available ? serverNativeBinding : undefined,
      sqliteAvailable: available,
    };
  }
})();

function testThread(): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Runtime persistence",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function removeCostSchemaForDowngrade(sqlite: Database.Database): void {
  sqlite.exec("DROP INDEX idx_usage_token_ledger_scope");
  sqlite.exec("ALTER TABLE usage_events DROP COLUMN cost_details");
  sqlite.exec("ALTER TABLE usage_token_ledger DROP COLUMN cost_details");
}

function removeConversationSearchFixtureSchema(sqlite: Database.Database): void {
  const triggers = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND (name GLOB 'search_*' OR name GLOB 'conversation_search_*')",
    )
    .all() as { name: string }[];
  for (const { name } of triggers) sqlite.exec(`DROP TRIGGER "${name}"`);
  sqlite.exec(`DROP TABLE conversation_search_fts;
    DROP TABLE conversation_search_pending;
    DROP TABLE conversation_search_documents;
    DROP TABLE conversation_search_meta;`);
}

export {
  nativeBindingEnv,
  sqliteAvailable,
  testThread,
  removeCostSchemaForDowngrade,
  removeConversationSearchFixtureSchema,
};
