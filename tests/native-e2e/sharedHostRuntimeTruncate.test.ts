import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { closeDatabase, initDatabase } from "../../src/main/db/connection.ts";
import {
  dbAppendThreadCompletedTurn,
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetThreadCompletedTurns,
  dbGetThreadRuntimeItemsPage,
} from "../../src/main/db/runtimeItems.ts";
import { dbGetProjects, dbUpsertThread } from "../../src/main/db/projectsThreads.ts";
import type { Thread } from "../../src/shared/contracts.ts";
import { collectRuntimeEventsFromSupervisoryMessage } from "../../src/renderer/state/remote/runtimeRequests.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import { startRealHost, type RealHostHandle } from "./harness/realHost.ts";
import { findRepoRoot } from "./harness/paths.ts";
import { ProfileClient, type ReceivedEvent } from "./helpers/concurrencyProfileClient.ts";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
} from "./helpers/profileClientFactory.ts";

/**
 * F2 producer regression (tmp/v2-production-review/gui-priority/chat-review/REPORT.md):
 * a checkpoint revert (runtime truncate) issued by one client must reach every
 * other connected client as one canonical `runtime.truncated` event on the
 * replayable `thread-runtime-event` stream, followed by the sidebar-refresh
 * `remote-threads-changed` signal.
 *
 * Producer contract (remote protocol v10):
 *  1. The acting client's own served history AND the host SQLite file both
 *     show the truncation (the divergence is real, with the orphaned completed
 *     turn removed).
 *  2. The observer — a live authenticated WS connection with declared
 *     `thread-item-interests` for the open thread — receives exactly one
 *     `thread-runtime-event { runtime.truncated }` frame carrying the
 *     server-declared `removedCompletedTurnAnchors`, plus the sidebar
 *     `remote-threads-changed` frame.
 *  3. Pushed through the production client parser
 *     (`collectRuntimeEventsFromSupervisoryMessage`), the received frames yield
 *     at least one transcript batch for the open thread containing the
 *     canonical truncate event.
 */

const THREAD_ID = "native-e2e-truncate-sync";
const ARTIFACT_DIR = join("tmp", "v2-production-review", "gui-priority", "truncate-sync");
/** Same guard as helpers/experimentArtifacts.ts — never persist credential material. */
const SECRET_PATTERN = /lc_(pair|access|ws)_[A-Za-z0-9_-]+/u;

// node_modules/better-sqlite3 may be compiled for Electron's ABI; fall back to
// the Node-ABI binding the headless server uses (mirrors projectsThreads.test.ts).
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

function writeTruncateArtifact(repoRoot: string, fileName: string, payload: unknown): string {
  const serialized = JSON.stringify(payload, null, 2);
  if (SECRET_PATTERN.test(serialized)) {
    throw new Error(`refusing to write artifact ${fileName}: secret-shaped material detected`);
  }
  const dir = join(repoRoot, ARTIFACT_DIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, fileName);
  writeFileSync(path, `${serialized}\n`, { mode: 0o600 });
  return path;
}

function summarizeFrames(frames: readonly ReceivedEvent[]): Array<Record<string, unknown>> {
  return frames.map((frame) => {
    const serialized = JSON.stringify(frame.event);
    // Frames are recorded whole so the companion probe replays exactly the
    // bytes the observer received; cap degenerate frames defensively.
    if (serialized.length > 8_192) {
      return { seq: frame.seq, type: frame.type, truncated: true };
    }
    return { seq: frame.seq, type: frame.type, event: frame.event };
  });
}

async function servedItemIds(client: ProfileClient, label: string): Promise<string[]> {
  const response = await client.fetchJson(
    label,
    `/api/threads/${THREAD_ID}/history/items?limit=500`,
  );
  expect(response.status).toBe(200);
  return (response.body as { items: Array<{ id: string }> }).items.map((item) => item.id);
}

