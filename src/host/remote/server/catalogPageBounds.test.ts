import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import {
  CATALOG_READS_CAPABILITY,
  CATALOG_SOFT_PACK_WIRE_BYTES,
  serializedWireByteLength,
} from "@/shared/remote/catalogReadContract";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import type { RemoteServerContext } from "./context";
import { CatalogItemTooLargeError } from "./catalogPageBudget";
import { buildCatalogThreadListPage } from "./catalogPageBuilders";
import { parseCatalogReadNegotiation } from "./catalogPages";

/**
 * B4 catalog pre-fetch refusal semantics: a conservative upper bound above a
 * cap is not proof and never refuses; a sound lower bound (the exact escaped
 * size of raw columns the wire schema emits verbatim) refuses before the
 * payload fetch, and a JSON-heavy row is always resolved by the exact phase-2
 * measurement. These are the fail-before/pass-after regressions for the
 * parent's upper-bound defect, with SQL-select evidence.
 */

function threadFixture(index: number, overrides: Partial<Thread> = {}): Thread {
  return {
    id: `thread-${String(index).padStart(3, "0")}`,
    projectId: "project-1",
    title: `Thread ${index}`,
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function context(): RemoteServerContext {
  return {
    options: { gitSummaries: () => ({}) },
    seq: 1,
  } as unknown as RemoteServerContext;
}

function negotiation(query = "") {
  return parseCatalogReadNegotiation(
    new URL(`http://host/api/threads?reads=${CATALOG_READS_CAPABILITY}${query}`),
    "thread-list",
  );
}

function captureSql<T>(run: () => T): { readonly sql: string[]; readonly result: T } {
  const sqlite = getSqlite();
  const original = sqlite.prepare.bind(sqlite);
  const sql: string[] = [];
  (sqlite as unknown as { prepare: (statement: string) => unknown }).prepare = (
    statement: string,
  ) => {
    sql.push(statement);
    return original(statement);
  };
  try {
    return { sql, result: run() };
  } finally {
    (sqlite as unknown as { prepare: typeof original }).prepare = original;
  }
}

const phase2PayloadSelect = /SELECT .* FROM threads WHERE id IN \(/u;

describe.skipIf(!sqliteAvailable)("catalog page bound semantics", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-catalog-bounds-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("accepts a large valid-Unicode row whose conservative bound alone exceeds the client cap", () => {
    // 1,000,000 CJK characters: 3 MB of UTF-8 wire, but `6 × stored` is 18 MB.
    // The client declares 4 MiB, which the old upper-bound refusal treated as
    // proof of oversize. The row is real and must be served as a page-of-one.
    dbUpsertThread(
      threadFixture(99, {
        id: "thread-unicode",
        title: `u-${"界".repeat(1_000_000)}`,
      }),
      -1,
    );
    const body = buildCatalogThreadListPage(
      context(),
      negotiation("&limit=1&maxBytes=4194304"),
      undefined,
    );
    const parsed = JSON.parse(body) as { threads: { id: string }[] };
    expect(parsed.threads.map((thread) => thread.id)).toEqual(["thread-unicode"]);
    expect(serializedWireByteLength(body)).toBeGreaterThan(CATALOG_SOFT_PACK_WIRE_BYTES);
    expect(serializedWireByteLength(body)).toBeLessThanOrEqual(4_194_304);
  });

  it("accepts a 2 MiB JSON config under a 4 MiB client cap (the parent's catalog repro)", () => {
    dbUpsertThread(
      threadFixture(99, {
        id: "thread-big",
        title: "big",
        config: { model: "y".repeat(2 * 1024 * 1024) },
      }),
      -1,
    );
    const body = buildCatalogThreadListPage(
      context(),
      negotiation("&limit=1&maxBytes=4194304"),
      undefined,
    );
    const parsed = JSON.parse(body) as { threads: { id: string }[] };
    expect(parsed.threads.map((thread) => thread.id)).toEqual(["thread-big"]);
    expect(serializedWireByteLength(body)).toBeLessThanOrEqual(4_194_304);
  });

  it("refuses a genuinely oversized raw-string row before the payload fetch, with SQL evidence", () => {
    dbUpsertThread(
      threadFixture(1, { id: "thread-huge", title: `h-${"z".repeat(3 * 1024 * 1024)}` }),
      -1,
    );
    let failure: unknown;
    const { sql } = captureSql(() => {
      try {
        buildCatalogThreadListPage(context(), negotiation("&limit=10&maxBytes=1048576"), undefined);
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toBeInstanceOf(CatalogItemTooLargeError);
    const readItem = (failure as CatalogItemTooLargeError).body.readItem;
    expect(readItem).toMatchObject({
      resource: "thread",
      id: "thread-huge",
      maxBytes: 1_048_576,
      measurement: "serialized-upper-bound",
    });
    // The proof is a sound lower bound (exact escaped title bytes), and the
    // reported sizes are the conservative upper bounds.
    expect(readItem.lowerBoundWireBytes).toBeGreaterThan(1_048_576);
    expect(readItem.lowerBoundWireBytes).toBeLessThanOrEqual(readItem.wireBytes!);
    // No phase-2 payload fetch ran: the refusal was decided on metadata.
    expect(sql.some((statement) => phase2PayloadSelect.test(statement))).toBe(false);
  });

  it("refuses a huge JSON config only by exact measurement after the fetch, with SQL evidence", () => {
    // A 5 MiB config survives schema projection, so no sound lower bound can
    // prove it oversized without parsing. The row is fetched and measured.
    dbUpsertThread(
      threadFixture(1, {
        id: "thread-json",
        title: "json",
        config: { model: "q".repeat(5 * 1024 * 1024) },
      }),
      -1,
    );
    let failure: unknown;
    const { sql } = captureSql(() => {
      try {
        buildCatalogThreadListPage(context(), negotiation("&limit=10&maxBytes=1048576"), undefined);
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toBeInstanceOf(CatalogItemTooLargeError);
    const readItem = (failure as CatalogItemTooLargeError).body.readItem;
    expect(readItem).toMatchObject({ id: "thread-json", measurement: "serialized-exact" });
    expect(readItem.wireBytes).toBeGreaterThan(1_048_576);
    expect(readItem.lowerBoundWireBytes).toBeUndefined();
    expect(sql.some((statement) => phase2PayloadSelect.test(statement))).toBe(true);
  });

  it("uses the exact path for tiny caps and never serves an unmeasured body", () => {
    dbUpsertThread(threadFixture(1, { id: "thread-small" }), 0);
    const { result, sql } = captureSql(() => {
      const body = buildCatalogThreadListPage(
        context(),
        negotiation("&limit=10&maxBytes=4096&maxDecodeBytes=8192"),
        undefined,
      );
      return body;
    });
    expect(serializedWireByteLength(result)).toBeLessThanOrEqual(4096);
    const parsed = JSON.parse(result) as { threads: { id: string }[] };
    expect(parsed.threads).toHaveLength(1);
    expect(sql.some((statement) => phase2PayloadSelect.test(statement))).toBe(true);
  });
});
