import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { REMOTE_HTTP_ROUTES } from "@/shared/remote/contract";
import { closeDatabase, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import type { LegacyBulkReadAdmission } from "./legacyBulkReadAdmission";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

/**
 * B4 bounded-read negotiation over the REAL server: the dispatcher enforces
 * registry scopes and every response is validated through the registry route
 * contract's own schema (so a field the contract does not model would be
 * stripped and fail the assertion). Old clients keep complete legacy responses;
 * new clients get the bounded bundle; legacy bulk reads are explicitly
 * admitted and refused typed — never silently truncated.
 */

const servers: RemoteAccessServer[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  closeDatabase();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function threadFixture(index: number, title = `Thread ${index}`): Thread {
  return {
    id: `thread-${String(index).padStart(4, "0")}`,
    projectId: "project-1",
    title,
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: `2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    updatedAt: `2026-02-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
  };
}

function seedCatalog(threadCount: number): void {
  dbUpsertProject(
    {
      id: "project-1",
      name: "Project 1",
      location: { kind: "posix", path: "/tmp/project-1" },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    0,
  );
  for (let index = 0; index < threadCount; index += 1) {
    dbUpsertThread(threadFixture(index), index);
  }
}

function seedHistory(threadId: string): void {
  const sqlite = getSqlite();
  const insertItem = sqlite.prepare(
    `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (let index = 0; index < 5; index += 1) {
    insertItem.run(
      threadId,
      `item-${index}`,
      index,
      "assistant",
      "completed",
      `{"text":"${index}"}`,
    );
  }
  const insertTurn = sqlite.prepare(
    `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (let index = 0; index < 3; index += 1) {
    insertTurn.run(
      threadId,
      index,
      `2026-03-01T00:00:0${index}.000Z`,
      `2026-03-01T00:00:1${index}.000Z`,
      `item-${index}`,
    );
  }
}

function createServer(overrides: Partial<RemoteAccessServerOptions> = {}): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "bounded-reads-http", label: "Bounded" },
    host: "127.0.0.1",
    port: 0,
    webSocketHeartbeatIntervalMs: 0,
    ownsSupervisorPersistence: false,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never),
    ...overrides,
  });
  servers.push(server);
  return server;
}

