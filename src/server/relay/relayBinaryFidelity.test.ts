import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { decodeRelayBinaryFrame, encodeRelayBinaryFrame } from "@/shared/remote/relayBinaryFrame";
import { PORACODE_RELAY_PROTOCOL_VERSION } from "@/shared/remote/relayProtocol";
import { RelayServer } from "./relayServer";
import { startRelayHost, type RelaySocket } from "./relayHost";

/** Every byte value 0..255 — NUL, ASCII, and bytes that are invalid UTF-8 on
 * their own (bare continuation bytes, 0xFF/0xFE). A transport that touches the
 * payload as text cannot round-trip this. */
const ALL_BYTES = Uint8Array.from({ length: 256 }, (_, i) => i);

/** Wire payload: strings travel as TEXT frames, Buffers as BINARY frames. */
type WirePayload = string | Buffer;

function bytesOf(payload: WirePayload): Buffer {
  return typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
}

interface ReceivedFrame {
  readonly data: Buffer;
  readonly isBinary: boolean;
}

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return data;
}

function recordFrames(ws: WebSocket): ReceivedFrame[] {
  const received: ReceivedFrame[] = [];
  ws.on("message", (data: RawData, isBinary: boolean) => {
    received.push({ data: toBuffer(data), isBinary });
  });
  return received;
}

