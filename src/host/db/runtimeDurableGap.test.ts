import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import {
  RuntimeDurableGapStore,
  clearThreadDurableGapRowsInTransaction,
  identityOfRuntimeDatabase,
} from "./runtimeDurableGap";
import {
  RuntimeDurableGapCoordinator,
  type RuntimeDurableGapCoordinatorOptions,
} from "./runtimeDurableGapCoordinator";
import {
  RuntimePersistenceDurableGapPendingError,
  RuntimePersistenceUnknownThreadError,
} from "./runtimePersistenceTypes";

const A = "thread-gap-a";
const B = "thread-gap-b";
const C = "thread-gap-c";

type Sqlite = InstanceType<typeof Database>;

function epochRow(sqlite: Sqlite = getSqlite()): { epoch: number; armed: number } {
  return sqlite
    .prepare("SELECT epoch, armed FROM runtime_persistence_epoch WHERE id = 1")
    .get() as { epoch: number; armed: number };
}

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
): { reason: string; refused_events: number; refused_bytes: number; epoch: number } | undefined {
  return sqlite
    .prepare(
      "SELECT reason, refused_events, refused_bytes, epoch FROM thread_runtime_gaps WHERE thread_id = ?",
    )
    .get(threadId) as
    | { reason: string; refused_events: number; refused_bytes: number; epoch: number }
    | undefined;
}

