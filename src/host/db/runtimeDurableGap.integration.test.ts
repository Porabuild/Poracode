import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbDeleteThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbGetThreadRuntimeItems,
  dbReplaceThreadRuntimeSnapshot,
  dbTruncateThreadRuntimeAfter,
} from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { RuntimeDurableGapStore } from "./runtimeDurableGap";
import {
  armRuntimeThreadForLaunch,
  getRuntimeContamination,
  getRuntimeDurableGapPendingThreadIds,
  getRuntimePersistenceState,
  resetRuntimePersistenceForTests,
  runtimePersistenceController,
} from "./runtimePersistenceRuntime";
import {
  RuntimePersistenceContaminatedError,
  RuntimePersistenceUnknownThreadError,
} from "./runtimePersistenceTypes";

const A = "thread-integration-a";
const B = "thread-integration-b";

function started(threadId: string, itemId: string): RuntimeEvent {
  return {
    type: "item.started",
    threadId,
    itemId,
    itemType: "assistant_message",
  } as RuntimeEvent;
}

function delta(threadId: string, itemId: string, text: string): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId,
    stream: "assistant_text",
    delta: text,
  } as RuntimeEvent;
}

function epochRow(): { epoch: number; armed: number } {
  return getSqlite()
    .prepare("SELECT epoch, armed FROM runtime_persistence_epoch WHERE id = 1")
    .get() as { epoch: number; armed: number };
}

function touchEpochs(threadId: string): number[] {
  return (
    getSqlite()
      .prepare("SELECT epoch FROM thread_runtime_epoch_touches WHERE thread_id = ? ORDER BY epoch")
      .all(threadId) as Array<{ epoch: number }>
  ).map((row) => row.epoch);
}

function gapRow(threadId: string): { reason: string } | undefined {
  return getSqlite()
    .prepare("SELECT reason FROM thread_runtime_gaps WHERE thread_id = ?")
    .get(threadId) as { reason: string } | undefined;
}

function totalChanges(): number {
  return (getSqlite().prepare("SELECT total_changes() AS n").get() as { n: number }).n;
}