async function startWithSession(
  seed: () => void,
): Promise<{ info: RemoteAccessServerInfo; token: string; server: RemoteAccessServer }> {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  const dir = mkdtempSync(join(tmpdir(), "poracode-bounded-http-"));
  tempDirs.push(dir);
  initDatabase(join(dir, "state.sqlite"));
  seed();
  const server = createServer();
  const info = await server.start();
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read"],
      client: { label: "http-test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  const { accessToken } = (await response.json()) as { accessToken: string };
  return { info, token: accessToken, server };
}

async function getJson(
  info: RemoteAccessServerInfo,
  token: string,
  path: string,
): Promise<{ status: number; headers: Headers; body: Record<string, unknown> }> {
  const response = await fetch(new URL(path, info.httpBaseUrl), {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function postJson(
  info: RemoteAccessServerInfo,
  token: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL(path, info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/**
 * Validates a response through the real registry route contract. The contract
 * schema strips fields it does not model, so an assertion on a new field after
 * this parse proves the registry preserves it.
 */
function registryParse(routeId: string, body: unknown): Record<string, unknown> {
  const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === routeId);
  if (!route?.response.jsonSchema) throw new Error(`No registry response schema for ${routeId}`);
  const parsed = route.response.jsonSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`${routeId} response failed registry validation: ${parsed.error.message}`);
  }
  return parsed.data as Record<string, unknown>;
}

describe.skipIf(!sqliteAvailable)("B4 bounded reads over real HTTP", () => {
  it("serves the complete legacy snapshot and the negotiated bounded snapshot", async () => {
    const { info, token } = await startWithSession(() => seedCatalog(5));

    const legacy = await getJson(info, token, "/api/snapshot");
    expect(legacy.status).toBe(200);
    const legacyParsed = registryParse("shell-snapshot", legacy.body);
    expect(legacyParsed.reads).toBeUndefined();
    expect((legacyParsed.threads as unknown[]).length).toBe(5);
    expect((legacyParsed.projects as unknown[]).length).toBe(1);

    const bounded = await getJson(
      info,
      token,
      "/api/snapshot?reads=bounded-v1&order=updated&threadLimit=2&projectLimit=1&summaries=0",
    );
    expect(bounded.status).toBe(200);
    const boundedParsed = registryParse("shell-snapshot", bounded.body);
    expect(boundedParsed.reads).toBe("bounded-v1");
    expect((boundedParsed.threads as unknown[]).length).toBe(2);
    expect(typeof boundedParsed.threadsNextCursor).toBe("string");
    // The single project is complete, so the field is present and null.
    expect(boundedParsed.projectsNextCursor).toBeNull();
    expect(boundedParsed.runtimeSummariesByThread).toEqual({});
  });

  it("walks thread-list paint pages and refuses cursor/mode protocol errors", async () => {
    const { info, token } = await startWithSession(() => seedCatalog(5));
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const query = `/api/threads?reads=bounded-v1&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const result = await getJson(info, token, query);
      expect(result.status).toBe(200);
      const parsed = registryParse("thread-list", result.body);
      expect(parsed.reads).toBe("bounded-v1");
      seen.push(...(parsed.threads as { id: string }[]).map((thread) => thread.id));
      cursor = parsed.nextCursor as string | null;
      if (cursor === null) break;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);

    const manual = await getJson(info, token, "/api/threads?reads=bounded-v1&limit=2");
    const manualCursor = registryParse("thread-list", manual.body).nextCursor as string;
    const mismatch = await getJson(
      info,
      token,
      `/api/threads?reads=bounded-v1&limit=2&order=updated&cursor=${encodeURIComponent(manualCursor)}`,
    );
    expect(mismatch.status).toBe(400);
    expect(mismatch.body).toMatchObject({ error: { code: "invalid_thread_cursor" } });

    const unknown = await getJson(info, token, "/api/threads?reads=bounded-v2&limit=2");
    expect(unknown.status).toBe(400);
    expect(unknown.body).toMatchObject({ error: { code: "invalid_reads_capability" } });
  });

  it("walks exact membership and confirms it through catalog-membership", async () => {
    const { info, token } = await startWithSession(() => seedCatalog(5));
    const seen = new Set<string>();
    let cursor: string | null = null;
    const frontiers: unknown[] = [];
    for (let page = 0; page < 10; page += 1) {
      const query = `/api/threads?reads=bounded-v1&mode=inventory&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const result = await getJson(info, token, query);
      expect(result.status).toBe(200);
      const parsed = registryParse("thread-list", result.body);
      frontiers.push(parsed.inventoryFrontier);
      for (const thread of parsed.threads as { id: string }[]) seen.add(thread.id);
      cursor = parsed.nextCursor as string | null;
      if (cursor === null) break;
    }
    expect(seen.size).toBe(5);
    // Page 1 echoes the frontier; continuation pages never do.
    expect(typeof frontiers[0]).toBe("string");
    expect(frontiers.slice(1).every((value) => value === undefined)).toBe(true);

    const membership = await postJson(info, token, "/api/catalog/membership", {
      threadIds: ["thread-0000", "thread-missing"],
      projectIds: ["project-1"],
    });
    expect(membership.status).toBe(200);
    expect(registryParse("catalog-membership", membership.body)).toEqual({
      existingThreadIds: ["thread-0000"],
      existingProjectIds: ["project-1"],
    });
  });

  it("pages projects and rejects the undeclared project-list", async () => {
    const { info, token } = await startWithSession(() => seedCatalog(2));
    const page = await getJson(info, token, "/api/projects?reads=bounded-v1&projectLimit=1");
    expect(page.status).toBe(200);
    const parsed = registryParse("project-list", page.body);
    expect(parsed.reads).toBe("bounded-v1");
    expect((parsed.projects as unknown[]).length).toBe(1);
    expect(parsed.projectsNextCursor).toBeNull();

    const undeclared = await getJson(info, token, "/api/projects?projectLimit=1");
    expect(undeclared.status).toBe(400);
    expect(undeclared.body).toMatchObject({ error: { code: "invalid_reads_capability" } });
  });

  it("serves the bounded history tail and continues older turns", async () => {
    const { info, token } = await startWithSession(() => {
      seedCatalog(1);
      seedHistory("thread-0000");
    });

    const history = await getJson(
      info,
      token,
      "/api/threads/thread-0000/history?reads=bounded-v1&completedTurnsLimit=2",
    );
    expect(history.status).toBe(200);
    const parsed = registryParse("thread-history", history.body);
    expect(parsed.reads).toBe("bounded-v1");
    expect((parsed.completedTurns as unknown[]).length).toBe(2);
    const turnsCursor = parsed.completedTurnsNextCursor as string;
    expect(turnsCursor).toMatch(/^ct1\./u);

    const turns = await getJson(
      info,
      token,
      `/api/threads/thread-0000/turns?reads=bounded-v1&cursor=${encodeURIComponent(turnsCursor)}`,
    );
    expect(turns.status).toBe(200);
    const turnsParsed = registryParse("thread-turns", turns.body);
    expect(turnsParsed.reads).toBe("bounded-v1");
    expect((turnsParsed.turns as unknown[]).length).toBe(1);
    expect(turnsParsed.completedTurnsNextCursor).toBeNull();

    const undeclaredTurns = await getJson(info, token, "/api/threads/thread-0000/turns");
    expect(undeclaredTurns.status).toBe(400);
    expect(undeclaredTurns.body).toMatchObject({ error: { code: "invalid_reads_capability" } });

    const legacy = await getJson(info, token, "/api/threads/thread-0000/history");
    expect(legacy.status).toBe(200);
    const legacyParsed = registryParse("thread-history", legacy.body);
    expect(legacyParsed.reads).toBeUndefined();
    expect((legacyParsed.runtimeItems as unknown[]).length).toBe(5);
    expect((legacyParsed.completedTurns as unknown[]).length).toBe(3);
  });

  it("admits at most two legacy reads and refuses the rest typed with Retry-After", async () => {
    const { info, token, server } = await startWithSession(() => seedCatalog(3));
    const admission = (server as unknown as { legacyBulkReadAdmission: LegacyBulkReadAdmission })
      .legacyBulkReadAdmission;
    const held = [admission.tryAdmit("alice"), admission.tryAdmit("bob")];
    const refused = await getJson(info, token, "/api/snapshot");
    expect(refused.status).toBe(503);
    expect(refused.body).toMatchObject({ error: { code: "legacy_read_busy" } });
    expect(refused.headers.get("retry-after")).toBe("1");
    for (const lease of held) lease.release();
    const served = await getJson(info, token, "/api/snapshot");
    expect(served.status).toBe(200);
    expect((served.body.threads as unknown[]).length).toBe(3);
  });

  it("refuses an over-reservation legacy read typed instead of returning a short catalog", async () => {
    const { info, token } = await startWithSession(() => {
      dbUpsertProject(
        {
          id: "project-1",
          name: "Project 1",
          location: { kind: "posix", path: "/tmp/project-1" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      );
      // 70 threads x ~1 MiB stored titles: above the 64 MiB legacy reservation,
      // while every single bounded page stays inside the host caps.
      for (let index = 0; index < 70; index += 1) {
        dbUpsertThread(threadFixture(index, `t-${index}-${"x".repeat(1024 * 1024)}`), index);
      }
    });
    const refused = await getJson(info, token, "/api/snapshot");
    expect(refused.status).toBe(503);
    expect(refused.body).toMatchObject({
      error: { code: "legacy_read_too_large" },
      legacyRead: {
        resource: "catalog",
        charge: "stored-bytes",
        meaning: "conservative-stored-byte-reservation-not-serialized-size",
      },
    });
    expect(refused.body.threads).toBeUndefined();

    const bounded = await getJson(
      info,
      token,
      "/api/snapshot?reads=bounded-v1&threadLimit=1&maxBytes=4194304",
    );
    expect(bounded.status).toBe(200);
    expect((bounded.body.threads as unknown[]).length).toBe(1);
  });

  it("admits the dummy-bound legacy variants and still refuses the over-reservation read", async () => {
    const { info, token, server } = await startWithSession(() => {
      // The icon is part of the legacy `SELECT *` projection the snapshot
      // materializes; it alone pushes the catalog reservation over the cap.
      dbUpsertProject(
        {
          id: "project-1",
          name: "Project 1",
          icon: "i".repeat(68 * 1024 * 1024),
          location: { kind: "posix", path: "/tmp/project-1" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      );
      dbUpsertThread(threadFixture(0), 0);
      const sqlite = getSqlite();
      const insertTurn = sqlite.prepare(
        `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (let index = 0; index < 35; index += 1) {
        insertTurn.run(
          "thread-0000",
          index,
          `${index}-${"x".repeat(1024 * 1024)}`,
          `${index}-${"y".repeat(1024 * 1024)}`,
          null,
        );
      }
    });
    const admission = (server as unknown as { legacyBulkReadAdmission: LegacyBulkReadAdmission })
      .legacyBulkReadAdmission;
    const before = admission.usage();

    const snapshot = await getJson(info, token, "/api/snapshot?threadLimit=1");
    expect(snapshot.status).toBe(503);
    expect(snapshot.body).toMatchObject({
      error: { code: "legacy_read_too_large" },
      legacyRead: { resource: "catalog" },
    });
    expect(snapshot.body.threads).toBeUndefined();
    expect(snapshot.headers.get("retry-after")).toBe("1");
    expect(admission.usage().admitted).toBe(before.admitted + 1);

    const history = await getJson(info, token, "/api/threads/thread-0000/history?runtimePage=1");
    expect(history.status).toBe(503);
    expect(history.body).toMatchObject({
      error: { code: "legacy_read_too_large" },
      legacyRead: { resource: "thread-history" },
    });
    expect(history.body.completedTurns).toBeUndefined();
    expect(admission.usage()).toMatchObject({
      admitted: before.admitted + 2,
      active: 0,
      aborted: 0,
    });
  });

  it("admits an under-cap dummy-bound legacy read while the handler still honors the bound", async () => {
    const { info, token, server } = await startWithSession(() => seedCatalog(5));
    const admission = (server as unknown as { legacyBulkReadAdmission: LegacyBulkReadAdmission })
      .legacyBulkReadAdmission;
    const before = admission.usage();

    const snapshot = await getJson(info, token, "/api/snapshot?threadLimit=2");
    expect(snapshot.status).toBe(200);
    expect((snapshot.body.threads as unknown[]).length).toBe(2);
    expect(snapshot.body.reads).toBeUndefined();
    expect(admission.usage().admitted).toBe(before.admitted + 1);

    const history = await getJson(info, token, "/api/threads/thread-0000/history?runtimePage=1");
    expect(history.status).toBe(200);
    expect(history.body.reads).toBeUndefined();
    expect(admission.usage()).toMatchObject({
      admitted: before.admitted + 2,
      aborted: 0,
    });
  });

  it("keeps an unknown reads value a 400 protocol error without consuming legacy admission", async () => {
    const { info, token, server } = await startWithSession(() => seedCatalog(2));
    const admission = (server as unknown as { legacyBulkReadAdmission: LegacyBulkReadAdmission })
      .legacyBulkReadAdmission;
    const before = admission.usage();

    const unknown = await getJson(info, token, "/api/snapshot?reads=bogus&threadLimit=1");
    expect(unknown.status).toBe(400);
    expect(unknown.body).toMatchObject({ error: { code: "invalid_reads_capability" } });
    expect(admission.usage()).toMatchObject({ admitted: before.admitted, active: 0 });
  });

  it("serves a threadLimit snapshot whose over-cap row is outside the page lookahead", async () => {
    const { info, token, server } = await startWithSession(() => {
      seedCatalog(3);
      // The third row (beyond threadLimit=1 plus its one-row lookahead) carries
      // the 68 MiB value; the selected page and all projects stay small.
      getSqlite()
        .prepare("UPDATE threads SET terminal_prompt = ? WHERE id = ?")
        .run("x".repeat(68 * 1024 * 1024), "thread-0002");
    });
    const admission = (server as unknown as { legacyBulkReadAdmission: LegacyBulkReadAdmission })
      .legacyBulkReadAdmission;
    const before = admission.usage();

    const result = await getJson(info, token, "/api/snapshot?threadLimit=1");
    expect(result.status).toBe(200);
    expect((result.body.threads as unknown[]).length).toBe(1);
    expect(result.body.reads).toBeUndefined();
    expect(admission.usage()).toMatchObject({ admitted: before.admitted + 1, aborted: 0 });
  });

  it("serves runtimePage history with omitScrollback without charging the stored transcript", async () => {
    const { info, token, server } = await startWithSession(() => {
      seedCatalog(1);
      seedHistory("thread-0000");
      getSqlite()
        .prepare(
          `INSERT INTO thread_terminal_scrollback (thread_id, transcript, output_length)
           VALUES (?, ?, ?)`,
        )
        .run("thread-0000", "x".repeat(68 * 1024 * 1024), 68 * 1024 * 1024);
    });
    const admission = (server as unknown as { legacyBulkReadAdmission: LegacyBulkReadAdmission })
      .legacyBulkReadAdmission;
    const before = admission.usage();

    const omitted = await getJson(
      info,
      token,
      "/api/threads/thread-0000/history?runtimePage=1&omitScrollback=1",
    );
    expect(omitted.status).toBe(200);
    expect(omitted.body.terminalScrollback).toBeUndefined();
    expect((omitted.body.runtimeItems as unknown[]).length).toBe(5);
    expect(admission.usage()).toMatchObject({ admitted: before.admitted + 1, aborted: 0 });

    // Without the explicit omission the same stored transcript is charged and
    // the read is refused typed, never truncated.
    const kept = await getJson(info, token, "/api/threads/thread-0000/history?runtimePage=1");
    expect(kept.status).toBe(503);
    expect(kept.body).toMatchObject({
      error: { code: "legacy_read_too_large" },
      legacyRead: { resource: "thread-history" },
    });
    expect(kept.body.runtimeItems).toBeUndefined();
  });

  it("still refuses a runtimePage history whose selected item exceeds the reservation", async () => {
    const { info, token } = await startWithSession(() => {
      seedCatalog(1);
      seedHistory("thread-0000");
      getSqlite()
        .prepare(
          `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "thread-0000",
          "item-big",
          5,
          "assistant",
          "completed",
          `{"text":"${"x".repeat(68 * 1024 * 1024)}"}`,
        );
    });

    const refused = await getJson(
      info,
      token,
      "/api/threads/thread-0000/history?runtimePage=1&omitScrollback=1",
    );
    expect(refused.status).toBe(503);
    expect(refused.body).toMatchObject({
      error: { code: "legacy_read_too_large" },
      legacyRead: { resource: "thread-history" },
    });
    expect(refused.body.runtimeItems).toBeUndefined();
  });

  it("returns the legacy handler's 400 for invalid bounds instead of a reservation 503", async () => {
    const { info, token, server } = await startWithSession(() => {
      // A genuinely over-cap host: if the bounds were ignored, the reservation
      // pre-check would answer 503 before the handler could see the bad value.
      dbUpsertProject(
        {
          id: "project-1",
          name: "Project 1",
          icon: "i".repeat(68 * 1024 * 1024),
          location: { kind: "posix", path: "/tmp/project-1" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      );
      dbUpsertThread(threadFixture(0), 0);
      const sqlite = getSqlite();
      const insertTurn = sqlite.prepare(
        `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (let index = 0; index < 35; index += 1) {
        insertTurn.run(
          "thread-0000",
          index,
          `${index}-${"x".repeat(1024 * 1024)}`,
          `${index}-${"y".repeat(1024 * 1024)}`,
          null,
        );
      }
    });
    const admission = (server as unknown as { legacyBulkReadAdmission: LegacyBulkReadAdmission })
      .legacyBulkReadAdmission;
    const before = admission.usage();

    const invalidThreadLimit = await getJson(info, token, "/api/snapshot?threadLimit=abc");
    expect(invalidThreadLimit.status).toBe(400);
    expect(invalidThreadLimit.body).toMatchObject({ error: { code: "invalid_thread_limit" } });

    const invalidTarget = await getJson(
      info,
      token,
      "/api/threads/thread-0000/history?runtimePage=1&targetTimelineEntryCount=abc",
    );
    expect(invalidTarget.status).toBe(400);
    expect(invalidTarget.body).toMatchObject({ error: { code: "invalid_request" } });
    expect(admission.usage()).toMatchObject({ admitted: before.admitted, active: 0 });

    // The same host still refuses the valid over-cap reads typed: the 400 above
    // did not pass the reservation, the reservation simply never masked it.
    const snapshot = await getJson(info, token, "/api/snapshot?threadLimit=1");
    expect(snapshot.status).toBe(503);
    const history = await getJson(info, token, "/api/threads/thread-0000/history?runtimePage=1");
    expect(history.status).toBe(503);
  });
});
