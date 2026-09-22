import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  RemoteDesktopClient,
  isRemoteBoundedReadProtocolError,
  type RemoteBoundedReadFirst,
  type RemoteBoundedReadsProof,
} from "./client";
import {
  encodeCatalogInventoryCursor,
  encodeCatalogProjectPaintCursor,
  encodeCatalogThreadPaintCursor,
  decodeCatalogInventoryCursor,
  decodeCatalogProjectPaintCursor,
  decodeCatalogThreadPaintCursor,
  type CatalogPaintOrder,
} from "./catalogReadContract";
import { encodeCompletedTurnCursor, decodeCompletedTurnCursor } from "./historyReadContract";

const TOKEN = "lc_access_bounded_test";
const CAPABILITY = "bounded-v1" as const;
const UPDATED_AT = "2026-01-02T00:00:00.000Z";

interface FixtureOptions {
  legacy?: boolean;
  omitEcho?: boolean;
  echo?: unknown;
  omitShellCursors?: boolean;
  omitInventoryFrontier?: boolean;
  responseCursorPrefixMismatch?: boolean;
  membershipExtraId?: boolean;
  membershipFailure?: boolean;
  noProjectList?: boolean;
  noTurnsRoute?: boolean;
  noMembershipRoute?: boolean;
  hang?: boolean;
}

interface CapturedRequest {
  readonly method: string;
  readonly pathname: string;
  readonly params: URLSearchParams;
  readonly authorization: string | undefined;
  readonly commandId: string | undefined;
  readonly body: unknown;
}

interface Fixture {
  readonly endpoint: string;
  readonly requests: CapturedRequest[];
  readonly options: FixtureOptions;
}

interface FixtureThread {
  readonly id: string;
  readonly sortOrder: number;
  readonly updatedAt: string;
  readonly createdAt: string;
  readonly row: Record<string, unknown>;
}

interface FixtureProject {
  readonly id: string;
  readonly sortOrder: number;
  readonly row: Record<string, unknown>;
}

interface FixtureItem {
  readonly position: number;
  readonly row: Record<string, unknown>;
}

interface FixtureTurn {
  readonly row: Record<string, unknown>;
}

function isoFromIndex(index: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

const THREADS: readonly FixtureThread[] = Array.from({ length: 7 }, (_, index) => {
  const id = `th-${String(index).padStart(3, "0")}`;
  const updatedAt = isoFromIndex(index);
  const createdAt = isoFromIndex(index);
  return {
    id,
    sortOrder: index,
    updatedAt,
    createdAt,
    row: {
      id,
      projectId: "pr-000",
      title: `Thread ${index}`,
      agentKind: "claude",
      config: { model: "sonnet" },
      status: "idle",
      attention: "none",
      archived: false,
      done: false,
      starred: false,
      createdAt,
      updatedAt,
    },
  };
});
const THREAD_IDS = new Set(THREADS.map((thread) => thread.id));

const PROJECTS: readonly FixtureProject[] = Array.from({ length: 5 }, (_, index) => {
  const id = `pr-${String(index).padStart(3, "0")}`;
  return {
    id,
    sortOrder: index,
    row: {
      id,
      name: `Project ${index}`,
      location: { kind: "posix", path: `/tmp/${id}` },
      createdAt: isoFromIndex(index),
    },
  };
});
const PROJECT_IDS = new Set(PROJECTS.map((project) => project.id));

const ITEMS: readonly FixtureItem[] = Array.from({ length: 12 }, (_, position) => ({
  position,
  row: {
    id: `item-${position}`,
    type: "assistant",
    state: "completed",
    payload: { text: `item ${position}` },
    streams: {},
  },
}));

const TURNS: readonly FixtureTurn[] = Array.from({ length: 23 }, (_, index) => ({
  row: {
    startedAt: isoFromIndex(index),
    endedAt: isoFromIndex(index + 1),
    anchorItemId: index % 3 === 0 ? null : `item-${index}`,
  },
}));

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function encodeThreadCursor(thread: FixtureThread, order: CatalogPaintOrder): string {
  if (order === "manual") {
    return encodeCatalogThreadPaintCursor({ order, sortOrder: thread.sortOrder, id: thread.id });
  }
  if (order === "updated") {
    return encodeCatalogThreadPaintCursor({ order, updatedAt: thread.updatedAt, id: thread.id });
  }
  return encodeCatalogThreadPaintCursor({ order, createdAt: thread.createdAt, id: thread.id });
}

function threadPaintPage(
  order: CatalogPaintOrder,
  cursor: string | undefined,
  limit: number,
): { rows: FixtureThread[]; nextCursor: string | null } {
  const sorted = [...THREADS].sort((left, right) => {
    if (order === "manual") {
      return left.sortOrder - right.sortOrder || compareIds(left.id, right.id);
    }
    if (order === "updated") {
      return right.updatedAt.localeCompare(left.updatedAt) || compareIds(right.id, left.id);
    }
    return right.createdAt.localeCompare(left.createdAt) || compareIds(right.id, left.id);
  });
  let start = 0;
  if (cursor !== undefined) {
    const decoded = decodeCatalogThreadPaintCursor(cursor);
    if (decoded.order !== order) throw new Error("fixture cursor order mismatch");
    start = sorted.findIndex((thread) => thread.id === decoded.id) + 1;
  }
  const page = sorted.slice(start, start + limit);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor:
      last !== undefined && start + page.length < sorted.length
        ? encodeThreadCursor(last, order)
        : null,
  };
}

