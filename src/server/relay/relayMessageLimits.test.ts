import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { decodeRelayBinaryFrame, encodeRelayBinaryFrame } from "@/shared/remote/relayBinaryFrame";
import {
  relayBinaryMessageLimit,
  RELAY_WS_PAYLOAD_TOO_LARGE_REASON,
} from "@/shared/remote/relayLimits";
import {
  PORACODE_RELAY_PROTOCOL_VERSION,
  relayWebSocketPayloadLimit,
} from "@/shared/remote/relayProtocol";
import { startRelayHost } from "./relayHost";
import { RelayServer } from "./relayServer";

/**
 * Message-limit regressions for the relay transport (real sockets).
 *
 * A forwarded application WebSocket message rides INSIDE a control frame — a
 * protocol-3 binary envelope (+3 header bytes + UTF-8 channel id) or a JSON
 * `ws-data` text frame (whose escaping expands control characters 6×). The
 * regression these tests pin: one message at the top of the legal range used
 * to produce a control frame OVER the shared budget, and the send-failure path
 * TERMINATED the whole control connection — every channel and in-flight
 * request with it (probe: tmp/v2-production-review/relay-binary-review).
 *
 * Documented limit semantics under test:
 * - control-frame budget `CONTROL = relayWebSocketPayloadLimit(maxBodyBytes)`
 *   (unchanged; also fits base64 HTTP bodies ≤ 4/3 × maxBodyBytes),
 * - application messages: binary raw ≤ `relayBinaryMessageLimit(CONTROL)` (the
 *   worst-case envelope reserve, 128-byte id maximum), text measured by the
 *   EXACT framed byte length ≤ `CONTROL`,
 * - oversize is rejected on its channel only (1009 + explicit reason) while
 *   the control connection, other channels, and HTTP keep working — in BOTH
 *   directions.
 *
 * Everything here runs over real sockets (real `RelayServer`, real
 * `startRelayHost` on production default factories, real local origin, real ws
 * clients); the small limits come from the documented `maxBodyBytes` option so
 * the boundary bands are reachable without multi-megabyte messages.
 */

const MAX_BODY_BYTES = 300; // → CONTROL = ceil(300*4/3) + 1 MiB = 1_048_976
const CONTROL = relayWebSocketPayloadLimit(MAX_BODY_BYTES);
const APP_LIMIT = relayBinaryMessageLimit(CONTROL);

/** NUL, the worst-case JSON-escaping character (6 bytes framed). */
const NUL = String.fromCharCode(0);

it("pins the documented limit geometry of the shrunk test config", () => {
  expect(CONTROL).toBe(1_048_976);
  // The app bound reserves the protocol-3 envelope worst case (3 header bytes
  // + the codec's 128-UTF-8-byte id maximum), not the 36-byte UUID.
  expect(APP_LIMIT).toBe(CONTROL - 131);
});

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return data;
}