describe.skipIf(!sqliteAvailable)("runtime durable-gap store (production schema)", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-durable-gap-"));
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
    dbUpsertThread({ ...testThread(), id: C }, 2);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function boundStore(options?: { resolutionCacheMaxEntries?: number }): RuntimeDurableGapStore {
    const store = new RuntimeDurableGapStore(options);
    store.bind(getSqlite());
    return store;
  }

  it("bind never arms or writes; the explicit arm commits the boot epoch once", () => {
    const store = boundStore();
    expect(store.getBindResult()).toMatchObject({
      boot: { epoch: 0, priorArmed: false },
      armed: false,
    });
    expect(epochRow()).toEqual({ epoch: 0, armed: 0 });
    expect(touchEpochs(A)).toEqual([]);
    expect(store.resolve(A)).toEqual({ kind: "clean" });
    // Resolution is cached but still never a write.
    expect(epochRow()).toEqual({ epoch: 0, armed: 0 });

    store.arm();
    expect(epochRow()).toEqual({ epoch: 1, armed: 1 });
    store.ensureArmed();
    expect(epochRow().epoch).toBe(1);
    expect(store.isArmed()).toBe(true);
    expect(store.getCurrentEpoch()).toBe(1);
  });

  it("exact gap evidence wins across epochs; an unknown persisted reason is never clean", () => {
    const store = boundStore();
    store.arm();
    store.persistGap(A, "age", 2, 200);
    expect(store.resolve(A)).toMatchObject({
      kind: "exact",
      reason: "age",
      refusedEvents: 2,
      refusedBytes: 200,
      unknownReason: false,
    });

    // A future/unknown persisted reason must load conservatively.
    getSqlite()
      .prepare("UPDATE thread_runtime_gaps SET reason = 'banana' WHERE thread_id = ?")
      .run(A);
    store.forgetThread(A);
    const resolution = store.resolve(A);
    expect(resolution).toMatchObject({
      kind: "exact",
      reason: "degraded",
      refusedEvents: 2,
      unknownReason: true,
    });
  });

  it("a crashed boot's surviving touch resolves suspect without any write", () => {
    const firstBoot = boundStore();
    firstBoot.arm();
    firstBoot.touch(A);
    expect(firstBoot.resolve(A)).toEqual({ kind: "clean" });
    // Crash: no clean close, so epoch 1 stays armed and touch(A, 1) survives.
    expect(epochRow()).toEqual({ epoch: 1, armed: 1 });
    expect(touchEpochs(A)).toEqual([1]);

    // A read-only bind (a connection that never arms) still sees it: the
    // virtual boot epoch marks the prior boot's touch suspect.
    const readOnlyBoot = boundStore();
    expect(readOnlyBoot.resolve(A)).toMatchObject({ kind: "suspect", epoch: 1 });
    expect(epochRow()).toEqual({ epoch: 1, armed: 1 });
    expect(touchEpochs(A)).toEqual([1]);

    // The next owner arms boot 2 and resolves the prior touch as unrepaired.
    const secondBoot = boundStore();
    secondBoot.arm();
    expect(secondBoot.resolve(A)).toMatchObject({ kind: "suspect", epoch: 1 });
  });

  it("an older unrepaired touch survives intermediate clean closes", () => {
    const firstBoot = boundStore();
    firstBoot.arm();
    firstBoot.touch(A);
    // Crash (no disarm), then a second boot that never touches A closes cleanly.
    const secondBoot = boundStore();
    secondBoot.arm();
    expect(secondBoot.resolve(B)).toEqual({ kind: "clean" });
    secondBoot.disarmAfterCleanClose();
    expect(epochRow()).toEqual({ epoch: 2, armed: 0 });
    expect(touchEpochs(A)).toEqual([1]);

    // Third boot: A's boot-1 touch is still unrepaired evidence.
    const thirdBoot = boundStore();
    thirdBoot.arm();
    expect(thirdBoot.resolve(A)).toMatchObject({ kind: "suspect", epoch: 1 });
    // A clean close of the third boot deletes only its own epoch's touches.
    thirdBoot.touch(B);
    thirdBoot.disarmAfterCleanClose();
    expect(touchEpochs(A)).toEqual([1]);
    expect(touchEpochs(B)).toEqual([]);
  });

  it("the resolution cache is a bounded LRU; eviction recomputes instead of trusting absence", () => {
    const store = new RuntimeDurableGapStore({ resolutionCacheMaxEntries: 2 });
    store.bind(getSqlite());
    store.arm();
    expect(store.resolve(A)).toEqual({ kind: "clean" });
    expect(store.resolve(B)).toEqual({ kind: "clean" });
    expect(store.resolve(C)).toEqual({ kind: "clean" });
    expect(store.hasCachedResolution(A)).toBe(false);
    expect(store.hasCachedResolution(C)).toBe(true);

    // A gap written after A's eviction is still found: the cache is derived.
    store.persistGap(A, "global-bytes", 1, 10);
    const recomputed = store.resolve(A);
    expect(recomputed).toMatchObject({ kind: "exact", reason: "global-bytes" });
  });

  it("an unknown-thread touch is refused typed on both the launch and admission paths", () => {
    const store = boundStore();
    store.arm();
    expect(() => store.touch("missing-thread")).toThrow(RuntimePersistenceUnknownThreadError);
    expect(touchEpochs("missing-thread")).toEqual([]);
  });

  it("clearThreadDurableGapRowsInTransaction preserves the current touch and rolls back whole", () => {
    const store = boundStore();
    store.arm();
    store.touch(A);
    store.persistGap(A, "age", 1, 98);
    // A leftover touch from an older (crashed) boot for the same thread.
    getSqlite()
      .prepare(
        "INSERT INTO thread_runtime_epoch_touches (thread_id, epoch, touched_at) VALUES (?, 0, 1)",
      )
      .run(A);

    // Interrupted rebase: the helper runs inside the caller's transaction, and
    // a throw rolls back gap + touches together.
    const interrupted = getSqlite().transaction(() => {
      clearThreadDurableGapRowsInTransaction(getSqlite(), A, 1);
      throw new Error("interrupted rebase");
    });
    expect(() => interrupted()).toThrow("interrupted rebase");
    expect(gapRow(A)).toMatchObject({ reason: "age" });
    expect(touchEpochs(A)).toEqual([0, 1]);

    // Committed rebase: the older touch and the exact gap go, the current
    // boot's touch stays so a live producer remains covered.
    getSqlite().transaction(() => {
      clearThreadDurableGapRowsInTransaction(getSqlite(), A, 1);
    })();
    expect(gapRow(A)).toBeUndefined();
    expect(touchEpochs(A)).toEqual([1]);
    expect(store.resolve(A)).toEqual({ kind: "clean" });
  });

  it("a read-only connection resolves durably and cannot arm, touch, or write a gap", () => {
    const writer = boundStore();
    writer.arm();
    writer.touch(A);
    // Crash the boot: leave the epoch armed.
    closeDatabase();

    const binding = nativeBindingEnv;
    const readonly = new Database(dbPath, {
      readonly: true,
      ...(binding ? { nativeBinding: binding } : {}),
    }) as Sqlite;
    try {
      const store = new RuntimeDurableGapStore();
      const bind = store.bind(readonly);
      expect(bind.boot).toMatchObject({ epoch: 1, priorArmed: true });
      expect(store.resolve(A)).toMatchObject({ kind: "suspect", epoch: 1 });
      expect(() => store.arm()).toThrow(/readonly/i);
      // A touch cannot even be attempted before an arm committed.
      expect(() => store.touch(A)).toThrow(/not armed/i);
      expect(() => store.persistGap(A, "age", 1, 1)).toThrow(/readonly/i);
      expect(epochRow(readonly)).toEqual({ epoch: 1, armed: 1 });
      expect(touchEpochs(A, readonly)).toEqual([1]);
    } finally {
      readonly.close();
      initDatabase(dbPath);
    }
  });
});