function threadInventoryPage(
  cursor: string | undefined,
  limit: number,
): { rows: FixtureThread[]; nextCursor: string | null } {
  const sorted = [...THREADS].sort((left, right) => compareIds(left.id, right.id));
  const decoded = cursor === undefined ? undefined : decodeCatalogInventoryCursor(cursor, "thread");
  const frontier = decoded?.frontier ?? sorted.at(-1)?.id ?? "";
  const candidates = sorted.filter(
    (thread) => (decoded === undefined || thread.id > decoded.id) && thread.id <= frontier,
  );
  const page = candidates.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor:
      last !== undefined && page.length < candidates.length
        ? encodeCatalogInventoryCursor("thread", { id: last.id, frontier })
        : null,
  };
}

function projectPaintPage(
  cursor: string | undefined,
  limit: number,
): { rows: FixtureProject[]; nextCursor: string | null } {
  const sorted = [...PROJECTS].sort(
    (left, right) => left.sortOrder - right.sortOrder || compareIds(left.id, right.id),
  );
  let start = 0;
  if (cursor !== undefined) {
    const decoded = decodeCatalogProjectPaintCursor(cursor);
    start = sorted.findIndex((project) => project.id === decoded.id) + 1;
  }
  const page = sorted.slice(start, start + limit);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor:
      last !== undefined && start + page.length < sorted.length
        ? encodeCatalogProjectPaintCursor({ sortOrder: last.sortOrder, id: last.id })
        : null,
  };
}

function projectInventoryPage(
  cursor: string | undefined,
  limit: number,
): { rows: FixtureProject[]; nextCursor: string | null } {
  const sorted = [...PROJECTS].sort((left, right) => compareIds(left.id, right.id));
  const decoded =
    cursor === undefined ? undefined : decodeCatalogInventoryCursor(cursor, "project");
  const frontier = decoded?.frontier ?? sorted.at(-1)?.id ?? "";
  const candidates = sorted.filter(
    (project) => (decoded === undefined || project.id > decoded.id) && project.id <= frontier,
  );
  const page = candidates.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor:
      last !== undefined && page.length < candidates.length
        ? encodeCatalogInventoryCursor("project", { id: last.id, frontier })
        : null,
  };
}

function itemsPage(
  beforePosition: number | undefined,
  limit: number,
): { items: Record<string, unknown>[]; nextCursor: number | null } {
  const candidates = ITEMS.filter(
    (item) => beforePosition === undefined || item.position < beforePosition,
  );
  const page = candidates.slice(Math.max(0, candidates.length - limit)).reverse();
  const oldest = page.at(-1);
  return {
    items: page.map((item) => item.row),
    nextCursor: oldest !== undefined && page.length < candidates.length ? oldest.position : null,
  };
}

