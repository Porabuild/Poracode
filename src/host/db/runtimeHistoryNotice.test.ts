import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRuntimeHistoryNoticeToken } from "@/shared/runtimeHistoryNotice";
import type { RuntimeHistoryGapAcknowledgeResult } from "@/shared/runtimeHistoryNotice";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbDeleteThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbReplaceThreadRuntimeSnapshot } from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { RuntimeDurableGapCoordinator } from "./runtimeDurableGapCoordinator";
import {
  RuntimeDurableGapStore,
  clearThreadDurableGapRowsInTransaction,
} from "./runtimeDurableGap";
import {
  RuntimePersistenceDurableStateUnavailableError,
  RuntimePersistenceGapIdentityError,
} from "./runtimePersistenceTypes";

const A = "thread-notice-a";
const B = "thread-notice-b";
const C = "thread-notice-c";

type Sqlite = InstanceType<typeof Database>;

function touchEpochs(threadId: string, sqlite: Sqlite = getSqlite()): number[] {
  return (
    sqlite
      .prepare("SELECT epoch FROM thread_runtime_epoch_touches WHERE thread_id = ? ORDER BY epoch")
      .all(threadId) as Array<{ epoch: number }>
  ).map((row) => row.epoch);
}

function gapRow(
  threadId: string,
  sqlite: Sqlite = getSqlite(),
):
  | {
      reason: string;
      refused_events: number;
      refused_bytes: number;
      epoch: number;
      created_at: number;
      episode_id: string | null;
    }
  | undefined {
  return sqlite
    .prepare(
      "SELECT reason, refused_events, refused_bytes, epoch, created_at, episode_id FROM thread_runtime_gaps WHERE thread_id = ?",
    )
    .get(threadId) as
    | {
        reason: string;
        refused_events: number;
        refused_bytes: number;
        epoch: number;
        created_at: number;
        episode_id: string | null;
      }
    | undefined;
}

function noticeRow(threadId: string, sqlite: Sqlite = getSqlite()) {
  return sqlite
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
        first_acknowledged_at: number;
        last_acknowledged_at: number;
      }
    | undefined;
}

/** Byte-level digest of every committed runtime row for one thread. */
function itemDigest(threadId: string, sqlite: Sqlite = getSqlite()): string {
  return JSON.stringify(
    sqlite
      .prepare(
        "SELECT item_id, position, type, state, payload, streams, parent_item_id FROM thread_runtime_items WHERE thread_id = ? ORDER BY position, item_id",
      )
      .all(threadId),
  );
}

function changes(sqlite: Sqlite = getSqlite()): number {
  const row = sqlite.pragma("total_changes", { simple: true });
  return typeof row === "number" ? row : 0;
}

/** Assert + narrow an acknowledgement result to its `applied` arm. */
function appliedOf(
  result: RuntimeHistoryGapAcknowledgeResult,
): Extract<RuntimeHistoryGapAcknowledgeResult, { outcome: "applied" }> {
  expect(result.outcome).toBe("applied");
  if (result.outcome !== "applied") throw new Error("expected an applied acknowledgement");
  return result;
}

