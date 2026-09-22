import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { parseRuntimeHistoryNoticeToken } from "@/shared/runtimeHistoryNotice";
import type { RuntimeHistoryGapAcknowledgeResult } from "@/shared/runtimeHistoryNotice";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbTruncateThreadRuntimeAfter,
} from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import {
  attachRuntimePersistenceDurableGapFromCurrentConnection,
  resetRuntimePersistenceForTests,
  runtimePersistenceController,
} from "./runtimePersistenceRuntime";

const A = "thread-ack-a";
const B = "thread-ack-b";

function started(threadId: string, itemId: string): RuntimeEvent {
  return {
    type: "item.started",
    threadId,
    itemId,
    itemType: "command_execution",
  } as RuntimeEvent;
}

function delta(threadId: string, itemId: string, text: string): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId,
    stream: "command_output",
    delta: text,
  } as RuntimeEvent;
}

/** A lone event above the hard per-event bound is refused `oversize`. */
function oversize(threadId: string): RuntimeEvent {
  return delta(threadId, "oversize-item", "x".repeat(9 * 1024 * 1024));
}

function gapRow(threadId: string) {
  return getSqlite()
    .prepare(
      "SELECT reason, refused_events, refused_bytes, epoch, created_at, episode_id FROM thread_runtime_gaps WHERE thread_id = ?",
    )
    .get(threadId) as
    | {
        reason: string;
        refused_events: number;
        refused_bytes: number;
        created_at: number;
        episode_id: string;
      }
    | undefined;
}

function noticeRow(threadId: string) {
  return getSqlite()
    .prepare(
      "SELECT acknowledged_token, source, reason, refused_events, refused_bytes, acknowledged_count, first_acknowledged_at, last_acknowledged_at FROM thread_runtime_gap_notices WHERE thread_id = ?",
    )
    .get(threadId) as
    | {
        acknowledged_token: string;
        source: string;
        reason: string;
        refused_events: number;
        refused_bytes: number;
        acknowledged_count: number;
      }
    | undefined;
}

function itemDigest(threadId: string): string {
  return JSON.stringify(
    getSqlite()
      .prepare(
        "SELECT item_id, position, type, state, payload, streams, parent_item_id FROM thread_runtime_items WHERE thread_id = ? ORDER BY position, item_id",
      )
      .all(threadId),
  );
}

function totalChanges(): number {
  const value = getSqlite().pragma("total_changes", { simple: true });
  return typeof value === "number" ? value : 0;
}

/** Assert + narrow an acknowledgement result to its `applied` arm. */
function appliedOf(
  result: RuntimeHistoryGapAcknowledgeResult,
): Extract<RuntimeHistoryGapAcknowledgeResult, { outcome: "applied" }> {
  expect(result.outcome).toBe("applied");
  if (result.outcome !== "applied") throw new Error("expected an applied acknowledgement");
  return result;
}