function turnsPage(
  cursorIdx: number | undefined,
  limit: number,
): { turns: Record<string, unknown>[]; nextCursor: string | null } {
  const end = cursorIdx ?? TURNS.length;
  const start = Math.max(0, end - limit);
  const page = TURNS.slice(start, end);
  return {
    turns: page.map((turn) => turn.row),
    nextCursor: start > 0 ? encodeCompletedTurnCursor(start) : null,
  };
}

function legacyShellBody(): Record<string, unknown> {
  return {
    snapshotSeq: 42,
    projects: PROJECTS.map((project) => project.row),
    threads: THREADS.map((thread) => thread.row),
    runtimeSummariesByThread: {},
    updatedAt: UPDATED_AT,
  };
}

function legacyHistoryBody(): Record<string, unknown> {
  return {
    snapshotSeq: 9,
    thread: THREADS[0]!.row,
    runtimeItems: ITEMS.map((item) => item.row),
    runtimeNextCursor: null,
    completedTurns: TURNS.map((turn) => turn.row),
    contextUsage: null,
    updatedAt: UPDATED_AT,
  };
}

function boundedHistoryBody(): Record<string, unknown> {
  const itemTailStart = Math.max(0, ITEMS.length - 4);
  const itemTail = ITEMS.slice(itemTailStart);
  const turnTailStart = Math.max(0, TURNS.length - 5);
  return {
    snapshotSeq: 9,
    thread: THREADS[0]!.row,
    runtimeItems: itemTail.map((item) => item.row),
    runtimeNextCursor: itemTailStart > 0 ? ITEMS[itemTailStart]!.position : null,
    completedTurns: TURNS.slice(turnTailStart).map((turn) => turn.row),
    completedTurnsNextCursor: turnTailStart > 0 ? encodeCompletedTurnCursor(turnTailStart) : null,
    contextUsage: null,
    updatedAt: UPDATED_AT,
  };
}

function errorBody(code: string): Record<string, unknown> {
  return { error: { code, message: code } };
}

