import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import {
  CATALOG_HOST_DECODE_MAX_BYTES,
  CATALOG_HOST_WIRE_MAX_BYTES,
  CATALOG_READS_CAPABILITY,
  CATALOG_SOFT_PACK_WIRE_BYTES,
  decodeCatalogInventoryCursor,
  serializedDecodeByteLength,
  serializedWireByteLength,
} from "@/shared/remote/catalogReadContract";
import { closeDatabase, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import type { RemoteServerContext } from "./context";
import { handleCatalogMembership } from "./catalogMembership";
import {
  buildCatalogProjectListPage,
  buildCatalogShellSnapshotPage,
  buildCatalogThreadListPage,
  boundedShellSnapshotSchema,
  boundedThreadListPageSchema,
  catalogProjectListPageSchema,
} from "./catalogPageBuilders";
import { CatalogItemTooLargeError } from "./catalogPageBudget";
import {
  handleCatalogProjectList,
  handleCatalogShellSnapshot,
  handleCatalogThreadList,
  parseCatalogReadNegotiation,
} from "./catalogPages";

function threadFixture(index: number, overrides: Partial<Thread> = {}): Thread {
  const id = `thread-${String(index).padStart(5, "0")}`;
  return {
    id,
    projectId: "project-1",
    title: `Fix regression ${index}`,
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: `2026-08-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    updatedAt: `2026-09-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    ...overrides,
  };
}

function insertThreads(count: number, options?: { readonly pageRows?: number }): void {
  const sqlite = getSqlite();
  const insert = sqlite.prepare(
    `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  sqlite.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const rows = options?.pageRows ?? 4;
      insert.run(
        `thread-${String(index).padStart(5, "0")}`,
        "project-1",
        `Fix regression ${index} ${"x".repeat(rows * 64)}`,
        "claude",
        '{"model":"sonnet"}',
        "idle",
        "none",
        index,
        `2026-08-01T00:00:00.${String(index % 1000).padStart(3, "0")}Z`,
        `2026-09-01T00:00:00.${String(index % 1000).padStart(3, "0")}Z`,
      );
    }
  })();
}

const projectFixture = (index: number) => ({
  id: `project-${index}`,
  name: `Project ${index}`,
  location: { kind: "posix" as const, path: `/tmp/project-${index}` },
  createdAt: "2026-01-01T00:00:00.000Z",
});

function context(overrides: { readonly withGitState?: boolean } = {}): RemoteServerContext {
  return {
    options: {
      gitSummaries: () => ({
        "thread-00000": {
          isRepo: true,
          branch: "main",
          totalInsertions: 3,
          totalDeletions: 1,
          ahead: 0,
          behind: 0,
          pr: null,
        },
      }),
      ...(overrides.withGitState
        ? {
            gitState: {
              getSnapshot: () => ({
                revision: 0,
                projects: {},
                targets: {},
                pullRequests: {},
                pullRequestKeyByBranch: {},
                projectPullRequestLists: {},
              }),
            },
          }
        : {}),
    },
    seq: 42,
  } as unknown as RemoteServerContext;
}

function negotiation(route: "shell-snapshot" | "thread-list" | "project-list", query = "") {
  return parseCatalogReadNegotiation(
    new URL(`http://host/api/${route}?reads=${CATALOG_READS_CAPABILITY}${query}`),
    route,
  );
}

interface FakeResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string | number | string[] | undefined>;
}

function fakeResponse(): ServerResponse & FakeResponse {
  const state: FakeResponse = { statusCode: 200, body: "", headers: {} };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    get body() {
      return state.body;
    },
    headers: state.headers,
    setHeader(name: string, value: string | number | readonly string[]) {
      state.headers[name.toLowerCase()] = Array.isArray(value)
        ? [...value]
        : (value as string | number);
      return res;
    },
    appendHeader(name: string, value: string | readonly string[]) {
      const key = name.toLowerCase();
      const previous = state.headers[key];
      const next = Array.isArray(value) ? value : [value];
      state.headers[key] = previous === undefined ? [...next] : [previous, ...next].flat();
      return res;
    },
    end(body?: string) {
      if (body !== undefined) state.body += body;
      return res;
    },
  };
  return res as unknown as ServerResponse & FakeResponse;
}