async function openWs(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function closeOf(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket never closed")), 10_000);
    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves with the next JSON text frame of the given type from the control. */
function nextFrame<T>(control: WebSocket, type: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} frame`)), 10_000);
    const onMessage = (data: RawData, isBinary: boolean): void => {
      if (isBinary) return;
      const frame = JSON.parse(String(data)) as { t?: string };
      if (frame.t === type) {
        clearTimeout(timer);
        control.off("message", onMessage);
        resolve(frame as T);
      }
    };
    control.on("message", onMessage);
    control.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Resolves with the next binary envelope the control receives, decoded. */
function nextEnvelope(control: WebSocket): Promise<{ id: string; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no binary envelope")), 10_000);
    const onMessage = (data: RawData, isBinary: boolean): void => {
      if (!isBinary) return;
      const decoded = decodeRelayBinaryFrame(toBuffer(data));
      if (decoded) {
        clearTimeout(timer);
        control.off("message", onMessage);
        resolve({ id: decoded.id, data: Buffer.from(decoded.data) });
      }
    };
    control.on("message", onMessage);
    control.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Resolves with the first message of the wanted type that `ws` receives. */
function nextMessage(ws: WebSocket, binary: true): Promise<Buffer>;
function nextMessage(ws: WebSocket, binary: false): Promise<string>;
function nextMessage(ws: WebSocket, binary: boolean): Promise<string | Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("message never arrived")), 10_000);
    const onMessage = (data: RawData, isBinary: boolean): void => {
      if (isBinary !== binary) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(binary ? toBuffer(data) : String(data));
    };
    ws.on("message", onMessage);
    ws.once("close", () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      reject(new Error("socket closed before the message arrived"));
    });
  });
}

/**
 * A raw registered host control that behaves like a minimal host app: acks
 * every `req` with an empty 200 (so visitor HTTP round-trips complete) and
 * echoes every ws-data payload (binary envelope or text frame) back to its
 * channel. Real relay, real ws clients — only the host endpoint is scripted.
 */
async function startRawStack(serverId: string): Promise<{ control: WebSocket; relayPort: number }> {
  const relay = new RelayServer({ host: "127.0.0.1", port: 0, maxBodyBytes: MAX_BODY_BYTES });
  const { port: relayPort } = await relay.start();
  cleanups.push(() => relay.dispose());
  const control = new WebSocket(`ws://127.0.0.1:${relayPort}/host`);
  cleanups.push(() => control.terminate());
  await openWs(control);
  control.send(
    JSON.stringify({
      t: "register",
      protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
      serverId,
      secret: "s",
    }),
  );
  await nextFrame(control, "registered");
  control.on("message", (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      const decoded = decodeRelayBinaryFrame(toBuffer(data));
      if (decoded) control.send(Buffer.from(encodeRelayBinaryFrame(decoded.id, decoded.data)));
      return;
    }
    const frame = JSON.parse(String(data)) as { t?: string; id?: string; data?: string };
    if (frame.t === "req" && frame.id) {
      control.send(JSON.stringify({ t: "res", id: frame.id, status: 200, headers: {}, body: "" }));
    } else if (frame.t === "ws-data" && frame.id && typeof frame.data === "string") {
      control.send(JSON.stringify({ t: "ws-data", id: frame.id, data: frame.data }));
    }
  });
  return { control, relayPort };
}

/** Opens a visitor and pairs it with the `ws-open` frame the relay minted for
 * it (listener attached before the socket connects, so none is missed). */
async function openChannel(
  control: WebSocket,
  relayPort: number,
  serverId: string,
): Promise<{ visitor: WebSocket; id: string }> {
  const opened = nextFrame<{ id: string }>(control, "ws-open");
  const visitor = new WebSocket(`ws://127.0.0.1:${relayPort}/s/${serverId}/ws`);
  cleanups.push(() => visitor.close());
  await openWs(visitor);
  return { visitor, id: (await opened).id };
}

async function openVisitor(relayPort: number, serverId: string): Promise<WebSocket> {
  const visitor = new WebSocket(`ws://127.0.0.1:${relayPort}/s/${serverId}/ws`);
  cleanups.push(() => visitor.close());
  await openWs(visitor);
  return visitor;
}

/** The offender must not take the shared control with it: the control is still
 * open, the healthy channel still round-trips, and HTTP still completes. */
async function expectStackAlive(
  control: WebSocket,
  healthy: WebSocket,
  relayPort: number,
  serverId: string,
): Promise<void> {
  let controlClosed = false;
  control.once("close", () => {
    controlClosed = true;
  });
  await delay(400);
  expect(controlClosed).toBe(false);
  expect(control.readyState).toBe(WebSocket.OPEN);

  // The raw host echoes ws-data back, so one healthy round-trip proves the
  // control still forwards both ways for a live channel.
  healthy.send("still-alive");
  await expect(nextMessage(healthy, false)).resolves.toBe("still-alive");

  const response = await fetch(`http://127.0.0.1:${relayPort}/s/${serverId}/api/alive`);
  expect(response.status).toBe(200);
}