function intParam(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : fallback;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function startFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const requests: CapturedRequest[] = [];
  const fixture: Fixture = { endpoint: "", requests, options };

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const method = request.method ?? "GET";
      const body = method === "POST" ? await readJsonBody(request) : undefined;
      requests.push({
        method,
        pathname: url.pathname,
        params: url.searchParams,
        authorization: request.headers.authorization,
        commandId: request.headers["x-poracode-command-id"] as string | undefined,
        body,
      });
      if (options.hang === true) return;
      if (request.headers.authorization !== `Bearer ${TOKEN}`) {
        sendJson(response, 401, errorBody("unauthorized"));
        return;
      }
      const echoField = options.omitEcho === true ? {} : { reads: options.echo ?? CAPABILITY };

      if (url.pathname === "/api/snapshot" && method === "GET") {
        if (options.legacy === true) {
          sendJson(response, 200, legacyShellBody());
          return;
        }
        const orderRaw = url.searchParams.get("order") ?? "manual";
        const order = orderRaw as CatalogPaintOrder;
        const threadLimit = intParam(url.searchParams.get("threadLimit"), 100);
        const projectLimit = intParam(url.searchParams.get("projectLimit"), 50);
        const threads = threadPaintPage(order, undefined, threadLimit);
        const projects = projectPaintPage(undefined, projectLimit);
        sendJson(response, 200, {
          snapshotSeq: 42,
          projects: projects.rows.map((project) => project.row),
          threads: threads.rows.map((thread) => thread.row),
          runtimeSummariesByThread: {},
          updatedAt: UPDATED_AT,
          ...echoField,
          ...(options.omitShellCursors === true
            ? {}
            : {
                threadsNextCursor: threads.nextCursor,
                projectsNextCursor: projects.nextCursor,
              }),
        });
        return;
      }

      if (url.pathname === "/api/threads" && method === "GET") {
        if (options.legacy === true) {
          sendJson(response, 200, {
            threads: THREADS.map((thread) => thread.row),
            runtimeSummariesByThread: {},
            nextCursor: null,
          });
          return;
        }
        const limit = intParam(url.searchParams.get("limit"), 100);
        const cursor = url.searchParams.get("cursor") ?? undefined;
        if (url.searchParams.get("mode") === "inventory") {
          const page = threadInventoryPage(cursor, limit);
          sendJson(response, 200, {
            threads: page.rows.map((thread) => thread.row),
            runtimeSummariesByThread: {},
            nextCursor: page.nextCursor,
            ...echoField,
            ...(cursor === undefined && options.omitInventoryFrontier !== true
              ? { inventoryFrontier: THREADS.at(-1)?.id }
              : {}),
          });
          return;
        }
        let page: { rows: FixtureThread[]; nextCursor: string | null };
        try {
          page = threadPaintPage(
            (url.searchParams.get("order") ?? "manual") as CatalogPaintOrder,
            cursor,
            limit,
          );
        } catch {
          sendJson(response, 400, errorBody("invalid_thread_cursor"));
          return;
        }
        if (options.responseCursorPrefixMismatch === true && page.nextCursor !== null) {
          page = {
            ...page,
            nextCursor: encodeCatalogInventoryCursor("thread", {
              id: "th-999",
              frontier: "th-999",
            }),
          };
        }
        sendJson(response, 200, {
          threads: page.rows.map((thread) => thread.row),
          runtimeSummariesByThread: {},
          nextCursor: page.nextCursor,
          ...echoField,
        });
        return;
      }

      if (url.pathname === "/api/projects" && method === "GET") {
        if (options.legacy === true || options.noProjectList === true) {
          sendJson(response, 404, errorBody("not_found"));
          return;
        }
        const limit = intParam(url.searchParams.get("projectLimit"), 50);
        const cursor = url.searchParams.get("cursor") ?? undefined;
        if (url.searchParams.get("mode") === "inventory") {
          const page = projectInventoryPage(cursor, limit);
          sendJson(response, 200, {
            projects: page.rows.map((project) => project.row),
            projectsNextCursor: page.nextCursor,
            ...echoField,
            ...(cursor === undefined && options.omitInventoryFrontier !== true
              ? { inventoryFrontier: PROJECTS.at(-1)?.id }
              : {}),
          });
          return;
        }
        const page = projectPaintPage(cursor, limit);
        sendJson(response, 200, {
          projects: page.rows.map((project) => project.row),
          projectsNextCursor: page.nextCursor,
          ...echoField,
        });
        return;
      }

      if (url.pathname === "/api/catalog/membership" && method === "POST") {
        if (options.legacy === true || options.noMembershipRoute === true) {
          sendJson(response, 404, errorBody("not_found"));
          return;
        }
        if (options.membershipFailure === true) {
          sendJson(response, 500, errorBody("boom"));
          return;
        }
        const requestBody = (body ?? {}) as {
          threadIds?: string[];
          projectIds?: string[];
        };
        const existingThreadIds = (requestBody.threadIds ?? []).filter((id) => THREAD_IDS.has(id));
        if (options.membershipExtraId === true) existingThreadIds.push("th-ghost");
        const existingProjectIds = (requestBody.projectIds ?? []).filter((id) =>
          PROJECT_IDS.has(id),
        );
        sendJson(response, 200, { existingThreadIds, existingProjectIds });
        return;
      }

      const threadRoute = /^\/api\/threads\/([^/]+)\/(history\/items|history|turns)$/u.exec(
        url.pathname,
      );
      if (threadRoute && method === "GET") {
        const route = threadRoute[2]!;
        if (route === "history") {
          if (options.legacy === true) {
            sendJson(response, 200, legacyHistoryBody());
            return;
          }
          sendJson(response, 200, { ...boundedHistoryBody(), ...echoField });
          return;
        }
        if (route === "history/items") {
          const beforeRaw = url.searchParams.get("beforePosition");
          const limit = intParam(url.searchParams.get("limit"), 500);
          const page = itemsPage(beforeRaw === null ? undefined : Number(beforeRaw), limit);
          sendJson(response, 200, {
            items: page.items,
            nextCursor: page.nextCursor,
            ...(options.legacy === true ? {} : echoField),
          });
          return;
        }
        if (options.legacy === true) {
          sendJson(response, 400, errorBody("invalid_reads_capability"));
          return;
        }
        if (options.noTurnsRoute === true) {
          sendJson(response, 404, errorBody("not_found"));
          return;
        }
        const cursorRaw = url.searchParams.get("cursor");
        let cursorIdx: number | undefined;
        try {
          cursorIdx = cursorRaw === null ? undefined : decodeCompletedTurnCursor(cursorRaw);
        } catch {
          sendJson(response, 400, errorBody("invalid_thread_cursor"));
          return;
        }
        const limit = intParam(url.searchParams.get("limit"), 200);
        const page = turnsPage(cursorIdx, limit);
        sendJson(response, 200, {
          turns: page.turns,
          completedTurnsNextCursor: page.nextCursor,
          ...echoField,
        });
        return;
      }

      sendJson(response, 404, errorBody("not_found"));
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });

  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { ...fixture, endpoint: `http://127.0.0.1:${port}/` };
}

