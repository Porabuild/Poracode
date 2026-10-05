import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import {
  RuntimePersistenceController,
  type RuntimePersistenceControllerOptions,
} from "./runtimePersistenceController";
import { applyThreadRuntimeEventsNow } from "./runtimeItemsWriter";
import { started, delta } from "./runtimePersistence.atomic.testFixtures";

function cost(events: readonly RuntimeEvent[]) {
  const bytes = events.map(estimateRuntimeEventBytes);
  return {
    eventCount: events.length,
    eventBytes: bytes.reduce((sum, n) => sum + n, 0),
    maxEventBytes: Math.max(...bytes),
  };
}

function totalChanges(): unknown {
  return getSqlite().prepare("SELECT total_changes() AS n").get();
}

describe.skipIf(!sqliteAvailable)("reserved admission through controller durability gates", () => {
  let dir: string;
  const controllers: RuntimePersistenceController[] = [];
  function controller(options: Partial<RuntimePersistenceControllerOptions> = {}) {
    const c = new RuntimePersistenceController({ write: applyThreadRuntimeEventsNow, ...options });
    controllers.push(c);
    c.bindDurableGapForConnection(getSqlite());
    return c;
  }
  function grant(
    c: RuntimePersistenceController,
    threadId: string,
    events: readonly RuntimeEvent[],
  ) {
    const result = c.reserveAdmission(threadId, cost(events));
    if (result.kind !== "granted") throw new Error(`expected grant: ${JSON.stringify(result)}`);
    return result.reservation.id;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
    dir = mkdtempSync(join(process.cwd(), "tmp", "runtime-reservations-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Reserved persistence",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00Z",
      },
      0,
    );
    for (const id of ["a", "b"]) dbUpsertThread({ ...testThread(), id }, 0);
  });
  afterEach(() => {
    for (const c of controllers.splice(0)) c.stopTimers();
    getSqlite().pragma("query_only = OFF");
    closeDatabase();
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("a quote does no durable write; touch commits before transfer and the ordinary scheduler commits payload", () => {
    const custodyObservations: unknown[] = [];
    const c = controller({
      onCapacityChange: (change) => {
        if (change.kind === "admitted") {
          custodyObservations.push(
            getSqlite()
              .prepare(
                "SELECT COUNT(*) AS n FROM thread_runtime_epoch_touches WHERE thread_id = 'a'",
              )
              .get(),
          );
          custodyObservations.push(
            getSqlite()
              .prepare("SELECT COUNT(*) AS n FROM thread_runtime_items WHERE thread_id = 'a'")
              .get(),
          );
        }
      },
    });
    const events = [started("a"), delta("a", "🙂 exact")];
    const before = totalChanges();
    const id = grant(c, "a", events);
    expect(totalChanges()).toEqual(before);
    expect(c.capacitySnapshot(["a"]).global).toMatchObject({ reservedEvents: 2, pendingEvents: 0 });
    expect(c.admitReserved("a", id, events)).toMatchObject({
      kind: "accepted",
      acceptedEvents: 2,
      refusedEvents: 0,
    });
    expect(custodyObservations).toEqual([{ n: 1 }, { n: 0 }]);
    expect(c.capacitySnapshot().global).toMatchObject({ reservedEvents: 0, pendingEvents: 2 });
    vi.advanceTimersByTime(250);
    expect(c.capacitySnapshot().global.pendingEvents).toBe(0);
    expect(
      getSqlite()
        .prepare("SELECT COUNT(*) AS n FROM thread_runtime_items WHERE thread_id = 'a'")
        .get(),
    ).toEqual({ n: 1 });
    expect(c.admitReserved("a", id, events)).toEqual({ kind: "invalid-reservation" });
    expect(c.contaminatedThreadCount()).toBe(0);
  });

  it("a bad/stale quote creates no durable evidence, consumes no lease, and bypasses no shutdown gate", () => {
    const c = controller();
    const events = [started("a")];
    const id = grant(c, "a", events);
    c.shutdown();
    const before = totalChanges();
    expect(c.admitReserved("a", id, [delta("a", "wrong cost")])).toEqual({
      kind: "invalid-reservation",
    });
    expect(c.admitReserved("a", "stale", events)).toEqual({ kind: "invalid-reservation" });
    expect(totalChanges()).toEqual(before);
    expect(c.contaminatedThreadCount()).toBe(0);
    expect(c.admitReserved("a", id, events)).toMatchObject({
      kind: "refused",
      reason: "shutdown",
      refusedEvents: 1,
    });
    expect(c.capacitySnapshot().global).toMatchObject({ reservedEvents: 1, pendingEvents: 0 });
    expect(c.getContamination("a")).toMatchObject({ reason: "shutdown", refusedEvents: 1 });
    expect(c.releaseAdmissionReservation(id)).toBe(true);
  });

  it("touch failure refuses payload with durable pending evidence and leaves grant custody unchanged", () => {
    const c = controller();
    const events = [started("a")];
    const id = grant(c, "a", events);
    getSqlite().pragma("query_only = ON");
    expect(c.admitReserved("a", id, events)).toMatchObject({
      kind: "refused",
      reason: "degraded",
      scope: "global",
    });
    expect(c.capacitySnapshot().global).toMatchObject({ pendingEvents: 0, reservedEvents: 1 });
    expect(c.durableGapPendingThreadIds()).toContain("a");
    expect(c.reserveAdmission("b", cost([started("b")]))).toEqual({
      kind: "blocked",
      reason: "degraded",
    });
  });

  it("metadata backpressure is not a gap or stop and resumes after actual COMMIT", () => {
    const signals: unknown[] = [];
    const c = controller({
      bounds: { maxPendingEventsPerThread: 1 },
      onSignal: (signal) => signals.push(signal),
    });
    const events = [started("a")];
    const id = grant(c, "a", events);
    expect(c.reserveAdmission("a", cost(events))).toEqual({
      kind: "blocked",
      reason: "thread-events",
    });
    expect(c.contaminatedThreadCount()).toBe(0);
    expect(signals).toEqual([]);
    c.admitReserved("a", id, events);
    expect(c.reserveAdmission("a", cost(events))).toEqual({
      kind: "blocked",
      reason: "thread-events",
    });
    vi.advanceTimersByTime(250);
    expect(c.reserveAdmission("a", cost(events)).kind).toBe("granted");
  });

  it("age gate still records the exact canonical refusal after a prior grant", () => {
    let now = 1000;
    const c = controller({ now: () => now, bounds: { maxPendingAgeMs: 100 } });
    const events = [started("a")];
    const id = grant(c, "a", events);
    c.admit("b", [started("b")]);
    now += 100;
    expect(c.reserveAdmission("a", cost(events))).toEqual({ kind: "blocked", reason: "age" });
    expect(c.contaminatedThreadCount()).toBe(0);
    expect(c.admitReserved("a", id, events)).toMatchObject({
      kind: "refused",
      reason: "age",
      scope: "global",
    });
    expect(c.getContamination("a")).toMatchObject({ reason: "age", refusedEvents: 1 });
    expect(c.capacitySnapshot().global.reservedEvents).toBe(1);
  });

  it("an unknown thread cannot turn a capacity quote into a no-op accepted write", () => {
    const c = controller();
    const events = [started("missing")];
    const id = grant(c, "missing", events);
    expect(c.admitReserved("missing", id, events)).toMatchObject({
      kind: "refused",
      reason: "unknown-thread",
    });
    expect(c.capacitySnapshot().global.pendingEvents).toBe(0);
    expect(c.contaminatedThreadCount()).toBe(0);
    expect(getSqlite().prepare("SELECT COUNT(*) AS n FROM thread_runtime_gaps").get()).toEqual({
      n: 0,
    });
  });

  it("contamination between quote and payload remains authoritative and other threads continue", () => {
    const c = controller({ bounds: { maxPendingEventsPerThread: 1 } });
    const events = [started("a")];
    const id = grant(c, "a", events);
    expect(c.admit("a", events)).toMatchObject({ kind: "refused", reason: "thread-events" });
    expect(c.reserveAdmission("a", cost(events))).toEqual({
      kind: "blocked",
      reason: "thread-events",
    });
    expect(c.admitReserved("a", id, events)).toMatchObject({
      kind: "refused",
      reason: "thread-events",
    });
    const other = [started("b")];
    expect(c.admitReserved("b", grant(c, "b", other), other)).toMatchObject({ kind: "accepted" });
    expect(c.capacitySnapshot(["a", "b"]).global).toMatchObject({
      reservedEvents: 1,
      pendingEvents: 1,
    });
  });

  it("reset and applied rebase invalidate outstanding grants before reused identities can accept payload", () => {
    const c = controller();
    const events = [started("a")];
    const old = grant(c, "a", events);
    c.tryRunThreadMutation("a", "reset", () => undefined);
    expect(c.admitReserved("a", old, events)).toEqual({ kind: "invalid-reservation" });
    const fresh = grant(c, "a", events);
    c.resetForNewConnection();
    expect(c.admitReserved("a", fresh, events)).toEqual({ kind: "invalid-reservation" });
    expect(c.capacitySnapshot().global).toMatchObject({ reservedEvents: 0, pendingEvents: 0 });
  });
});