async function openWs(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function waitForLength(frames: ReceivedFrame[], length: number): Promise<void> {
  return vi.waitFor(() => expect(frames).toHaveLength(length), { timeout: 10_000, interval: 10 });
}

/**
 * Real-socket binary fidelity: a real `RelayServer`, a real relay host on its
 * PRODUCTION default socket factories (the same ws paths visitors and the
 * local server exercise), a real local origin, and a real visitor client.
 * The scratch probe under tmp/v2-production-review/relay-fidelity proved the
 * pre-fix corruption with wrappers that coerced payloads themselves; every
 * assertion here goes through unmodified production transport code.
 */
describe("relay binary ws fidelity (real sockets)", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  /** Local origin whose WebSocket upgrade can be delayed, so the host's
   * pre-open queue is observed on a real socket. The frame recorder attaches
   * inside the upgrade callback, before any queued frame can flush. */
  async function startLocalOrigin(delayUpgradeMs = 0): Promise<{
    httpUrl: string;
    connections: WebSocket[];
    frames: ReceivedFrame[];
  }> {
    const connections: WebSocket[] = [];
    const frames: ReceivedFrame[] = [];
    const server: HttpServer = createHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      const accept = () =>
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.on("message", (data: RawData, isBinary: boolean) => {
            frames.push({ data: toBuffer(data), isBinary });
          });
          connections.push(ws);
        });
      if (delayUpgradeMs > 0) setTimeout(accept, delayUpgradeMs);
      else accept();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    cleanups.push(async () => {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.closeIdleConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    return { httpUrl: `http://127.0.0.1:${port}`, connections, frames };
  }

  async function startStack(delayLocalUpgradeMs = 0): Promise<{
    visitorWsBase: string;
    connections: WebSocket[];
    frames: ReceivedFrame[];
  }> {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const local = await startLocalOrigin(delayLocalUpgradeMs);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("host never registered")), 10_000);
      timer.unref?.();
      cleanups.push(() => clearTimeout(timer));
      const handle = startRelayHost({
        relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
        serverId: "srv-bin",
        secret: "bin-secret",
        localHttpUrl: local.httpUrl,
        onRegistered: () => {
          clearTimeout(timer);
          resolve();
        },
      });
      cleanups.push(() => handle.dispose());
    });
    return {
      visitorWsBase: `ws://127.0.0.1:${relayInfo.port}/s/srv-bin`,
      connections: local.connections,
      frames: local.frames,
    };
  }

  async function openVisitor(visitorWsBase: string): Promise<WebSocket> {
    const visitor = new WebSocket(`${visitorWsBase}/ws`);
    cleanups.push(() => visitor.close());
    await openWs(visitor);
    return visitor;
  }

  async function firstLocalConnection(connections: WebSocket[]): Promise<WebSocket> {
    await vi.waitFor(() => expect(connections.length).toBeGreaterThan(0), {
      timeout: 10_000,
      interval: 10,
    });
    return connections[0]!;
  }

  it("preserves visitor→local binary frames byte-for-byte, typed binary, incl. empty", async () => {
    const stack = await startStack();
    const visitor = await openVisitor(stack.visitorWsBase);
    await firstLocalConnection(stack.connections);
    const atLocal = stack.frames;

    visitor.send(Buffer.from(ALL_BYTES));
    visitor.send(Buffer.alloc(0));
    visitor.send("héllo ✅ text");

    await waitForLength(atLocal, 3);
    expect(atLocal[0]).toMatchObject({ isBinary: true });
    expect(atLocal[0]!.data.equals(Buffer.from(ALL_BYTES))).toBe(true);
    expect(atLocal[1]).toMatchObject({ isBinary: true });
    expect(atLocal[1]!.data.length).toBe(0);
    expect(atLocal[2]).toMatchObject({ isBinary: false });
    expect(atLocal[2]!.data.equals(Buffer.from("héllo ✅ text", "utf8"))).toBe(true);
  }, 20_000);

  it("preserves local→visitor binary frames byte-for-byte, typed binary, incl. empty", async () => {
    const stack = await startStack();
    const visitor = await openVisitor(stack.visitorWsBase);
    const localWs = await firstLocalConnection(stack.connections);
    const atVisitor = recordFrames(visitor);

    localWs.send(Buffer.from(ALL_BYTES));
    localWs.send(Buffer.alloc(0));
    localWs.send("héllo ✅ text");

    await waitForLength(atVisitor, 3);
    expect(atVisitor[0]).toMatchObject({ isBinary: true });
    expect(atVisitor[0]!.data.equals(Buffer.from(ALL_BYTES))).toBe(true);
    expect(atVisitor[1]).toMatchObject({ isBinary: true });
    expect(atVisitor[1]!.data.length).toBe(0);
    expect(atVisitor[2]).toMatchObject({ isBinary: false });
    expect(atVisitor[2]!.data.equals(Buffer.from("héllo ✅ text", "utf8"))).toBe(true);
  }, 20_000);

  it("keeps text/binary alternation and ordering intact in both directions at once", async () => {
    const stack = await startStack();
    const visitor = await openVisitor(stack.visitorWsBase);
    const localWs = await firstLocalConnection(stack.connections);
    const atLocal = stack.frames;
    const atVisitor = recordFrames(visitor);

    const visitorSequence: Array<[boolean, WirePayload]> = [
      [false, "v-text-1"],
      [true, Buffer.from(ALL_BYTES)],
      [false, ""],
      [true, Buffer.alloc(0)],
      [false, "v-text-2 ✅"],
    ];
    const localSequence: Array<[boolean, WirePayload]> = [
      [true, Buffer.from([0xc3, 0x28, 0xff])],
      [false, "l-text-1"],
      [true, Buffer.alloc(0)],
      [false, "l-text-2"],
    ];
    for (const [, payload] of visitorSequence) visitor.send(payload);
    for (const [, payload] of localSequence) localWs.send(payload);

    await Promise.all([
      waitForLength(atLocal, visitorSequence.length),
      waitForLength(atVisitor, localSequence.length),
    ]);
    for (const [index, [isBinary, payload]] of visitorSequence.entries()) {
      expect(atLocal[index]).toMatchObject({ isBinary });
      expect(atLocal[index]!.data.equals(bytesOf(payload))).toBe(true);
    }
    for (const [index, [isBinary, payload]] of localSequence.entries()) {
      expect(atVisitor[index]).toMatchObject({ isBinary });
      expect(atVisitor[index]!.data.equals(bytesOf(payload))).toBe(true);
    }
  }, 20_000);

  it("flushes mixed text/binary frames queued before the local socket opened, in order", async () => {
    // The local origin holds its upgrade for 300ms, so frames the visitor
    // sends immediately land in the host's pre-open queue.
    const stack = await startStack(300);
    const visitor = await openVisitor(stack.visitorWsBase);

    visitor.send("queued-text");
    visitor.send(Buffer.from(ALL_BYTES));
    visitor.send(Buffer.alloc(0));

    const atLocal = stack.frames;
    await firstLocalConnection(stack.connections);
    await waitForLength(atLocal, 3);
    expect(atLocal.map((frame) => frame.isBinary)).toEqual([false, true, true]);
    expect(atLocal[0]!.data.equals(Buffer.from("queued-text", "utf8"))).toBe(true);
    expect(atLocal[1]!.data.equals(Buffer.from(ALL_BYTES))).toBe(true);
    expect(atLocal[2]!.data.length).toBe(0);
  }, 20_000);
});