describe.skipIf(!sqliteAvailable)("runtime history notice store (real SQLite)", () => {
  let dir: string;
  let dbPath: string;
  const coordinators: RuntimeDurableGapCoordinator[] = [];

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-history-notice-"));
    dbPath = join(dir, "state.sqlite");
    initDatabase(dbPath);
    dbUpsertProject(
      {
        id: "project-1",
        name: "Notice project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    for (const [index, id] of [A, B, C].entries()) {
      dbUpsertThread({ ...testThread(), id }, index);
    }
  });

  afterEach(() => {
    for (const coordinator of coordinators) coordinator.resetForTests();
    coordinators.length = 0;
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function stack(
    options: {
      now?: () => number;
      noticeLookupCacheMaxEntries?: number;
    } = {},
  ): RuntimeDurableGapCoordinator {
    const coordinator = new RuntimeDurableGapCoordinator({
      ...(options.now ? { now: options.now } : {}),
      ...(options.noticeLookupCacheMaxEntries !== undefined
        ? { noticeLookupCacheMaxEntries: options.noticeLookupCacheMaxEntries }
        : {}),
      onStorageFailure: vi.fn<(error: unknown) => void>(),
      onReserveOverflow: vi.fn<() => void>(),
    });
    coordinator.attachAndArm(getSqlite());
    coordinators.push(coordinator);
    return coordinator;
  }

  it("descriptor reads are SELECT-only, exact for a gap, suspect for a foreign touch, null when clean", () => {
    const first = stack();
    first.armThreadForAdmission(A);
    first.armThreadForAdmission(B);
    first.recordGap(A, "age", 3, 30);

    const before = changes();
    const descriptorA = first.getGapDescriptor(A);
    expect(first.getGapDescriptor(C)).toBeNull();
    expect(changes()).toBe(before);

    const parsedA = parseRuntimeHistoryNoticeToken(descriptorA?.token);
    expect(parsedA).toMatchObject({ kind: "exact" });
    expect(descriptorA).toMatchObject({
      threadId: A,
      source: "exact",
      reason: "age",
      refusedEvents: 3,
      refusedBytes: 30,
    });
    expect((parsedA as { episodeId: string }).episodeId).toBe(gapRow(A)?.episode_id);

    // A second boot: A's exact gap still wins, B's surviving touch is suspect.
    const second = stack();
    const descriptorB = second.getGapDescriptor(B);
    expect(descriptorB).toMatchObject({
      threadId: B,
      source: "suspect",
      reason: "unclean-epoch",
      refusedEvents: 0,
      refusedBytes: 0,
    });
    expect(parseRuntimeHistoryNoticeToken(descriptorB?.token)).toMatchObject({ kind: "suspect" });
    expect(second.getGapDescriptor(A)?.token).toBe(descriptorA?.token);
  });

  it("a missing or malformed persisted episode identity refuses typed instead of minting a token", () => {
    const coordinator = stack();
    coordinator.recordGap(A, "age", 1, 10);
    getSqlite()
      .prepare("UPDATE thread_runtime_gaps SET episode_id = NULL WHERE thread_id = ?")
      .run(A);
    expect(() => coordinator.getGapDescriptor(A)).toThrow(RuntimePersistenceGapIdentityError);
    getSqlite()
      .prepare("UPDATE thread_runtime_gaps SET episode_id = 'not-a-uuid' WHERE thread_id = ?")
      .run(A);
    expect(() => coordinator.getGapDescriptor(A)).toThrow(RuntimePersistenceGapIdentityError);
    // Admission still refuses the thread: corrupt identity is never clean.
    expect(coordinator.resolve(A)).toMatchObject({ kind: "exact" });
  });

  it("applied ack clears only the matching gap and foreign touches, keeps the current touch and committed bytes", async () => {
    await dbReplaceThreadRuntimeSnapshot(
      A,
      [
        {
          id: "item-1",
          type: "command_execution",
          state: "completed",
          streams: { command_output: "durable output" },
        },
      ],
      [],
      null,
    );
    const digestBefore = itemDigest(A);

    const coordinator = stack();
    coordinator.armThreadForAdmission(A);
    coordinator.recordGap(A, "age", 2, 200);
    const episodeId = gapRow(A)?.episode_id;
    // A leftover touch from a crashed older boot.
    getSqlite()
      .prepare(
        "INSERT INTO thread_runtime_epoch_touches (thread_id, epoch, touched_at) VALUES (?, 0, 1)",
      )
      .run(A);
    expect(touchEpochs(A)).toEqual([0, 1]);

    const descriptor = coordinator.getGapDescriptor(A)!;
    const applied = appliedOf(
      coordinator.acknowledgeThreadGap(A, descriptor.token, { events: 0, bytes: 0 }),
    );
    expect(applied.descriptor.token).toBe(descriptor.token);
    expect(applied.supersededAcceptedEvents).toBe(0);

    expect(gapRow(A)).toBeUndefined();
    expect(touchEpochs(A)).toEqual([1]);
    expect(itemDigest(A)).toBe(digestBefore);
    expect(coordinator.getGapDescriptor(A)).toBeNull();
    expect(coordinator.resolve(A)).toEqual({ kind: "clean" });
    expect(noticeRow(A)).toMatchObject({
      acknowledged_token: descriptor.token,
      source: "exact",
      reason: "age",
      refused_events: 2,
      refused_bytes: 200,
      acknowledged_count: 1,
    });
    expect(episodeId).toBeTruthy();
    expect(coordinator.getNotice(A)?.acknowledgedToken).toBe(descriptor.token);
    expect(coordinator.lookupNotice(A)).toEqual({ kind: "notice" });
  });

  it("stale and already acknowledgements perform zero writes and zero cache changes", () => {
    const coordinator = stack({ now: () => 5_000 });
    coordinator.recordGap(A, "age", 1, 10);
    const descriptor = coordinator.getGapDescriptor(A)!;

    const bogus = "gap2:e00000000-0000-4000-8000-000000000000";
    let before = changes();
    expect(coordinator.acknowledgeThreadGap(A, bogus, { events: 0, bytes: 0 })).toMatchObject({
      outcome: "stale",
      current: { token: descriptor.token },
    });
    expect(changes()).toBe(before);
    // Malformed token is stale too, never a match.
    expect(
      coordinator.acknowledgeThreadGap(A, "gap9:whatever", { events: 0, bytes: 0 }),
    ).toMatchObject({ outcome: "stale" });
    expect(gapRow(A)?.episode_id).toBeTruthy();

    const applied = coordinator.acknowledgeThreadGap(A, descriptor.token, { events: 0, bytes: 0 });
    expect(applied.outcome).toBe("applied");
    before = changes();
    expect(
      coordinator.acknowledgeThreadGap(A, descriptor.token, { events: 0, bytes: 0 }),
    ).toMatchObject({ outcome: "already" });
    expect(changes()).toBe(before);
    expect(noticeRow(A)).toMatchObject({ acknowledged_count: 1, refused_events: 1 });

    // A differently-cased spelling of the same exact identity is still the
    // replay of that ack, not a stale request.
    const parsed = parseRuntimeHistoryNoticeToken(descriptor.token) as {
      kind: "exact";
      episodeId: string;
    };
    before = changes();
    expect(
      coordinator.acknowledgeThreadGap(A, `gap2:e${parsed.episodeId.toUpperCase()}`, {
        events: 0,
        bytes: 0,
      }),
    ).toMatchObject({ outcome: "already" });
    expect(changes()).toBe(before);
  });

  it("a new episode after ack/reset/delete gets a fresh UUID under a frozen clock, and retry A cannot clear it", () => {
    const frozen = () => 1_000;
    const coordinator = stack({ now: frozen });
    coordinator.recordGap(A, "age", 1, 10);
    const tokenA = coordinator.getGapDescriptor(A)!.token;
    expect(coordinator.acknowledgeThreadGap(A, tokenA, { events: 0, bytes: 0 }).outcome).toBe(
      "applied",
    );

    // Same millisecond, same counters: still a brand-new episode identity.
    coordinator.recordGap(A, "age", 1, 10);
    const tokenB = coordinator.getGapDescriptor(A)!.token;
    expect(tokenB).not.toBe(tokenA);
    const applied = appliedOf(coordinator.acknowledgeThreadGap(A, tokenB, { events: 0, bytes: 0 }));
    expect(applied.notice.acknowledgedCount).toBe(2);
    expect(applied.notice.refusedEvents).toBe(2);
    expect(applied.notice.firstAcknowledgedAt).toBe(1_000);

    // Episode C after a deleted gap row: again a fresh identity, and retrying B
    // is an idempotent `already` that leaves C untouched.
    coordinator.recordGap(A, "shutdown", 5, 50);
    const tokenC = coordinator.getGapDescriptor(A)!.token;
    expect(tokenC).not.toBe(tokenB);
    const before = changes();
    expect(coordinator.acknowledgeThreadGap(A, tokenB, { events: 0, bytes: 0 })).toMatchObject({
      outcome: "already",
    });
    expect(changes()).toBe(before);
    expect(coordinator.getGapDescriptor(A)!.token).toBe(tokenC);
    expect(coordinator.acknowledgeThreadGap(A, tokenC, { events: 0, bytes: 0 }).outcome).toBe(
      "applied",
    );
  });

  it("late refusals in the same episode accumulate and are exact at delete time", () => {
    const coordinator = stack({ now: () => 77 });
    coordinator.recordGap(A, "age", 1, 10);
    coordinator.recordGap(A, "age", 2, 20);
    coordinator.recordGap(A, "thread-bytes", 4, 40);
    const descriptor = coordinator.getGapDescriptor(A)!;
    expect(descriptor).toMatchObject({
      reason: "thread-bytes",
      refusedEvents: 7,
      refusedBytes: 70,
      createdAt: 77,
    });
    const applied = coordinator.acknowledgeThreadGap(A, descriptor.token, { events: 0, bytes: 0 });
    expect(applied).toMatchObject({
      outcome: "applied",
      notice: { refusedEvents: 7, refusedBytes: 70, reason: "thread-bytes" },
    });
  });

  it("a failing notice insert rolls the whole transaction back: gap and touches survive", () => {
    const coordinator = stack();
    coordinator.recordGap(A, "age", 1, 10);
    getSqlite()
      .prepare(
        "INSERT INTO thread_runtime_epoch_touches (thread_id, epoch, touched_at) VALUES (?, 0, 1)",
      )
      .run(A);
    const descriptor = coordinator.getGapDescriptor(A)!;
    getSqlite().exec(`
      CREATE TRIGGER fail_notice_insert BEFORE INSERT ON thread_runtime_gap_notices
      BEGIN SELECT RAISE(ABORT, 'injected notice failure'); END;
    `);
    expect(() =>
      coordinator.acknowledgeThreadGap(A, descriptor.token, { events: 0, bytes: 0 }),
    ).toThrow(/injected notice failure/);

    expect(gapRow(A)).toMatchObject({ reason: "age", refused_events: 1 });
    // The trigger aborts AFTER the foreign-touch delete inside the same
    // transaction: the touch surviving proves the whole transaction rolled back.
    expect(touchEpochs(A)).toEqual([0]);
    expect(noticeRow(A)).toBeUndefined();
    // The correction is possible: with the trigger gone the ack applies.
    getSqlite().exec("DROP TRIGGER fail_notice_insert");
    expect(
      coordinator.acknowledgeThreadGap(A, descriptor.token, { events: 0, bytes: 0 }),
    ).toMatchObject({ outcome: "applied" });
  });

  it("a pending refusal obligation is folded into the applied notice and dropped only then", () => {
    const coordinator = stack();
    coordinator.recordGap(A, "age", 1, 10);
    getSqlite().pragma("query_only = ON");
    try {
      coordinator.recordGap(A, "age", 2, 20);
    } finally {
      getSqlite().pragma("query_only = OFF");
    }
    expect(coordinator.pendingObligationFor(A)).toEqual({ refusedEvents: 2, refusedBytes: 20 });

    const descriptor = coordinator.getGapDescriptor(A)!;
    const applied = coordinator.acknowledgeThreadGap(A, descriptor.token, {
      events: 0,
      bytes: 0,
    });
    expect(applied).toMatchObject({
      outcome: "applied",
      notice: { refusedEvents: 3, refusedBytes: 30 },
    });
    expect(coordinator.pendingObligationFor(A)).toBeNull();
  });

  it("a stale acknowledgement never drops a pending obligation", () => {
    const coordinator = stack();
    coordinator.recordGap(A, "age", 1, 10);
    getSqlite().pragma("query_only = ON");
    try {
      coordinator.recordGap(A, "age", 2, 20);
    } finally {
      getSqlite().pragma("query_only = OFF");
    }
    expect(
      coordinator.acknowledgeThreadGap(A, "gap2:e00000000-0000-4000-8000-000000000000", {
        events: 0,
        bytes: 0,
      }),
    ).toMatchObject({ outcome: "stale" });
    expect(coordinator.pendingObligationFor(A)).toEqual({ refusedEvents: 2, refusedBytes: 20 });
    expect(noticeRow(A)).toBeUndefined();
  });

  it("never folds another root's pending obligation into a rebound database's notice", () => {
    const otherPath = join(dir, "other.sqlite");
    const coordinator = stack();
    coordinator.recordGap(A, "age", 1, 10);
    getSqlite().pragma("query_only = ON");
    try {
      coordinator.recordGap(A, "age", 2, 20);
    } finally {
      getSqlite().pragma("query_only = OFF");
    }
    expect(coordinator.pendingObligationFor(A)).toEqual({ refusedEvents: 2, refusedBytes: 20 });

    closeDatabase();
    initDatabase(otherPath);
    dbUpsertProject(
      {
        id: "project-1",
        name: "Other project",
        location: { kind: "posix", path: "/tmp/other" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), id: A }, 0);
    coordinator.resetForConnection();
    coordinator.attachAndArm(getSqlite());
    coordinator.recordGap(A, "age", 7, 70);
    const descriptor = coordinator.getGapDescriptor(A)!;
    const applied = coordinator.acknowledgeThreadGap(A, descriptor.token, { events: 0, bytes: 0 });
    expect(applied).toMatchObject({
      outcome: "applied",
      notice: { refusedEvents: 7, refusedBytes: 70 },
    });
    // The old root's obligation is evidence for that root: untouched here.
    expect(coordinator.pendingThreadIds()).toEqual([A]);
  });

  it("unarmed and unbound stores fail closed instead of assuming a clean transcript", () => {
    const unbound = new RuntimeDurableGapCoordinator({
      onStorageFailure: vi.fn<(error: unknown) => void>(),
      onReserveOverflow: vi.fn<() => void>(),
    });
    coordinators.push(unbound);
    expect(() => unbound.getGapDescriptor(A)).toThrow(
      RuntimePersistenceDurableStateUnavailableError,
    );
    expect(() => unbound.acknowledgeThreadGap(A, "gap2:s1", { events: 0, bytes: 0 })).toThrow(
      RuntimePersistenceDurableStateUnavailableError,
    );
    expect(unbound.lookupNotice(A)).toMatchObject({ kind: "error" });

    const unarmed = new RuntimeDurableGapCoordinator({
      onStorageFailure: vi.fn<(error: unknown) => void>(),
      onReserveOverflow: vi.fn<() => void>(),
    });
    coordinators.push(unarmed);
    unarmed.bindForConnection(getSqlite());
    expect(unarmed.getGapDescriptor(C)).toBeNull();
    expect(() => unarmed.acknowledgeThreadGap(A, "gap2:s1", { events: 0, bytes: 0 })).toThrow(
      RuntimePersistenceDurableStateUnavailableError,
    );
  });

  it("the notice survives rebase and truncation, and thread deletion cascades it", async () => {
    const coordinator = stack();
    coordinator.recordGap(A, "age", 1, 10);
    const token = coordinator.getGapDescriptor(A)!.token;
    expect(coordinator.acknowledgeThreadGap(A, token, { events: 0, bytes: 0 }).outcome).toBe(
      "applied",
    );
    await dbReplaceThreadRuntimeSnapshot(
      A,
      [
        {
          id: "item-1",
          type: "command_execution",
          state: "completed",
          streams: { command_output: "post-ack output" },
        },
      ],
      [],
      null,
    );
    expect(coordinator.getNotice(A)?.acknowledgedToken).toBe(token);
    expect(noticeRow(A)).toMatchObject({ acknowledged_token: token });

    // A thread delete cascades the notice row; the derived lookup re-queries.
    dbDeleteThread(A);
    expect(noticeRow(A)).toBeUndefined();
    expect(coordinator.lookupNotice(A)).toEqual({ kind: "clean" });

    // Id reuse must not inherit the deleted thread's notice.
    dbUpsertThread({ ...testThread(), id: A }, 0);
    expect(coordinator.getNotice(A)).toBeNull();
    expect(coordinator.lookupNotice(A)).toEqual({ kind: "clean" });

    // A new episode after the delete mints a fresh identity: the acknowledged
    // token can never alias a later episode on the reused id.
    coordinator.recordGap(A, "age", 1, 10);
    expect(coordinator.getGapDescriptor(A)!.token).not.toBe(token);
  });

  it("the derived notice lookup is bounded, re-queries on eviction, and invalidates on data change", () => {
    const coordinator = stack({ noticeLookupCacheMaxEntries: 1 });
    expect(coordinator.lookupNotice(A)).toEqual({ kind: "clean" });
    expect(coordinator.lookupNotice(B)).toEqual({ kind: "clean" });
    expect(coordinator.noticeLookupCacheSize()).toBe(1);

    // Bypass the ack path (another writer is impossible in-process, but the
    // cache must never answer from a derived miss): a durable notice inserted
    // behind the cache is found once the entry re-queries.
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_gap_notices
           (thread_id, acknowledged_token, source, reason, refused_events, refused_bytes,
            acknowledged_count, first_acknowledged_at, last_acknowledged_at)
         VALUES (?, 'gap2:e22222222-2222-4222-8222-222222222222', 'exact', 'age', 1, 10, 1, 1, 1)`,
      )
      .run(A);
    expect(coordinator.lookupNotice(A)).toEqual({ kind: "notice" });

    // A project/thread data change (renderer sync, bulk delete) drops the
    // derived cache; the durable row still answers.
    dbUpsertThread({ ...testThread(), id: C }, 3);
    expect(coordinator.noticeLookupCacheSize()).toBe(0);
    expect(coordinator.lookupNotice(A)).toEqual({ kind: "notice" });
    expect(coordinator.getNotice(A)?.acknowledgedToken).toBe(
      "gap2:e22222222-2222-4222-8222-222222222222",
    );

    // Ack keeps the derived answer positive for the just-acknowledged thread.
    const coordinatorB = stack();
    coordinatorB.recordGap(B, "age", 1, 10);
    const token = coordinatorB.getGapDescriptor(B)!.token;
    expect(coordinatorB.acknowledgeThreadGap(B, token, { events: 0, bytes: 0 }).outcome).toBe(
      "applied",
    );
    expect(coordinatorB.lookupNotice(B)).toEqual({ kind: "notice" });
  });

  it("answers correctly beyond the lookup cache bound without retaining an id set", () => {
    const coordinator = stack({ noticeLookupCacheMaxEntries: 2 });
    const extraIds = ["thread-notice-x", "thread-notice-y"];
    for (const id of extraIds) dbUpsertThread({ ...testThread(), id }, 9);
    const allIds = [A, B, C, ...extraIds];
    const insertNotice = getSqlite().prepare(
      `INSERT INTO thread_runtime_gap_notices
         (thread_id, acknowledged_token, source, reason, refused_events, refused_bytes,
          acknowledged_count, first_acknowledged_at, last_acknowledged_at)
       VALUES (?, ?, 'exact', 'age', 1, 10, 1, 1, 1)`,
    );
    allIds.forEach((id, index) => {
      insertNotice.run(id, `gap2:e${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`);
    });

    // More ids than the bound: every positive answer comes from the durable
    // row (eviction re-queries), never from a retained full-table id set.
    for (const id of allIds) expect(coordinator.lookupNotice(id)).toEqual({ kind: "notice" });
    expect(coordinator.noticeLookupCacheSize()).toBeLessThanOrEqual(2);
    // The first (long-evicted) id still answers, and deletion still wins.
    expect(coordinator.lookupNotice(A)).toEqual({ kind: "notice" });
    expect(coordinator.noticeLookupCacheSize()).toBeLessThanOrEqual(2);
    dbDeleteThread(A);
    expect(coordinator.lookupNotice(A)).toEqual({ kind: "clean" });
  });

  it("a rebase-cleared episode mints a fresh identity even when the clock moves backward", () => {
    let now = 10_000;
    const coordinator = stack({ now: () => now });
    coordinator.recordGap(A, "age", 1, 10);
    const first = coordinator.getGapDescriptor(A)!.token;

    now = 9_000; // backward clock: identity must not depend on time
    getSqlite().transaction(() => {
      clearThreadDurableGapRowsInTransaction(getSqlite(), A, null);
    })();
    coordinator.recordGap(A, "age", 1, 10);
    const second = coordinator.getGapDescriptor(A)!;
    expect(second.token).not.toBe(first);
    expect(second.createdAt).toBe(9_000);
  });

  it("accumulation preserves the episode identity allocated by the first insert", () => {
    const store = new RuntimeDurableGapStore({ now: () => 42 });
    store.bind(getSqlite());
    store.arm();
    store.persistGap(A, "age", 1, 10);
    const first = gapRow(A)?.episode_id;
    store.persistGap(A, "age", 2, 20);
    expect(gapRow(A)).toMatchObject({ refused_events: 3, refused_bytes: 30, episode_id: first });
    expect(store.resolve(A)).toMatchObject({ kind: "exact", episodeId: first, createdAt: 42 });
  });
});