describe("visitor→host message limits (real relay, raw registered control)", () => {
  it("admits a binary payload at exactly the app limit and rejects one byte past it on that channel only", async () => {
    const { control, relayPort } = await startRawStack("srv-lim-bin");
    const healthy = await openChannel(control, relayPort, "srv-lim-bin");
    const offender = await openChannel(control, relayPort, "srv-lim-bin");
    expect(healthy.id).not.toBe(offender.id);

    // Exactly at the documented bound: delivered byte-exact inside the envelope.
    const envelopePromise = nextEnvelope(control);
    offender.visitor.send(Buffer.alloc(APP_LIMIT, 0xcd));
    const envelope = await envelopePromise;
    expect(envelope.id).toBe(offender.id);
    expect(envelope.data.length).toBe(APP_LIMIT);
    expect(envelope.data[0]).toBe(0xcd);

    // One byte past: the visitor channel is closed 1009 with the explicit
    // reason while the control connection and the healthy channel survive.
    const offenderClosed = closeOf(offender.visitor);
    offender.visitor.send(Buffer.alloc(APP_LIMIT + 1, 0xcd));
    await expect(offenderClosed).resolves.toEqual({
      code: 1009,
      reason: RELAY_WS_PAYLOAD_TOO_LARGE_REASON,
    });
    await expectStackAlive(control, healthy.visitor, relayPort, "srv-lim-bin");
  }, 30_000);

  it("admits text whose exact framed length equals the control budget and rejects one byte past it", async () => {
    const { control, relayPort } = await startRawStack("srv-lim-text");
    const healthy = await openChannel(control, relayPort, "srv-lim-text");
    const offender = await openChannel(control, relayPort, "srv-lim-text");

    // Exact boundary: `{"t":"ws-data","id":"<id>","data":"<payload>"}` measured
    // in UTF-8 bytes is exactly CONTROL.
    const framedOverhead = (id: string): number =>
      Buffer.byteLength(JSON.stringify({ t: "ws-data", id, data: "" }));
    const atLimitPayload = "a".repeat(CONTROL - framedOverhead(offender.id));
    const framePromise = nextFrame<{ t: string; id: string; data: string }>(control, "ws-data");
    offender.visitor.send(atLimitPayload);
    const frame = await framePromise;
    expect(frame.id).toBe(offender.id);
    expect(frame.data).toBe(atLimitPayload);

    const offenderClosed = closeOf(offender.visitor);
    offender.visitor.send("a".repeat(CONTROL - framedOverhead(offender.id) + 1));
    await expect(offenderClosed).resolves.toEqual({
      code: 1009,
      reason: RELAY_WS_PAYLOAD_TOO_LARGE_REASON,
    });
    await expectStackAlive(control, healthy.visitor, relayPort, "srv-lim-text");
  }, 30_000);

  it("measures worst-case JSON escaping exactly: NUL text at the boundary delivers, past it the channel dies with 1009", async () => {
    const { control, relayPort } = await startRawStack("srv-lim-nul");
    const healthy = await openChannel(control, relayPort, "srv-lim-nul");
    const offender = await openChannel(control, relayPort, "srv-lim-nul");

    // Each NUL escapes to a 6-byte sequence under JSON.stringify: the exact
    // boundary count of NULs whose framed ws-data frame still equals CONTROL.
    const base = Buffer.byteLength(JSON.stringify({ t: "ws-data", id: offender.id, data: "" }));
    const maxNuls = Math.floor((CONTROL - base) / 6);
    const framePromise = nextFrame<{ t: string; id: string; data: string }>(control, "ws-data");
    offender.visitor.send(NUL.repeat(maxNuls));
    const frame = await framePromise;
    expect(frame.id).toBe(offender.id);
    expect(frame.data.length).toBe(maxNuls);
    expect(frame.data).toBe(NUL.repeat(maxNuls));

    const offenderClosed = closeOf(offender.visitor);
    offender.visitor.send(NUL.repeat(maxNuls + 1));
    await expect(offenderClosed).resolves.toEqual({
      code: 1009,
      reason: RELAY_WS_PAYLOAD_TOO_LARGE_REASON,
    });
    await expectStackAlive(control, healthy.visitor, relayPort, "srv-lim-nul");
  }, 30_000);
});