async function invoke(
  handler: (call: never) => Promise<void>,
  input: { readonly url: string; readonly body?: unknown; readonly ctx?: RemoteServerContext },
): Promise<FakeResponse> {
  const res = fakeResponse();
  const req = Readable.from(
    input.body !== undefined ? [Buffer.from(JSON.stringify(input.body))] : [],
  ) as unknown as IncomingMessage;
  (req as unknown as { headers: Record<string, string> }).headers = {};
  await handler({
    ctx: input.ctx ?? context(),
    req,
    res,
    url: new URL(input.url, "http://host"),
    forwardOrigin: null,
    bearerToken: null,
    session: null,
    readClass: "normal",
    params: {},
  } as never);
  return res;
}

describe.skipIf(!sqliteAvailable)("catalogPages", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-catalog-pages-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(projectFixture(1), 0);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("parses negotiation strictly and clamps caps to the host ceiling", () => {
    const declared = negotiation(
      "thread-list",
      "&limit=7&order=updated&mode=inventory&summaries=1",
    );
    expect(declared).toMatchObject({
      declared: true,
      order: "updated",
      mode: "inventory",
      limit: 7,
      summaries: true,
    });
    expect(declared.caps.maxWireBytes).toBe(CATALOG_HOST_WIRE_MAX_BYTES);
    expect(declared.caps.maxDecodeBytes).toBe(CATALOG_HOST_DECODE_MAX_BYTES);
    expect(declared.caps.softPackWireBytes).toBe(CATALOG_SOFT_PACK_WIRE_BYTES);

    const clamped = negotiation(
      "thread-list",
      "&maxBytes=999999999999&maxDecodeBytes=999999999999",
    );
    expect(clamped.caps.maxWireBytes).toBe(CATALOG_HOST_WIRE_MAX_BYTES);
    expect(clamped.caps.maxDecodeBytes).toBe(CATALOG_HOST_DECODE_MAX_BYTES);

    const clientCapped = negotiation("thread-list", "&maxBytes=1024&maxDecodeBytes=2048");
    expect(clientCapped.caps.maxWireBytes).toBe(1024);
    expect(clientCapped.caps.maxDecodeBytes).toBe(2048);
    expect(clientCapped.caps.softPackWireBytes).toBe(1024);

    expect(
      parseCatalogReadNegotiation(new URL("http://host/api/threads"), "thread-list").declared,
    ).toBe(false);
    const expectCode = (query: string, code: string) => {
      expect(() =>
        parseCatalogReadNegotiation(
          new URL(`http://host/api/threads?reads=${CATALOG_READS_CAPABILITY}${query}`),
          "thread-list",
        ),
      ).toThrowError(expect.objectContaining({ code }) as Error);
    };
    expect(() =>
      parseCatalogReadNegotiation(new URL("http://host/api/threads?reads=nope"), "thread-list"),
    ).toThrowError(expect.objectContaining({ code: "invalid_reads_capability" }) as Error);
    expectCode("&order=sideways", "invalid_order");
    expectCode("&order=sideways", "invalid_order");
    expectCode("&mode=everything", "invalid_mode");
    expectCode("&limit=0", "invalid_thread_limit");
    expectCode("&limit=01", "invalid_thread_limit");
    expectCode("&limit=201", "invalid_thread_limit");
    expectCode("&summaries=true", "invalid_summaries");
    expectCode("&maxBytes=0", "invalid_max_bytes");
    expectCode("&maxDecodeBytes=-5", "invalid_max_decode_bytes");
  });

  it("walks a paint page cursor without holes and keeps every body inside caps", () => {
    insertThreads(400);
    const ctx = context();
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const body = buildCatalogThreadListPage(ctx, negotiation("thread-list"), cursor);
      const parsed = boundedThreadListPageSchema.parse(JSON.parse(body));
      expect(parsed.reads).toBe(CATALOG_READS_CAPABILITY);
      expect(serializedWireByteLength(body)).toBeLessThanOrEqual(CATALOG_HOST_WIRE_MAX_BYTES);
      expect(serializedDecodeByteLength(body)).toBeLessThanOrEqual(CATALOG_HOST_DECODE_MAX_BYTES);
      // Packing keeps the page near the soft target; only the small envelope
      // may push it past, never a whole extra row.
      expect(serializedWireByteLength(body)).toBeLessThan(CATALOG_SOFT_PACK_WIRE_BYTES + 8 * 1024);
      seen.push(...parsed.threads.map((thread) => thread.id));
      pages += 1;
      if (parsed.nextCursor === null) break;
      cursor = parsed.nextCursor;
      if (pages > 100) throw new Error("paint walk did not terminate");
    }
    expect(seen).toHaveLength(400);
    expect(new Set(seen).size).toBe(400);
  });

  it("keeps an oversized row as an explicit page-of-one while soft targets never refuse", () => {
    insertThreads(3);
    // A 2 MiB row: above the soft target, below both hard caps. Sorted first so
    // this request's page is the oversized row itself.
    dbUpsertThread(
      threadFixture(99, { id: "thread-big", title: `big-${"y".repeat(2 * 1024 * 1024)}` }),
      -1,
    );
    const body = buildCatalogThreadListPage(
      context(),
      negotiation("thread-list", "&limit=1"),
      undefined,
    );
    const parsed = boundedThreadListPageSchema.parse(JSON.parse(body));
    expect(parsed.threads.map((thread) => thread.id)).toEqual(["thread-big"]);
    expect(serializedWireByteLength(body)).toBeGreaterThan(CATALOG_SOFT_PACK_WIRE_BYTES);
    expect(serializedWireByteLength(body)).toBeLessThanOrEqual(CATALOG_HOST_WIRE_MAX_BYTES);
  });

  it("refuses a page-of-one that cannot fit a client-declared wire cap before fetching it", () => {
    dbUpsertThread(
      threadFixture(1, { id: "thread-huge", title: `huge-${"z".repeat(3 * 1024 * 1024)}` }),
      -1,
    );
    let failure: unknown;
    try {
      buildCatalogThreadListPage(
        context(),
        negotiation("thread-list", "&limit=10&maxBytes=1048576"),
        undefined,
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CatalogItemTooLargeError);
    const body = (failure as CatalogItemTooLargeError).body;
    expect(body.readItem).toMatchObject({
      resource: "thread",
      id: "thread-huge",
      maxBytes: 1_048_576,
      measurement: "serialized-upper-bound",
      decodeBytesMeaning: "utf16-code-units-x2",
    });
    expect(body.readItem.wireBytes).toBeGreaterThan(1_048_576);
  });

  it("binds the decode cap independently of the wire cap", () => {
    dbUpsertThread(
      threadFixture(1, { id: "thread-ascii", title: `a-${"q".repeat(1024 * 1024)}` }),
      0,
    );
    let failure: unknown;
    try {
      buildCatalogThreadListPage(
        context(),
        negotiation("thread-list", "&limit=10&maxBytes=33554432&maxDecodeBytes=1048576"),
        undefined,
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CatalogItemTooLargeError);
    expect((failure as CatalogItemTooLargeError).body.readItem).toMatchObject({
      maxBytes: CATALOG_HOST_WIRE_MAX_BYTES,
      maxDecodeBytes: 1_048_576,
      measurement: "serialized-upper-bound",
    });
  });

  it("trims trailing rows against a small exact cap and continues from the last included row", () => {
    insertThreads(20, { pageRows: 8 });
    const seen: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const body = buildCatalogThreadListPage(
        context(),
        negotiation("thread-list", "&limit=100&maxBytes=5120"),
        cursor,
      );
      const parsed = boundedThreadListPageSchema.parse(JSON.parse(body));
      expect(serializedWireByteLength(body)).toBeLessThanOrEqual(5120);
      expect(parsed.threads.length).toBeGreaterThanOrEqual(1);
      seen.push(...parsed.threads.map((thread) => thread.id));
      if (parsed.nextCursor === null) break;
      cursor = parsed.nextCursor;
      if (seen.length > 40) throw new Error("small-cap walk did not terminate");
    }
    expect(seen).toHaveLength(20);
    expect(new Set(seen).size).toBe(20);
  });

  it("walks the inventory to a completed pass over 1,000 rows with a page-1 frontier", () => {
    insertThreads(1000);
    const ctx = context();
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    let pageOneFrontier: string | undefined;
    let continuationEchoedFrontier = false;
    for (;;) {
      const body = buildCatalogThreadListPage(
        ctx,
        negotiation("thread-list", "&limit=100&mode=inventory&order=updated"),
        cursor,
      );
      const parsed = boundedThreadListPageSchema.parse(JSON.parse(body));
      if (cursor === undefined) pageOneFrontier = parsed.inventoryFrontier;
      else if (parsed.inventoryFrontier !== undefined) continuationEchoedFrontier = true;
      for (const thread of parsed.threads) {
        expect(seen.has(thread.id)).toBe(false);
        seen.add(thread.id);
      }
      pages += 1;
      if (parsed.nextCursor === null) break;
      const decoded = decodeCatalogInventoryCursor(parsed.nextCursor, "thread");
      expect(decoded.frontier).toBe(parsed.inventoryFrontier ?? decoded.frontier);
      cursor = parsed.nextCursor;
      if (pages > 50) throw new Error("inventory walk did not terminate");
    }
    expect(seen.size).toBe(1000);
    expect(pageOneFrontier).toBeDefined();
    expect(continuationEchoedFrontier).toBe(false);
  });

  it("builds the bounded shell snapshot with cursors, summaries opt-in, and sliced git maps", () => {
    insertThreads(5);
    dbUpsertProject(projectFixture(2), 1);
    const body = buildCatalogShellSnapshotPage(
      context({ withGitState: true }),
      negotiation("shell-snapshot"),
    );
    const parsed = boundedShellSnapshotSchema.parse(JSON.parse(body));
    expect(parsed.reads).toBe(CATALOG_READS_CAPABILITY);
    expect(parsed.snapshotSeq).toBe(42);
    expect(parsed.threads).toHaveLength(5);
    expect(parsed.threadsNextCursor).toBeNull();
    expect(parsed.projects.map((project) => project.id)).toEqual(["project-1", "project-2"]);
    expect(parsed.projectsNextCursor).toBeNull();
    expect(parsed.runtimeSummariesByThread).toEqual({});
    expect(Object.keys(parsed.gitSummariesByThread ?? {})).toEqual(["thread-00000"]);
    expect(parsed.gitState).toBeDefined();

    const withSummaries = buildCatalogShellSnapshotPage(
      context(),
      negotiation("shell-snapshot", "&summaries=1"),
    );
    const parsedSummaries = boundedShellSnapshotSchema.parse(JSON.parse(withSummaries));
    expect(Object.keys(parsedSummaries.runtimeSummariesByThread)).toHaveLength(5);
  });

  it("serves an empty bounded snapshot and empty pages without special cases", () => {
    const body = buildCatalogShellSnapshotPage(context(), negotiation("shell-snapshot"));
    const parsed = boundedShellSnapshotSchema.parse(JSON.parse(body));
    expect(parsed.threads).toEqual([]);
    // Only the beforeEach project exists; it is complete, so no cursor.
    expect(parsed.projects.map((project) => project.id)).toEqual(["project-1"]);
    expect(parsed.threadsNextCursor).toBeNull();
    expect(parsed.projectsNextCursor).toBeNull();
    expect(parsed.runtimeSummariesByThread).toEqual({});
  });

  it("pages projects in paint and inventory modes", () => {
    for (let index = 2; index < 7; index += 1) dbUpsertProject(projectFixture(index), index - 1);
    const paint = catalogProjectListPageSchema.parse(
      JSON.parse(
        buildCatalogProjectListPage(
          context(),
          negotiation("project-list", "&projectLimit=2"),
          undefined,
        ),
      ),
    );
    expect(paint.projects.map((project) => project.id)).toEqual(["project-1", "project-2"]);
    expect(paint.projectsNextCursor).not.toBeNull();
    const inventory = catalogProjectListPageSchema.parse(
      JSON.parse(
        buildCatalogProjectListPage(
          context(),
          negotiation("project-list", "&mode=inventory&projectLimit=2"),
          undefined,
        ),
      ),
    );
    expect(inventory.inventoryFrontier).toBeDefined();
    expect(inventory.projects.map((project) => project.id)).toEqual(["project-1", "project-2"]);
  });

  it("keeps the legacy routes byte-compatible for undeclared clients", async () => {
    insertThreads(3);
    const list = await invoke(handleCatalogThreadList, {
      url: "/api/threads?limit=2",
    });
    expect(list.statusCode).toBe(200);
    const legacyList = JSON.parse(list.body) as { reads?: string; nextCursor: string | null };
    expect(legacyList.reads).toBeUndefined();
    expect(legacyList.nextCursor).toMatch(/^tp1\./u);

    const snapshot = await invoke(handleCatalogShellSnapshot, { url: "/api/shell-snapshot" });
    expect(snapshot.statusCode).toBe(200);
    const legacySnapshot = JSON.parse(snapshot.body) as { reads?: string; threads: unknown[] };
    expect(legacySnapshot.reads).toBeUndefined();
    expect(legacySnapshot.threads).toHaveLength(3);
  });

  it("serves bounded pages through the HTTP handlers, including the typed 422 body", async () => {
    insertThreads(4);
    const page = await invoke(handleCatalogThreadList, {
      url: `/api/threads?reads=${CATALOG_READS_CAPABILITY}&limit=2`,
    });
    expect(page.statusCode).toBe(200);
    const parsed = JSON.parse(page.body) as { reads: string; threads: unknown[] };
    expect(parsed.reads).toBe(CATALOG_READS_CAPABILITY);
    expect(parsed.threads).toHaveLength(2);

    dbUpsertThread(threadFixture(9, { id: "thread-big", title: `t-${"w".repeat(2_000_000)}` }), -1);
    const refused = await invoke(handleCatalogThreadList, {
      url: `/api/threads?reads=${CATALOG_READS_CAPABILITY}&limit=10&maxBytes=1048576`,
    });
    expect(refused.statusCode).toBe(422);
    expect(JSON.parse(refused.body)).toMatchObject({
      error: { code: "read_item_too_large" },
      readItem: { resource: "thread", id: "thread-big" },
    });

    await expect(
      invoke(handleCatalogProjectList, { url: "/api/projects?projectLimit=2" }),
    ).rejects.toMatchObject({ code: "invalid_reads_capability", status: 400 });
  });

  it("answers the membership route and rejects oversized or duplicate batches", async () => {
    dbUpsertThread(threadFixture(1, { id: "thread-1" }), 0);
    const ok = await invoke(handleCatalogMembership, {
      url: "/api/catalog/membership",
      body: { threadIds: ["thread-1", "missing"], projectIds: ["project-1"] },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body)).toEqual({
      existingThreadIds: ["thread-1"],
      existingProjectIds: ["project-1"],
    });
    await expect(
      invoke(handleCatalogMembership, {
        url: "/api/catalog/membership",
        body: { threadIds: Array.from({ length: 201 }, (_, index) => `id-${index}`) },
      }),
    ).rejects.toThrow(/threadIds|too_big/u);
    await expect(
      invoke(handleCatalogMembership, {
        url: "/api/catalog/membership",
        body: { threadIds: ["dup", "dup"] },
      }),
    ).rejects.toThrow(/threadIds|unique/u);
  });
});
