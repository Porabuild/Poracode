import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { threadSchema, type Thread } from "@/shared/contracts";
import {
  CATALOG_ROW_ENVELOPE_BYTES,
  CATALOG_THREAD_INVENTORY_CURSOR_PREFIX,
  CatalogCursorError,
  decodeCatalogThreadPaintCursor,
  encodeCatalogInventoryCursor,
  encodeCatalogThreadPaintCursor,
  serializedDecodeByteLength,
  serializedWireByteLength,
} from "@/shared/remote/catalogReadContract";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  dbGetProject,
  dbGetThread,
  dbUpsertProject,
  dbUpsertThread,
  encodeDbThreadPageCursor,
} from "./projectsThreads";
import {
  dbReadCatalogProjectPhase1,
  dbReadCatalogProjectPhase2,
  dbReadCatalogThreadPhase1,
  dbReadCatalogThreadPhase2,
} from "./catalogReads";
import { dbReadCatalogMembership } from "./catalogMembershipReads";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

function testThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Test thread",
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const testProject = (id: string, name = `Project ${id}`) => ({
  id,
  name,
  location: { kind: "posix" as const, path: `/tmp/${id}` },
  createdAt: "2026-01-01T00:00:00.000Z",
});

/** Fast bulk insert for the 10k-row fixtures; values are test-controlled. */
function insertThreadRows(
  count: number,
  options: {
    readonly id: (index: number) => string;
    readonly sortOrder?: (index: number) => number;
    readonly updatedAt?: (index: number) => string;
    readonly projectId?: string;
  },
): void {
  const sqlite = getSqlite();
  const insert = sqlite.prepare(
    `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  sqlite.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const updatedAt = options.updatedAt?.(index) ?? "2026-01-01T00:00:00.000Z";
      insert.run(
        options.id(index),
        options.projectId ?? "project-1",
        `Thread ${index}`,
        "claude",
        '{"model":"sonnet"}',
        "idle",
        "none",
        options.sortOrder?.(index) ?? index,
        updatedAt,
        updatedAt,
      );
    }
  })();
}

describe.skipIf(!sqliteAvailable)("catalogReads (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-catalog-reads-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(testProject("project-1"), 0);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("pages manual paint in (sort_order, id) order across cursors", () => {
    for (let index = 0; index < 25; index += 1) {
      dbUpsertThread(testThread({ id: `thread-${String(index).padStart(2, "0")}` }), index);
    }
    const first = dbReadCatalogThreadPhase1({ mode: "page", order: "manual", limit: 10 });
    expect(first.rows.map((row) => row.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `thread-${String(index).padStart(2, "0")}`),
    );
    expect(first.moreBeyondWindow).toBe(true);
    const cursor = encodeCatalogThreadPaintCursor({
      order: "manual",
      sortOrder: first.rows.at(-1)!.sortOrder,
      id: first.rows.at(-1)!.id,
    });
    const second = dbReadCatalogThreadPhase1({
      mode: "page",
      order: "manual",
      limit: 10,
      cursor,
    });
    expect(second.rows).toHaveLength(10);
    expect(second.rows[0]?.id).toBe("thread-10");
    expect(second.moreBeyondWindow).toBe(true);
    expect(decodeCatalogThreadPaintCursor(cursor)).toEqual({
      order: "manual",
      sortOrder: 9,
      id: "thread-09",
    });
  });

  it("pages updated paint recent-first and continues without overlap", () => {
    insertThreadRows(30, {
      id: (index) => `u-${String(index).padStart(3, "0")}`,
      updatedAt: (index) => `2026-02-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    });
    const first = dbReadCatalogThreadPhase1({ mode: "page", order: "updated", limit: 10 });
    expect(first.rows).toHaveLength(10);
    const times = first.rows.map((row) => row.updatedAt);
    expect([...times].sort().reverse()).toEqual(times);
    const cursor = encodeCatalogThreadPaintCursor({
      order: "updated",
      updatedAt: first.rows.at(-1)!.updatedAt,
      id: first.rows.at(-1)!.id,
    });
    const second = dbReadCatalogThreadPhase1({
      mode: "page",
      order: "updated",
      limit: 10,
      cursor,
    });
    const firstIds = new Set(first.rows.map((row) => row.id));
    expect(second.rows.every((row) => !firstIds.has(row.id))).toBe(true);
  });

  it("walks the full 10k inventory exactly once with a bounded frontier", () => {
    insertThreadRows(10_000, { id: (index) => `t-${index.toString(36).padStart(6, "0")}` });
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = dbReadCatalogThreadPhase1({
        mode: "inventory",
        limit: 200,
        ...(cursor !== undefined ? { cursor } : {}),
      });
      pages += 1;
      for (const row of page.rows) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
      const last = page.rows.at(-1);
      if (!page.moreBeyondWindow || last === undefined) break;
      cursor = encodeCatalogInventoryCursor("thread", { id: last.id, frontier: page.frontier! });
    }
    expect(seen.size).toBe(10_000);
    expect(pages).toBe(50);
    // Continuation pages carry the frontier from their own cursor.
    const continuation = dbReadCatalogThreadPhase1({
      mode: "inventory",
      limit: 10,
      cursor: encodeCatalogInventoryCursor("thread", { id: "0000", frontier: "zzzz" }),
    });
    expect(continuation.frontier).toBe("zzzz");
  });

  it("bounds the walk at the page-1 frontier even when inserts stream in ahead", () => {
    for (let index = 0; index < 5; index += 1) {
      dbUpsertThread(testThread({ id: `base-${index}` }), index);
    }
    const page1 = dbReadCatalogThreadPhase1({ mode: "inventory", limit: 2 });
    const frontier = page1.frontier!;
    expect(frontier).toBeDefined();
    // Hostile insert far above the frontier while the walk is in flight.
    dbUpsertThread(testThread({ id: "zzzz-inserted-ahead" }), 100);
    let cursor = encodeCatalogInventoryCursor("thread", { id: page1.rows.at(-1)!.id, frontier });
    const ids: string[] = [...page1.rows.map((row) => row.id)];
    for (;;) {
      const page = dbReadCatalogThreadPhase1({ mode: "inventory", limit: 2, cursor });
      ids.push(...page.rows.map((row) => row.id));
      if (!page.moreBeyondWindow || page.rows.length === 0) break;
      cursor = encodeCatalogInventoryCursor("thread", { id: page.rows.at(-1)!.id, frontier });
    }
    expect(ids).not.toContain("zzzz-inserted-ahead");
    expect(ids).toHaveLength(5);
  });

  it("ignores an insert behind the cursor but confirms it through membership", () => {
    for (let index = 0; index < 6; index += 1) {
      dbUpsertThread(testThread({ id: `t-${index}` }), index);
    }
    const page1 = dbReadCatalogThreadPhase1({ mode: "inventory", limit: 3 });
    const cursor = encodeCatalogInventoryCursor("thread", {
      id: page1.rows.at(-1)!.id,
      frontier: page1.frontier!,
    });
    // Restore/insert an id that sorts before the cursor while the walk runs.
    dbUpsertThread(testThread({ id: "t-0000-behind" }), -1);
    const page2 = dbReadCatalogThreadPhase1({ mode: "inventory", limit: 10, cursor });
    expect(page2.rows.map((row) => row.id)).not.toContain("t-0000-behind");
    expect(dbReadCatalogMembership({ threadIds: ["t-0000-behind"] })).toEqual({
      existingThreadIds: ["t-0000-behind"],
      existingProjectIds: [],
    });
  });

  it("refuses a cursor whose prefix does not match the requested mode or order", () => {
    dbUpsertThread(testThread({ id: "thread-1" }), 0);
    expect(() =>
      dbReadCatalogThreadPhase1({ mode: "page", order: "manual", limit: 5, cursor: "ti1.abc" }),
    ).toThrow(CatalogCursorError);
    const inventoryCursor = encodeCatalogInventoryCursor("thread", { id: "a", frontier: "b" });
    expect(inventoryCursor.startsWith(CATALOG_THREAD_INVENTORY_CURSOR_PREFIX)).toBe(true);
    expect(() =>
      dbReadCatalogThreadPhase1({
        mode: "page",
        order: "manual",
        limit: 5,
        cursor: inventoryCursor,
      }),
    ).toThrow(CatalogCursorError);
    const updatedCursor = encodeCatalogThreadPaintCursor({
      order: "updated",
      updatedAt: "2026-01-01T00:00:00.000Z",
      id: "a",
    });
    expect(() =>
      dbReadCatalogThreadPhase1({ mode: "page", order: "manual", limit: 5, cursor: updatedCursor }),
    ).toThrow(CatalogCursorError);
  });

  it("keeps the legacy tp1. cursor byte-compatible with the bounded manual paint", () => {
    const legacy = encodeDbThreadPageCursor({ sortOrder: 7, id: "thread-x" });
    expect(encodeCatalogThreadPaintCursor({ order: "manual", sortOrder: 7, id: "thread-x" })).toBe(
      legacy,
    );
    expect(decodeCatalogThreadPaintCursor(legacy)).toEqual({
      order: "manual",
      sortOrder: 7,
      id: "thread-x",
    });
  });

  it("bounds hostile stored JSON lexemes soundly and returns payload-free phase-1 metadata", () => {
    // Stored text (not the parsed value): legacy numeric forms can be shorter
    // than their canonical re-serialization, which is what the 6x factor covers.
    const hostileTexts = [
      `[${Array.from({ length: 2000 }, () => "1e20").join(",")}]`,
      `{"escaped":"\\ud800","literal":"\u{1F600}","controls":"\\u0001\\u0002"}`,
      `{"big":123456789012345678901234567890,"zero":-0,"one":1.0,"exp":1E+20}`,
    ];
    dbUpsertThread(testThread({ id: "hostile" }), 0);
    const raw = getSqlite().prepare("UPDATE threads SET config = ? WHERE id = ?");
    hostileTexts.forEach((text, index) => {
      const id = `hostile-${index}`;
      dbUpsertThread(testThread({ id }), index);
      raw.run(text, id);
    });
    const page = dbReadCatalogThreadPhase1({ mode: "page", order: "manual", limit: 10 });
    expect(page.rows).toHaveLength(4);
    // Phase 1 rows are metadata-only regardless of stored payload size.
    expect(JSON.stringify(page.rows).length).toBeLessThan(4096);
    for (const [index, text] of hostileTexts.entries()) {
      const canonical = JSON.stringify(JSON.parse(text) as unknown);
      const matching = page.rows.find((row) => row.id === `hostile-${index}`)!;
      expect(matching.boundWireBytes - CATALOG_ROW_ENVELOPE_BYTES).toBeGreaterThanOrEqual(
        serializedWireByteLength(canonical),
      );
      expect(matching.boundWireBytes - CATALOG_ROW_ENVELOPE_BYTES).toBeGreaterThanOrEqual(
        serializedDecodeByteLength(canonical) / 2,
      );
    }
  });

  it("keeps phase-2 rows mapped exactly and never selects terminal_prompt", () => {
    const rich = testThread({
      id: "round-trip",
      workspaceId: "ws-1",
      agentInstanceId: "instance-1",
      sessionRef: {
        providerSessionId: "sess-1",
        discoveredAt: "2026-01-01T00:00:00.000Z",
      },
      worktreePath: "/tmp/wt",
      worktreeBranch: "poracode/fix",
      prNumber: 42,
      groupId: "g-1",
      groupName: "Group",
      parentThreadId: "parent-1",
      archived: true,
      archivedAt: "2026-02-01T00:00:00.000Z",
      done: true,
      doneAt: "2026-02-02T00:00:00.000Z",
      starred: true,
      threadStatusSource: "cli_hook",
      activeTurnStartedAt: "2026-02-03T00:00:00.000Z",
      lastTurnStartedAt: "2026-02-03T00:00:00.000Z",
      lastTurnEndedAt: "2026-02-03T01:00:00.000Z",
    });
    dbUpsertThread(rich, 0);
    const [thread] = dbReadCatalogThreadPhase2(["round-trip"]);
    expect(thread).toEqual(dbGetThread("round-trip"));
    getSqlite()
      .prepare("UPDATE threads SET terminal_prompt = ? WHERE id = ?")
      .run("x".repeat(1000), "round-trip");
    const [after] = dbReadCatalogThreadPhase2(["round-trip"]);
    expect(JSON.stringify(after)).not.toContain("xxxx");
    expect(threadSchema.parse(after)).toBeTruthy();
  });

  it("keeps project phase-2 rows identical to the mapped project (minus mcpServers)", () => {
    const richProject = {
      ...testProject("rich"),
      icon: "lucide:folder",
      lastDraftConfig: { agentKind: "claude" as const, model: "sonnet" },
      scripts: { actions: [], setupScript: "pnpm i" },
      searchSettings: { useIgnoreFiles: true },
      worktreeLocation: { mode: "global" as const, basePath: "/tmp/wt" },
      mcpServers: [
        {
          id: "custom",
          name: "custom",
          description: "custom server",
          enabled: true,
          timeoutMs: 1000,
          transport: { type: "stdio" as const, command: "x", args: [], env: {} },
        },
      ],
      ghAccount: { host: "github.com", login: "octocat" },
      workspaceId: "ws-1",
      disabled: true,
    };
    dbUpsertProject(richProject, 0);
    const [project] = dbReadCatalogProjectPhase2(["rich"]);
    const { mcpServers: _mcpServers, ...expected } = dbGetProject("rich")!;
    expect(project).toEqual(expected);
    expect(project?.mcpServers).toBeUndefined();
  });

  it("reads project pages and inventory with the same budget contract", () => {
    for (let index = 0; index < 5; index += 1) {
      dbUpsertProject(testProject(`p-${index}`, `Project ${index}`), index);
    }
    const paint = dbReadCatalogProjectPhase1({ mode: "page", limit: 3 });
    expect(paint.rows.map((row) => row.id)).toEqual(["p-0", "project-1", "p-1"]);
    expect(paint.moreBeyondWindow).toBe(true);
    const inventory = dbReadCatalogProjectPhase1({ mode: "inventory", limit: 2 });
    expect(inventory.frontier).toBeDefined();
    const [first, second] = dbReadCatalogProjectPhase2(inventory.rows.map((row) => row.id));
    expect(first?.id).toBe("p-0");
    expect(second?.id).toBe("p-1");
    expect(first?.mcpServers).toBeUndefined();
  });

  it("membership preserves request order, filters absent ids, and enforces the bound", () => {
    dbUpsertThread(testThread({ id: "a" }), 0);
    dbUpsertProject(testProject("pa"), 0);
    expect(
      dbReadCatalogMembership({ threadIds: ["missing", "a"], projectIds: ["pa", "missing"] }),
    ).toEqual({ existingThreadIds: ["a"], existingProjectIds: ["pa"] });
    expect(dbReadCatalogMembership({})).toEqual({
      existingThreadIds: [],
      existingProjectIds: [],
    });
    const tooMany = Array.from({ length: 201 }, (_, index) => `id-${index}`);
    expect(() => dbReadCatalogMembership({ threadIds: tooMany })).toThrow(/200/);
  });

  it("computes lower bounds that never exceed the actual serialized row", () => {
    // Valid Unicode, hostile JSON lexemes, controls and emoji: the phase-1
    // lower bound is the exact escaped size of the verbatim raw columns, so it
    // must always be ≤ the real row, while the packing bound must dominate it.
    const fixtures: Array<{ id: string; title: string; config: Thread["config"] }> = [
      { id: "unicode", title: "界".repeat(50_000), config: { model: "界".repeat(10) } },
      { id: "emoji", title: `emoji ${"😀".repeat(20_000)}`, config: { model: "😀" } },
      { id: "controls", title: `ctl ${"\u0001".repeat(30_000)}`, config: { model: "\t\n\b" } },
      {
        id: "hostile-json",
        title: "hostile",
        config: {
          exp: 1e20,
          zero: -0,
          one: 1.0,
          escaped: "\ud800",
        } as unknown as Thread["config"],
      },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      dbUpsertThread(
        testThread({ id: fixture.id, title: fixture.title, config: fixture.config }),
        index,
      );
    }
    const page = dbReadCatalogThreadPhase1({ mode: "page", order: "manual", limit: 10 });
    expect(page.rows).toHaveLength(fixtures.length);
    for (const row of page.rows) {
      const [thread] = dbReadCatalogThreadPhase2([row.id]);
      const actualWire = serializedWireByteLength(JSON.stringify(thread));
      const actualDecode = serializedDecodeByteLength(JSON.stringify(thread));
      expect(row.lowerBoundWireBytes).toBeLessThanOrEqual(actualWire);
      expect(row.lowerBoundDecodeBytes).toBeLessThanOrEqual(actualDecode);
      expect(row.boundWireBytes).toBeGreaterThanOrEqual(actualWire);
    }
    // The empty optional columns contribute nothing to the lower bound: the
    // 50k-character CJK title dominates it and is exact for that column.
    const unicodeRow = page.rows.find((row) => row.id === "unicode")!;
    expect(unicodeRow.lowerBoundWireBytes).toBeGreaterThanOrEqual(50_000 * 3);
    expect(unicodeRow.lowerBoundWireBytes).toBeLessThan(50_000 * 3 + 1024);
  });

  it("guards project location columns by location kind in the lower bound", () => {
    const wsl = {
      ...testProject("wsl-project", "WSL project"),
      location: {
        kind: "wsl" as const,
        distro: "Ubuntu",
        linuxPath: "/home/me/work",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\me\\work",
      },
    };
    dbUpsertProject(wsl, 1);
    // A stale posix path on a WSL row is never emitted by `rowToLocation`; the
    // lower bound must ignore it exactly like the wire schema does.
    getSqlite()
      .prepare("UPDATE projects SET location_path = ? WHERE id = ?")
      .run("x".repeat(1_000_000), "wsl-project");
    const page = dbReadCatalogProjectPhase1({ mode: "page", limit: 10 });
    const row = page.rows.find((candidate) => candidate.id === "wsl-project")!;
    const [project] = dbReadCatalogProjectPhase2(["wsl-project"]);
    expect(JSON.stringify(project)).not.toContain("xxxx");
    expect(row.lowerBoundWireBytes).toBeLessThanOrEqual(
      serializedWireByteLength(JSON.stringify(project)),
    );
    expect(row.lowerBoundWireBytes).toBeLessThan(10_000);
  });
});