/**
 * Host→visitor direction and whole-host isolation over the FULL real stack:
 * real `startRelayHost` on production default socket factories and a real
 * local origin. The oversized sender is the local server itself.
 */
describe("host→visitor message limits (real host, default factories)", () => {
  interface FullStack {
    relayPort: number;
    localConnections: WebSocket[];
    localFrames: Array<{ data: Buffer; isBinary: boolean }>;
  }

  async function startFullStack(
    serverId: string,
    options: { maxWebSocketPayloadBytes?: number } = {},
  ): Promise<FullStack> {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      maxBodyBytes: MAX_BODY_BYTES,
      ...options,
    });
    const { port: relayPort } = await relay.start();
    cleanups.push(() => relay.dispose());

    const localConnections: WebSocket[] = [];
    const localFrames: Array<{ data: Buffer; isBinary: boolean }> = [];
    const server: HttpServer = createHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.on("message", (data: RawData, isBinary: boolean) => {
          localFrames.push({ data: toBuffer(data), isBinary });
        });
        localConnections.push(ws);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const localPort = (server.address() as AddressInfo).port;
    cleanups.push(async () => {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("host never registered")), 10_000);
      timer.unref?.();
      cleanups.push(() => clearTimeout(timer));
      const handle = startRelayHost({
        relayUrl: `ws://127.0.0.1:${relayPort}/host`,
        serverId,
        secret: "s",
        localHttpUrl: `http://127.0.0.1:${localPort}`,
        maxBodyBytes: MAX_BODY_BYTES,
        ...options,
        onRegistered: () => {
          clearTimeout(timer);
          resolve();
        },
      });
      cleanups.push(() => handle.dispose());
    });
    return { relayPort, localConnections, localFrames };
  }

  /** The host must still be registered and serving: a fresh visitor channel
   * works both ways against the real local origin, and HTTP round-trips. */
  async function expectFullStackAlive(stack: FullStack, serverId: string): Promise<void> {
    const before = stack.localConnections.length;
    const fresh = await openVisitor(stack.relayPort, serverId);
    await vi.waitFor(() => expect(stack.localConnections.length).toBeGreaterThan(before), {
      timeout: 10_000,
      interval: 10,
    });
    const local = stack.localConnections[stack.localConnections.length - 1]!;

    fresh.send("fresh-channel");
    await vi.waitFor(
      () => {
        const texts = stack.localFrames
          .filter((frame) => !frame.isBinary)
          .map((frame) => frame.data.toString("utf8"));
        expect(texts).toContain("fresh-channel");
      },
      { timeout: 10_000, interval: 10 },
    );
    local.send("fresh-echo");
    await expect(nextMessage(fresh, false)).resolves.toBe("fresh-echo");

    const response = await fetch(`http://127.0.0.1:${stack.relayPort}/s/${serverId}/api/alive`);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok");
  }

  it.each([
    ["visitor", "binary"],
    ["visitor", "text"],
    ["origin", "binary"],
    ["origin", "text"],
  ] as const)(
    "isolates %s %s overflow when inbound limit is smaller than outbound budget",
    async (direction, kind) => {
      const serverId = "srv-low-inbound";
      const stack = await startFullStack(serverId, { maxWebSocketPayloadBytes: 1024 });
      const healthy = await openVisitor(stack.relayPort, serverId);
      const offender = await openVisitor(stack.relayPort, serverId);
      await vi.waitFor(() => expect(stack.localConnections).toHaveLength(2));
      const [healthyLocal, offenderLocal] = stack.localConnections;
      const offenderClosed = closeOf(offender);
      const payload = kind === "binary" ? Buffer.alloc(1024, 0xef) : NUL.repeat(200);
      (direction === "visitor" ? offender : offenderLocal!).send(payload);
      await expect(offenderClosed).resolves.toEqual({
        code: 1009,
        reason: RELAY_WS_PAYLOAD_TOO_LARGE_REASON,
      });
      const healthyEcho = nextMessage(healthy, false);
      healthyLocal!.send("healthy-still-alive");
      await expect(healthyEcho).resolves.toBe("healthy-still-alive");
      await expectFullStackAlive(stack, serverId);
    },
  );

  it("delivers a local binary payload at exactly the app limit and rejects one byte past it on that channel only", async () => {
    const stack = await startFullStack("srv-lim-host-bin");
    const healthy = await openVisitor(stack.relayPort, "srv-lim-host-bin");
    const offender = await openVisitor(stack.relayPort, "srv-lim-host-bin");
    await vi.waitFor(() => expect(stack.localConnections.length).toBe(2), {
      timeout: 10_000,
      interval: 10,
    });
    const [healthyLocal, offenderLocal] = stack.localConnections;

    // At the documented bound the visitor receives the bytes exactly.
    const atLimit = nextMessage(offender, true);
    offenderLocal!.send(Buffer.alloc(APP_LIMIT, 0xef));
    const delivered = await atLimit;
    expect(delivered.length).toBe(APP_LIMIT);
    expect(delivered[0]).toBe(0xef);

    // One byte past: this channel closes 1009 with the explicit reason while
    // the host control connection, the healthy channel, and HTTP survive.
    const offenderClosed = closeOf(offender);
    const offenderLocalClosed = closeOf(offenderLocal!);
    offenderLocal!.send(Buffer.alloc(APP_LIMIT + 1, 0xef));
    await expect(offenderClosed).resolves.toEqual({
      code: 1009,
      reason: RELAY_WS_PAYLOAD_TOO_LARGE_REASON,
    });
    await expect(offenderLocalClosed).resolves.toBeDefined();

    let healthyClosed = false;
    healthy.once("close", () => {
      healthyClosed = true;
    });
    const healthyEcho = nextMessage(healthy, false);
    healthyLocal!.send("healthy-still-alive");
    await expect(healthyEcho).resolves.toBe("healthy-still-alive");
    expect(healthyClosed).toBe(false);

    await expectFullStackAlive(stack, "srv-lim-host-bin");
  }, 30_000);

  it("rejects worst-case escaped local text past the budget on that channel only and keeps the host serving", async () => {
    const stack = await startFullStack("srv-lim-host-text");
    const healthy = await openVisitor(stack.relayPort, "srv-lim-host-text");
    const offender = await openVisitor(stack.relayPort, "srv-lim-host-text");
    await vi.waitFor(() => expect(stack.localConnections.length).toBe(2), {
      timeout: 10_000,
      interval: 10,
    });
    const [healthyLocal, offenderLocal] = stack.localConnections;

    // Plain text comfortably inside the framed budget delivers exactly.
    const underBudget = "a".repeat(APP_LIMIT - 2000);
    const underDelivered = nextMessage(offender, false);
    offenderLocal!.send(underBudget);
    await expect(underDelivered).resolves.toBe(underBudget);

    // NUL control characters expand 6x under JSON escaping: the framed frame
    // is far past the control budget even though the raw text is inside it.
    const rawNuls = Math.floor((CONTROL - 200) / 2);
    const offenderClosed = closeOf(offender);
    offenderLocal!.send(NUL.repeat(rawNuls));
    await expect(offenderClosed).resolves.toEqual({
      code: 1009,
      reason: RELAY_WS_PAYLOAD_TOO_LARGE_REASON,
    });

    let healthyClosed = false;
    healthy.once("close", () => {
      healthyClosed = true;
    });
    const healthyEcho = nextMessage(healthy, false);
    healthyLocal!.send("healthy-still-alive");
    await expect(healthyEcho).resolves.toBe("healthy-still-alive");
    expect(healthyClosed).toBe(false);

    await expectFullStackAlive(stack, "srv-lim-host-text");
  }, 30_000);
});
