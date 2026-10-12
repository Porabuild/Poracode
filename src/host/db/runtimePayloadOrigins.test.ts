import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertRequiredDatabaseSchema, runDatabaseMigrations } from "./migrations";
import { sqliteAvailable } from "./runtimeItems.testFixtures";
import {
  installTrustedRuntimePayloadOriginAfterCompleteWrite,
  readRuntimePayloadOrigin,
  type RuntimePayloadOrigin,
  type TrustedCompleteRuntimePayloadInstallation,
} from "./runtimePayloadOrigins";
import {
  createSchema53PayloadOriginDatabase,
  installFixtureOrigin,
  LEGACY_SUMMARY_PAYLOAD,
  ORIGIN_A,
  ORIGIN_B,
} from "./runtimePayloadOrigins.testFixtures";

describe.skipIf(!sqliteAvailable)("internal runtime payload origin storage", () => {
  let directory: string;
  let sqlite: InstanceType<typeof Database>;

  beforeEach(() => {
    mkdirSync("tmp", { recursive: true });
    directory = mkdtempSync(join("tmp", "origin-helper-"));
    sqlite = createSchema53PayloadOriginDatabase(join(directory, "state.sqlite"));
    runDatabaseMigrations(sqlite, 53);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (sqlite.open) sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function installation(): TrustedCompleteRuntimePayloadInstallation {
    return {
      threadId: "thread-1",
      itemId: "growing",
      itemType: "assistant_message",
      installedPayload: LEGACY_SUMMARY_PAYLOAD,
      sqlChanges: 1,
      origin: ORIGIN_A,
      custody: "captured-producer-complete-payload",
    };
  }

  function install(input: TrustedCompleteRuntimePayloadInstallation): void {
    sqlite.transaction(() => installTrustedRuntimePayloadOriginAfterCompleteWrite(sqlite, input))();
  }

  it("requires the caller's SQL transaction and foreign-key enforcement", () => {
    expect(() =>
      installTrustedRuntimePayloadOriginAfterCompleteWrite(sqlite, installation()),
    ).toThrow(/transaction/);
    sqlite.pragma("foreign_keys = OFF");
    expect(() => install(installation())).toThrow(/foreign-key/);
    sqlite.pragma("foreign_keys = ON");
    expect(readRuntimePayloadOrigin(sqlite, "thread-1", "growing")).toBeUndefined();
  });

  it("rejects missing rows and mismatched current type or exact serialized payload", () => {
    expect(() => install({ ...installation(), itemId: "missing" })).toThrow(
      /existing runtime item/,
    );
    expect(() => install({ ...installation(), itemType: "tool_call" })).toThrow(/does not match/);
    expect(() =>
      install({
        ...installation(),
        installedPayload: JSON.stringify(JSON.parse(LEGACY_SUMMARY_PAYLOAD)),
      }),
    ).toThrow(/does not match/);
    expect(() => install({ ...installation(), installedPayload: null })).toThrow(/does not match/);
    expect(readRuntimePayloadOrigin(sqlite, "thread-1", "growing")).toBeUndefined();
  });

  it.each([0, 2, -1, 1.5, Number.NaN])("rejects a SQL changes receipt of %s", (sqlChanges) => {
    expect(() => install({ ...installation(), sqlChanges })).toThrow(/single-row SQL write/);
  });

  it("rejects a caller without captured complete-payload custody", () => {
    const input = {
      ...installation(),
      custody: "current-thread",
    } as unknown as TrustedCompleteRuntimePayloadInstallation;
    expect(() => install(input)).toThrow(/captured complete-payload custody/);
  });

  it.each(["", "x".repeat(129), "a\n", "a\0b", "format key", "É", "UPPER", "/format"])(
    "rejects a malformed or unbounded owner key %j in the helper and SQL table",
    (formatOwnerKey) => {
      expect(() => install({ ...installation(), origin: { ...ORIGIN_A, formatOwnerKey } })).toThrow(
        /format version or format owner key/,
      );
      expect(() =>
        sqlite
          .prepare(
            "INSERT INTO thread_runtime_item_payload_origins VALUES ('thread-1', 'growing', ?, 1)",
          )
          .run(formatOwnerKey),
      ).toThrow(/CHECK constraint/);
    },
  );

  it.each([0, 2, "1", null])(
    "rejects unsupported origin format %j before replacing existing proof",
    (originFormatVersion) => {
      installFixtureOrigin(sqlite);
      const origin = {
        formatOwnerKey: ORIGIN_B.formatOwnerKey,
        originFormatVersion,
      } as unknown as RuntimePayloadOrigin;
      expect(() => install({ ...installation(), origin })).toThrow(/format version/);
      expect(readRuntimePayloadOrigin(sqlite, "thread-1", "growing")).toEqual(ORIGIN_A);
    },
  );

  it("stores at most one bounded proof per item and supports an exact null payload installation", () => {
    installFixtureOrigin(sqlite, "growing", { ...ORIGIN_A, formatOwnerKey: "x".repeat(128) });
    installFixtureOrigin(sqlite, "growing", ORIGIN_B);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM thread_runtime_item_payload_origins").get(),
    ).toEqual({ n: 1 });
    sqlite.transaction(() => {
      const write = sqlite
        .prepare("UPDATE thread_runtime_items SET payload = NULL WHERE item_id = 'growing'")
        .run();
      installTrustedRuntimePayloadOriginAfterCompleteWrite(sqlite, {
        ...installation(),
        installedPayload: null,
        sqlChanges: write.changes,
      });
    })();
    expect(readRuntimePayloadOrigin(sqlite, "thread-1", "growing")).toEqual(ORIGIN_A);
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO thread_runtime_item_payload_origins VALUES ('thread-1', 'missing', 'fixture.format-a', 1)",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
    expect(() =>
      sqlite
        .prepare("UPDATE thread_runtime_item_payload_origins SET origin_format_version = 2")
        .run(),
    ).toThrow(/CHECK constraint/);
  });

  it("uses indexed exact-key reads without returning payloads or consulting thread routing/history", () => {
    installFixtureOrigin(sqlite);
    const prepare = vi.spyOn(sqlite, "prepare");
    expect(readRuntimePayloadOrigin(sqlite, "thread-1", "growing")).toEqual(ORIGIN_A);
    expect(readRuntimePayloadOrigin(sqlite, "thread-2", "growing")).toBeUndefined();
    expect(prepare.mock.calls).toHaveLength(2);
    for (const [sql] of prepare.mock.calls) {
      expect(sql).toMatch(/WHERE thread_id = \? AND item_id = \?/);
      expect(sql).not.toMatch(/JOIN|ORDER BY|streams|FROM threads/);
    }
    const plan = sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT format_owner_key FROM thread_runtime_item_payload_origins WHERE thread_id = ? AND item_id = ?",
      )
      .all("thread-1", "growing") as { detail: string }[];
    expect(plan.map(({ detail }) => detail).join(" ")).toMatch(/SEARCH.*PRIMARY KEY/);
  });

  it("rolls the payload assignment and prior proof back together if proof installation fails", () => {
    installFixtureOrigin(sqlite);
    sqlite.exec(`CREATE TRIGGER fail_origin BEFORE INSERT ON thread_runtime_item_payload_origins
      BEGIN SELECT RAISE(ABORT, 'origin write failure'); END;`);
    expect(() =>
      sqlite.transaction(() => {
        const write = sqlite
          .prepare("UPDATE thread_runtime_items SET payload = '{}' WHERE item_id = 'growing'")
          .run();
        installTrustedRuntimePayloadOriginAfterCompleteWrite(sqlite, {
          ...installation(),
          installedPayload: "{}",
          sqlChanges: write.changes,
          origin: ORIGIN_B,
        });
      })(),
    ).toThrow("origin write failure");
    expect(
      sqlite.prepare("SELECT payload FROM thread_runtime_items WHERE item_id = 'growing'").get(),
    ).toEqual({ payload: LEGACY_SUMMARY_PAYLOAD });
    expect(readRuntimePayloadOrigin(sqlite, "thread-1", "growing")).toEqual(ORIGIN_A);
  });

  it("returns unknown for corrupted or unsupported metadata instead of inferring ownership", () => {
    installFixtureOrigin(sqlite);
    sqlite.pragma("ignore_check_constraints = ON");
    sqlite
      .prepare("UPDATE thread_runtime_item_payload_origins SET origin_format_version = 2")
      .run();
    expect(readRuntimePayloadOrigin(sqlite, "thread-1", "growing")).toBeUndefined();
    sqlite
      .prepare(
        "UPDATE thread_runtime_item_payload_origins SET origin_format_version = 1, format_owner_key = ?",
      )
      .run("a\n");
    expect(readRuntimePayloadOrigin(sqlite, "thread-1", "growing")).toBeUndefined();
  });

  it.each(["runtime_payload_origin_insert_reset", "runtime_payload_origin_update_reset"])(
    "rejects a missing or weakened custody trigger %s during required-schema validation",
    (trigger) => {
      sqlite.exec(`DROP TRIGGER ${trigger}`);
      expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow(/payload origin custody schema/);
      sqlite.exec(
        `CREATE TRIGGER ${trigger} AFTER INSERT ON thread_runtime_items BEGIN SELECT 1; END;`,
      );
      expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow(/payload origin custody schema/);
    },
  );

  it("refuses a same-column side table missing its custody constraints", () => {
    sqlite.exec(`DROP TABLE thread_runtime_item_payload_origins;
      CREATE TABLE thread_runtime_item_payload_origins
        (thread_id TEXT, item_id TEXT, format_owner_key TEXT, origin_format_version INTEGER);`);
    expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow(/payload origin custody schema/);
  });
});
