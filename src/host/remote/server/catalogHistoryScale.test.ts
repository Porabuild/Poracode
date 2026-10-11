import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CATALOG_READS_CAPABILITY,
  decodeCatalogInventoryCursor,
  serializedWireByteLength,
} from "@/shared/remote/catalogReadContract";
import { decodeCompletedTurnCursor } from "@/shared/remote/historyReadContract";
import { boundedRuntimeItemsPageSchema } from "@/shared/remote/historyReadSchemas";
import { boundedThreadListPageSchema } from "@/shared/remote/catalogReadSchemas";
import { dbReadCatalogMembership } from "@/host/db/catalogMembershipReads";
import { getSqlite, initDatabase, closeDatabase } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import type { RemoteServerContext } from "./context";
import {
  buildCatalogProjectListPage,
  buildCatalogThreadListPage,
  type CatalogReadNegotiation,
} from "./catalogPageBuilders";
import { buildBoundedCompletedTurnPage, buildBoundedThreadHistoryItems } from "./historyRead";
import { parseCatalogReadNegotiation } from "./catalogPages";
import { parseHistoryReadNegotiation } from "./historyReadNegotiation";

/**
 * Real-SQLite scale test (10,000 threads / 5,000 items / 500 turns): the
 * bounded catalog selection and continuation walks cover every row exactly
 * once, the inventory frontier terminates, membership confirmation answers
 * exactly, and the completed-turn continuation is lossless. This is the
 * in-tree version of the B4 host probes; it uses the real builders and the
 * real DB, not mocks.
 */

const THREADS = 10_000;
const PROJECTS = 40;
const ITEMS = 5_000;
const TURNS = 500;

function negotiationFor(
  route: "thread-list" | "project-list",
  query: string,
): CatalogReadNegotiation {
  return parseCatalogReadNegotiation(
    new URL(`http://host/api/${route}?reads=${CATALOG_READS_CAPABILITY}${query}`),
    route,
  );
}

function context(): RemoteServerContext {
  return {
    options: { gitSummaries: () => ({}) },
    seq: 1,
  } as unknown as RemoteServerContext;
}

