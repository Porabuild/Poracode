#!/usr/bin/env node
/**
 * Test-only fixture for the B1 CAPABLE-HOST Android device journey.
 *
 * Modes (forked exactly like `src/host/db/runtimeDurableGap.crashFixture.ts`,
 * under `--experimental-transform-types` + the remote-v3 TypeScript register):
 *
 *   seed   <dbPath> <paramsJson>
 *     Opens the disposable host DB through the production connection, creates
 *     the fixture project and GUI thread, commits the retained canonical
 *     prefix through `dbApplyThreadRuntimeEvents` + `dbFlushThreadRuntimeWrites`,
 *     accepts one further event without flushing it, prints
 *     `CAPABLE_HISTORY_SEED_ARMED`, and stays alive until the parent SIGKILLs
 *     it. The kill loses the unflushed event but leaves the armed epoch and the
 *     thread touch: a genuine durable gap.
 *
 *   verify <dbPath> <paramsJson>
 *     Read-only reopen: never arms and never writes, so closing it cannot
 *     disarm the crashed boot's evidence. Prints one
 *     `CAPABLE_HISTORY_VERIFY <json>` line with the resolved contamination,
 *     descriptor, notice state and committed items, then exits 0.
 *
 * Never imported by production code; no production emit/fault endpoint exists.
 */

import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { dbApplyThreadRuntimeEvents, dbFlushThreadRuntimeWrites } from "@/host/db/runtimeItems";
import {
  getRuntimeContamination,
  getRuntimeThreadGapDescriptor,
  getRuntimeThreadGapNotice,
} from "@/host/db/runtimePersistenceRuntime";
import {
  CAPABLE_HISTORY_SEED_ARMED_MARKER,
  CAPABLE_HISTORY_SEED_FAILED_MARKER,
  CAPABLE_HISTORY_VERIFY_MARKER,
  capableHistoryItemText,
  capableHistoryLostEvent,
  capableHistoryPrefixEvents,
  capableHistoryThreadRow,
  type CapableHistorySeedParams,
  type CapableHistoryVerifyResult,
} from "../helpers/androidCapableHistorySeed.ts";

function requiredArgument(index: number, name: string): string {
  const value = process.argv[index];
  if (!value) throw new Error(`Missing capable-history fixture ${name}.`);
  return value;
}

function parseParams(raw: string): CapableHistorySeedParams {
  return JSON.parse(raw) as CapableHistorySeedParams;
}

function seed(dbPath: string, params: CapableHistorySeedParams): void {
  initDatabase(dbPath);
  dbUpsertProject(
    {
      id: params.projectId,
      name: params.projectName,
      location: { kind: "posix", path: params.projectPath },
      createdAt: "2026-09-21T00:00:00.000Z",
    },
    0,
  );
  dbUpsertThread(capableHistoryThreadRow(params), 0);

  const prefix = dbApplyThreadRuntimeEvents(params.threadId, capableHistoryPrefixEvents(params));
  if (prefix.kind !== "accepted") {
    throw new Error(`prefix admission was refused (${prefix.kind}: ${String(prefix.reason)}).`);
  }
}

async function seedAndWait(dbPath: string, params: CapableHistorySeedParams): Promise<void> {
  seed(dbPath, params);
  // Commit the retained prefix durably; only after this point does the extra
  // accepted-but-unflushed event become the genuine lost work.
  await dbFlushThreadRuntimeWrites(params.threadId);
  const lost = dbApplyThreadRuntimeEvents(params.threadId, [capableHistoryLostEvent(params)]);
  if (lost.kind !== "accepted") {
    throw new Error(`lost-event admission was refused (${lost.kind}: ${String(lost.reason)}).`);
  }
  console.log(
    `${CAPABLE_HISTORY_SEED_ARMED_MARKER} ${JSON.stringify({
      threadId: params.threadId,
      prefixItems: [params.userItemId, params.assistantItemId],
      lostItemId: params.lostItemId,
    })}`,
  );
  // Stay alive so the parent owns the exact SIGKILL point.
  setInterval(() => {}, 1_000);
}

function verify(dbPath: string, params: CapableHistorySeedParams): void {
  initDatabase(dbPath);
  const sqlite = getSqlite();
  const contamination = getRuntimeContamination(params.threadId);
  let descriptor: CapableHistoryVerifyResult["descriptor"] = null;
  let descriptorError: string | null = null;
  try {
    const resolved = getRuntimeThreadGapDescriptor(params.threadId);
    descriptor = resolved
      ? {
          token: resolved.token,
          source: resolved.source,
          reason: resolved.reason,
          refusedEvents: resolved.refusedEvents,
          refusedBytes: resolved.refusedBytes,
        }
      : null;
  } catch (error) {
    descriptorError = error instanceof Error ? error.message : String(error);
  }
  const gapRow = sqlite
    .prepare("SELECT reason FROM thread_runtime_gaps WHERE thread_id = ?")
    .get(params.threadId) as { reason: string } | undefined;
  const notice = getRuntimeThreadGapNotice(params.threadId);
  const threadRow = sqlite
    .prepare("SELECT status FROM threads WHERE id = ?")
    .get(params.threadId) as { status: string } | undefined;
  const itemRows = sqlite
    .prepare(
      `SELECT item_id, position, type, state, payload, streams
         FROM thread_runtime_items WHERE thread_id = ? ORDER BY position, item_id`,
    )
    .all(params.threadId) as Array<{
    item_id: string;
    position: number;
    type: string;
    state: string;
    payload: string | null;
    streams: string | null;
  }>;
  const result: CapableHistoryVerifyResult = {
    threadId: params.threadId,
    contaminationReason: contamination?.reason ?? null,
    gapRowAbsent: gapRow === undefined,
    noticeAbsent: notice === null,
    descriptor,
    descriptorError,
    liveThreadStatus: threadRow?.status ?? null,
    items: itemRows.map((row) => ({
      itemId: row.item_id,
      position: row.position,
      type: row.type,
      state: row.state,
      text: capableHistoryItemText(row.payload, row.streams),
    })),
  };
  console.log(
    `${CAPABLE_HISTORY_VERIFY_MARKER} ${JSON.stringify({
      ...result,
      descriptorTokenPresent: descriptor !== null,
    })}`,
  );
  // A read-only boot never armed, so the close hook's disarm is a no-op and
  // the crashed boot's evidence survives.
  closeDatabase();
}

const mode = requiredArgument(2, "mode");
const dbPath = requiredArgument(3, "database path");
const params = parseParams(requiredArgument(4, "params JSON"));

try {
  if (mode === "seed") {
    await seedAndWait(dbPath, params);
  } else if (mode === "verify") {
    verify(dbPath, params);
  } else {
    throw new Error(`unknown capable-history fixture mode: ${mode}`);
  }
} catch (error) {
  console.log(
    `${CAPABLE_HISTORY_SEED_FAILED_MARKER} ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