describe.skipIf(!sqliteAvailable)(
  "runtime durable-gap integration (real SQLite, runtime owner)",
  () => {
    let dir: string;
    let dbPath: string;

    beforeEach(() => {
      if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
      vi.useRealTimers();
      dir = mkdtempSync(join(tmpdir(), "poracode-durable-gap-integration-"));
      dbPath = join(dir, "state.sqlite");
      initDatabase(dbPath);
      dbUpsertProject(
        {
          id: "project-1",
          name: "Gap project",
          location: { kind: "posix", path: "/tmp/project" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      );
      dbUpsertThread({ ...testThread(), id: A }, 0);
      dbUpsertThread({ ...testThread(), id: B }, 1);
      resetRuntimePersistenceForTests();
    });

    afterEach(() => {
      vi.useRealTimers();
      resetRuntimePersistenceForTests();
      closeDatabase();
      rmSync(dir, { recursive: true, force: true });
      delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    });

    it("GET never arms or writes; the first canonical admission arms and touches before acceptance", async () => {
      // Pure reads on a never-admitted boot: no root arm, no touch, no writes.
      await expect(dbGetThreadRuntimeItems(A)).resolves.toEqual([]);
      expect(getRuntimeContamination(A)).toBeNull();
      await dbGetThreadRuntimeItems(A);
      expect(epochRow()).toEqual({ epoch: 0, armed: 0 });
      expect(touchEpochs(A)).toEqual([]);

      const before = totalChanges();
      await dbGetThreadRuntimeItems(A);
      expect(totalChanges()).toBe(before);

      // First admission arms the boot and commits the touch before acceptance.
      expect(dbApplyThreadRuntimeEvents(A, [started(A, "one")]).kind).toBe("accepted");
      expect(epochRow()).toEqual({ epoch: 1, armed: 1 });
      expect(touchEpochs(A)).toEqual([1]);
      // A second admission in the same boot adds no epoch/touch row.
      expect(dbApplyThreadRuntimeEvents(A, [delta(A, "one", "x")]).kind).toBe("accepted");
      expect(epochRow()).toEqual({ epoch: 1, armed: 1 });
      expect(touchEpochs(A)).toEqual([1]);
    });

    it("a GET-only boot on a crashed armed database resolves suspect with zero writes", async () => {
      // Boot 1 arms and touches A, then "crashes" without the close hook.
      const crashBoot = new RuntimeDurableGapStore();
      crashBoot.bind(getSqlite());
      crashBoot.arm();
      crashBoot.touch(A);
      closeDatabase();

      // Boot 2 only reads: the virtual boot epoch marks the surviving touch.
      initDatabase(dbPath);
      const epochBefore = epochRow();
      const touchesBefore = touchEpochs(A);
      const before = totalChanges();
      expect(getRuntimeContamination(A)?.reason).toBe("unclean-epoch");
      await expect(dbGetThreadRuntimeItems(A)).rejects.toBeInstanceOf(
        RuntimePersistenceContaminatedError,
      );
      expect(epochRow()).toEqual(epochBefore);
      expect(touchEpochs(A)).toEqual(touchesBefore);
      expect(totalChanges()).toBe(before);
      expect(getRuntimePersistenceState()?.state).not.toBe("refusing");
    });

    it("an unarmed boot refuses canonical batches globally while reads still resolve", () => {
      const sqlite = getSqlite();
      sqlite.pragma("query_only = ON");
      try {
        const admission = dbApplyThreadRuntimeEvents(A, [started(A, "lost")]);
        expect(admission).toMatchObject({ kind: "refused", reason: "degraded", scope: "global" });
        // Nothing was accepted, and the failed exact evidence is tracked.
        expect(getRuntimePersistenceState()?.pendingEvents).toBe(0);
        expect(epochRow()).toEqual({ epoch: 0, armed: 0 });
        expect(touchEpochs(A)).toEqual([]);
        expect(getRuntimeDurableGapPendingThreadIds()).toContain(A);
        expect(getRuntimeContamination(A)?.reason).toBe("degraded");
        // An unrelated thread has no refusal evidence: its read stays clean.
        expect(getRuntimeContamination(B)).toBeNull();
      } finally {
        sqlite.pragma("query_only = OFF");
      }

      // Storage recovered: the pending evidence commits through the same finalize
      // the close hook runs, and after the stable window the boot re-arms and
      // accepts for a clean thread (the unarmed interval accepted nothing).
      runtimePersistenceController.finalizeDurableGapClose();
      expect(getRuntimeDurableGapPendingThreadIds()).toEqual([]);
      expect(gapRow(A)).toMatchObject({ reason: "degraded" });
      const recoveredAt = Date.now() + 10_000;
      vi.useFakeTimers();
      vi.setSystemTime(recoveredAt);
      runtimePersistenceController.runControlWrite(() => undefined);
      expect(getRuntimePersistenceState()?.state).not.toBe("refusing");
      expect(dbApplyThreadRuntimeEvents(B, [started(B, "later")]).kind).toBe("accepted");
      vi.useRealTimers();
      expect(epochRow()).toEqual({ epoch: 1, armed: 1 });
      expect(touchEpochs(B)).toEqual([1]);
    });

    it("an authoritative rebase clears gap + older touches atomically, keeps the live touch, and never truncates", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      dbApplyThreadRuntimeEvents(A, [started(A, "one")]);
      vi.setSystemTime(new Date("2026-01-01T00:00:31.000Z"));
      const refused = dbApplyThreadRuntimeEvents(A, [delta(A, "one", "aged out")]);
      expect(refused).toMatchObject({ kind: "refused", reason: "age", scope: "global" });
      expect(gapRow(A)).toMatchObject({ reason: "age" });
      expect(touchEpochs(A)).toEqual([1]);
      vi.useRealTimers();

      // Truncate is not an authoritative rebase: it refuses typed and never
      // clears durable evidence.
      expect(() => dbTruncateThreadRuntimeAfter(A, "one")).toThrow(
        RuntimePersistenceContaminatedError,
      );
      expect(gapRow(A)).toMatchObject({ reason: "age" });
      expect(touchEpochs(A)).toEqual([1]);

      // A leftover touch from an older crash must go with the rebase.
      getSqlite()
        .prepare(
          "INSERT INTO thread_runtime_epoch_touches (thread_id, epoch, touched_at) VALUES (?, 0, 1)",
        )
        .run(A);

      await dbReplaceThreadRuntimeSnapshot(A, [], [], null);
      expect(gapRow(A)).toBeUndefined();
      // The live producer's current-boot touch is preserved by the same
      // transaction, so a post-rebase admission cannot fall into a re-touch gap.
      expect(touchEpochs(A)).toEqual([1]);
      expect(getRuntimeContamination(A)).toBeNull();

      // The age refusal closed global admission; after the stable window a
      // successful write recovers, and the post-rebase admission is accepted
      // with the preserved touch (no second touch row, no new gap).
      const recoveredAt = Date.now() + 10_000;
      vi.useFakeTimers();
      vi.setSystemTime(recoveredAt);
      runtimePersistenceController.runControlWrite(() => undefined);
      expect(dbApplyThreadRuntimeEvents(A, [started(A, "after")]).kind).toBe("accepted");
      vi.useRealTimers();
      expect(touchEpochs(A)).toEqual([1]);
      expect(gapRow(A)).toBeUndefined();
    });

    it("delete cascades the durable evidence and forgets the in-memory markers", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      dbApplyThreadRuntimeEvents(A, [started(A, "one")]);
      vi.setSystemTime(new Date("2026-01-01T00:00:31.000Z"));
      dbApplyThreadRuntimeEvents(A, [delta(A, "one", "aged")]);
      vi.useRealTimers();
      expect(gapRow(A)).toBeDefined();
      expect(getRuntimeContamination(A)?.reason).toBe("age");

      dbDeleteThread(A);
      expect(gapRow(A)).toBeUndefined();
      expect(touchEpochs(A)).toEqual([]);
      expect(getRuntimeContamination(A)).toBeNull();

      // A reused thread id does not inherit the old marker.
      dbUpsertThread({ ...testThread(), id: A }, 0);
      expect(getRuntimeContamination(A)).toBeNull();
      expect(dbApplyThreadRuntimeEvents(A, [started(A, "fresh")]).kind).toBe("accepted");
    });

    it("canonical events for an unknown thread are refused explicitly without fabricated evidence", () => {
      const admission = dbApplyThreadRuntimeEvents("thread-gone", [started("thread-gone", "x")]);
      expect(admission).toMatchObject({
        kind: "refused",
        reason: "unknown-thread",
        scope: "thread",
      });
      // The batch was never accepted (no silent no-op write); no gap row is
      // fabricated for a thread that cannot own one, so a later close is not
      // blocked by unpersistable evidence.
      expect(getRuntimeDurableGapPendingThreadIds()).toEqual([]);
      expect(gapRow("thread-gone")).toBeUndefined();
      expect(getRuntimeContamination("thread-gone")).toBeNull();
    });

    it("an unknown thread launch is refused typed before any provider dispatch", () => {
      expect(() => armRuntimeThreadForLaunch("thread-does-not-exist")).toThrow(
        RuntimePersistenceUnknownThreadError,
      );
      // The refused launch left no touch row for the unknown id.
      expect(touchEpochs("thread-does-not-exist")).toEqual([]);
    });

    it("a storage-failed pre-launch touch refuses the launch and leaves no marker", () => {
      // Arm and touch a different thread while storage is writable so the root
      // arm is not the failing write.
      expect(dbApplyThreadRuntimeEvents(B, [started(B, "arm")]).kind).toBe("accepted");
      const sqlite = getSqlite();
      sqlite.pragma("query_only = ON");
      try {
        expect(() => armRuntimeThreadForLaunch(A)).toThrow(/readonly/i);
        expect(touchEpochs(A)).toEqual([]);
      } finally {
        sqlite.pragma("query_only = OFF");
      }
    });
  },
);