describe.skipIf(!sqliteAvailable)(
  "runtime durable-gap coordinator bounds and root identity",
  () => {
    let dir: string;
    let dbPath: string;
    let otherPath: string;

    beforeEach(() => {
      if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
      dir = mkdtempSync(join(tmpdir(), "poracode-durable-gap-coordinator-"));
      dbPath = join(dir, "state.sqlite");
      otherPath = join(dir, "other.sqlite");
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
      for (const id of [A, B]) dbUpsertThread({ ...testThread(), id }, 0);
    });

    afterEach(() => {
      closeDatabase();
      rmSync(dir, { recursive: true, force: true });
      delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    });

    function coordinator(
      overrides: Partial<RuntimeDurableGapCoordinatorOptions> = {},
    ): RuntimeDurableGapCoordinator {
      return new RuntimeDurableGapCoordinator({
        now: () => 1_000,
        onStorageFailure: vi.fn<(error: unknown) => void>(),
        onReserveOverflow: vi.fn<() => void>(),
        ...overrides,
      });
    }

    it("records a bounded pending obligation when the gap write fails and flushes it on recovery", () => {
      const events: string[] = [];
      const c = coordinator({ onStorageFailure: (error) => events.push(String(error)) });
      c.bindForConnection(getSqlite());
      c.attachAndArm(getSqlite());

      getSqlite().pragma("query_only = ON");
      try {
        c.recordGap(A, "age", 1, 98);
        expect(c.pendingThreadIds()).toEqual([A]);
        expect(events.length).toBeGreaterThan(0);
        // A retry for the same thread accumulates counts instead of adding rows.
        c.recordGap(A, "age", 1, 1);
        expect(c.pendingThreadIds()).toEqual([A]);
        expect(() => c.flushPendingGaps()).toThrow(RuntimePersistenceDurableGapPendingError);
      } finally {
        getSqlite().pragma("query_only = OFF");
      }
      c.flushPendingGaps();
      expect(c.pendingThreadIds()).toEqual([]);
      expect(gapRow(A)).toMatchObject({ reason: "age", refused_events: 2, refused_bytes: 99 });
    });

    it("never evicts evidence: overflow latches and keeps every tracked obligation", () => {
      const overflows: number[] = [];
      const c = coordinator({
        pendingMaxThreads: 2,
        onReserveOverflow: () => overflows.push(1),
      });
      c.bindForConnection(getSqlite());
      c.attachAndArm(getSqlite());
      getSqlite().pragma("query_only = ON");
      try {
        c.recordGap(A, "degraded", 1, 1);
        c.recordGap(B, "degraded", 1, 1);
        c.recordGap(C, "degraded", 1, 1);
        expect(c.pendingThreadIds()).toEqual([A, B]);
        expect(c.isReserveLatched()).toBe(true);
        expect(overflows).toHaveLength(1);
      } finally {
        getSqlite().pragma("query_only = OFF");
      }
      // Storage recovered: tracked obligations become exact, the latch still
      // refuses the close so the untracked thread's surviving touch is kept.
      expect(() => c.flushPendingGaps()).toThrow(/overflowed/);
      expect(c.pendingThreadIds()).toEqual([]);
      expect(c.isReserveLatched()).toBe(true);
      expect(gapRow(A)).toMatchObject({ reason: "degraded" });
      expect(gapRow(B)).toMatchObject({ reason: "degraded" });
    });

    it("never writes another root's pending obligation into a rebound database", () => {
      const c = coordinator();
      c.bindForConnection(getSqlite());
      c.attachAndArm(getSqlite());
      getSqlite().pragma("query_only = ON");
      try {
        c.recordGap(A, "age", 1, 98);
      } finally {
        getSqlite().pragma("query_only = OFF");
      }
      expect(c.pendingThreadIds()).toEqual([A]);

      // Root replacement: the failed write happened on `dbPath`; a new root that
      // reuses thread id A must never receive it.
      closeDatabase();
      initDatabase(otherPath);
      c.resetForConnection();
      c.bindForConnection(getSqlite());
      c.attachAndArm(getSqlite());
      expect(() => c.flushPendingGaps()).toThrow(RuntimePersistenceDurableGapPendingError);
      expect(gapRow(A)).toBeUndefined();
      expect(c.pendingThreadIds()).toEqual([A]);
    });

    it("forgetThread drops the pending obligation and the derived touch decision", () => {
      const c = coordinator();
      c.bindForConnection(getSqlite());
      c.attachAndArm(getSqlite());
      getSqlite().pragma("query_only = ON");
      try {
        c.recordGap(A, "age", 1, 98);
      } finally {
        getSqlite().pragma("query_only = OFF");
      }
      c.forgetThread(A);
      expect(c.pendingThreadIds()).toEqual([]);
      c.flushPendingGaps();
    });

    it("identityOfRuntimeDatabase distinguishes roots by path and falls back to the handle", () => {
      const handle = getSqlite();
      expect(identityOfRuntimeDatabase(handle)).toBe(dbPath);
      expect(identityOfRuntimeDatabase(handle)).not.toBe(otherPath);
    });
  },
);
