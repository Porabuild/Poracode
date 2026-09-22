import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { runtimeEventSchema } from "@/shared/contracts/runtimeEvent";
import {
  acknowledgeRuntimeThreadGap,
  attachRuntimePersistenceDurableGapFromCurrentConnection,
  closeDatabase,
  dbDeleteThread,
  getRuntimeThreadGapDescriptor,
  getRuntimeThreadGapNotice,
  initDatabase,
  lookupRuntimeNotice,
} from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import type { Thread } from "@/shared/contracts";
import { RemoteAccessServer, type RemoteAccessServerInfo } from "./RemoteAccessServer";
import type { RemoteBroadcastEvent } from "./server/context";

/**
 * B1 live/replay notice gate over the REAL server + REAL SQLite.
 *
 * An incapable (no `notices=v1`) connection receives emptied canonical runtime
 * batches for a notice thread — live AND on cursor replay — with contiguity
 * preserved and unrelated threads untouched. A capable connection keeps the
 * canonical content. The gate reads the bounded DB-backed notice lookup, so a
 * deleted/reused thread id cannot inherit a stale notice.
 */

const servers: RemoteAccessServer[] = [];
const sockets: WebSocket[] = [];
const tempDirs: string[] = [];
const THREAD = "thread-notice";
const OTHER = "thread-unrelated";
const GAP_A = "gap2:e11111111-1111-4111-8111-111111111111";

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  closeDatabase();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function threadFixture(id: string): Thread {
  return {
    id,
    projectId: "project-1",
    title: id,
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

function itemEvent(threadId: string, index: number): RemoteBroadcastEvent {
  return {
    type: "thread-runtime-event",
    threadId,
    event: runtimeEventSchema.parse({
      type: "item.completed",
      threadId,
      itemId: `${threadId}-item-${index}`,
      payload: { name: "command", result: `content-${index}` },
    }),
  };
}

function multiBatches(): ReadonlyArray<{ threadId: string; readonly events: readonly unknown[] }> {
  const event = multiEvent();
  if (event.type !== "thread-runtime-events-multi") throw new Error("expected a multi event");
  return event.batches;
}

function multiEvent(): RemoteBroadcastEvent {
  return {
    type: "thread-runtime-events-multi",
    batches: [
      {
        threadId: THREAD,
        events: [
          runtimeEventSchema.parse({
            type: "item.completed",
            threadId: THREAD,
            itemId: `${THREAD}-multi`,
            payload: { name: "command", result: "gated" },
          }),
        ],
      },
      {
        threadId: OTHER,
        events: [
          runtimeEventSchema.parse({
            type: "item.completed",
            threadId: OTHER,
            itemId: `${OTHER}-multi`,
            payload: { name: "command", result: "passes" },
          }),
        ],
      },
    ],
  };
}

interface Frame {
  readonly type: string;
  readonly seq?: number;
  readonly event?: RemoteBroadcastEvent;
}

function collect(socket: WebSocket): Frame[] {
  const frames: Frame[] = [];
  socket.on("message", (raw) => frames.push(JSON.parse(raw.toString()) as Frame));
  return frames;
}

async function connect(
  info: RemoteAccessServerInfo,
  token: string,
  options: { noticesCapable?: boolean; noticesValue?: string; lastSeenSeq?: number } = {},
): Promise<{ socket: WebSocket; frames: Frame[] }> {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(ticketResponse.status).toBe(200);
  const { ticket } = (await ticketResponse.json()) as { ticket: string };
  const url = new URL("/ws", info.wsBaseUrl);
  url.searchParams.set("ticket", ticket);
  if (options.noticesCapable) url.searchParams.set("notices", "v1");
  if (options.noticesValue !== undefined) url.searchParams.set("notices", options.noticesValue);
  if (options.lastSeenSeq !== undefined) {
    url.searchParams.set("lastSeenSeq", String(options.lastSeenSeq));
  }
  const socket = new WebSocket(url);
  sockets.push(socket);
  // Attach the collector BEFORE the handshake completes: replay frames can
  // start arriving in the same turn the socket opens.
  const frames = collect(socket);
  await once(socket, "open");
  return { socket, frames };
}

async function startServer(): Promise<{
  info: RemoteAccessServerInfo;
  token: string;
  server: RemoteAccessServer;
}> {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  const dir = mkdtempSync(join(tmpdir(), "poracode-notice-gate-"));
  tempDirs.push(dir);
  initDatabase(join(dir, "state.sqlite"));
  attachRuntimePersistenceDurableGapFromCurrentConnection();
  dbUpsertProject(
    {
      id: "project-1",
      name: "Project 1",
      location: { kind: "posix", path: "/tmp/project-1" },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    0,
  );
  dbUpsertThread(threadFixture(THREAD), 0);
  dbUpsertThread(threadFixture(OTHER), 1);
  getSqlite()
    .prepare(
      `INSERT INTO thread_runtime_gaps
         (thread_id, reason, refused_events, refused_bytes, epoch, created_at, episode_id)
       VALUES (?, 'age', 2, 20, 1, 111, '11111111-1111-4111-8111-111111111111')`,
    )
    .run(THREAD);
  const acked = await acknowledgeRuntimeThreadGap(THREAD, GAP_A);
  expect(acked.outcome).toBe("applied");

  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "notice-gate", label: "Notice gate" },
    host: "127.0.0.1",
    port: 0,
    webSocketHeartbeatIntervalMs: 0,
    ownsSupervisorPersistence: false,
    runtimeHistoryGap: {
      read: getRuntimeThreadGapDescriptor,
      readNotice: getRuntimeThreadGapNotice,
      lookupNotice: lookupRuntimeNotice,
      acknowledge: acknowledgeRuntimeThreadGap,
    },
    callSupervisor: async () => {
      throw new Error("Unexpected supervisor call");
    },
  });
  servers.push(server);
  const info = await server.start();
  return { info, token: await authorize(info), server };
}