/**
 * Server-side binary ws-data over a REAL relay with a raw host control socket:
 * the relay must translate the protocol-3 binary envelope both ways, drop
 * malformed envelopes without harming live channels, and keep serving.
 */
describe("relay server binary ws-data (real relay, raw host control)", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function openRawHost(relayPort: number, serverId: string): Promise<WebSocket> {
    const control = new WebSocket(`ws://127.0.0.1:${relayPort}/host`);
    cleanups.push(() => control.close());
    await openWs(control);
    control.send(
      JSON.stringify({
        t: "register",
        protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
        serverId,
        secret: "raw-secret",
      }),
    );
    const registered = await new Promise<RawData>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no registered frame")), 5_000);
      control.once("message", (data: RawData, isBinary: boolean) => {
        if (!isBinary) {
          clearTimeout(timer);
          resolve(data);
        }
      });
      control.once("error", reject);
    });
    expect(JSON.parse(String(registered))).toMatchObject({ t: "registered", serverId });
    return control;
  }

  /** Waits for the `ws-open` frame the relay mints for the next visitor. */
  async function awaitWsOpen(control: WebSocket): Promise<{ id: string }> {
    return await new Promise<{ id: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no ws-open frame")), 5_000);
      const onMessage = (data: RawData, isBinary: boolean): void => {
        if (isBinary) return;
        const frame = JSON.parse(String(data)) as { t?: string; id?: string };
        if (frame.t === "ws-open" && frame.id) {
          clearTimeout(timer);
          control.off("message", onMessage);
          resolve(frame as { id: string });
        }
      };
      control.on("message", onMessage);
      control.once("error", reject);
    });
  }

  async function startRelay(): Promise<number> {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    return relayInfo.port;
  }

  it("carries binary and text both directions through the envelope without loss", async () => {
    const relayPort = await startRelay();
    const control = await openRawHost(relayPort, "srv-raw");
    const visitor = new WebSocket(`ws://127.0.0.1:${relayPort}/s/srv-raw/ws?ticket=t`);
    cleanups.push(() => visitor.close());
    await openWs(visitor);
    const atVisitor = recordFrames(visitor);
    const wsOpen = await awaitWsOpen(control);

    // Host → relay → visitor: a binary envelope arrives as a binary ws frame,
    // the JSON text frame stays text.
    control.send(Buffer.from(encodeRelayBinaryFrame(wsOpen.id, ALL_BYTES)));
    control.send(JSON.stringify({ t: "ws-data", id: wsOpen.id, data: "plain text ✅" }));

    // Visitor → relay → host: binary rides the envelope, text stays a JSON frame.
    const atHost: Array<{ isBinary: boolean; bytes: Buffer }> = [];
    control.on("message", (data: RawData, isBinary: boolean) => {
      atHost.push({ isBinary, bytes: toBuffer(data) });
    });
    visitor.send(Buffer.from(ALL_BYTES));
    visitor.send(Buffer.alloc(0));
    visitor.send("visitor text ✅");

    await waitForLength(atVisitor, 2);
    expect(atVisitor[0]).toMatchObject({ isBinary: true });
    expect(atVisitor[0]!.data.equals(Buffer.from(ALL_BYTES))).toBe(true);
    expect(atVisitor[1]).toMatchObject({ isBinary: false });
    expect(atVisitor[1]!.data.equals(Buffer.from("plain text ✅", "utf8"))).toBe(true);

    await vi.waitFor(() => expect(atHost).toHaveLength(3), { timeout: 10_000, interval: 10 });
    expect(atHost[0]).toMatchObject({ isBinary: true });
    const decoded = decodeRelayBinaryFrame(atHost[0]!.bytes);
    expect(decoded?.id).toBe(wsOpen.id);
    expect(Buffer.from(decoded!.data).equals(Buffer.from(ALL_BYTES))).toBe(true);
    expect(atHost[1]).toMatchObject({ isBinary: true });
    const decodedEmpty = decodeRelayBinaryFrame(atHost[1]!.bytes);
    expect(decodedEmpty?.id).toBe(wsOpen.id);
    expect(decodedEmpty?.data.length).toBe(0);
    expect(atHost[2]).toMatchObject({ isBinary: false });
    expect(JSON.parse(String(atHost[2]!.bytes))).toEqual({
      t: "ws-data",
      id: wsOpen.id,
      data: "visitor text ✅",
    });
  }, 20_000);

  it("drops malformed and unknown binary control frames and keeps live channels working", async () => {
    const relayPort = await startRelay();
    const control = await openRawHost(relayPort, "srv-raw-garbage");
    const visitor = new WebSocket(`ws://127.0.0.1:${relayPort}/s/srv-raw-garbage/ws?ticket=t`);
    cleanups.push(() => visitor.close());
    await openWs(visitor);
    const atVisitor = recordFrames(visitor);
    const wsOpen = await awaitWsOpen(control);

    const wrongKind = Buffer.from(encodeRelayBinaryFrame(wsOpen.id, ALL_BYTES));
    wrongKind[0] = 2;
    control.send(wrongKind);
    control.send(Buffer.from([1, 0, 40, 111, 110, 101]));
    control.send(Buffer.from([1, 0, 2, 0xd8, 0x00, 65]));
    control.send(Buffer.from(encodeRelayBinaryFrame("no-such-channel", ALL_BYTES)));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(atVisitor).toHaveLength(0);

    // The relay survived the garbage: the live channel still works both ways.
    control.send(JSON.stringify({ t: "ws-data", id: wsOpen.id, data: "still-alive" }));
    visitor.send(Buffer.from([1, 2, 3]));
    await waitForLength(atVisitor, 1);
    expect(atVisitor[0]).toMatchObject({ isBinary: false });
    expect(atVisitor[0]!.data.equals(Buffer.from("still-alive", "utf8"))).toBe(true);
  }, 20_000);
});

