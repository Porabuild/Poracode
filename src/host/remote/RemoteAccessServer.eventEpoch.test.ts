import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { runtimeEventSchema } from "@/shared/contracts/runtimeEvent";
import { closeDatabase, initDatabase } from "@/host/db";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { remoteShellSnapshotSchema } from "@/shared/remote";
import {
  REMOTE_EVENT_EPOCH_DECLARATION,
  REMOTE_EVENT_EPOCH_WS_PARAM,
  REMOTE_LAST_SEEN_EPOCH_WS_PARAM,
} from "@/shared/remote/protocol/eventEpoch";
import { createPersistentRemoteAuthStore } from "./auth";
import { RemoteAccessServer, type RemoteAccessServerInfo } from "./RemoteAccessServer";
import type { RemoteBroadcastEvent } from "./server/context";

// A restart is modelled exactly like production: a fresh server instance over
// the same persisted remote-access-auth.json, so the bearer session survives
// while the in-memory sequence restarts at 0.

const servers: RemoteAccessServer[] = [];
const sockets: WebSocket[] = [];
const dataDirs: string[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const server of servers.splice(0)) await server.dispose();
  closeDatabase();
  for (const dir of dataDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Frame = { readonly type: string; readonly seq?: number; readonly epoch?: string } & Record<
  string,
  unknown
>;

interface Host {
  readonly server: RemoteAccessServer;
  readonly info: RemoteAccessServerInfo;
}

interface Resume {
  readonly lastSeenSeq?: number;
  /** Declares `eventEpoch=v1`; a string also sends it as `lastSeenEpoch`. */
  readonly epoch?: string | true;
}

function item(label: string): RemoteBroadcastEvent {
  return {
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: runtimeEventSchema.parse({
      type: "item.completed",
      threadId: "thread-1",
      itemId: label,
      payload: { name: "command", result: label },
    }),
  };
}

function itemIdOf(frame: Frame): string | undefined {
  return (frame.event as { event?: { itemId?: string } } | undefined)?.event?.itemId;
}

function newDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-event-epoch-"));
  dataDirs.push(dir);
  return dir;
}

async function startInstance(dataDir: string): Promise<Host> {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "event-epoch", label: "Event epoch" },
    host: "127.0.0.1",
    port: 0,
    ownsSupervisorPersistence: false,
    webSocketHeartbeatIntervalMs: 0,
    authStore: createPersistentRemoteAuthStore(dataDir),
    callSupervisor: async () => {
      throw new Error("Unexpected supervisor call");
    },
  });
  servers.push(server);
  return { server, info: await server.start() };
}

async function restart(dataDir: string, previous: Host): Promise<Host> {
  for (const socket of sockets.splice(0)) socket.terminate();
  await previous.server.dispose();
  servers.splice(servers.indexOf(previous.server), 1);
  return startInstance(dataDir);
}

