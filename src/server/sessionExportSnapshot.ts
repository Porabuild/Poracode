import { createHash } from "node:crypto";
import { getSqlite, initReadOnlyDatabase } from "@/host/db/connection";
import { dbGetThread } from "@/host/db/projectsThreads";
import { dbGetThreadRuntimeItemCommitted } from "@/host/db/runtimeItemRead";
import { dbGetThreadContextUsage } from "@/host/db/runtimeItems";
import { dbGetThreadTerminalScrollbackRecord } from "@/host/db/terminalScrollback";
import { hostAdminSessionSummarySchema } from "@/shared/hostAdminProtocol";
import { SESSION_EXPORT_FORMAT_VERSION } from "@/shared/contracts/sessionExport";
import type { SessionExportInitialization } from "./sessionExportProtocol";

/** A dedicated read connection pins one snapshot; only one item is decoded at a time. */
export async function writeSessionExportSnapshot(
  input: SessionExportInitialization,
  snapshotReady: () => Promise<void>,
  write: (bytes: Buffer) => Promise<void>,
) {
  initReadOnlyDatabase(input.dbPath);
  const sqlite = getSqlite();
  const hash = createHash("sha256");
  let bytes = 0;
  const emit = async (text: string) => {
    const buffer = Buffer.from(text);
    hash.update(buffer);
    bytes += buffer.length;
    await write(buffer);
  };
  try {
    sqlite.exec("BEGIN");
    const thread = dbGetThread(input.threadId);
    if (!thread) throw new Error("Persisted session not found.");
    const session = hostAdminSessionSummarySchema.parse({
      id: thread.id,
      projectId: thread.projectId,
      title: thread.title,
      agentKind: thread.agentKind,
      presentationMode: thread.presentationMode ?? "terminal",
      storedStatus: thread.status,
      archived: thread.archived,
      done: thread.done,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    });
    // The SELECT above establishes the snapshot before the host releases its fence.
    await snapshotReady();
    const header = {
      kind: "poracode-session",
      formatVersion: SESSION_EXPORT_FORMAT_VERSION,
      scope: "persisted-thread",
      exportedAt: new Date().toISOString(),
      session,
      runtimeNotice: input.runtimeNotice,
    };
    await emit(JSON.stringify(header).slice(0, -1) + ',"runtimeItems":[');
    let separator = "";
    const items = sqlite.prepare(
      "SELECT item_id FROM thread_runtime_items WHERE thread_id = ? ORDER BY position",
    );
    for (const row of items.iterate(input.threadId) as Iterable<{ item_id: string }>) {
      const item = dbGetThreadRuntimeItemCommitted(input.threadId, row.item_id);
      if (!item) throw new Error("Snapshot item disappeared.");
      await emit(separator + JSON.stringify(item));
      separator = ",";
    }
    await emit('],"completedTurns":[');
    separator = "";
    const turns = sqlite.prepare(
      "SELECT started_at, ended_at, anchor_item_id FROM thread_completed_turns WHERE thread_id = ? ORDER BY idx",
    );
    for (const row of turns.iterate(input.threadId) as Iterable<{
      started_at: string;
      ended_at: string;
      anchor_item_id: string | null;
    }>) {
      await emit(
        separator +
          JSON.stringify({
            startedAt: row.started_at,
            endedAt: row.ended_at,
            anchorItemId: row.anchor_item_id,
          }),
      );
      separator = ",";
    }
    await emit('],"contextUsage":' + JSON.stringify(dbGetThreadContextUsage(input.threadId)));
    await emit(
      ',"terminalScrollback":' +
        JSON.stringify(dbGetThreadTerminalScrollbackRecord(input.threadId)) +
        "}\n",
    );
    return { bytes, sha256: hash.digest("hex") };
  } finally {
    if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
    sqlite.close();
  }
}