/**
 * Host-side framing over injectable sockets that mirror ws exactly: text
 * frames arrive as strings on `onmessage`, binary frames as Buffers. These
 * pin the envelope framing, malformed-frame tolerance, queue bounds, and the
 * text-only droppable-stream rule at the channel level.
 */
describe("relay host binary control frames (unit)", () => {
  interface RecordingSocket extends RelaySocket {
    readonly sent: Array<string | Uint8Array>;
    readyState: number;
    bufferedAmount: number;
    closed: boolean;
  }

  function recordingSocket(readyState = 1): RecordingSocket {
    return {
      sent: [],
      readyState,
      bufferedAmount: 0,
      closed: false,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(data) {
        this.sent.push(data);
      },
      close() {
        this.closed = true;
      },
    };
  }

  function controlFrame(data: unknown): { data: string } {
    return { data: JSON.stringify(data) };
  }

  /** Mirrors ws `onmessage` for a binary frame: a Buffer, not a string. */
  function binaryEvent(bytes: Uint8Array): { data: Buffer } {
    return { data: Buffer.from(bytes) };
  }

  function sentText(socket: RecordingSocket): Array<Record<string, unknown>> {
    return socket.sent
      .filter((data): data is string => typeof data === "string")
      .map((data) => JSON.parse(data) as Record<string, unknown>);
  }

  function sentBinary(socket: RecordingSocket): Uint8Array[] {
    return socket.sent.filter((data): data is Uint8Array => typeof data !== "string");
  }

  const baseOptions = {
    relayUrl: "ws://relay.test/host",
    serverId: "srv-1",
    secret: "secret",
    localHttpUrl: "http://127.0.0.1:38987",
  };

  it("frames outbound binary local messages as envelopes, never as coerced text", () => {
    const control = recordingSocket();
    const local = recordingSocket();
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      wsFactory: () => local,
    });
    control.onopen?.();
    control.onmessage?.(controlFrame({ t: "ws-open", id: "ch-1", path: "/ws" }));

    local.onmessage?.(binaryEvent(ALL_BYTES));
    local.onmessage?.(binaryEvent(new Uint8Array(0)));

    const envelopes = sentBinary(control);
    expect(envelopes).toHaveLength(2);
    const decoded = decodeRelayBinaryFrame(envelopes[0]!);
    expect(decoded?.id).toBe("ch-1");
    expect(Buffer.from(decoded!.data).equals(Buffer.from(ALL_BYTES))).toBe(true);
    const decodedEmpty = decodeRelayBinaryFrame(envelopes[1]!);
    expect(decodedEmpty?.id).toBe("ch-1");
    expect(decodedEmpty?.data.length).toBe(0);
    // Binary never rides the JSON ws-data frame (which would coerce bytes).
    expect(sentText(control).filter((frame) => frame.t === "ws-data")).toEqual([]);
    handle.dispose();
  });

  it("routes inbound envelopes to the local socket with bytes and type intact", () => {
    const control = recordingSocket();
    const local = recordingSocket();
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      wsFactory: () => local,
    });
    control.onopen?.();
    control.onmessage?.(controlFrame({ t: "ws-open", id: "ch-1", path: "/ws" }));

    control.onmessage?.({ data: Buffer.from(encodeRelayBinaryFrame("ch-1", ALL_BYTES)) });
    control.onmessage?.({ data: Buffer.from(encodeRelayBinaryFrame("ch-1", new Uint8Array(0))) });

    expect(local.sent).toHaveLength(2);
    expect(local.sent[0]).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(local.sent[0] as Uint8Array).equals(Buffer.from(ALL_BYTES))).toBe(true);
    expect(local.sent[1]).toBeInstanceOf(Uint8Array);
    expect((local.sent[1] as Uint8Array).byteLength).toBe(0);
    handle.dispose();
  });

  it("drops malformed or unknown-channel envelopes and keeps the channel working", () => {
    const control = recordingSocket();
    const local = recordingSocket();
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      wsFactory: () => local,
    });
    control.onopen?.();
    control.onmessage?.(controlFrame({ t: "ws-open", id: "ch-1", path: "/ws" }));

    const wrongKind = Buffer.from(encodeRelayBinaryFrame("ch-1", ALL_BYTES));
    wrongKind[0] = 9;
    control.onmessage?.({ data: wrongKind });
    control.onmessage?.({ data: Buffer.from([1, 0, 40, 111]) });
    control.onmessage?.({ data: Buffer.from([1, 0, 2, 0xd8, 0x00, 65]) });
    control.onmessage?.({ data: Buffer.from(encodeRelayBinaryFrame("other", ALL_BYTES)) });
    expect(local.sent).toEqual([]);

    // Text frames — including non-JSON application text — still flow.
    control.onmessage?.(controlFrame({ t: "ws-data", id: "ch-1", data: "hello" }));
    control.onmessage?.(controlFrame({ t: "ws-data", id: "ch-1", data: "not json {" }));
    expect(local.sent).toEqual(["hello", "not json {"]);
    expect(local.closed).toBe(false);
    handle.dispose();
  });

  it("applies the pre-open queue cap to binary frames", () => {
    const control = recordingSocket();
    const local = recordingSocket(0);
    const handle = startRelayHost({
      ...baseOptions,
      maxWebSocketOutboundBufferBytes: 64,
      socketFactory: () => control,
      wsFactory: () => local,
    });
    control.onopen?.();
    control.onmessage?.(controlFrame({ t: "ws-open", id: "ch-1", path: "/ws" }));
    control.onmessage?.({
      data: Buffer.from(encodeRelayBinaryFrame("ch-1", new Uint8Array(100))),
    });

    expect(local.closed).toBe(true);
    expect(sentText(control)).toContainEqual(
      expect.objectContaining({ t: "ws-close", id: "ch-1", reason: "local socket error" }),
    );
    handle.dispose();
  });

  it("queues mixed text/binary frames pre-open and flushes them in order", () => {
    const control = recordingSocket();
    const local = recordingSocket(0);
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      wsFactory: () => local,
    });
    control.onopen?.();
    control.onmessage?.(controlFrame({ t: "ws-open", id: "ch-1", path: "/ws" }));
    control.onmessage?.({ data: Buffer.from(encodeRelayBinaryFrame("ch-1", ALL_BYTES)) });
    control.onmessage?.(controlFrame({ t: "ws-data", id: "ch-1", data: "text-1" }));
    control.onmessage?.({ data: Buffer.from(encodeRelayBinaryFrame("ch-1", new Uint8Array(0))) });
    expect(local.sent).toEqual([]);

    local.onopen?.();
    expect(local.sent).toHaveLength(3);
    expect(local.sent[0]).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(local.sent[0] as Uint8Array).equals(Buffer.from(ALL_BYTES))).toBe(true);
    expect(local.sent[1]).toBe("text-1");
    expect(local.sent[2]).toBeInstanceOf(Uint8Array);
    expect((local.sent[2] as Uint8Array).byteLength).toBe(0);
    handle.dispose();
  });

  it("never drops binary frames under the droppable-stream soft cap", () => {
    const control = recordingSocket();
    const local = recordingSocket();
    const handle = startRelayHost({
      ...baseOptions,
      maxWebSocketOutboundBufferBytes: 512,
      socketFactory: () => control,
      wsFactory: () => local,
    });
    control.onopen?.();
    control.onmessage?.(controlFrame({ t: "ws-open", id: "ch-1", path: "/ws" }));
    control.bufferedAmount = 300;

    local.onmessage?.(binaryEvent(Buffer.from([0, 159, 146, 150, 0xff])));
    const envelopes = sentBinary(control);
    expect(envelopes).toHaveLength(1);
    const decoded = decodeRelayBinaryFrame(envelopes[0]!);
    expect(decoded?.id).toBe("ch-1");
    expect(Buffer.from(decoded!.data).equals(Buffer.from([0, 159, 146, 150, 0xff]))).toBe(true);
    expect(control.closed).toBe(false);
    expect(local.closed).toBe(false);
    handle.dispose();
  });

  it("drops a ws-open whose channel id the binary envelope could not carry", () => {
    // A hostile relay opens a channel with an id beyond the envelope's 128
    // UTF-8-byte bound. The schema must reject the frame before any channel
    // exists — otherwise the first binary local event would throw inside the
    // encode and reach the process as an unhandled exception.
    const control = recordingSocket();
    const dialed: RecordingSocket[] = [];
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      wsFactory: () => {
        const local = recordingSocket();
        dialed.push(local);
        return local;
      },
    });
    control.onopen?.();
    control.onmessage?.(controlFrame({ t: "ws-open", id: "é".repeat(100), path: "/ws" }));
    control.onmessage?.(controlFrame({ t: "ws-open", id: "\ud800", path: "/ws" }));
    expect(dialed).toHaveLength(0);
    // Nothing but the register frame went out: the bad channels never existed.
    expect(sentText(control).map((frame) => frame.t)).toEqual(["register"]);

    // The host is unharmed and still serves a well-formed channel afterwards.
    control.onmessage?.(controlFrame({ t: "ws-open", id: "ch-1", path: "/ws" }));
    expect(dialed).toHaveLength(1);
    control.onmessage?.(controlFrame({ t: "ws-data", id: "ch-1", data: "ok" }));
    expect(dialed[0]!.sent).toEqual(["ok"]);
    handle.dispose();
  });
});

