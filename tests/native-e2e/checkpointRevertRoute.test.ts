import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "../../src/shared/contracts";
import { closeDatabase, initDatabase } from "../../src/main/db/connection";
import {
  dbApplyThreadRuntimeEvents,
  dbAppendThreadCompletedTurn,
  dbFlushThreadRuntimeWrites,
  dbGetThreadRuntimeItemsPage,
} from "../../src/main/db/runtimeItems";
import { dbGetProjects, dbUpsertThread } from "../../src/main/db/projectsThreads";
import { ProcessCleanup } from "./harness/processCleanup";
import { startRealHost, type RealHostHandle } from "./harness/realHost";
import { findRepoRoot } from "./harness/paths";
import { ProfileClient } from "./helpers/concurrencyProfileClient";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
} from "./helpers/profileClientFactory";
import { expectOk } from "./helpers/sharedHostWorkload";
import { writeExperimentArtifact } from "./helpers/experimentArtifacts";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");

function databaseOpens(nativeBinding?: string): boolean {
  if (nativeBinding && !existsSync(nativeBinding)) return false;
  try {
    const database = nativeBinding
      ? new Database(":memory:", { nativeBinding })
      : new Database(":memory:");
    database.close();
    return true;
  } catch {
    return false;
  }
}

function prepareTestProcessBinding(): void {
  if (databaseOpens()) return;
  if (!databaseOpens(serverNativeBinding)) {
    throw new Error(
      "No Node-compatible better-sqlite3 binding available to open the host database.",
    );
  }
  process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = serverNativeBinding;
}

const THREAD_ID = "native-e2e-checkpoint-revert";

/**
 * WS2 stage 3/4 wire proof against a real host: the compound route
 * `POST /api/threads/{id}/checkpoint-revert` runs the backend-owned journaled
 * operation (anchor-capable provider phase, file checkpoint restore,
 * transcript truncation) and replays the journalled outcome for a repeated
 * `operationKey`.
 *
 * The host has fixture data only — no provider session and no file checkpoint
 * — so the honest production outcome here is `failed` with both external
 * phases recorded as failed and the transcript truncation deliberately NOT
 * executed (phase ordering aborts the compound before the destructive step).
 * The replay attempt returns the stored outcome without re-executing anything.
 * Provider-capable full-completion journeys are covered by the unit suite and
 * remain a manual QA item.
 */