describe.skipIf(!sqliteAvailable)(
  "runtime history acknowledgement (real controller + SQLite)",
  () => {
    let dir: string;
    let dbPath: string;

    beforeEach(() => {
      if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
      dir = mkdtempSync(join(tmpdir(), "poracode-history-ack-"));
      dbPath = join(dir, "state.sqlite");
      initDatabase(dbPath);
      dbUpsertProject(
        {
          id: "project-1",
          name: "Ack project",
          location: { kind: "posix", path: "/tmp/project" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      );
      dbUpsertThread({ ...testThread(), id: A }, 0);
      dbUpsertThread({ ...testThread(), id: B }, 1);
      attachRuntimePersistenceDurableGapFromCurrentConnection();
    });

    afterEach(() => {
      resetRuntimePersistenceForTests();
      closeDatabase();
      rmSync(dir, { recursive: true, force: true });
      delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    });

    /**
     * Real canonical-gap shape for one thread: accepted events still pending in
     * the bounded queue, then a refused oversize batch that persists the exact
     * durable gap without committing the accepted prefix.
     */
    function createExactGapWithPendingPrefix(threadId: string): {
      descriptorToken: string;
      acceptedEvents: number;
    } {
      const admission = dbApplyThreadRuntimeEvents(threadId, [
        started(threadId, "item-1"),
        delta(threadId, "item-1", "committed later"),
      ]);
      expect(admission.kind).toBe("accepted");
      expect(runtimePersistenceController.hasPending(threadId)).toBe(true);
      const refusal = dbApplyThreadRuntimeEvents(threadId, [oversize(threadId)]);
      expect(refusal).toMatchObject({ kind: "refused", reason: "oversize", scope: "thread" });
      expect(runtimePersistenceController.getContamination(threadId)).toMatchObject({
        reason: "oversize",
      });
      const descriptor = runtimePersistenceController.getThreadRuntimeGapDescriptor(threadId);
      expect(descriptor).toMatchObject({ threadId, source: "exact", reason: "oversize" });
      return { descriptorToken: descriptor!.token, acceptedEvents: 2 };
    }

    it("an applied ack folds the accepted prefix into the notice, supersedes the queue, and keeps committed bytes", async () => {
      await dbFlushThreadRuntimeWrites(A);
      await dbFlushThreadRuntimeWrites(A);
      const { descriptorToken, acceptedEvents } = createExactGapWithPendingPrefix(A);
      const digestBefore = itemDigest(A);
      const gapBefore = gapRow(A)!;

      const applied = appliedOf(
        await runtimePersistenceController.acknowledgeThreadRuntimeGap(A, descriptorToken),
      );
      expect(applied.supersededAcceptedEvents).toBe(acceptedEvents);
      expect(applied.notice).toMatchObject({
        refusedEvents: gapBefore.refused_events + acceptedEvents,
        acknowledgedCount: 1,
      });

      expect(runtimePersistenceController.hasPending(A)).toBe(false);
      expect(runtimePersistenceController.getContamination(A)).toBeNull();
      expect(runtimePersistenceController.getThreadRuntimeGapDescriptor(A)).toBeNull();
      expect(gapRow(A)).toBeUndefined();
      expect(itemDigest(A)).toBe(digestBefore);
      expect(noticeRow(A)).toMatchObject({
        acknowledged_token: descriptorToken,
        source: "exact",
        refused_events: gapBefore.refused_events + acceptedEvents,
      });
      expect(runtimePersistenceController.lookupRuntimeNotice(A)).toEqual({ kind: "notice" });

      // After the applied ack the thread admits again.
      const admitted = dbApplyThreadRuntimeEvents(A, [delta(A, "item-2", "after ack")]);
      expect(admitted).toMatchObject({ kind: "accepted" });
      await dbFlushThreadRuntimeWrites(A);
    });

    it("a stale acknowledgement leaves the queue, contamination, gap, and pending obligation untouched", async () => {
      const { descriptorToken } = createExactGapWithPendingPrefix(A);
      const before = totalChanges();
      const stale = await runtimePersistenceController.acknowledgeThreadRuntimeGap(
        A,
        "gap2:e00000000-0000-4000-8000-000000000000",
      );
      expect(stale).toMatchObject({
        outcome: "stale",
        current: { token: descriptorToken },
      });
      expect(totalChanges()).toBe(before);
      expect(runtimePersistenceController.hasPending(A)).toBe(true);
      expect(runtimePersistenceController.getContamination(A)).not.toBeNull();
      expect(gapRow(A)?.episode_id).toBeTruthy();
      expect(noticeRow(A)).toBeUndefined();
    });

    it("retrying an applied token is zero-write `already` and a later episode B survives it", async () => {
      const { descriptorToken: tokenA } = createExactGapWithPendingPrefix(A);
      expect(
        await runtimePersistenceController.acknowledgeThreadRuntimeGap(A, tokenA),
      ).toMatchObject({ outcome: "applied" });

      // A late refusal opens episode B.
      const refusal = dbApplyThreadRuntimeEvents(A, [oversize(A)]);
      expect(refusal).toMatchObject({ kind: "refused", reason: "oversize" });
      const tokenB = runtimePersistenceController.getThreadRuntimeGapDescriptor(A)!.token;
      expect(tokenB).not.toBe(tokenA);

      const before = totalChanges();
      expect(
        await runtimePersistenceController.acknowledgeThreadRuntimeGap(A, tokenA),
      ).toMatchObject({ outcome: "already" });
      expect(totalChanges()).toBe(before);
      expect(runtimePersistenceController.getThreadRuntimeGapDescriptor(A)!.token).toBe(tokenB);

      const appliedB = appliedOf(
        await runtimePersistenceController.acknowledgeThreadRuntimeGap(A, tokenB),
      );
      expect(appliedB.notice.acknowledgedCount).toBe(2);
    });

    it("a failing notice write keeps the accepted queue, contamination, and gap intact", async () => {
      const { descriptorToken } = createExactGapWithPendingPrefix(A);
      getSqlite().exec(`
      CREATE TRIGGER fail_notice_insert BEFORE INSERT ON thread_runtime_gap_notices
      BEGIN SELECT RAISE(ABORT, 'injected notice failure'); END;
    `);
      await expect(
        runtimePersistenceController.acknowledgeThreadRuntimeGap(A, descriptorToken),
      ).rejects.toThrow(/injected notice failure/);
      expect(runtimePersistenceController.hasPending(A)).toBe(true);
      expect(runtimePersistenceController.getContamination(A)).not.toBeNull();
      expect(gapRow(A)).toMatchObject({ reason: "oversize" });
      expect(noticeRow(A)).toBeUndefined();

      getSqlite().exec("DROP TRIGGER fail_notice_insert");
      expect(
        await runtimePersistenceController.acknowledgeThreadRuntimeGap(A, descriptorToken),
      ).toMatchObject({ outcome: "applied" });
    });

    it("folds a pending refusal obligation into the applied notice counters", async () => {
      const { descriptorToken } = createExactGapWithPendingPrefix(A);
      // The next refusal's durable write fails: it becomes a bounded obligation.
      getSqlite().pragma("query_only = ON");
      try {
        expect(dbApplyThreadRuntimeEvents(A, [oversize(A)])).toMatchObject({ kind: "refused" });
      } finally {
        getSqlite().pragma("query_only = OFF");
      }
      expect(runtimePersistenceController.durableGapPendingThreadIds()).toContain(A);

      const applied = appliedOf(
        await runtimePersistenceController.acknowledgeThreadRuntimeGap(A, descriptorToken),
      );
      // Gap counter (1 refused oversize) + folded pending obligation (the second
      // refused oversize) + the superseded accepted prefix (2 events) are all
      // recorded; nothing is undercounted.
      expect(applied.notice.refusedEvents).toBe(4);
      expect(applied.notice.refusedBytes).toBeGreaterThan(16 * 1024 * 1024);
      expect(runtimePersistenceController.durableGapPendingThreadIds()).not.toContain(A);
    });

    it("the notice and derived lookup survive a truncate-style rebase and a normal turn", async () => {
      const { descriptorToken } = createExactGapWithPendingPrefix(A);
      const applied = await runtimePersistenceController.acknowledgeThreadRuntimeGap(
        A,
        descriptorToken,
      );
      expect(applied).toMatchObject({ outcome: "applied" });
      expect(runtimePersistenceController.getThreadRuntimeGapNotice(A)).toMatchObject({
        acknowledgedToken: descriptorToken,
      });

      // Normal turn: the notice is untouched.
      dbApplyThreadRuntimeEvents(A, [
        started(A, "item-3"),
        delta(A, "item-3", "normal turn"),
        started(A, "item-4"),
        delta(A, "item-4", "newer turn"),
      ]);
      await dbFlushThreadRuntimeWrites(A);
      expect(noticeRow(A)).toMatchObject({ acknowledged_token: descriptorToken });
      expect(runtimePersistenceController.getThreadRuntimeGapNotice(A)).not.toBeNull();

      // Truncation keeps the notice: loss already acknowledged stays acknowledged.
      expect(dbTruncateThreadRuntimeAfter(A, "item-3").truncated).toBe(true);
      expect(noticeRow(A)).toMatchObject({ acknowledged_token: descriptorToken });
      expect(runtimePersistenceController.lookupRuntimeNotice(A)).toEqual({ kind: "notice" });
    });

    it("a suspect episode is acknowledgeable with an opaque epoch token", async () => {
      // This boot touches B (epoch 1); an older crashed boot's surviving touch
      // (epoch 0) is the suspect episode. The current touch must survive the ack.
      runtimePersistenceController.armThreadForLaunch(B);
      getSqlite()
        .prepare(
          "INSERT INTO thread_runtime_epoch_touches (thread_id, epoch, touched_at) VALUES (?, 0, 1)",
        )
        .run(B);
      const descriptor = runtimePersistenceController.getThreadRuntimeGapDescriptor(B);
      expect(descriptor).toMatchObject({ source: "suspect", reason: "unclean-epoch" });
      expect(parseRuntimeHistoryNoticeToken(descriptor!.token)).toMatchObject({ kind: "suspect" });
      const applied = await runtimePersistenceController.acknowledgeThreadRuntimeGap(
        B,
        descriptor!.token,
      );
      expect(applied).toMatchObject({ outcome: "applied" });
      expect(runtimePersistenceController.getThreadRuntimeGapDescriptor(B)).toBeNull();
      expect(noticeRow(B)).toMatchObject({
        source: "suspect",
        acknowledged_token: descriptor!.token,
      });
      expect(
        getSqlite()
          .prepare("SELECT epoch FROM thread_runtime_epoch_touches WHERE thread_id = ?")
          .all(B),
      ).toEqual([{ epoch: 1 }]);
    });
  },
);