/**
 * Protocol 3 mixed-version compatibility. Binary ws-data changes the meaning
 * of control-socket traffic in a way a protocol-2 peer cannot preserve, so
 * mixed pairing must fail registration loudly instead of corrupting bytes.
 */
describe("relay protocol 3 mixed-version compatibility", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  it("pins the wire version at 3 for binary ws-data fidelity", () => {
    expect(PORACODE_RELAY_PROTOCOL_VERSION).toBe(3);
  });

  it("rejects a v2 host registration instead of corrupting binary traffic", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      hostRegistrationTimeoutMs: 200,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());

    const control = new WebSocket(`ws://127.0.0.1:${relayInfo.port}/host`);
    cleanups.push(() => control.terminate());
    await openWs(control);
    control.send(
      JSON.stringify({ t: "register", protocolVersion: 2, serverId: "srv-v2", secret: "s" }),
    );

    // No `registered` frame ever arrives; the relay times the unregistered
    // control out exactly like any socket that never sent a valid register.
    const closed = new Promise<{ code: number; reason: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("v2 control was never closed")), 5_000);
      control.once("close", (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
      control.once("error", reject);
    });
    await expect(closed).resolves.toEqual({ code: 1008, reason: "host must register first" });
    const probe = await fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-v2/anything`);
    expect(probe.status).toBe(502);
  }, 20_000);

  it("a v3 host against an old relay keeps speaking v3 and never silently falls back", async () => {
    const seenVersions: number[] = [];
    let fallbackRegistered = false;
    const stub = createHttpServer();
    const wss = new WebSocketServer({ noServer: true });
    stub.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        let closeTimer: ReturnType<typeof setTimeout> | null = null;
        ws.on("message", (data: RawData, isBinary: boolean) => {
          if (isBinary) return;
          const frame = JSON.parse(String(data)) as {
            t?: string;
            protocolVersion?: number;
            serverId?: string;
          };
          if (frame.t !== "register") return;
          seenVersions.push(frame.protocolVersion ?? -1);
          if (frame.protocolVersion === 2) {
            // A v2 relay WOULD accept a v2 host — if this host fell back, it
            // would register here and `fallbackRegistered` would flip.
            ws.send(
              JSON.stringify({
                t: "registered",
                serverId: frame.serverId ?? "",
                publicUrl: "https://old-relay.example.test/s/fallback/",
              }),
            );
            return;
          }
          // Mimic an old relay: the unknown `protocolVersion` literal fails its
          // schema, the frame is ignored, and its registration timeout then
          // closes the socket (compressed to 150ms here).
          closeTimer = setTimeout(() => {
            try {
              ws.close(1008, "host must register first");
            } catch {
              // already closing
            }
          }, 150);
        });
        ws.on("close", () => {
          if (closeTimer) clearTimeout(closeTimer);
        });
      });
    });
    await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
    const stubPort = (stub.address() as AddressInfo).port;
    cleanups.push(async () => {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => stub.close(() => resolve()));
    });

    const handle = startRelayHost({
      relayUrl: `ws://127.0.0.1:${stubPort}/host`,
      serverId: "srv-v3",
      secret: "s",
      localHttpUrl: "http://127.0.0.1:9",
      minReconnectMs: 50,
      maxReconnectMs: 100,
      onRegistered: () => {
        fallbackRegistered = true;
      },
    });
    cleanups.push(() => handle.dispose());

    await vi.waitFor(() => expect(seenVersions.length).toBeGreaterThanOrEqual(3), {
      timeout: 10_000,
      interval: 10,
    });
    expect(seenVersions.every((version) => version === PORACODE_RELAY_PROTOCOL_VERSION)).toBe(true);
    expect(fallbackRegistered).toBe(false);
  }, 20_000);
});
