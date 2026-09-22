import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { RemoteThreadCommand } from "@/shared/contracts";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";
import {
  batchThreadIdsForMembershipEvents,
  THREADS_CHANGED_EVENT_TARGET_BYTES,
} from "../remoteAccessServerEvents";

/**
 * H3: the shared byte-bounded membership publisher. Every producer of
 * `remote-threads-changed` (housekeeping sweep, HTTP routes, host-local
 * all-id projections) must publish small batches through the existing event
 * path — never one over-cap event that the generic guard would withhold and
 * answer with a GLOBAL `resync-required`.
 */

function createWsReader(ws: WebSocket): () => Promise<Record<string, unknown>> {
  const queue: Array<Record<string, unknown>> = [];
  const waiters: Array<(value: Record<string, unknown>) => void> = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return () =>
    new Promise((resolve, reject) => {
      const queued = queue.shift();
      if (queued) {
        resolve(queued);
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for websocket message")),
        10_000,
      );
      waiters.push((value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
}

async function exchangePairingUrl(pairingUrl: string): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read", "session:operate", "projects:manage"],
      client: { label: "Membership bounds test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function openSocket(
  info: RemoteAccessServerInfo,
  token: string,
  lastSeenSeq?: number,
): Promise<{ readonly ws: WebSocket; readonly read: () => Promise<Record<string, unknown>> }> {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const ticket = (await ticketResponse.json()) as { ticket: string };
  const wsUrl = new URL("/ws", info.wsBaseUrl);
  wsUrl.searchParams.set("ticket", ticket.ticket);
  if (lastSeenSeq !== undefined) wsUrl.searchParams.set("lastSeenSeq", String(lastSeenSeq));
  const ws = new WebSocket(wsUrl);
  const read = createWsReader(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  expect(await read()).toMatchObject({ type: "ready" });
  return { ws, read };
}

/** 60k ids with arbitrary accepted lengths (1–80 UTF-8 bytes, some non-ASCII). */
function arbitraryIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = "x".repeat(index % 40);
    const unicode = index % 7 === 0 ? "ü漢" : "";
    return `t-${index}-${suffix}${unicode}`;
  });
}

describe("bounded thread-membership publication", () => {
  const servers: RemoteAccessServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
  });

  it("splits arbitrary id lengths into ordered, duplicate-free bounded batches", () => {
    expect(batchThreadIdsForMembershipEvents([])).toEqual([]);
    expect(batchThreadIdsForMembershipEvents(["b", "a", "b"])).toEqual([["b", "a"]]);

    const ids = arbitraryIds(60_000);
    const batches = batchThreadIdsForMembershipEvents(ids);
    expect(batches.length).toBeGreaterThan(100);
    expect(batches.flat()).toEqual(ids);
    for (const batch of batches) {
      expect(batch.length).toBeGreaterThan(0);
      expect(
        Buffer.byteLength(
          JSON.stringify({ type: "remote-threads-changed", threadIds: batch }),
          "utf8",
        ),
      ).toBeLessThanOrEqual(THREADS_CHANGED_EVENT_TARGET_BYTES);
    }

    // A single id that alone cannot fit still publishes alone, never dropped.
    const oversizedId = "z".repeat(THREADS_CHANGED_EVENT_TARGET_BYTES * 2);
    expect(batchThreadIdsForMembershipEvents([oversizedId, "tail"])).toEqual([
      [oversizedId],
      ["tail"],
    ]);
  });

  it("charges the viewed acknowledgement payload to every batch and never truncates it", () => {
    const ids = arbitraryIds(5_000);
    // A viewed id large enough that ignoring it would break the target: every
    // batch must shrink so the serialized VIEWED copy fits too.
    const viewed = ["ack".concat("v".repeat(4_096))];
    const batches = batchThreadIdsForMembershipEvents(ids, viewed);
    expect(batches.flat()).toEqual(ids);
    expect(batches.length).toBeGreaterThan(20);
    for (const batch of batches) {
      const event = { type: "remote-threads-changed", threadIds: batch, viewedThreadIds: viewed };
      expect(Buffer.byteLength(JSON.stringify(event), "utf8")).toBeLessThanOrEqual(
        THREADS_CHANGED_EVENT_TARGET_BYTES,
      );
    }

    // The ack-shaped double copy (one id in both arrays) is budgeted exactly:
    // when both copies fit, they share one batch; when the second id cannot
    // fit beside the double copy, it splits instead of overshooting.
    const ackId = "a".repeat(4_000);
    const ackBatches = batchThreadIdsForMembershipEvents([ackId, "tail"], [ackId]);
    expect(ackBatches).toEqual([[ackId, "tail"]]);
    expect(
      Buffer.byteLength(
        JSON.stringify({
          type: "remote-threads-changed",
          threadIds: [ackId, "tail"],
          viewedThreadIds: [ackId],
        }),
        "utf8",
      ),
    ).toBeLessThanOrEqual(THREADS_CHANGED_EVENT_TARGET_BYTES);
    const bigAckId = "a".repeat(4_200);
    expect(batchThreadIdsForMembershipEvents([bigAckId, "tail"], [bigAckId])).toEqual([
      [bigAckId],
      ["tail"],
    ]);

    // An oversized single viewed id is an explicit exception, never dropped:
    // it rides every batch and the hard event guard governs the result.
    const oversizedViewed = ["view".concat("v".repeat(THREADS_CHANGED_EVENT_TARGET_BYTES * 2))];
    const exceptional = batchThreadIdsForMembershipEvents(["first", "second"], oversizedViewed);
    expect(exceptional).toEqual([["first"], ["second"]]);
  });

  it("publishes 60k ids as bounded live frames and a contiguous bounded replay without any resync", async () => {
    const onOversizedEventDropped = vi.fn<(info: { type: string; bytes: number }) => void>();
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-membership", label: "Membership desktop" },
      host: "127.0.0.1",
      port: 0,
      onOversizedEventDropped,
      dispatchThreadCommand: vi.fn<(command: RemoteThreadCommand) => boolean>(() => false),
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await exchangePairingUrl(info.pairingUrl);

    const live = await openSocket(info, token);
    const ids = arbitraryIds(60_000);
    // Direct event producer, not the helper: the bound lives in the shared
    // publisher, so every call site is covered.
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ids });

    const received: string[] = [];
    let frames = 0;
    while (received.length < ids.length) {
      const frame = await live.read();
      expect(frame.type).toBe("event");
      const event = frame.event as { type: string; threadIds: string[] };
      expect(event.type).toBe("remote-threads-changed");
      expect(Buffer.byteLength(JSON.stringify(event), "utf8")).toBeLessThanOrEqual(
        THREADS_CHANGED_EVENT_TARGET_BYTES,
      );
      received.push(...event.threadIds);
      frames += 1;
    }
    expect(received).toEqual(ids);
    expect(frames).toBeGreaterThan(100);
    expect(onOversizedEventDropped).not.toHaveBeenCalled();
    live.ws.close();

    // A reconnecting client replays the same bounded entries contiguously —
    // no global resync, no oversized retained frame.
    const replaying = await openSocket(info, token, 0);
    let replayedIds = 0;
    let replayFrames = 0;
    let expectedSeq = 1;
    for (;;) {
      if (replayedIds === ids.length) break;
      const frame = await replaying.read();
      expect(frame.type).toBe("event");
      expect(frame.seq).toBe(expectedSeq);
      expectedSeq += 1;
      const event = frame.event as { type: string; threadIds: string[] };
      replayedIds += event.threadIds.length;
      replayFrames += 1;
    }
    expect(replayFrames).toBe(frames);
    expect(replayedIds).toBe(ids.length);
    replaying.ws.close();
    expect(onOversizedEventDropped).not.toHaveBeenCalled();
  });

  it("keeps viewed-acknowledgement batches bounded and delivers exceptional singleton ids", async () => {
    const onOversizedEventDropped = vi.fn<(info: { type: string; bytes: number }) => void>();
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-viewed", label: "Viewed desktop" },
      host: "127.0.0.1",
      port: 0,
      onOversizedEventDropped,
      dispatchThreadCommand: vi.fn<(command: RemoteThreadCommand) => boolean>(() => false),
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await exchangePairingUrl(info.pairingUrl);
    const live = await openSocket(info, token);

    // A viewed acknowledgement large enough that an unstized copy would break
    // the target: the delivered frames still have to fit it.
    const ids = arbitraryIds(2_000);
    const viewed = ["ack".concat("v".repeat(4_096))];
    server.publishSupervisorEvent({
      type: "remote-threads-changed",
      threadIds: ids,
      viewedThreadIds: viewed,
    });
    const received: string[] = [];
    let frames = 0;
    while (received.length < ids.length) {
      const frame = await live.read();
      const event = frame.event as {
        type: string;
        threadIds: string[];
        viewedThreadIds?: string[];
      };
      expect(event.type).toBe("remote-threads-changed");
      expect(event.viewedThreadIds).toEqual(viewed);
      expect(Buffer.byteLength(JSON.stringify(event), "utf8")).toBeLessThanOrEqual(
        THREADS_CHANGED_EVENT_TARGET_BYTES,
      );
      received.push(...event.threadIds);
      frames += 1;
    }
    expect(received).toEqual(ids);
    expect(frames).toBeGreaterThan(10);

    // The review's exceptional ack shape: an 8,000-char accepted id in both
    // arrays is one ~16 KB singleton frame, delivered without a global resync
    // (the hard per-event guard governs it, the batching target does not).
    const oversizedId = "t".repeat(8_000);
    server.publishSupervisorEvent({
      type: "remote-threads-changed",
      threadIds: [oversizedId],
      viewedThreadIds: [oversizedId],
    });
    const exceptional = await live.read();
    const exceptionalEvent = exceptional.event as {
      type: string;
      threadIds: string[];
      viewedThreadIds?: string[];
    };
    expect(exceptionalEvent.threadIds).toEqual([oversizedId]);
    expect(exceptionalEvent.viewedThreadIds).toEqual([oversizedId]);
    expect(Buffer.byteLength(JSON.stringify(exceptionalEvent), "utf8")).toBeGreaterThan(
      THREADS_CHANGED_EVENT_TARGET_BYTES,
    );
    expect(onOversizedEventDropped).not.toHaveBeenCalled();

    // The channel stayed live: no resync frame interrupted the stream.
    server.publishThreadsChanged(["after-exception"]);
    const followUp = await live.read();
    expect(followUp).toMatchObject({
      event: { type: "remote-threads-changed", threadIds: ["after-exception"] },
    });
    live.ws.close();
    expect(onOversizedEventDropped).not.toHaveBeenCalled();
  });

  it("publishes nothing for an empty membership change", async () => {
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-empty", label: "Empty desktop" },
      host: "127.0.0.1",
      port: 0,
      dispatchThreadCommand: vi.fn<(command: RemoteThreadCommand) => boolean>(() => false),
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await exchangePairingUrl(info.pairingUrl);
    const socket = await openSocket(info, token);

    server.publishThreadsChanged([]);
    server.publishSupervisorEvent({
      type: "remote-threads-changed",
      threadIds: [],
      viewedThreadIds: ["viewed-1"],
    });
    // A follow-up event proves the channel is alive: the empty publishes above
    // must not have produced frames.
    server.publishThreadsChanged(["t-1"]);
    const frame = await socket.read();
    const event = frame.event as { type: string; threadIds: string[] };
    expect(event).toEqual({ type: "remote-threads-changed", threadIds: ["t-1"] });
    socket.ws.close();
  });
});