function boundedPage<TBounded extends RemoteBoundedReadsProof, TLegacy>(
  outcome: RemoteBoundedReadFirst<TBounded, TLegacy>,
): TBounded {
  if (outcome.negotiation !== "bounded") {
    throw new Error("expected a bounded negotiation result");
  }
  return outcome.page;
}

function clientFor(fixture: Fixture): RemoteDesktopClient {
  return new RemoteDesktopClient(fixture.endpoint, TOKEN);
}

interface PaintWalkStart {
  readonly ids: readonly string[];
  readonly cursor: string | null;
  readonly proof: RemoteBoundedReadsProof;
}

async function collectThreadPaintWalk(
  client: RemoteDesktopClient,
  order: CatalogPaintOrder,
  limit: number,
  first: PaintWalkStart,
): Promise<string[]> {
  const ids = [...first.ids];
  let cursor = first.cursor;
  let proof = first.proof;
  while (cursor !== null) {
    const page = boundedPage(
      await client.boundedThreadListPage({
        mode: "page",
        order,
        limit,
        cursor,
        after: proof,
      }),
    );
    ids.push(...page.threads.map((thread) => thread.id));
    cursor = page.nextCursor;
    proof = page;
  }
  return ids;
}

describe("RemoteDesktopClient bounded reads", () => {
  it("negotiates a single bounded shell page without assembling continuations", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const outcome = await client.boundedShellSnapshot({
      threadLimit: 3,
      projectLimit: 2,
      maxBytes: 1024,
      maxDecodeBytes: 2048,
    });
    const page = boundedPage(outcome);
    expect(page.reads).toBe(CAPABILITY);
    expect(page.threads).toHaveLength(3);
    expect(page.threadsNextCursor).not.toBeNull();
    expect(page.projects).toHaveLength(2);
    expect(page.projectsNextCursor).not.toBeNull();
    expect(fixture.requests).toHaveLength(1);
    const request = fixture.requests[0]!;
    expect(request.pathname).toBe("/api/snapshot");
    expect(request.method).toBe("GET");
    expect(request.authorization).toBe(`Bearer ${TOKEN}`);
    expect(request.params.get("reads")).toBe(CAPABILITY);
    expect(request.params.get("order")).toBe("manual");
    expect(request.params.get("threadLimit")).toBe("3");
    expect(request.params.get("projectLimit")).toBe("2");
    expect(request.params.get("summaries")).toBe("0");
    expect(request.params.get("maxBytes")).toBe("1024");
    expect(request.params.get("maxDecodeBytes")).toBe("2048");
    expect(fixture.requests.filter((entry) => entry.pathname === "/api/threads")).toHaveLength(0);
  });

  it("uses the declared 32 MiB wire / 64 MiB UTF-16 estimate budgets by default", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    await client.boundedShellSnapshot();
    const request = fixture.requests[0]!;
    expect(request.params.get("maxBytes")).toBe(String(REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES));
    expect(request.params.get("maxDecodeBytes")).toBe(
      String(REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES),
    );
    expect(REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES).toBe(32 * 1024 * 1024);
    expect(REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES).toBe(64 * 1024 * 1024);
  });

  it("walks the manual paint continuation losslessly from the shell page", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const shell = boundedPage(await client.boundedShellSnapshot({ threadLimit: 3 }));
    const ids = await collectThreadPaintWalk(client, "manual", 3, {
      ids: shell.threads.map((thread) => thread.id),
      cursor: shell.threadsNextCursor,
      proof: shell,
    });
    expect(ids).toHaveLength(THREADS.length);
    expect(new Set(ids).size).toBe(THREADS.length);
    expect([...ids].sort()).toEqual(THREADS.map((thread) => thread.id));
    for (const request of fixture.requests.slice(1)) {
      expect(request.pathname).toBe("/api/threads");
      expect(request.params.get("reads")).toBe(CAPABILITY);
      expect(request.params.get("mode")).toBe("page");
      expect(request.params.get("order")).toBe("manual");
      expect(request.params.get("maxDecodeBytes")).toBe(
        String(REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES),
      );
    }
  });

  it("negotiates paint order on a first thread-list page and walks it losslessly", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const first = boundedPage(
      await client.boundedThreadListPage({ mode: "page", order: "updated", limit: 2 }),
    );
    const ids = await collectThreadPaintWalk(client, "updated", 2, {
      ids: first.threads.map((thread) => thread.id),
      cursor: first.nextCursor,
      proof: first,
    });
    expect(ids).toHaveLength(THREADS.length);
    expect(new Set(ids).size).toBe(THREADS.length);
    expect(ids[0]).toBe(THREADS.at(-1)!.id);
    for (const request of fixture.requests) {
      expect(request.params.get("order")).toBe("updated");
    }
  });

  it("walks exact thread membership through the inventory frontier losslessly", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    let page = boundedPage(await client.boundedThreadListPage({ mode: "inventory", limit: 3 }));
    expect(page.inventoryFrontier).toBe(THREADS.at(-1)!.id);
    const ids = page.threads.map((thread) => thread.id);
    let cursor = page.nextCursor;
    while (cursor !== null) {
      page = boundedPage(
        await client.boundedThreadListPage({
          mode: "inventory",
          limit: 3,
          cursor,
          after: page,
        }),
      );
      expect(page.inventoryFrontier).toBeUndefined();
      ids.push(...page.threads.map((thread) => thread.id));
      cursor = page.nextCursor;
    }
    expect(ids).toHaveLength(THREADS.length);
    expect(new Set(ids).size).toBe(THREADS.length);
    expect([...ids].sort()).toEqual(THREADS.map((thread) => thread.id));
  });

  it("walks project paint and inventory pages losslessly", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const shell = boundedPage(await client.boundedShellSnapshot({ projectLimit: 2 }));
    const paintIds = shell.projects.map((project) => project.id);
    let paintCursor = shell.projectsNextCursor;
    while (paintCursor !== null) {
      const page = await client.boundedProjectListPage({ projectLimit: 2, cursor: paintCursor });
      expect(page.reads).toBe(CAPABILITY);
      paintIds.push(...page.projects.map((project) => project.id));
      paintCursor = page.projectsNextCursor;
    }
    expect(paintIds).toHaveLength(PROJECTS.length);
    expect(new Set(paintIds).size).toBe(PROJECTS.length);

    let inventory = await client.boundedProjectListPage({ mode: "inventory", projectLimit: 2 });
    expect(inventory.inventoryFrontier).toBe(PROJECTS.at(-1)!.id);
    const inventoryIds = inventory.projects.map((project) => project.id);
    let inventoryCursor = inventory.projectsNextCursor;
    while (inventoryCursor !== null) {
      inventory = await client.boundedProjectListPage({
        mode: "inventory",
        projectLimit: 2,
        cursor: inventoryCursor,
      });
      expect(inventory.inventoryFrontier).toBeUndefined();
      inventoryIds.push(...inventory.projects.map((project) => project.id));
      inventoryCursor = inventory.projectsNextCursor;
    }
    expect(inventoryIds).toHaveLength(PROJECTS.length);
    expect(new Set(inventoryIds).size).toBe(PROJECTS.length);
  });

  it("walks older runtime items losslessly from the bounded history tail", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const history = boundedPage(await client.boundedThreadHistory("th-000"));
    const positions = history.runtimeItems.map((item) => Number(item.id.slice(5)));
    expect(history.runtimeNextCursor).toBe(ITEMS.length - 4);
    expect(history.completedTurnsNextCursor).toBe(encodeCompletedTurnCursor(TURNS.length - 5));
    let cursor = history.runtimeNextCursor ?? null;
    let proof: RemoteBoundedReadsProof = history;
    while (cursor !== null) {
      const page = boundedPage(
        await client.boundedThreadHistoryItems({
          threadId: "th-000",
          limit: 5,
          beforePosition: cursor,
          after: proof,
        }),
      );
      positions.push(...page.items.map((item) => Number(item.id.slice(5))));
      cursor = page.nextCursor;
      proof = page;
    }
    expect(positions).toHaveLength(ITEMS.length);
    expect(new Set(positions).size).toBe(ITEMS.length);
    expect([...positions].sort((left, right) => left - right)).toEqual(
      ITEMS.map((item) => item.position),
    );
  });

  it("walks older completed turns losslessly with ct1 continuation", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const history = boundedPage(await client.boundedThreadHistory("th-000"));
    const pages = [[...history.completedTurns]];
    let cursor = history.completedTurnsNextCursor ?? null;
    while (cursor !== null) {
      expect(decodeCompletedTurnCursor(cursor)).toBeGreaterThan(0);
      const page = await client.boundedThreadTurns({ threadId: "th-000", limit: 4, cursor });
      expect(page.reads).toBe(CAPABILITY);
      pages.push([...page.turns]);
      cursor = page.completedTurnsNextCursor;
    }
    const turns = pages.flat();
    expect(turns).toHaveLength(TURNS.length);
    expect(new Set(turns.map((turn) => `${turn.startedAt}|${turn.endedAt}`)).size).toBe(
      TURNS.length,
    );
    for (const page of pages) {
      for (let index = 1; index < page.length; index += 1) {
        expect(page[index]!.startedAt > page[index - 1]!.startedAt).toBe(true);
      }
    }
    expect([...turns].map((turn) => turn.startedAt).sort()).toEqual(
      TURNS.map((turn) => turn.row.startedAt),
    );
  });

  it("reports the absence of the echo as legacy and never assembles a fallback", async () => {
    const fixture = await startFixture({ legacy: true });
    const client = clientFor(fixture);
    const shell = await client.boundedShellSnapshot();
    expect(shell.negotiation).toBe("legacy");
    if (shell.negotiation !== "legacy") throw new Error("expected legacy");
    expect(shell.page.threads).toHaveLength(THREADS.length);
    expect(shell.page.projects).toHaveLength(PROJECTS.length);
    const threadList = await client.boundedThreadListPage();
    expect(threadList.negotiation).toBe("legacy");
    const history = await client.boundedThreadHistory("th-000");
    expect(history.negotiation).toBe("legacy");
    if (history.negotiation !== "legacy") throw new Error("expected legacy");
    expect(history.page.completedTurns).toHaveLength(TURNS.length);
    expect(fixture.requests).toHaveLength(3);
    expect(fixture.requests.filter((entry) => entry.pathname === "/api/threads")).toHaveLength(1);
  });

  it("rejects an unknown or malformed reads echo as a protocol error", async () => {
    const fixture = await startFixture({ echo: "bounded-v2" });
    const client = clientFor(fixture);
    await expect(client.boundedShellSnapshot()).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) && error.violation === "reads_echo_mismatch",
    );
  });

  it("rejects a bounded response that omits required bounded fields", async () => {
    const fixture = await startFixture({ omitShellCursors: true });
    const client = clientFor(fixture);
    await expect(client.boundedShellSnapshot()).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) && error.violation === "bounded_response_invalid",
    );
  });

  it("rejects the first inventory page when its frontier is missing", async () => {
    const fixture = await startFixture({ omitInventoryFrontier: true });
    const client = clientFor(fixture);
    await expect(client.boundedThreadListPage({ mode: "inventory", limit: 3 })).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) && error.violation === "bounded_response_invalid",
    );
  });

  it("rejects a continuation that omits the echo after negotiation", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const first = boundedPage(await client.boundedThreadListPage({ limit: 3 }));
    expect(first.nextCursor).not.toBeNull();
    fixture.options.omitEcho = true;
    await expect(
      client.boundedThreadListPage({
        limit: 3,
        cursor: first.nextCursor!,
        after: first,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) &&
        error.violation === "reads_echo_absent_after_negotiation",
    );
  });

  it("rejects a cursor that does not match the requested mode or order before dispatch", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const first = boundedPage(await client.boundedThreadListPage({ limit: 3 }));
    const dispatched = fixture.requests.length;
    await expect(
      client.boundedThreadListPage({
        mode: "inventory",
        limit: 3,
        cursor: first.nextCursor!,
        after: first,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) && error.violation === "cursor_mismatch",
    );
    await expect(
      client.boundedThreadListPage({
        mode: "page",
        order: "updated",
        limit: 3,
        cursor: first.nextCursor!,
        after: first,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) && error.violation === "cursor_mismatch",
    );
    expect(fixture.requests).toHaveLength(dispatched);
  });

  it("requires the bounded page proof on a continuation cursor", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const first = boundedPage(await client.boundedThreadListPage({ limit: 3 }));
    const dispatched = fixture.requests.length;
    await expect(
      client.boundedThreadListPage({
        limit: 3,
        cursor: first.nextCursor!,
        after: undefined as unknown as RemoteBoundedReadsProof,
      }),
    ).rejects.toMatchObject({ code: "invalid_reads_request" });
    expect(fixture.requests).toHaveLength(dispatched);
  });

  it("rejects a host response cursor minted for another mode", async () => {
    const fixture = await startFixture({ responseCursorPrefixMismatch: true });
    const client = clientFor(fixture);
    await expect(client.boundedThreadListPage({ limit: 3 })).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) && error.violation === "cursor_mismatch",
    );
  });

  it("confirms catalog membership as a read and rejects unrequested ids", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const response = await client.boundedCatalogMembership({
      threadIds: ["th-000", "th-999"],
      projectIds: ["pr-000"],
    });
    expect(response.existingThreadIds).toEqual(["th-000"]);
    expect(response.existingProjectIds).toEqual(["pr-000"]);
    const request = fixture.requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.commandId).toBeUndefined();
    expect(request.authorization).toBe(`Bearer ${TOKEN}`);

    fixture.options.membershipExtraId = true;
    await expect(client.boundedCatalogMembership({ threadIds: ["th-000"] })).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) &&
        error.violation === "membership_response_invalid",
    );
  });

  it("refuses duplicate membership ids before dispatch", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    await expect(
      client.boundedCatalogMembership({ threadIds: ["th-000", "th-000"] }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(fixture.requests).toHaveLength(0);
  });

  it("never classifies a failed membership read as an uncertain mutation", async () => {
    const fixture = await startFixture({ membershipFailure: true });
    const client = clientFor(fixture);
    const error = await client
      .boundedCatalogMembership({ threadIds: ["th-000"] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as { requestMayHaveCommitted?: boolean }).requestMayHaveCommitted).not.toBe(true);
  });

  it("reports missing declared routes as protocol errors", async () => {
    const fixture = await startFixture({
      noProjectList: true,
      noTurnsRoute: true,
      noMembershipRoute: true,
    });
    const client = clientFor(fixture);
    await expect(client.boundedProjectListPage()).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) && error.violation === "route_unavailable",
    );
    await expect(client.boundedThreadTurns({ threadId: "th-000" })).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) && error.violation === "route_unavailable",
    );
    await expect(client.boundedCatalogMembership({ threadIds: ["th-000"] })).rejects.toSatisfy(
      (error: unknown) =>
        isRemoteBoundedReadProtocolError(error) && error.violation === "route_unavailable",
    );
  });

  it("cancels a bounded read through the caller signal", async () => {
    const fixture = await startFixture({ hang: true });
    const client = clientFor(fixture);
    const controller = new AbortController();
    const pending = client.boundedShellSnapshot({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled", status: 499 });
  });

  it("refuses a pre-aborted bounded read before dispatch", async () => {
    const fixture = await startFixture();
    const client = clientFor(fixture);
    const controller = new AbortController();
    controller.abort();
    await expect(client.boundedShellSnapshot({ signal: controller.signal })).rejects.toMatchObject({
      code: "cancelled",
      status: 499,
      requestPhase: "presend",
    });
    expect(fixture.requests).toHaveLength(0);
  });
});