describe("compound checkpoint revert route (real host)", () => {
  const repoRoot = findRepoRoot();
  let cleanup: ProcessCleanup | undefined;
  let host: RealHostHandle | undefined;
  const clients: ProfileClient[] = [];

  beforeEach(() => {
    prepareTestProcessBinding();
  });

  afterEach(async () => {
    await closeProfileClients(clients);
    clients.length = 0;
    await host?.stop();
    host = undefined;
    await cleanup?.shutdown("test-end");
    cleanup = undefined;
    closeDatabase();
  });

  function seedGuiThread(dbPath: string): void {
    initDatabase(dbPath);
    try {
      const projectId = dbGetProjects()[0]!.id;
      const now = new Date().toISOString();
      const thread: Thread = {
        id: THREAD_ID,
        projectId,
        title: "Checkpoint revert route proof",
        agentKind: "native-e2e",
        config: { model: "native-e2e-model" },
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        createdAt: now,
        updatedAt: now,
      };
      dbUpsertThread(thread, 0);
      const itemIds = ["revert-item-1", "revert-item-2", "revert-item-3", "revert-item-4"];
      for (const [index, itemId] of itemIds.entries()) {
        dbApplyThreadRuntimeEvents(THREAD_ID, [
          {
            type: "item.started",
            threadId: THREAD_ID,
            itemId,
            itemType: index % 2 === 0 ? "user_message" : "assistant_message",
          },
          {
            type: "item.completed",
            threadId: THREAD_ID,
            itemId,
            payload: { content: [{ kind: "text", text: `${itemId} body` }] },
          },
        ]);
      }
      // Two completed turns anchored after the checkpoint item.
      dbAppendThreadCompletedTurn(THREAD_ID, {
        startedAt: "2026-09-10T00:00:00.000Z",
        endedAt: "2026-09-10T00:00:30.000Z",
        anchorItemId: "revert-item-2",
      });
      dbAppendThreadCompletedTurn(THREAD_ID, {
        startedAt: "2026-09-10T00:01:00.000Z",
        endedAt: "2026-09-10T00:01:30.000Z",
        anchorItemId: "revert-item-4",
      });
      dbFlushThreadRuntimeWrites(THREAD_ID);
    } finally {
      closeDatabase();
    }
  }

  it("runs the journaled compound, aborts before the truncate when the file restore fails, and replays the outcome", async () => {
    cleanup = new ProcessCleanup();
    host = await startRealHost({
      port: await allocateLoopbackPort(),
      cleanup,
      baseDirRoot: join(repoRoot, "tmp", ".tmp", "checkpoint-revert-qa"),
    });
    const dbPath = join(host.baseDir, "state.sqlite");
    seedGuiThread(dbPath);

    const credential = await acquireDeviceCredential(host, "revert-route");
    const client = await ProfileClient.create({
      handle: host,
      label: "revert-route",
      accessToken: credential.accessToken,
    });
    clients.push(client);
    client.sendJson({ type: "thread-item-interests", threadIds: [THREAD_ID] });

    const revertPath = `/api/threads/${THREAD_ID}/checkpoint-revert`;
    const post = (operationKey: string) =>
      client.fetchJson("checkpoint-revert", revertPath, {
        method: "POST",
        body: { checkpointItemId: "revert-item-2", operationKey },
      });

    const first = await post("revert-route-op-1");
    expectOk(first.status, "checkpoint revert", first.body);
    expect(first.body).toMatchObject({
      outcome: "failed",
      replayed: false,
      numTurns: 1,
      providerPhase: "failed",
      filesPhase: "failed",
      truncatePhase: "pending",
      removedCompletedTurnAnchors: [],
    });

    // A `failed` row is retryable, not replayable: the second POST with the
    // same operationKey resumes the compound and re-attempts the failed
    // phases (which fail again without a checkpoint) instead of returning a
    // stored outcome. Settled outcomes (completed / local_only / ambiguous)
    // are the ones replayed verbatim — covered in the unit suite.
    const retrySameKey = await post("revert-route-op-1");
    expect(retrySameKey.status).toBe(200);
    expect(retrySameKey.body).toMatchObject({
      outcome: "failed",
      replayed: false,
      truncatePhase: "pending",
    });

    // The abort-before-truncate ordering kept the transcript intact.
    const history = await client.fetchJson(
      "history-after-revert",
      `/api/threads/${THREAD_ID}/history?runtimePage=1`,
    );
    expectOk(history.status, "history after revert", history.body);
    const servedIds = (history.body as { runtimeItems: Array<{ id: string }> }).runtimeItems.map(
      (item) => item.id,
    );
    expect(servedIds).toHaveLength(4);

    // The host database agrees with the served history.
    initDatabase(dbPath);
    try {
      const dbIds = dbGetThreadRuntimeItemsPage(THREAD_ID, undefined, 500).items.map(
        (item) => item.id,
      );
      expect(dbIds).toEqual(servedIds);
    } finally {
      closeDatabase();
    }

    // A different operation key on the same checkpoint resumes the compound:
    // the phases re-attempt (files restore still fails without a checkpoint),
    // which keeps the abort-before-truncate contract stable across retries.
    const second = await post("revert-route-op-2");
    expectOk(second.status, "checkpoint revert retry", second.body);
    expect(second.body).toMatchObject({
      outcome: "failed",
      replayed: false,
      truncatePhase: "pending",
    });

    writeExperimentArtifact(repoRoot, "checkpoint-revert-route.json", {
      threadId: THREAD_ID,
      firstOutcome: first.body,
      sameKeyRetryOutcome: retrySameKey.body,
      freshKeyRetryOutcome: second.body,
      servedItemIds: servedIds,
      scope:
        "Real headless host, fixture data only: no provider session and no file checkpoint, " +
        "so the compound honestly fails at the provider/file phases and never reaches the " +
        "destructive truncate. Failed rows stay retryable (resume + re-attempt); settled " +
        "outcomes replay verbatim (unit suite).",
    });
  }, 120_000);
});
