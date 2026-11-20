import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbReplaceThreadRuntimeItems } from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { clearPendingSessionImport, markSessionImportPending } from "./sessionImportJournal";

it.skipIf(!sqliteAvailable)(
  "recovers only interrupted import rows when the host reopens its database",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-session-import-journal-"));
    const dbPath = join(dir, "state.sqlite");
    const previous = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    try {
      initDatabase(dbPath);
      const base = testThread();
      dbUpsertProject(
        {
          id: base.projectId,
          name: "Fixture",
          location: { kind: "posix", path: dir },
          createdAt: base.createdAt,
        },
        0,
      );
      const config = {
        ...base.config,
        importedFrom: { path: "/fixture/session.jsonl", importedAt: base.createdAt },
      };
      // Existing app versions saved this row shape without a pending marker.
      dbUpsertThread({ ...base, id: "legacy", config }, 0);
      markSessionImportPending("interrupted", base.createdAt);
      dbUpsertThread({ ...base, id: "interrupted", config }, 1);
      await dbReplaceThreadRuntimeItems("interrupted", [
        { id: "import-one", type: "assistant_message", state: "completed", streams: {} },
      ]);
      markSessionImportPending("completed", base.createdAt);
      dbUpsertThread({ ...base, id: "completed", config }, 2);
      clearPendingSessionImport("completed");
      markSessionImportPending("never-created", base.createdAt);
      markSessionImportPending("other-incarnation", "1999-01-01");
      dbUpsertThread({ ...base, id: "other-incarnation", config }, 3);
      markSessionImportPending("later-conversation", base.createdAt);
      dbUpsertThread({ ...base, id: "later-conversation", config }, 4);
      await dbReplaceThreadRuntimeItems("later-conversation", [
        { id: "later-user-message", type: "user_message", state: "completed", streams: {} },
      ]);
      closeDatabase();

      initDatabase(dbPath, { schemaMode: "validate" });
      expect(dbGetThread("interrupted")).not.toBeNull();
      closeDatabase();

      initDatabase(dbPath);
      expect(dbGetThread("interrupted")).toBeNull();
      expect(dbGetThread("legacy")?.config).toEqual(config);
      expect(dbGetThread("completed")?.config).toEqual(config);
      expect(dbGetThread("other-incarnation")?.config).toEqual(config);
      expect(dbGetThread("later-conversation")?.config).toEqual(config);
      expect(
        getSqlite()
          .prepare("SELECT item_id FROM thread_runtime_items WHERE thread_id = ?")
          .all("interrupted"),
      ).toEqual([]);
      const pending = getSqlite()
        .prepare("SELECT key FROM app_state WHERE key GLOB ?")
        .all("host-session-import-pending:v1:*");
      expect(pending).toEqual([]);
    } finally {
      closeDatabase();
      if (previous === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
      else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
