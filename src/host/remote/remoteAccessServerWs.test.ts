import { describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { REMOTE_PER_MESSAGE_DEFLATE } from "./server/wsConnections";
import { dropWebSocketClient, sendControlFrame, sendRaw } from "./remoteAccessServerWs";
import {
  PrincipalAdmissionController,
  resolvePrincipalAdmissionLimits,
} from "./server/principalAdmission";
import { outboundFrameBytes } from "./server/outboundBudget";
import type { RemoteAccessServerHost } from "./remoteAccessServerTypes";

/** Transport double with the ws control surface `sendRaw`/`sendControlFrame`
 * and the drop path touch. */
class TestSocket {
  readonly readyState = WebSocket.OPEN;
  bufferedAmount = 0;
  terminations = 0;
  readonly sent: string[] = [];
  readonly pings: Array<Buffer | undefined> = [];
  readonly pongs: Array<Buffer | undefined> = [];
  private writeCallbacks: Array<(error?: Error) => void> = [];
  private closeListeners: Array<() => void> = [];

  readonly compression: boolean[] = [];
  send(data: string, options: { compress: boolean }, callback?: (error?: Error) => void): void {
    this.sent.push(data);
    this.compression.push(options.compress);
    if (callback) this.writeCallbacks.push(callback);
  }

  ping(data?: Buffer, _mask?: boolean, callback?: (error?: Error) => void): void {
    this.pings.push(data);
    if (callback) this.writeCallbacks.push(callback);
  }

  pong(data?: Buffer, _mask?: boolean, callback?: (error?: Error) => void): void {
    this.pongs.push(data);
    if (callback) this.writeCallbacks.push(callback);
  }

  terminate(): void {
    this.terminations += 1;
  }

  once(event: string, listener: () => void): this {
    if (event === "close") this.closeListeners.push(listener);
    return this;
  }

  /** The transport close event that releases queued-byte reservations. */
  emitClose(): void {
    for (const listener of this.closeListeners.splice(0)) listener();
  }

  /** The ws write-completion callback: bytes left the socket queue. */
  flushSends(error?: Error): void {
    for (const callback of this.writeCallbacks.splice(0)) callback(error);
  }
}

function createHost(options: Record<string, number> = {}): {
  host: RemoteAccessServerHost;
  admission: PrincipalAdmissionController;
  clients: Map<WebSocket, { sessionId: string }>;
} {
  const clients = new Map<WebSocket, { sessionId: string }>();
  const host = {
    options: {
      appVersion: "test",
      identity: { desktopId: "d", label: "d" },
      host: "127.0.0.1",
      port: 0,
      ...options,
    },
    clients,
    replayingClients: new Set<WebSocket>(),
    clientLiveness: new Map<WebSocket, boolean>(),
    terminalWatches: new Map<WebSocket, Set<string>>(),
    gitStateInterests: new Map(),
    itemInterests: new Map(),
    noticeCapableClients: new Set<WebSocket>(),
    boundedCatalogChangeClients: new Set<WebSocket>(),
    terminalCursorSync: { clearConnection: () => {} },
    detachDesktopInternalClient: () => {},
    notifyEventInterestsChanged: () => {},
  } as unknown as RemoteAccessServerHost;
  const admission = new PrincipalAdmissionController(
    resolvePrincipalAdmissionLimits(host.options),
    { evictSocket: (ws) => dropWebSocketClient(host, ws) },
  );
  (host as { principalAdmission: PrincipalAdmissionController }).principalAdmission = admission;
  return { host, admission, clients };
}

function attach(
  clients: Map<WebSocket, { sessionId: string }>,
  socket: TestSocket,
  sessionId: string,
): WebSocket {
  const ws = socket as unknown as WebSocket;
  clients.set(ws, { sessionId });
  return ws;
}

describe("sendRaw aggregate accounting", () => {
  it("keeps reading clients connected through sustained incompressible 64 KiB bursts", async () => {
    const server = new WebSocketServer({ port: 0, perMessageDeflate: REMOTE_PER_MESSAGE_DEFLATE });
    const peers: WebSocket[] = [];
    const { host, clients } = createHost();
    try {
      await once(server, "listening");
      const address = server.address();
      if (typeof address === "string" || address === null) throw new Error("Expected TCP listener");
      const received = Array.from({ length: 8 }, () => 0);
      for (let index = 0; index < received.length; index += 1) {
        const connected = once(server, "connection");
        const peer = new WebSocket(`ws://127.0.0.1:${address.port}`);
        peers.push(peer);
        peer.on("message", () => {
          received[index]! += 1;
        });
        await once(peer, "open");
        const [socket] = (await connected) as [WebSocket];
        clients.set(socket, { sessionId: `reader-${index}` });
        expect(peer.extensions).toContain("permessage-deflate");
      }
      const payload = randomBytes(48 * 1024).toString("base64");
      const sockets = [...clients.keys()];
      const deadline = Date.now() + 5_000;
      for (let wave = 0; wave < 20; wave += 1) {
        for (let frame = 0; frame < 16; frame += 1) {
          for (const socket of sockets) expect(sendRaw(host, socket, payload)).toBe(true);
        }
        // A loop yield does not guarantee socket drainage on every OS. Keep
        // each burst below the cap and observe readers before producing more.
        const expected = (wave + 1) * 16;
        while (received.some((count) => count < expected) && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 5));
        expect(received).toEqual(Array.from({ length: 8 }, () => expected));
      }
      expect(received).toEqual(Array.from({ length: 8 }, () => 320));
      expect(peers.every((peer) => peer.readyState === WebSocket.OPEN)).toBe(true);
    } finally {
      for (const peer of peers) peer.terminate();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.each([
    { bytes: 65_535, compress: true, reservedBytes: 65_549 },
    { bytes: 65_536, compress: false, reservedBytes: 65_546 },
    { bytes: 65_537, compress: false, reservedBytes: 65_547 },
  ])("reserves $reservedBytes bytes with compress=$compress for $bytes payload bytes", (input) => {
    const { host, admission, clients } = createHost();
    const socket = new TestSocket();
    const ws = attach(clients, socket, "alice");

    expect(sendRaw(host, ws, "x".repeat(input.bytes))).toBe(true);
    expect(socket.compression).toEqual([input.compress]);
    expect(admission.outboundQueuedBytes("alice")).toBe(input.reservedBytes);
    socket.flushSends();
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
  });

  it("reserves the framed byte size and releases it on the write callback", () => {
    const { host, admission, clients } = createHost({
      maxQueuedBytesPerPrincipal: 10_000,
      maxTotalQueuedBytes: 10_000,
    });
    const socket = new TestSocket();
    const ws = attach(clients, socket, "alice");
    let sentCallbacks = 0;

    expect(
      sendRaw(host, ws, "hello", () => {
        sentCallbacks += 1;
      }),
    ).toBe(true);
    expect(socket.sent).toEqual(["hello"]);
    // Framed size, not payload size: header plus worst-case deflate slack.
    expect(admission.outboundQueuedBytes("alice")).toBe(
      outboundFrameBytes(Buffer.byteLength("hello", "utf8")),
    );

    socket.flushSends();
    expect(sentCallbacks).toBe(1);
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
  });

  it("refuses and drops the recipient while an evicted socket's bytes are retained", () => {
    const { host, admission, clients } = createHost({
      maxQueuedBytesPerPrincipal: 1_000,
      maxTotalQueuedBytes: 1_000,
    });
    const congested = new TestSocket();
    const recipient = new TestSocket();
    const congestedWs = attach(clients, congested, "alice");
    const recipientWs = attach(clients, recipient, "alice");
    const prior = admission.tryReserveOutboundBytes(congestedWs, "alice", 900);
    expect(prior).not.toBeNull();

    // 900 + 214 crosses the principal budget: the congested socket is evicted
    // through the wired drop path, but its retained bytes still count, so the
    // frame is refused and the recipient is terminated for replay.
    expect(sendRaw(host, recipientWs, "x".repeat(200), undefined, 200)).toBe(false);
    expect(congested.terminations).toBe(1);
    expect(recipient.terminations).toBe(1);
    expect(recipient.sent).toEqual([]);
    expect(clients.has(congestedWs)).toBe(false);
    expect(clients.has(recipientWs)).toBe(false);
    expect(admission.outboundQueuedBytes("alice")).toBe(900);

    // Only the transport close frees the reservation.
    congested.emitClose();
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
  });

  it("terminates a recipient whose socket cap would be crossed without reserving", () => {
    const { host, admission, clients } = createHost({
      maxWebSocketOutboundBufferBytes: 100,
      maxQueuedBytesPerPrincipal: 10_000,
      maxTotalQueuedBytes: 10_000,
    });
    const socket = new TestSocket();
    const ws = attach(clients, socket, "alice");
    socket.bufferedAmount = 100;

    expect(sendRaw(host, ws, "hello")).toBe(false);
    expect(socket.terminations).toBe(1);
    expect(socket.sent).toEqual([]);
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
  });
});

describe("sendControlFrame aggregate accounting", () => {
  it("charges the unmasked control header plus payload and releases on the write callback", () => {
    const { host, admission, clients } = createHost({
      maxQueuedBytesPerPrincipal: 10_000,
      maxTotalQueuedBytes: 10_000,
    });
    const socket = new TestSocket();
    const ws = attach(clients, socket, "alice");
    const payload = Buffer.alloc(125, 1);

    expect(sendControlFrame(host, ws, "pong", payload)).toBe(true);
    expect(socket.pongs).toEqual([payload]);
    expect(socket.pings).toEqual([]);
    // RFC 6455 control frames are never compressed: header plus payload.
    expect(admission.outboundQueuedBytes("alice")).toBe(2 + payload.byteLength);

    socket.flushSends();
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
  });

  it("charges the 2-byte header for a zero-length control frame", () => {
    const { host, admission, clients } = createHost();
    const socket = new TestSocket();
    const ws = attach(clients, socket, "alice");

    expect(sendControlFrame(host, ws, "ping")).toBe(true);
    expect(socket.pings).toEqual([undefined]);
    expect(socket.pongs).toEqual([]);
    expect(admission.outboundQueuedBytes("alice")).toBe(2);
  });

  it("releases pending control-frame bytes on close when the callback never fires", () => {
    const { host, admission, clients } = createHost();
    const socket = new TestSocket();
    const ws = attach(clients, socket, "alice");

    expect(sendControlFrame(host, ws, "pong", Buffer.alloc(8))).toBe(true);
    expect(admission.outboundQueuedBytes("alice")).toBe(10);

    socket.emitClose();
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
    socket.flushSends();
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
  });

  it("refuses an over-budget pong while an evicted socket's bytes stay reserved", () => {
    const { host, admission, clients } = createHost({
      maxQueuedBytesPerPrincipal: 1_000,
      maxTotalQueuedBytes: 1_000,
    });
    const congested = new TestSocket();
    const recipient = new TestSocket();
    const congestedWs = attach(clients, congested, "alice");
    const recipientWs = attach(clients, recipient, "alice");
    expect(admission.tryReserveOutboundBytes(congestedWs, "alice", 990)).not.toBeNull();

    // 990 + 127 crosses the principal budget: the pong is refused, the
    // congested socket is evicted, and the recipient is terminated for replay
    // rather than queueing protocol output over the budget.
    expect(sendControlFrame(host, recipientWs, "pong", Buffer.alloc(125))).toBe(false);
    expect(congested.terminations).toBe(1);
    expect(recipient.terminations).toBe(1);
    expect(recipient.pongs).toEqual([]);
    expect(admission.outboundQueuedBytes("alice")).toBe(990);

    congested.emitClose();
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
  });

  it("drops a control frame that would cross the per-socket cap without reserving", () => {
    const { host, admission, clients } = createHost({
      maxWebSocketOutboundBufferBytes: 100,
      maxQueuedBytesPerPrincipal: 10_000,
      maxTotalQueuedBytes: 10_000,
    });
    const socket = new TestSocket();
    const ws = attach(clients, socket, "alice");
    socket.bufferedAmount = 100;

    expect(sendControlFrame(host, ws, "pong", Buffer.alloc(1))).toBe(false);
    expect(socket.terminations).toBe(1);
    expect(socket.pongs).toEqual([]);
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
  });
});

describe("dropWebSocketClient lease separation", () => {
  it("releases watch/baseline leases immediately but keeps queued bytes until close", () => {
    const { host, admission, clients } = createHost();
    const socket = new TestSocket();
    const ws = attach(clients, socket, "alice");
    admission.tryAdmitWatch(ws, "alice", "term-1");
    admission.tryAdmitBaseline(ws, "alice", "watch-1", 1, 64);
    const reservation = admission.tryReserveOutboundBytes(ws, "alice", 128);
    expect(reservation).not.toBeNull();

    dropWebSocketClient(host, ws);
    expect(socket.terminations).toBe(1);
    expect(admission.usage("alice")).toMatchObject({
      watches: 0,
      baselineStreams: 0,
      baselineBytes: 0,
    });
    expect(admission.outboundQueuedBytes("alice")).toBe(128);

    socket.emitClose();
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
    reservation!.release();
    expect(admission.outboundQueuedBytes("alice")).toBe(0);
  });
});