async function authorize(info: RemoteAccessServerInfo): Promise<string> {
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read"],
    }),
  });
  expect(response.status).toBe(200);
  const { accessToken } = (await response.json()) as { accessToken: string };
  return accessToken;
}

function runtimeFrames(
  frames: readonly Frame[],
): Array<{ seq: number; event: RemoteBroadcastEvent }> {
  return frames
    .filter(
      (frame): frame is Frame & { seq: number; event: RemoteBroadcastEvent } =>
        frame.type === "event" && frame.event !== undefined,
    )
    .map((frame) => ({ seq: frame.seq, event: frame.event }));
}

describe.skipIf(!sqliteAvailable)("B1 live/replay notice gate", () => {
  it("empties notice-thread batches for incapable clients live, keeps capable content, and preserves contiguous seqs", async () => {
    const { info, token, server } = await startServer();
    const { frames: legacyFrames } = await connect(info, token);
    const { frames: capableFrames } = await connect(info, token, { noticesCapable: true });

    server.publishSupervisorEvent(itemEvent(THREAD, 1));
    server.publishSupervisorEvent(itemEvent(OTHER, 2));
    server.publishSupervisorEvent(multiEvent());

    await expect.poll(() => legacyFrames.filter((f) => f.type === "event").length).toBe(3);
    await expect.poll(() => capableFrames.filter((f) => f.type === "event").length).toBe(3);

    const legacyEvents = runtimeFrames(legacyFrames);
    // Contiguity: every published seq arrives exactly once, in order.
    expect(legacyEvents.map((entry) => entry.seq)).toEqual([1, 2, 3]);
    expect(legacyEvents[0]!.event).toEqual({
      type: "thread-runtime-events",
      threadId: THREAD,
      events: [],
    });
    // Unrelated thread content passes untouched.
    expect(legacyEvents[1]!.event).toEqual(itemEvent(OTHER, 2));
    expect(legacyEvents[2]!.event).toMatchObject({
      type: "thread-runtime-events-multi",
      batches: [
        { threadId: THREAD, events: [] },
        { threadId: OTHER, events: multiBatches()[1]!.events },
      ],
    });

    // The capable connection keeps the canonical frames byte-for-byte.
    const capableEvents = runtimeFrames(capableFrames);
    expect(capableEvents.map((entry) => entry.seq)).toEqual([1, 2, 3]);
    expect(capableEvents[0]!.event).toEqual(itemEvent(THREAD, 1));
    expect(capableEvents[2]!.event).toEqual(multiEvent());
  });

  it("applies the same gate on cursor replay and re-reads capability per connection", async () => {
    const { info, token, server } = await startServer();
    server.publishSupervisorEvent(itemEvent(THREAD, 1));
    server.publishSupervisorEvent(itemEvent(OTHER, 2));
    server.publishSupervisorEvent(itemEvent(THREAD, 3));

    const { frames: legacyFrames } = await connect(info, token, { lastSeenSeq: 0 });
    await expect.poll(() => runtimeFrames(legacyFrames).length, { timeout: 5_000 }).toBe(3);
    const replayed = runtimeFrames(legacyFrames);
    expect(replayed.map((entry) => entry.seq)).toEqual([1, 2, 3]);
    expect(replayed[0]!.event).toMatchObject({ type: "thread-runtime-events", events: [] });
    expect(replayed[1]!.event).toEqual(itemEvent(OTHER, 2));
    expect(replayed[2]!.event).toMatchObject({ type: "thread-runtime-events", events: [] });

    // A different connection declaring the capability gets the content for the
    // SAME buffered seqs: capability is per-connection, not global.
    const { frames: capableFrames } = await connect(info, token, {
      noticesCapable: true,
      lastSeenSeq: 0,
    });
    await expect.poll(() => runtimeFrames(capableFrames).length, { timeout: 5_000 }).toBe(3);
    expect(runtimeFrames(capableFrames)[0]!.event).toEqual(itemEvent(THREAD, 1));
    expect(runtimeFrames(capableFrames)[2]!.event).toEqual(itemEvent(THREAD, 3));
  });

  it("fails closed for an unknown declaration and for a lookup error", async () => {
    const { info, token, server } = await startServer();
    const unknownDeclaration = await connect(info, token, { noticesValue: "v9" });
    const erroringLookup = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "test",
      identity: { desktopId: "notice-gate-error", label: "Notice gate error" },
      host: "127.0.0.1",
      port: 0,
      webSocketHeartbeatIntervalMs: 0,
      ownsSupervisorPersistence: false,
      runtimeHistoryGap: {
        read: getRuntimeThreadGapDescriptor,
        readNotice: getRuntimeThreadGapNotice,
        lookupNotice: () => ({ kind: "error", error: new Error("lookup exploded") }),
        acknowledge: acknowledgeRuntimeThreadGap,
      },
      callSupervisor: async () => {
        throw new Error("Unexpected supervisor call");
      },
    });
    servers.push(erroringLookup);
    const errorInfo = await erroringLookup.start();
    const errorToken = await authorize(errorInfo);
    const errored = await connect(errorInfo, errorToken);

    // An unknown declaration is incapable (fail closed), and a lookup error
    // gates the thread instead of assuming clean.
    server.publishSupervisorEvent(itemEvent(THREAD, 7));
    await expect.poll(() => runtimeFrames(unknownDeclaration.frames).length).toBe(1);
    expect(runtimeFrames(unknownDeclaration.frames)[0]!.event).toMatchObject({
      type: "thread-runtime-events",
      events: [],
    });
    erroringLookup.publishSupervisorEvent(itemEvent(OTHER, 8));
    await expect.poll(() => runtimeFrames(errored.frames).length).toBe(1);
    expect(runtimeFrames(errored.frames)[0]!.event).toMatchObject({
      type: "thread-runtime-events",
      events: [],
    });
  });

  it("invalidates the gate on thread delete and does not alias a reused id", async () => {
    const { info, token, server } = await startServer();
    const { frames } = await connect(info, token);

    server.publishSupervisorEvent(itemEvent(THREAD, 1));
    await expect.poll(() => runtimeFrames(frames).length).toBe(1);
    expect(runtimeFrames(frames)[0]!.event).toMatchObject({ events: [] });

    // Deleting the thread cascades the notice; the derived lookup re-queries.
    dbDeleteThread(THREAD);
    server.publishSupervisorEvent(itemEvent(THREAD, 2));
    await expect.poll(() => runtimeFrames(frames).length).toBe(2);
    expect(runtimeFrames(frames)[1]!.event).toEqual(itemEvent(THREAD, 2));

    // The id is reused with a NEW episode: only the new acknowledgement gates.
    dbUpsertThread(threadFixture(THREAD), 0);
    server.publishSupervisorEvent(itemEvent(THREAD, 3));
    await expect.poll(() => runtimeFrames(frames).length).toBe(3);
    expect(runtimeFrames(frames)[2]!.event).toEqual(itemEvent(THREAD, 3));
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_gaps
           (thread_id, reason, refused_events, refused_bytes, epoch, created_at, episode_id)
         VALUES (?, 'age', 1, 10, 1, 222, '22222222-2222-4222-8222-222222222222')`,
      )
      .run(THREAD);
    await acknowledgeRuntimeThreadGap(THREAD, "gap2:e22222222-2222-4222-8222-222222222222");
    server.publishSupervisorEvent(itemEvent(THREAD, 4));
    await expect.poll(() => runtimeFrames(frames).length).toBe(4);
    expect(runtimeFrames(frames)[3]!.event).toMatchObject({ events: [] });
  });
});