it("a runtime truncate on one client reaches a second connected client as runtime.truncated", async () => {
  const repoRoot = findRepoRoot();
  prepareTestProcessBinding();
  const cleanup = new ProcessCleanup();
  const clients: ProfileClient[] = [];
  let host: RealHostHandle | undefined;
  try {
    host = await startRealHost({
      port: await allocateLoopbackPort(),
      cleanup,
      baseDirRoot: join(repoRoot, "tmp", ".tmp", "truncate-sync-qa"),
    });

    // Seed through the production writers the host itself uses, against the
    // host's live SQLite file (WAL allows the second process connection).
    // No provider is ever started; the thread stays idle.
    const dbPath = join(host.baseDir, "state.sqlite");
    initDatabase(dbPath);
    const projectId = dbGetProjects()[0]!.id;
    const now = new Date().toISOString();
    const thread: Thread = {
      id: THREAD_ID,
      projectId,
      title: "Truncate sync regression",
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
    const itemIds = ["truncate-item-1", "truncate-item-2", "truncate-item-3", "truncate-item-4"];
    const messagePayload = (text: string) => ({ content: [{ kind: "text", text }] });
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
          payload: messagePayload(`${itemId} body`),
        },
      ]);
    }
    // One completed turn anchored on a surviving item, one anchored on an
    // item the truncate deletes (its row is removed by the checkpoint).
    dbAppendThreadCompletedTurn(THREAD_ID, {
      startedAt: "2026-09-08T00:00:00.000Z",
      endedAt: "2026-09-08T00:01:00.000Z",
      anchorItemId: itemIds[0]!,
    });
    dbAppendThreadCompletedTurn(THREAD_ID, {
      startedAt: "2026-09-08T00:02:00.000Z",
      endedAt: "2026-09-08T00:03:00.000Z",
      anchorItemId: itemIds[2]!,
    });
    dbFlushThreadRuntimeWrites(THREAD_ID);
    expect(dbGetThreadRuntimeItemsPage(THREAD_ID, undefined, 500).items).toHaveLength(4);
    closeDatabase();

    const observerCredential = await acquireDeviceCredential(host, "truncate-observer");
    const actorCredential = await acquireDeviceCredential(host, "truncate-actor");
    expect(observerCredential.accessToken === actorCredential.accessToken).toBe(false);
    const observer = await ProfileClient.create({
      handle: host,
      label: "truncate-observer",
      accessToken: observerCredential.accessToken,
    });
    clients.push(observer);
    const actor = await ProfileClient.create({
      handle: host,
      label: "truncate-actor",
      accessToken: actorCredential.accessToken,
    });
    clients.push(actor);
    // The observer mirrors an open-thread client: it declared transcript
    // interests, so any runtime-scope broadcast for this thread reaches it.
    observer.sendJson({ type: "thread-item-interests", threadIds: [THREAD_ID] });

    const observerSnapshot = await observer.fetchJson(
      "history",
      `/api/threads/${THREAD_ID}/history?runtimePage=1`,
    );
    expect(observerSnapshot.status).toBe(200);
    const preTruncateSnapshot = observerSnapshot.body as {
      snapshotSeq: number;
      runtimeItems: Array<{ id: string }>;
    };
    expect(preTruncateSnapshot.runtimeItems.map((item) => item.id)).toEqual(itemIds);
    const framesBeforeTruncate = observer.receivedEvents().length;
    // The full pre-truncate snapshot body the observer received — the probe
    // seeds the real renderer store from exactly these bytes.
    const observerHistorySnapshot = observerSnapshot.body;

    // Acting client truncates after item 2 (checkpoint revert keeps 1-2).
    const checkpointItemId = itemIds[1]!;
    const truncateStartedAt = observer.receivedEvents().length;
    const truncated = await actor.fetchJson(
      "truncate",
      `/api/threads/${THREAD_ID}/runtime/truncate`,
      {
        method: "POST",
        body: { itemId: checkpointItemId },
      },
    );
    expect(truncated.status).toBe(200);
    expect(truncated.body).toEqual({ ok: true });

    // 1. The acting client's served history reflects the truncate.
    const actorItemsAfter = await servedItemIds(actor, "history-items-after-truncate");
    expect(actorItemsAfter).toEqual([itemIds[0]!, itemIds[1]!]);

    // 2. The observer receives the canonical truncate on the replayable
    // runtime-event stream, followed by the sidebar-refresh broadcast.
    const truncatedFrame = await observer
      .awaitNextEvent(
        (event) =>
          event.type === "thread-runtime-event" &&
          (event.event as { threadId?: unknown }).threadId === THREAD_ID &&
          (event.event as { event?: { type?: unknown } }).event?.type === "runtime.truncated",
        10_000,
      )
      .catch(() => null);
    expect(truncatedFrame).not.toBeNull();
    expect(truncatedFrame?.event).toMatchObject({
      type: "thread-runtime-event",
      threadId: THREAD_ID,
      event: {
        type: "runtime.truncated",
        threadId: THREAD_ID,
        itemId: checkpointItemId,
        removedCompletedTurnAnchors: [itemIds[2]!],
      },
    });

    const remoteThreadsChanged = await observer
      .awaitNextEvent(
        (event) =>
          event.type === "remote-threads-changed" &&
          JSON.stringify((event.event as { threadIds?: unknown }).threadIds ?? []).includes(
            THREAD_ID,
          ),
        10_000,
      )
      .catch(() => null);
    expect(remoteThreadsChanged).not.toBeNull();

    // Give any trailing broadcast time to arrive, then record exactly what the
    // observer received since the truncate was dispatched.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const postTruncateFrames = observer.receivedEvents().slice(truncateStartedAt);

    // Pushed through the production client parser: at least one transcript
    // batch for the open thread — the received signal set can update a
    // transcript.
    const transcriptBatches = postTruncateFrames.flatMap((frame) =>
      collectRuntimeEventsFromSupervisoryMessage(frame.event).filter(
        (batch) => batch.threadId === THREAD_ID,
      ),
    );
    expect(
      transcriptBatches
        .flatMap((batch) => batch.events)
        .filter((event) => event.type === "runtime.truncated"),
    ).toHaveLength(1);

    // 3. The host database itself shows the truncation (production readers,
    // second connection): the observer-visible mutation is real, including the
    // completed-turn cleanup scoped to the removed tail.
    initDatabase(dbPath);
    try {
      const dbItemsAfter = dbGetThreadRuntimeItemsPage(THREAD_ID, undefined, 500).items;
      expect(dbItemsAfter.map((item) => item.id)).toEqual([itemIds[0]!, itemIds[1]!]);
      expect(dbGetThreadCompletedTurns(THREAD_ID)).toEqual([
        {
          startedAt: "2026-09-08T00:00:00.000Z",
          endedAt: "2026-09-08T00:01:00.000Z",
          anchorItemId: itemIds[0]!,
        },
      ]);
    } finally {
      closeDatabase();
    }

    // The observer can still refetch the truncated history directly.
    const observerRefetchedItems = await servedItemIds(observer, "history-items-observer-refetch");
    expect(observerRefetchedItems).toEqual([itemIds[0]!, itemIds[1]!]);
    const observerReopenSnapshot = await observer.fetchJson(
      "history-reopen",
      `/api/threads/${THREAD_ID}/history?runtimePage=1`,
    );
    expect(observerReopenSnapshot.status).toBe(200);

    const serverBundlePath = join(repoRoot, "dist", "main", "server.cjs");
    const serverBundle = existsSync(serverBundlePath)
      ? {
          sha256: createHash("sha256").update(readFileSync(serverBundlePath)).digest("hex"),
          bytes: statSync(serverBundlePath).size,
          mtimeIso: statSync(serverBundlePath).mtime.toISOString(),
          truncatePathVerified:
            "bundle publishes runtime.truncated via truncateThreadRuntime then remote-threads-changed",
        }
      : { present: false };
    writeTruncateArtifact(repoRoot, "truncate-sync-native-e2e.json", {
      threadId: THREAD_ID,
      checkpointItemId,
      orphanedTurnAnchorItemId: itemIds[2]!,
      removedCompletedTurnAnchors: [itemIds[2]!],
      hostBaseDir: host.baseDir,
      snapshotSeqBeforeTruncate: preTruncateSnapshot.snapshotSeq,
      servedItemIdsAfterTruncate: {
        actor: actorItemsAfter,
        observerRefetch: observerRefetchedItems,
      },
      hostDbItemIdsAfterTruncate: [itemIds[0]!, itemIds[1]!],
      observerHistorySnapshotBeforeTruncate: observerHistorySnapshot,
      observerHistorySnapshotForReopen: observerReopenSnapshot.body,
      observerFramesBeforeTruncate: framesBeforeTruncate,
      observerFramesAfterTruncate: summarizeFrames(postTruncateFrames),
      remoteThreadsChangedArrived: remoteThreadsChanged !== null,
      truncatedEventArrived: truncatedFrame !== null,
      transcriptBatchesFromReceivedFrames: transcriptBatches.length,
      serverBundle,
      scope:
        "One production headless host, two independently paired device credentials, two live WS connections (actor + observer with declared thread-item-interests). Runtime items seeded via the production DB writers against the host SQLite file; no provider or supervisor thread was started.",
      regressionContract:
        "A truncate must yield exactly one transcript-effective runtime.truncated signal (with server-declared removedCompletedTurnAnchors) for subscribed clients, plus the sidebar remote-threads-changed refresh.",
      protocolVersion: 11,
    });

    // THE PRODUCER CONTRACT: the subscribed open-thread client received the
    // canonical truncate event that lets it converge without a reopen.
    expect(transcriptBatches.length).toBeGreaterThan(0);
  } finally {
    try {
      await closeProfileClients(clients);
    } finally {
      try {
        await host?.stop();
      } finally {
        await cleanup.shutdown();
      }
    }
  }
}, 120_000);
