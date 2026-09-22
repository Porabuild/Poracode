import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSqlite, initDatabase, closeDatabase } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  LEGACY_READ_CHARGE_MEANING,
  LEGACY_READ_TOO_LARGE_CODE,
} from "@/shared/remote/legacyReadContract";
import {
  assertLegacyHistoryWithinReservation,
  assertLegacySnapshotWithinReservation,
  LegacyReadTooLargeError,
} from "./legacyReadPrecheck";

function insertProject(): void {
  getSqlite()
    .prepare(
      `INSERT INTO projects (id, name, location_kind, location_path, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run("project-1", "Project", "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
}

function insertThread(id: string, title: string): void {
  getSqlite()
    .prepare(
      `INSERT INTO threads
         (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, "project-1", title, "claude", "{}", "idle", "none", "a", "b");
}

describe.skipIf(!sqliteAvailable)("legacy read pre-check", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-legacy-precheck-"));
    initDatabase(join(dir, "state.sqlite"));
    insertProject();
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("passes an ordinary catalog and returns its reservation", () => {
    insertThread("thread-1", "small");
    const reservation = assertLegacySnapshotWithinReservation();
    expect(reservation).toBeGreaterThan(0);
    expect(reservation).toBeLessThan(64 * 1024 * 1024);
  });

  it("refuses over-reservation with a labelled stored-byte charge", () => {
    insertThread("thread-1", "x".repeat(4_096));
    let failure: unknown;
    try {
      assertLegacySnapshotWithinReservation({}, 1_024);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(LegacyReadTooLargeError);
    const body = (failure as LegacyReadTooLargeError).body;
    expect(body.error.code).toBe(LEGACY_READ_TOO_LARGE_CODE);
    expect(body.legacyRead).toMatchObject({
      resource: "catalog",
      charge: "stored-bytes",
      maxBytes: 1_024,
      meaning: LEGACY_READ_CHARGE_MEANING,
    });
    expect(body.legacyRead.reservationBytes).toBeGreaterThan(1_024);
  });

  it("never refuses from an expanding-JSON upper bound when the stored bytes fit", () => {
    // `1e20` lexemes expand heavily when re-serialized. The charge is stored
    // bytes (a sound lower bound), so a row whose stored size fits is served —
    // the old upper-bound-as-proof defect cannot resurface here.
    insertThread("thread-1", `[${Array.from({ length: 64 }, () => "1e20").join(",")}]`);
    expect(assertLegacySnapshotWithinReservation({}, 4_096)).toBeLessThan(4_096);
  });

  it("charges only the threadLimit page window and its one-row lookahead", () => {
    insertThread("thread-1", "small");
    insertThread("thread-2", "small");
    insertThread("thread-3", "x".repeat(4_096));
    // Page one materializes thread-1 plus the thread-2 lookahead: thread-3 is
    // outside the window.
    expect(assertLegacySnapshotWithinReservation({ threadListLimit: 1 }, 1_024)).toBeLessThan(
      1_024,
    );
    // Page two reaches thread-3, so the same request now refuses.
    expect(() => assertLegacySnapshotWithinReservation({ threadListLimit: 2 }, 1_024)).toThrowError(
      LegacyReadTooLargeError,
    );
  });

  it("keeps the full project table in the paged snapshot reservation", () => {
    insertThread("thread-1", "small");
    getSqlite()
      .prepare(`UPDATE projects SET name = ? WHERE id = ?`)
      .run("p".repeat(4_096), "project-1");
    expect(() => assertLegacySnapshotWithinReservation({ threadListLimit: 1 }, 1_024)).toThrowError(
      LegacyReadTooLargeError,
    );
  });

  it("refuses an over-reservation history with the thread-history resource", () => {
    insertThread("thread-1", "T");
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "item-1", 0, "assistant", "completed", "y".repeat(2_048));
    expect(() => assertLegacyHistoryWithinReservation("thread-1", {}, 1_024)).toThrowError(
      expect.objectContaining({
        body: expect.objectContaining({
          legacyRead: expect.objectContaining({
            resource: "thread-history",
            charge: "stored-bytes",
          }),
        }),
      }) as Error,
    );
    expect(assertLegacyHistoryWithinReservation("thread-1", {}, 8_192)).toBeGreaterThan(2_048);
  });

  it("does not charge omitted scrollback but refuses it when it is not omitted", () => {
    insertThread("thread-1", "T");
    getSqlite()
      .prepare(
        `INSERT INTO thread_terminal_scrollback (thread_id, transcript, output_length)
         VALUES (?, ?, ?)`,
      )
      .run("thread-1", "x".repeat(4_096), 4_096);
    expect(
      assertLegacyHistoryWithinReservation(
        "thread-1",
        { runtimePage: true, omitScrollback: true },
        1_024,
      ),
    ).toBeLessThan(1_024);
    expect(() =>
      assertLegacyHistoryWithinReservation("thread-1", { runtimePage: true }, 1_024),
    ).toThrowError(LegacyReadTooLargeError);
  });

  it("keeps completed turns charged for the runtimePage variant", () => {
    insertThread("thread-1", "T");
    getSqlite()
      .prepare(
        `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("thread-1", 0, "s".repeat(4_096), "e", "item-0");
    expect(() =>
      assertLegacyHistoryWithinReservation(
        "thread-1",
        { runtimePage: true, omitScrollback: true },
        1_024,
      ),
    ).toThrowError(LegacyReadTooLargeError);
  });
});