describe.skipIf(!sqliteAvailable)("B4 real-scale catalog and history reads", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-b4-scale-"));
    initDatabase(join(dir, "state.sqlite"));
    const sqlite = getSqlite();
    const insertProject = sqlite.prepare(
      `INSERT INTO projects (id, name, location_kind, location_path, created_at, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertThread = sqlite.prepare(
      `INSERT INTO threads
         (id, project_id, title, agent_kind, config, status, attention, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertItem = sqlite.prepare(
      `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertTurn = sqlite.prepare(
      `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
       VALUES (?, ?, ?, ?, ?)`,
    );
    sqlite.transaction(() => {
      for (let index = 0; index < PROJECTS; index += 1) {
        insertProject.run(
          `project-${String(index).padStart(2, "0")}`,
          `Project ${index}`,
          "posix",
          `/tmp/project-${index}`,
          `2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
          index,
        );
      }
      for (let index = 0; index < THREADS; index += 1) {
        insertThread.run(
          `thread-${String(index).padStart(5, "0")}`,
          `project-${String(index % PROJECTS).padStart(2, "0")}`,
          `Thread ${index}`,
          "claude",
          '{"model":"sonnet"}',
          "idle",
          "none",
          index,
          `2026-01-01T00:00:00.${String(index % 1000).padStart(3, "0")}Z`,
          `2026-02-01T00:00:00.${String(index % 1000).padStart(3, "0")}Z`,
        );
      }
      for (let index = 0; index < ITEMS; index += 1) {
        insertItem.run(
          "thread-00000",
          `item-${String(index).padStart(5, "0")}`,
          index,
          "assistant",
          "completed",
          `{"text":"item ${index}"}`,
        );
      }
      for (let index = 0; index < TURNS; index += 1) {
        insertTurn.run(
          "thread-00000",
          index,
          `2026-03-01T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
          `2026-03-01T01:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
          `item-${String(index).padStart(5, "0")}`,
        );
      }
    })();
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("walks the 10k paint catalog once, in order, inside the wire cap", () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const body = buildCatalogThreadListPage(
        context(),
        negotiationFor("thread-list", "&limit=200&order=manual"),
        cursor,
      );
      expect(serializedWireByteLength(body)).toBeLessThanOrEqual(32 * 1024 * 1024);
      const parsed = boundedThreadListPageSchema.parse(JSON.parse(body));
      seen.push(...parsed.threads.map((thread) => thread.id));
      pages += 1;
      if (parsed.nextCursor === null) break;
      cursor = parsed.nextCursor;
      if (pages > 100) throw new Error("paint walk did not terminate");
    }
    // Conservative phase-1 bounds pack ~110-120 rows per 512 KiB soft target,
    // so the walk is more pages than the hard 50-row-count minimum; what
    // matters is exact coverage and termination.
    expect(pages).toBeGreaterThanOrEqual(THREADS / 200);
    expect(pages).toBeLessThan(THREADS);
    expect(seen).toHaveLength(THREADS);
    expect(new Set(seen).size).toBe(THREADS);
    expect(seen[0]).toBe("thread-00000");
    expect(seen.at(-1)).toBe("thread-09999");
  });

  it("walks the 10k inventory to a bounded frontier and confirms membership exactly", () => {
    const seen = new Set<string>();
    let cursor: string | undefined;
    const frontiers: (string | undefined)[] = [];
    for (;;) {
      const body = buildCatalogThreadListPage(
        context(),
        negotiationFor("thread-list", "&limit=200&mode=inventory"),
        cursor,
      );
      const parsed = boundedThreadListPageSchema.parse(JSON.parse(body));
      frontiers.push(parsed.inventoryFrontier);
      for (const thread of parsed.threads) seen.add(thread.id);
      if (parsed.nextCursor === null) break;
      const decoded = decodeCatalogInventoryCursor(parsed.nextCursor, "thread");
      expect(decoded.frontier).toBe(frontiers[0]);
      cursor = parsed.nextCursor;
      if (seen.size > THREADS) throw new Error("inventory walk did not terminate");
    }
    expect(frontiers[0]).toBe("thread-09999");
    expect(frontiers.slice(1).every((value) => value === undefined)).toBe(true);
    expect(seen.size).toBe(THREADS);

    const candidates = ["thread-00000", "thread-09999", "thread-missing"];
    expect(dbReadCatalogMembership({ threadIds: candidates })).toEqual({
      existingThreadIds: ["thread-00000", "thread-09999"],
      existingProjectIds: [],
    });
    const batch = Array.from({ length: 200 }, (_, index) =>
      index % 2 === 0 ? `thread-${String(index).padStart(5, "0")}` : `missing-${index}`,
    );
    const confirmation = dbReadCatalogMembership({ threadIds: batch });
    expect(confirmation.existingThreadIds).toHaveLength(100);
    expect(confirmation.existingThreadIds[0]).toBe("thread-00000");
  });

  it("pages the 40 projects in paint and inventory modes", () => {
    const first = buildCatalogProjectListPage(
      context(),
      negotiationFor("project-list", "&projectLimit=15"),
      undefined,
    );
    const parsedFirst = JSON.parse(first) as {
      projects: { id: string }[];
      projectsNextCursor: string | null;
    };
    expect(parsedFirst.projects).toHaveLength(15);
    expect(parsedFirst.projectsNextCursor).toMatch(/^pj1\./u);
    const inventory = buildCatalogProjectListPage(
      context(),
      negotiationFor("project-list", "&mode=inventory&projectLimit=15"),
      undefined,
    );
    const parsedInventory = JSON.parse(inventory) as {
      inventoryFrontier?: string;
      projectsNextCursor: string | null;
    };
    expect(parsedInventory.inventoryFrontier).toBe("project-39");
    expect(parsedInventory.projectsNextCursor).toMatch(/^pi1\./u);
  });

  it("walks the 5k-item history without holes and the 500-turn tail losslessly", async () => {
    const itemIds: string[] = [];
    let beforePosition: number | undefined;
    let pages = 0;
    for (;;) {
      const body = await buildBoundedThreadHistoryItems(
        {
          threadId: "thread-00000",
          limit: 500,
          ...(beforePosition !== undefined ? { beforePosition } : {}),
        },
        negotiationFor("thread-list", "").caps,
      );
      const parsed = boundedRuntimeItemsPageSchema.parse(JSON.parse(body));
      itemIds.push(...parsed.items.map((item) => item.id));
      pages += 1;
      if (parsed.nextCursor === null) break;
      // The cursor is the oldest returned position and strictly decreases.
      expect(parsed.nextCursor).toBeLessThan(beforePosition ?? Number.MAX_SAFE_INTEGER);
      beforePosition = parsed.nextCursor;
      if (pages > 30) throw new Error("history walk did not terminate");
    }
    expect(itemIds).toHaveLength(ITEMS);
    expect(new Set(itemIds).size).toBe(ITEMS);
    expect(itemIds).toContain("item-00000");
    expect(itemIds).toContain("item-04999");

    const turnKeys = new Set<string>();
    let cursorIdx: number | undefined;
    let turnPages = 0;
    for (;;) {
      const body = buildBoundedCompletedTurnPage({
        threadId: "thread-00000",
        limit: 200,
        caps: negotiationFor("thread-list", "").caps,
        ...(cursorIdx !== undefined ? { cursorIdx } : {}),
      });
      const parsed = JSON.parse(body) as {
        turns: { startedAt: string; endedAt: string }[];
        completedTurnsNextCursor: string | null;
      };
      for (const turn of parsed.turns) turnKeys.add(`${turn.startedAt}|${turn.endedAt}`);
      turnPages += 1;
      if (parsed.completedTurnsNextCursor === null) break;
      cursorIdx = decodeCompletedTurnCursor(parsed.completedTurnsNextCursor);
      if (turnPages > 5) throw new Error("turn walk did not terminate");
    }
    expect(turnPages).toBe(3);
    expect(turnKeys.size).toBe(TURNS);
  });

  it("keeps a declared history tail bounded while the legacy read stays complete", () => {
    const caps = negotiationFor("thread-list", "").caps;
    const turnPage = buildBoundedCompletedTurnPage({ threadId: "thread-00000", limit: 200, caps });
    const parsed = JSON.parse(turnPage) as { turns: unknown[]; completedTurnsNextCursor: string };
    expect(parsed.turns).toHaveLength(200);
    expect(parsed.completedTurnsNextCursor).toMatch(/^ct1\./u);
    // Declared history negotiation defaults to the newest 200 turns; the
    // legacy variant keeps all 500 (the HTTP suite asserts that path).
    const negotiation = parseHistoryReadNegotiation(
      new URL(`http://host/api/threads/thread-00000/history?reads=${CATALOG_READS_CAPABILITY}`),
    );
    expect(negotiation.declared).toBe(true);
    expect(negotiation.completedTurnsLimit).toBe(200);
  });
});