async function pair(info: RemoteAccessServerInfo): Promise<string> {
  const pairingUrl = new URL(info.pairingUrl);
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential: new URLSearchParams(pairingUrl.hash.slice(1)).get("token"),
      scopes: ["session:read"],
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

function publish(host: Host, ...itemIds: string[]): void {
  for (const itemId of itemIds) host.server.publishSupervisorEvent(item(itemId));
}

function labels(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

/** Opens one event socket and records every frame it receives. */
async function open(host: Host, token: string, resume: Resume = {}) {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", host.info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(ticketResponse.status).toBe(200);
  const { ticket } = (await ticketResponse.json()) as { ticket: string };
  const url = new URL("/ws", host.info.wsBaseUrl);
  url.searchParams.set("ticket", ticket);
  if (resume.lastSeenSeq !== undefined) {
    url.searchParams.set("lastSeenSeq", String(resume.lastSeenSeq));
  }
  if (resume.epoch !== undefined) {
    url.searchParams.set(REMOTE_EVENT_EPOCH_WS_PARAM, REMOTE_EVENT_EPOCH_DECLARATION);
    if (typeof resume.epoch === "string") {
      url.searchParams.set(REMOTE_LAST_SEEN_EPOCH_WS_PARAM, resume.epoch);
    }
  }
  const socket = new WebSocket(url);
  sockets.push(socket);
  const frames: Frame[] = [];
  const raws: string[] = [];
  socket.on("message", (raw) => {
    raws.push(String(raw));
    frames.push(JSON.parse(String(raw)) as Frame);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  await expect.poll(() => frames.length, { timeout: 5_000 }).toBeGreaterThan(0);
  return {
    socket,
    frames,
    raws,
    /** Publishes a live marker; every earlier frame of this socket precedes it. */
    async barrier(label: string): Promise<string[]> {
      publish(host, label);
      await expect
        .poll(() => frames.some((frame) => itemIdOf(frame) === label), { timeout: 5_000 })
        .toBe(true);
      return frames.map((frame) =>
        frame.type === "event" ? `event:${frame.seq}:${itemIdOf(frame)}` : frame.type,
      );
    },
  };
}

/** Epoch A: one client applies five live events. */
async function epochA() {
  const dataDir = newDataDir();
  const a = await startInstance(dataDir);
  const token = await pair(a.info);
  const live = await open(a, token, { epoch: true });
  const epoch = live.frames[0]?.epoch;
  publish(a, ...labels("A", 5));
  await expect
    .poll(() => live.frames.filter((frame) => frame.type === "event").length, { timeout: 5_000 })
    .toBe(5);
  return { dataDir, a, token, epoch: epoch! };
}

describe("event-stream epoch: declared clients", () => {
  it.each(["bounded", "legacy"] as const)(
    "binds the first %s HTTP snapshot to the same event stream without another resync",
    async (mode) => {
      initDatabase(join(newDataDir(), "db.sqlite"));
      const host = await startInstance(newDataDir());
      const token = await pair(host.info);
      publish(host, "before-snapshot");
      const client = new RemoteDesktopClient(host.info.httpBaseUrl, token);
      const snapshot =
        mode === "bounded"
          ? (
              await client.boundedShellSnapshot({
                order: "manual",
                threadLimit: 50,
                summaries: false,
              })
            ).page
          : await client.snapshot();
      expect(snapshot.snapshotSeq).toBe(1);
      expect(snapshot.snapshotEpoch).toMatch(/^[0-9a-f-]{36}$/);
      // A pre-upgrade reader continues to accept the additive field.
      const legacy = remoteShellSnapshotSchema.omit({ snapshotEpoch: true }).parse(snapshot);
      expect(legacy.snapshotSeq).toBe(1);
      expect(legacy).not.toHaveProperty("snapshotEpoch");
      const live = await open(host, token, {
        lastSeenSeq: snapshot.snapshotSeq,
        epoch: snapshot.snapshotEpoch!,
      });
      expect(live.frames[0]?.epoch).toBe(snapshot.snapshotEpoch);
      expect(await live.barrier("after-snapshot")).toEqual(["ready", "event:2:after-snapshot"]);
    },
  );

  it("reports one epoch per instance only to declaring connections", async () => {
    const { dataDir, a, token, epoch } = await epochA();
    expect(epoch).toMatch(/^[0-9a-f-]{36}$/);
    const again = await open(a, token, { epoch: true });
    expect(again.frames[0]).toEqual({ type: "ready", seq: 5, epoch });

    // Pre-upgrade readers keep the exact legacy frame, byte for byte.
    const legacy = await open(a, token);
    expect(legacy.raws[0]).toBe('{"type":"ready","seq":5}');

    const b = await restart(dataDir, a);
    const fresh = await open(b, token, { epoch: true });
    expect(fresh.frames[0]?.epoch).toMatch(/^[0-9a-f-]{36}$/);
    expect(fresh.frames[0]?.epoch).not.toBe(epoch);
  });

  it("resyncs an earlier instance's cursor inside the replay window and at an equal head", async () => {
    for (const afterRestart of [8, 5]) {
      const { dataDir, a, token, epoch } = await epochA();
      const b = await restart(dataDir, a);
      publish(b, ...labels("B", afterRestart));
      const resumed = await open(b, token, { lastSeenSeq: 5, epoch });
      expect(await resumed.barrier("B-live")).toEqual([
        "ready",
        "resync-required",
        `event:${afterRestart + 1}:B-live`,
      ]);
      expect(resumed.frames[1]).toMatchObject({ type: "resync-required", seq: afterRestart });
    }
  });

  it("replays efficiently within one instance when the epoch matches", async () => {
    const { a, token, epoch } = await epochA();
    publish(a, "A-6", "A-7");
    const resumed = await open(a, token, { lastSeenSeq: 5, epoch });
    expect(await resumed.barrier("A-live")).toEqual([
      "ready",
      "event:6:A-6",
      "event:7:A-7",
      "event:8:A-live",
    ]);
  });

  it("keeps refusing a stale cursor whose first resync frame was lost", async () => {
    const { dataDir, a, token, epoch } = await epochA();
    const b = await restart(dataDir, a);
    publish(b, ...labels("B", 8));
    // The client never applied the resync (frame lost with the socket), so it
    // reconnects with the same stale binding: verification is stateless per
    // connection and refuses it again instead of trusting the session.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const resumed = await open(b, token, { lastSeenSeq: 5, epoch });
      expect((await resumed.barrier(`B-live-${attempt}`)).slice(0, 2)).toEqual([
        "ready",
        "resync-required",
      ]);
      resumed.socket.terminate();
    }
  });

  it("verifies each of two realms that share one session", async () => {
    const { dataDir, a, token, epoch } = await epochA();
    const b = await restart(dataDir, a);
    publish(b, ...labels("B", 8));

    const first = await open(b, token, { lastSeenSeq: 5, epoch });
    expect((await first.barrier("B-first")).slice(0, 2)).toEqual(["ready", "resync-required"]);
    const epochB = first.frames[0]?.epoch;
    // The first realm re-baselined; its reconnect on the new binding is trusted.
    const rebound = await open(b, token, { lastSeenSeq: 9, epoch: epochB! });
    expect(await rebound.barrier("B-rebound")).toEqual(["ready", "event:10:B-rebound"]);

    // The second realm still holds the old binding and is refused, not trusted.
    const second = await open(b, token, { lastSeenSeq: 5, epoch });
    expect((await second.barrier("B-second")).slice(0, 2)).toEqual(["ready", "resync-required"]);
  });

  it("resyncs a positive cursor that has no bound epoch, and an oversized epoch", async () => {
    const { a, token } = await epochA();
    const unbound = await open(a, token, { lastSeenSeq: 3, epoch: true });
    expect((await unbound.barrier("A-unbound")).slice(0, 2)).toEqual(["ready", "resync-required"]);
    const oversized = await open(a, token, { lastSeenSeq: 3, epoch: "x".repeat(200) });
    expect((await oversized.barrier("A-oversized")).slice(0, 2)).toEqual([
      "ready",
      "resync-required",
    ]);
  });
});

describe("event-stream epoch: undeclared clients (bounded legacy fallback)", () => {
  it("forces one resync per session after an in-window or equal-head restart", async () => {
    for (const afterRestart of [8, 5]) {
      const { dataDir, a, token } = await epochA();
      const b = await restart(dataDir, a);
      publish(b, ...labels("B", afterRestart));
      const resumed = await open(b, token, { lastSeenSeq: 5 });
      expect(resumed.raws[0]).toBe(`{"type":"ready","seq":${afterRestart}}`);
      expect(await resumed.barrier("B-live")).toEqual([
        "ready",
        "resync-required",
        `event:${afterRestart + 1}:B-live`,
      ]);
    }
  });

  it("trusts the session's reconnects after the forced resync, so native resync flows cannot loop", async () => {
    const { dataDir, a, token } = await epochA();
    const b = await restart(dataDir, a);
    publish(b, ...labels("B", 8));
    const forced = await open(b, token, { lastSeenSeq: 5 });
    expect((await forced.barrier("B-9")).slice(0, 2)).toEqual(["ready", "resync-required"]);
    forced.socket.terminate();

    // Native clients reconnect from the authoritative snapshot cursor right
    // after a resync; that reconnect and every later one use the seq rules.
    const afterSnapshot = await open(b, token, { lastSeenSeq: 9 });
    expect(await afterSnapshot.barrier("B-10")).toEqual(["ready", "event:10:B-10"]);
    afterSnapshot.socket.terminate();
    const replay = await open(b, token, { lastSeenSeq: 8 });
    expect(await replay.barrier("B-11")).toEqual([
      "ready",
      "event:9:B-9",
      "event:10:B-10",
      "event:11:B-11",
    ]);
  });

  it("never forces a resync for a join without a cursor or with cursor 0", async () => {
    const { dataDir, a } = await epochA();
    const b = await restart(dataDir, a);
    publish(b, ...labels("B", 3));
    const token = await pair(b.info);
    const live = await open(b, token);
    expect(await live.barrier("B-live")).toEqual(["ready", "event:4:B-live"]);
    for (const epoch of [undefined, true] as const) {
      const fromStart = await open(b, token, { lastSeenSeq: 0, ...(epoch ? { epoch } : {}) });
      const frames = await fromStart.barrier(`B-start-${String(epoch)}`);
      expect(frames.slice(0, 5)).toEqual([
        "ready",
        "event:1:B-1",
        "event:2:B-2",
        "event:3:B-3",
        "event:4:B-live",
      ]);
      expect(frames).not.toContain("resync-required");
    }
  });

  it("still resyncs a cursor ahead of a reset head, for both client kinds", async () => {
    const { dataDir, a, token, epoch } = await epochA();
    const b = await restart(dataDir, a);
    const legacy = await open(b, token, { lastSeenSeq: 5 });
    expect((await legacy.barrier("B-1")).slice(0, 2)).toEqual(["ready", "resync-required"]);
    const declared = await open(b, token, { lastSeenSeq: 5, epoch });
    expect((await declared.barrier("B-2")).slice(0, 2)).toEqual(["ready", "resync-required"]);
  });
});
