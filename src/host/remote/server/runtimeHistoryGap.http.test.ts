import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { REMOTE_HTTP_ROUTES } from "@/shared/remote/contract";
import { REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE } from "@/shared/remote/clientErrors";
import {
  acknowledgeRuntimeThreadGap,
  attachRuntimePersistenceDurableGapFromCurrentConnection,
  closeDatabase,
  getRuntimeThreadGapDescriptor,
  getRuntimeThreadGapNotice,
  initDatabase,
  lookupRuntimeNotice,
} from "@/host/db";
import { RuntimePersistenceDurableStateUnavailableError } from "@/host/db/runtimePersistenceTypes";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

/**
 * B1 GUI durable-gap recovery over the REAL HTTP server + REAL SQLite:
 * descriptor read, command-id receipt behaviour (applied / cached retry /
 * already / stale / uncertain-with-proof / uncertain-without-proof), the
 * declared-reader gate on every transcript route, capability advertisement,
 * and the byte-identical committed prefix across an acknowledgement.
 */

const servers: RemoteAccessServer[] = [];
const tempDirs: string[] = [];
const THREAD = "thread-gap";
const OTHER_THREAD = "thread-other";
const GAP_A = "gap2:e11111111-1111-4111-8111-111111111111";
const GAP_B = "gap2:e22222222-2222-4222-8222-222222222222";
const MISSING_UUID = "00000000-0000-4000-8000-000000000000";

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  closeDatabase();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function threadFixture(id: string, title: string): Thread {
  return {
    id,
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
}

/** The production port shape; `acknowledge` is replaceable for fault probes. */
function runtimeHistoryGapPort(
  acknowledge: typeof acknowledgeRuntimeThreadGap = acknowledgeRuntimeThreadGap,
) {
  return {
    read: getRuntimeThreadGapDescriptor,
    readNotice: getRuntimeThreadGapNotice,
    lookupNotice: lookupRuntimeNotice,
    acknowledge,
  };
}

function createServer(
  overrides: Partial<ConstructorParameters<typeof RemoteAccessServer>[0]> = {},
  options: { withoutRuntimeHistoryGap?: boolean } = {},
) {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "runtime-gap-http", label: "Runtime gap" },
    host: "127.0.0.1",
    port: 0,
    webSocketHeartbeatIntervalMs: 0,
    ownsSupervisorPersistence: false,
    ...(options.withoutRuntimeHistoryGap
      ? {}
      : { runtimeHistoryGap: overrides.runtimeHistoryGap ?? runtimeHistoryGapPort() }),
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never),
    ...overrides,
  });
  servers.push(server);
  return server;
}

function seedProject(): void {
  dbUpsertProject(
    {
      id: "project-1",
      name: "Project 1",
      location: { kind: "posix", path: "/tmp/project-1" },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    0,
  );
}

function seedThread(threadId: string, items: number): void {
  dbUpsertThread(threadFixture(threadId, threadId), 0);
  const insertItem = getSqlite().prepare(
    `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (let index = 0; index < items; index += 1) {
    insertItem.run(
      threadId,
      `item-${index}`,
      index,
      "assistant",
      "completed",
      `{"text":"committed-${index}"}`,
    );
  }
}

function insertGap(
  threadId: string,
  episodeId: string,
  refusedEvents = 2,
  refusedBytes = 20,
): void {
  getSqlite()
    .prepare(
      `INSERT INTO thread_runtime_gaps
         (thread_id, reason, refused_events, refused_bytes, epoch, created_at, episode_id)
       VALUES (?, 'age', ?, ?, 1, 111, ?)`,
    )
    .run(threadId, refusedEvents, refusedBytes, episodeId);
}

function insertForeignTouch(threadId: string, epoch: number, touchedAt = 222): void {
  getSqlite()
    .prepare(
      `INSERT INTO thread_runtime_epoch_touches (thread_id, epoch, touched_at) VALUES (?, ?, ?)`,
    )
    .run(threadId, epoch, touchedAt);
}

/** Domain state a zero-effect outcome must not touch (receipts excluded). */
function domainSnapshot(threadId: string): string {
  const sqlite = getSqlite();
  return JSON.stringify({
    items: sqlite
      .prepare(
        `SELECT item_id, position, type, state, payload FROM thread_runtime_items
         WHERE thread_id = ? ORDER BY position`,
      )
      .all(threadId),
    gaps: sqlite.prepare(`SELECT * FROM thread_runtime_gaps WHERE thread_id = ?`).all(threadId),
    notices: sqlite
      .prepare(`SELECT * FROM thread_runtime_gap_notices WHERE thread_id = ?`)
      .all(threadId),
    touches: sqlite
      .prepare(`SELECT * FROM thread_runtime_epoch_touches WHERE thread_id = ?`)
      .all(threadId),
  });
}

function snapshotItemRows(threadId: string): string {
  return JSON.stringify(
    getSqlite()
      .prepare(
        `SELECT item_id, position, type, state, payload FROM thread_runtime_items
         WHERE thread_id = ? ORDER BY position`,
      )
      .all(threadId),
  );
}

function openDb(dbPath: string): void {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(dbPath);
  attachRuntimePersistenceDurableGapFromCurrentConnection();
}

async function startServer(
  seed: () => void,
  overrides: Partial<ConstructorParameters<typeof RemoteAccessServer>[0]> = {},
  options: { withoutRuntimeHistoryGap?: boolean } = {},
): Promise<{ info: RemoteAccessServerInfo; token: string; server: RemoteAccessServer }> {
  const dir = mkdtempSync(join(tmpdir(), "poracode-runtime-gap-"));
  tempDirs.push(dir);
  openDb(join(dir, "state.sqlite"));
  seedProject();
  seed();
  const server = createServer(overrides, options);
  const info = await server.start();
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read", "session:operate"],
      client: { label: "runtime-gap-http", deviceType: "mobile" },
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
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL(path, info.httpBaseUrl), {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function postJson(
  info: RemoteAccessServerInfo,
  token: string,
  path: string,
  body: unknown,
  commandId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL(path, info.httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(commandId ? { "x-poracode-command-id": commandId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

function registryParse(routeId: string, body: unknown): Record<string, unknown> {
  const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === routeId);
  if (!route?.response.jsonSchema) throw new Error(`No registry response schema for ${routeId}`);
  const parsed = route.response.jsonSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`${routeId} response failed registry validation: ${parsed.error.message}`);
  }
  return parsed.data as Record<string, unknown>;
}

function totalChanges(): number {
  return (getSqlite().prepare("SELECT total_changes() AS changes").get() as { changes: number })
    .changes;
}

describe.skipIf(!sqliteAvailable)("B1 runtime-gap recovery over real HTTP", () => {
  it("advertises the capability and reads the exact descriptor through the declared route", async () => {
    const { info, token } = await startServer(() => {
      seedThread(THREAD, 2);
      insertGap(THREAD, "11111111-1111-4111-8111-111111111111");
    });
    const descriptor = await getJson(info, token, `/api/threads/${THREAD}/runtime/gap?notices=v1`);
    expect(descriptor.status).toBe(200);
    expect(registryParse("thread-runtime-gap", descriptor.body)).toMatchObject({
      gap: {
        token: GAP_A,
        source: "exact",
        reason: "age",
        refusedEvents: 2,
        refusedBytes: 20,
        createdAt: 111,
      },
      notice: null,
    });
    // The environment descriptor advertises `runtimeHistoryNotices` only when
    // the composition wired the port.
    const environment = await getJson(info, token, "/.well-known/poracode/environment");
    expect(environment.status).toBe(200);
    expect(environment.body.capabilities).toMatchObject({
      runtimeHistoryNotices: { versions: [1] },
    });
    // A foreign touch without a gap row is the suspect episode (prior state).
    seedThread(OTHER_THREAD, 1);
    insertForeignTouch(OTHER_THREAD, 7);
    const suspect = await getJson(
      info,
      token,
      `/api/threads/${OTHER_THREAD}/runtime/gap?notices=v1`,
    );
    expect(suspect.status).toBe(200);
    expect(suspect.body.gap).toMatchObject({ token: "gap2:s7", source: "suspect" });

    // Declaration is required; unknown threads are a definite 404.
    expect((await getJson(info, token, `/api/threads/${THREAD}/runtime/gap`)).status).toBe(400);
    expect(
      (await getJson(info, token, `/api/threads/${THREAD}/runtime/gap?notices=v2`)).status,
    ).toBe(400);
    expect((await getJson(info, token, `/api/threads/nope/runtime/gap?notices=v1`)).status).toBe(
      404,
    );
  });

  it("applies an acknowledgement once, replays a cached receipt, and is zero-write afterwards", async () => {
    const { info, token } = await startServer(() => {
      seedThread(THREAD, 3);
      insertGap(THREAD, "11111111-1111-4111-8111-111111111111");
    });
    const before = snapshotItemRows(THREAD);
    const ack = (commandId: string, episodeToken: string) =>
      postJson(
        info,
        token,
        `/api/threads/${THREAD}/runtime/gap/acknowledge?notices=v1`,
        { episodeToken },
        commandId,
      );

    const applied = await ack("ack-1", GAP_A);
    expect(applied.status).toBe(200);
    expect(registryParse("thread-runtime-gap-acknowledge", applied.body)).toMatchObject({
      outcome: "applied",
      notice: { kind: "history-incomplete", reason: "age", acknowledgedCount: 1 },
      descriptor: { source: "exact" },
      supersededAcceptedEvents: 0,
    });
    expect(snapshotItemRows(THREAD)).toBe(before);

    // The same command id replays the durable receipt with zero new writes.
    const writesAfterApply = totalChanges();
    const replayed = await ack("ack-1", GAP_A);
    expect(replayed.status).toBe(200);
    expect(replayed.body).toEqual(applied.body);
    expect(totalChanges()).toBe(writesAfterApply);

    // A fresh command id with the same (stored) token is a zero-effect
    // `already`: only the new receipt row is written, no domain state.
    const beforeAlready = domainSnapshot(THREAD);
    const already = await ack("ack-2", GAP_A);
    expect(already.status).toBe(200);
    expect(already.body).toMatchObject({ outcome: "already" });
    expect(domainSnapshot(THREAD)).toBe(beforeAlready);

    // A token that no longer matches the current episode is a zero-effect
    // stale carrying the truthful current descriptor (`null` = clean).
    const stale = await ack("ack-3", `gap2:e${MISSING_UUID}`);
    expect(stale.status).toBe(200);
    expect(stale.body).toEqual({ outcome: "stale", current: null });
    expect(domainSnapshot(THREAD)).toBe(beforeAlready);

    // No command id is a definite 400; the receipt protocol is mandatory.
    expect(
      (
        await postJson(info, token, `/api/threads/${THREAD}/runtime/gap/acknowledge?notices=v1`, {
          episodeToken: GAP_A,
        })
      ).status,
    ).toBe(400);
  });

  it("gates every transcript read and carries the notice on snapshots and item pages", async () => {
    const { info, token } = await startServer(() => {
      seedThread(THREAD, 4);
      seedThread(OTHER_THREAD, 0);
      insertGap(THREAD, "11111111-1111-4111-8111-111111111111");
    });
    await postJson(
      info,
      token,
      `/api/threads/${THREAD}/runtime/gap/acknowledge?notices=v1`,
      { episodeToken: GAP_A },
      "ack-gate",
    );
    const before = snapshotItemRows(THREAD);

    // Incapable (legacy) readers: definite 409 on every transcript read.
    for (const path of [
      `/api/threads/${THREAD}/history?runtimePage=1`,
      `/api/threads/${THREAD}/history`,
      `/api/threads/${THREAD}/history/items?limit=50`,
      `/api/threads/${THREAD}/turns?reads=bounded-v1`,
    ]) {
      const refused = await getJson(info, token, path);
      if (refused.status !== 409) throw new Error(`${path}: expected 409, got ${refused.status}`);
      expect((refused.body.error as { code: string }).code).toBe(
        "runtime_history_notice_unsupported",
      );
    }
    // The declaration must be well formed; an unknown value is a protocol
    // error, never a downgrade.
    expect((await getJson(info, token, `/api/threads/${THREAD}/history?notices=9`)).status).toBe(
      400,
    );

    // Capable clients get the committed prefix plus the notice on both shapes,
    // legacy and bounded.
    const snapshot = await getJson(
      info,
      token,
      `/api/threads/${THREAD}/history?runtimePage=1&notices=v1`,
    );
    expect(snapshot.status).toBe(200);
    const snapshotBody = registryParse("thread-history", snapshot.body);
    expect(snapshotBody.runtimeNotice).toMatchObject({
      kind: "history-incomplete",
      reason: "age",
      acknowledgedCount: 1,
    });
    expect((snapshotBody.runtimeItems as unknown[]).length).toBe(4);

    const items = await getJson(
      info,
      token,
      `/api/threads/${THREAD}/history/items?limit=50&notices=v1`,
    );
    expect(items.status).toBe(200);
    const itemsBody = registryParse("thread-history-items", items.body);
    expect(itemsBody.runtimeNotice).toMatchObject({
      kind: "history-incomplete",
      acknowledgedCount: 1,
    });
    expect((itemsBody.items as unknown[]).length).toBe(4);

    const bounded = await getJson(
      info,
      token,
      `/api/threads/${THREAD}/history?reads=bounded-v1&runtimePage=1&notices=v1`,
    );
    expect(bounded.status).toBe(200);
    expect(registryParse("thread-history", bounded.body).runtimeNotice).toMatchObject({
      kind: "history-incomplete",
    });
    const boundedItems = await getJson(
      info,
      token,
      `/api/threads/${THREAD}/history/items?reads=bounded-v1&limit=50&notices=v1`,
    );
    expect(boundedItems.status).toBe(200);
    expect(registryParse("thread-history-items", boundedItems.body).runtimeNotice).toMatchObject({
      kind: "history-incomplete",
    });
    const turns = await getJson(
      info,
      token,
      `/api/threads/${THREAD}/turns?reads=bounded-v1&notices=v1`,
    );
    expect(turns.status).toBe(200);

    // A clean thread behaves exactly like the legacy path for both readers.
    const clean = await getJson(info, token, `/api/threads/${OTHER_THREAD}/history/items?limit=50`);
    expect(clean.status).toBe(200);
    expect(registryParse("thread-history-items", clean.body).runtimeNotice).toBeUndefined();
    expect(snapshotItemRows(THREAD)).toBe(before);
  });

  it("maps malformed persisted identity honestly", async () => {
    const { info, token } = await startServer(() => {
      seedThread(THREAD, 1);
      insertGap(THREAD, "not-a-uuid");
    });
    const descriptor = await getJson(info, token, `/api/threads/${THREAD}/runtime/gap?notices=v1`);
    expect(descriptor.status).toBe(500);
    expect((descriptor.body.error as { code: string }).code).toBe("persistence_identity_invalid");
    const ack = await postJson(
      info,
      token,
      `/api/threads/${THREAD}/runtime/gap/acknowledge?notices=v1`,
      { episodeToken: GAP_A },
      "ack-identity",
    );
    expect(ack.status).toBe(500);
  });

  it("refuses both routes typed when the host did not compose the gap port", async () => {
    const { info, token } = await startServer(
      () => seedThread(THREAD, 1),
      {},
      { withoutRuntimeHistoryGap: true },
    );
    const descriptor = await getJson(info, token, `/api/threads/${THREAD}/runtime/gap?notices=v1`);
    expect(descriptor.status).toBe(503);
    expect((descriptor.body.error as { code: string }).code).toBe(
      "runtime_history_notices_unavailable",
    );
    // The descriptor advertises nothing without the composition.
    const environment = await getJson(info, token, "/.well-known/poracode/environment");
    expect(environment.status).toBe(200);
    const capabilities = (environment.body.capabilities ?? {}) as Record<string, unknown>;
    expect(capabilities.runtimeHistoryNotices).toBeUndefined();
  });

  it("maps typed durable-state refusals honestly instead of assuming clean state", async () => {
    const { info, token } = await startServer(
      () => {
        seedThread(THREAD, 1);
        insertGap(THREAD, "11111111-1111-4111-8111-111111111111");
      },
      {
        runtimeHistoryGap: {
          read: () => {
            throw new RuntimePersistenceDurableStateUnavailableError(THREAD, "gap-descriptor");
          },
          readNotice: getRuntimeThreadGapNotice,
          lookupNotice: lookupRuntimeNotice,
          acknowledge: async () => {
            throw new RuntimePersistenceDurableStateUnavailableError(THREAD, "acknowledge");
          },
        },
      },
    );
    const descriptor = await getJson(info, token, `/api/threads/${THREAD}/runtime/gap?notices=v1`);
    expect(descriptor.status).toBe(503);
    expect((descriptor.body.error as { code: string }).code).toBe("persistence_unavailable");
    const ack = await postJson(
      info,
      token,
      `/api/threads/${THREAD}/runtime/gap/acknowledge?notices=v1`,
      { episodeToken: GAP_A },
      "ack-unavailable",
    );
    expect(ack.status).toBe(503);
    expect((ack.body.error as { code: string }).code).toBe("persistence_unavailable");
  });

  it("resolves an uncertain acknowledgement receipt only with concrete notice proof", async () => {
    let mode: "commit-then-throw" | "throw-before-commit" | "pass" = "commit-then-throw";
    const flakyAcknowledge: typeof acknowledgeRuntimeThreadGap = async (threadId, token) => {
      if (mode === "throw-before-commit") throw new Error("interrupted before commit");
      const result = await acknowledgeRuntimeThreadGap(threadId, token);
      if (mode === "commit-then-throw") throw new Error("interrupted after commit");
      return result;
    };
    const { info, token } = await startServer(
      () => {
        seedThread(THREAD, 1);
        seedThread(OTHER_THREAD, 1);
        insertGap(THREAD, "11111111-1111-4111-8111-111111111111");
        insertGap(OTHER_THREAD, "22222222-2222-4222-8222-222222222222");
      },
      { runtimeHistoryGap: runtimeHistoryGapPort(flakyAcknowledge) },
    );
    const ackPath = (threadId: string) =>
      `/api/threads/${threadId}/runtime/gap/acknowledge?notices=v1`;

    // Attempt 1 commits, then the caller is interrupted: receipt uncertain.
    const first = await postJson(info, token, ackPath(THREAD), { episodeToken: GAP_A }, "ack-c1");
    expect(first.status).toBe(500);
    expect(getRuntimeThreadGapNotice(THREAD)?.acknowledgedToken).toBe(GAP_A);

    // Retry: the reconcile seam proves the stored notice IS this exact episode
    // token, so the idempotent replay runs and completes the receipt.
    mode = "pass";
    const resumed = await postJson(info, token, ackPath(THREAD), { episodeToken: GAP_A }, "ack-c1");
    expect(resumed.status).toBe(200);
    expect(resumed.body).toMatchObject({ outcome: "already" });

    // Attempt 1 on the second thread commits nothing: the same uncertain
    // receipt must never re-execute without proof.
    mode = "throw-before-commit";
    const noProof = await postJson(
      info,
      token,
      ackPath(OTHER_THREAD),
      { episodeToken: GAP_B },
      "ack-c2",
    );
    expect(noProof.status).toBe(500);
    expect(getRuntimeThreadGapNotice(OTHER_THREAD)).toBeNull();
    const unresolved = await postJson(
      info,
      token,
      ackPath(OTHER_THREAD),
      { episodeToken: GAP_B },
      "ack-c2",
    );
    expect(unresolved.status).toBe(409);
    expect((unresolved.body.error as { code: string }).code).toBe(
      REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE,
    );
    // A new command id still succeeds: the gap is intact and acknowledgeable.
    mode = "pass";
    const fresh = await postJson(
      info,
      token,
      ackPath(OTHER_THREAD),
      { episodeToken: GAP_B },
      "ack-c3",
    );
    expect(fresh.status).toBe(200);
    expect(fresh.body).toMatchObject({ outcome: "applied" });
  });

  it("replays a bound receipt across a real database close/reopen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-runtime-gap-reopen-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "state.sqlite");
    openDb(dbPath);
    seedProject();
    seedThread(THREAD, 1);
    insertGap(THREAD, "11111111-1111-4111-8111-111111111111");
    const server = createServer();
    const info = await server.start();
    const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        scopes: ["session:read", "session:operate"],
      }),
    });
    const { accessToken: token } = (await tokenResponse.json()) as { accessToken: string };
    const path = `/api/threads/${THREAD}/runtime/gap/acknowledge?notices=v1`;
    expect((await postJson(info, token, path, { episodeToken: GAP_A }, "ack-reopen")).status).toBe(
      200,
    );

    // Close and reopen the same database: the binding receipt and the durable
    // notice both survive, and the retry is zero-write.
    closeDatabase();
    openDb(dbPath);
    expect(getRuntimeThreadGapNotice(THREAD)?.acknowledgedToken).toBe(GAP_A);
    const writes = totalChanges();
    const replayed = await postJson(info, token, path, { episodeToken: GAP_A }, "ack-reopen");
    expect(replayed.status).toBe(200);
    expect(replayed.body).toMatchObject({ outcome: "applied" });
    expect(totalChanges()).toBe(writes);
  });
});
