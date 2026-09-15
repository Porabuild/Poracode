import { createHash } from "node:crypto";
import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import {
  LARGE_REPLY_MAX_ENCODED_FRAME_BYTES,
  LARGE_REPLY_MAX_LOGICAL_BYTES,
} from "@/shared/rendererStreamChunks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { BackendRendererStream } from "./BackendRendererStream";
import { RendererStreamChunkSender, type ChunkSenderOutcome } from "./rendererStreamChunkSender";

const streams: BackendRendererStream[] = [];

afterEach(async () => {
  await Promise.all(streams.splice(0).map((stream) => stream.dispose()));
});

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface QueuedClient {
  socket: WebSocket;
  queue: string[];
  waiters: Array<(value: string) => void>;
}

function attachQueue(socket: WebSocket): QueuedClient {
  const client: QueuedClient = { socket, queue: [], waiters: [] };
  socket.on("message", (data) => {
    const raw = data.toString();
    const waiter = client.waiters.shift();
    if (waiter) waiter(raw);
    else client.queue.push(raw);
  });
  return client;
}

function nextQueued(client: QueuedClient): Promise<string> {
  const buffered = client.queue.shift();
  if (buffered !== undefined) return Promise.resolve(buffered);
  return new Promise<string>((resolve) => {
    client.waiters.push(resolve);
  });
}

async function nextFrame(client: QueuedClient): Promise<Record<string, unknown>> {
  return JSON.parse(await nextQueued(client)) as Record<string, unknown>;
}

function connect(url: string): Promise<{ socket: WebSocket; hello: string }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("message", (data) => resolve({ socket, hello: data.toString() }));
    socket.once("error", reject);
  });
}

async function readyClient(info: { url: string; token: string }): Promise<QueuedClient> {
  const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
  JSON.parse(hello);
  const client = attachQueue(socket);
  socket.send(
    JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests",
      terminalThreadIds: [],
      runtimeThreadIds: [],
      lastSeq: 0,
    }),
  );
  await nextFrame(client);
  return client;
}

interface CollectedTransfer {
  rawFrames: string[];
  start: Record<string, unknown>;
  chunks: Array<{ seq: number; data: string; raw: string }>;
  end?: Record<string, unknown> | undefined;
  abort?: Record<string, unknown> | undefined;
}

async function collectLargeReply(client: QueuedClient, id: string): Promise<CollectedTransfer> {
  const rawFrames: string[] = [];
  const chunks: CollectedTransfer["chunks"] = [];
  let start: Record<string, unknown> | undefined;
  let end: Record<string, unknown> | undefined;
  let abort: Record<string, unknown> | undefined;
  while (true) {
    const raw = await nextQueued(client);
    rawFrames.push(raw);
    expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(LARGE_REPLY_MAX_ENCODED_FRAME_BYTES);
    const frame = JSON.parse(raw) as Record<string, unknown>;
    if (frame.id !== id) continue;
    if (frame.type === "reply-start") {
      start = frame;
      continue;
    }
    if (frame.type === "reply-chunk") {
      chunks.push({ seq: frame.seq as number, data: frame.data as string, raw });
      client.socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "reply-ack",
          id,
          seq: frame.seq,
        }),
      );
      continue;
    }
    if (frame.type === "reply-end") {
      end = frame;
      break;
    }
    if (frame.type === "reply-abort") {
      abort = frame;
      break;
    }
    if (frame.type === "reply" && frame.id === id) {
      return { rawFrames, start: start ?? {}, chunks, end, abort: frame };
    }
  }
  return { rawFrames, start: start ?? {}, chunks, end, abort };
}

function historyPayload(items: number, bytesEach: number): Array<{ id: string; body: string }> {
  return Array.from({ length: items }, (_, index) => ({
    id: `item-${index}`,
    body: "h".repeat(bytesEach),
  }));
}

describe("large-reply delivery (real ws, production stream)", () => {
  it("keeps small replies ordinary and delivers a healthy 2MiB reply chunked with hash equality", async () => {
    const big = { items: historyPayload(20, 100_000) };
    const bigSerialized = JSON.stringify(big);
    const bigHash = sha(bigSerialized);
    const onRequest = vi.fn<(request: { name: string }) => Promise<unknown>>(
      async (request: { name: string }) =>
        request.name === "dbGetProjects" ? { small: true } : big,
    );
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info);

    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "small-1",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    const small = await nextFrame(client);
    expect(small).toMatchObject({ type: "reply", id: "small-1", ok: true });
    expect(Buffer.byteLength(JSON.stringify(small))).toBeLessThanOrEqual(
      LARGE_REPLY_MAX_ENCODED_FRAME_BYTES,
    );
    expect(client.socket.readyState).toBe(WebSocket.OPEN);

    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "big-1",
        operation: "database",
        name: "dbGetThreadRuntimeItems",
        payload: {},
      }),
    );
    const collected = await collectLargeReply(client, "big-1");
    expect(collected.start.type).toBe("reply-start");
    expect(collected.chunks.length).toBeGreaterThan(1);
    const joined = collected.chunks
      .sort((a, b) => a.seq - b.seq)
      .map((c) => c.data)
      .join("");
    expect(joined).toBe(bigSerialized);
    expect(sha(joined)).toBe(bigHash);
    expect(collected.end).toMatchObject({ type: "reply-end", id: "big-1" });
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    expect(onRequest).toHaveBeenCalledTimes(2);
    client.socket.close();
  }, 30_000);

  it("delivers history-shaped Unicode payloads with exact bytes and proves wire overhead", async () => {
    const data = {
      items: historyPayload(8, 50_000),
      emoji: "😀".repeat(10_000),
      quotes: '"\\'.repeat(10_000),
      cjk: "漢".repeat(10_000),
    };
    const serialized = JSON.stringify(data);
    const onRequest = vi.fn<() => Promise<unknown>>(async () => data);
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info);
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "uni-1",
        operation: "database",
        name: "dbGetThreadRuntimeItems",
        payload: {},
      }),
    );
    const collected = await collectLargeReply(client, "uni-1");
    const joined = collected.chunks
      .sort((a, b) => a.seq - b.seq)
      .map((c) => c.data)
      .join("");
    expect(joined).toBe(serialized);
    expect(JSON.parse(joined)).toEqual(data);
    const wire = collected.rawFrames.reduce((sum, raw) => sum + Buffer.byteLength(raw), 0);
    expect(wire).toBeGreaterThan(Buffer.byteLength(serialized));
    expect(wire).toBeLessThan(
      Buffer.byteLength(serialized) * 2 + collected.rawFrames.length * 1024,
    );
    for (const entry of collected.chunks) {
      expect(entry.data.length).toBeLessThan(serialized.length);
    }
    client.socket.close();
  }, 30_000);

  it("rejects 64MiB+1 with a bounded error and keeps the socket alive", async () => {
    const over = "a".repeat(LARGE_REPLY_MAX_LOGICAL_BYTES - 1);
    expect(Buffer.byteLength(JSON.stringify(over))).toBe(LARGE_REPLY_MAX_LOGICAL_BYTES + 1);
    const onRequest = vi.fn<(request: { name: string }) => Promise<unknown>>(
      async (request: { name: string }) =>
        request.name === "dbGetProjects" ? { small: true } : over,
    );
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info);
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "over-1",
        operation: "database",
        name: "dbGetThreadRuntimeItems",
        payload: {},
      }),
    );
    const reply = await nextFrame(client);
    // Chunks never precede the bounded error for an oversized logical reply.
    let bounded = reply;
    const deadline = Date.now() + 10_000;
    while (!(bounded.type === "reply" && bounded.id === "over-1")) {
      if (Date.now() > deadline) throw new Error("bounded reply missing.");
      bounded = await nextFrame(client);
    }
    expect(bounded).toMatchObject({ type: "reply", id: "over-1", ok: false });
    expect(String((bounded as { error?: unknown }).error)).toMatch(/transport limit/);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "after-1",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    const after = await nextFrame(client);
    expect(after).toMatchObject({ type: "reply", id: "after-1", ok: true });
    client.socket.close();
  }, 30_000);

  it("delivers exactly 64MiB logical bytes through the production sender with bounded frames", async () => {
    const exact = "a".repeat(LARGE_REPLY_MAX_LOGICAL_BYTES - 2);
    expect(Buffer.byteLength(JSON.stringify(exact))).toBe(LARGE_REPLY_MAX_LOGICAL_BYTES);
    const frames: string[] = [];
    const sender = new RendererStreamChunkSender("exact-64", exact, {
      sendFrame: (payload) => {
        frames.push(payload);
        return true;
      },
      isOpen: () => true,
    });
    let settledOutcome: ChunkSenderOutcome | undefined;
    const run = sender.run();
    let index = 0;
    const deadline = Date.now() + 50_000;
    while (settledOutcome === undefined) {
      if (Date.now() > deadline) throw new Error("64MiB sender did not settle in time.");
      settledOutcome = await Promise.race([
        run.then((outcome) => outcome),
        new Promise<undefined>((resolve) => setImmediate(() => resolve(undefined))),
      ]);
      while (index < frames.length) {
        const frame = JSON.parse(frames[index]!) as { type: string; seq?: number };
        index += 1;
        if (frame.type === "reply-chunk" && typeof frame.seq === "number") {
          sender.onAck({
            version: BACKEND_RENDERER_STREAM_VERSION,
            type: "reply-ack",
            id: "exact-64",
            seq: frame.seq,
          });
        }
      }
    }
    expect(settledOutcome).toBe("completed");
    const chunks = frames
      .map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .filter((f) => f.type === "reply-chunk");
    expect(chunks.length).toBeGreaterThan(100);
    for (const raw of frames) {
      expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(LARGE_REPLY_MAX_ENCODED_FRAME_BYTES);
    }
    const joined = chunks
      .sort((a, b) => (a.seq as number) - (b.seq as number))
      .map((c) => c.data as string)
      .join("");
    expect(joined).toBe(JSON.stringify(exact));
  }, 60_000);

  it("enforces receiver credit: pauses after 2 unacked, ignores duplicates/future, resumes on valid ACK", async () => {
    const data = { blob: "b".repeat(500_000) };
    const onRequest = vi.fn<() => Promise<unknown>>(async () => data);
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    JSON.parse(hello);
    const client = attachQueue(socket);
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await nextFrame(client);
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "credit-1",
        operation: "database",
        name: "dbGetThreadRuntimeItems",
        payload: {},
      }),
    );
    const received: Array<{ seq: number }> = [];
    const readChunk = async (): Promise<Record<string, unknown>> => {
      while (true) {
        const frame = await nextFrame(client);
        if (frame.type === "reply-chunk" && frame.id === "credit-1")
          received.push({ seq: frame.seq as number });
        return frame;
      }
    };
    let frame = await readChunk();
    expect(frame.type).toBe("reply-start");
    frame = await readChunk();
    expect(frame).toMatchObject({ type: "reply-chunk", seq: 0 });
    frame = await readChunk();
    expect(frame).toMatchObject({ type: "reply-chunk", seq: 1 });
    // Paused: no third chunk within 150ms while unacked == 2. Use a queued
    // read with timeout; queued frames stay buffered for later assertions.
    const paused = await Promise.race([
      nextQueued(client).then(() => "frame" as const),
      new Promise((resolve) => setTimeout(() => resolve("paused" as const), 150)),
    ]);
    expect(paused).toBe("paused");
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-ack",
        id: "credit-1",
        seq: 99,
      }),
    );
    const stillPaused = await Promise.race([
      nextQueued(client).then(() => "frame" as const),
      new Promise((resolve) => setTimeout(() => resolve("paused" as const), 150)),
    ]);
    expect(stillPaused).toBe("paused");
    // Dropped the two timeout probes from the queue check above: they left no
    // waiter behind (race losers), but a "frame" win would have consumed a real
    // frame — both were "paused", so the queue still holds nothing new. Clear
    // defensively before resuming.
    client.queue.length = 0;
    client.waiters.length = 0;
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-ack",
        id: "credit-1",
        seq: 0,
      }),
    );
    frame = await readChunk();
    expect(frame).toMatchObject({ type: "reply-chunk", seq: 2 });
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-ack",
        id: "credit-1",
        seq: 0,
      }),
    );
    const dup = await Promise.race([
      nextQueued(client).then(() => "frame" as const),
      new Promise((resolve) => setTimeout(() => resolve("paused" as const), 150)),
    ]);
    expect(dup).toBe("paused");
    client.queue.length = 0;
    client.waiters.length = 0;
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-ack",
        id: "credit-1",
        seq: 1,
      }),
    );
    frame = await readChunk();
    expect(frame).toMatchObject({ type: "reply-chunk", seq: 3 });
    socket.close();
  }, 30_000);

  it("aborts a stalled transfer with a bounded error and keeps the socket alive", async () => {
    const sent: string[] = [];
    const sender = new RendererStreamChunkSender(
      "stall-1",
      { blob: "x".repeat(200_000) },
      {
        sendFrame: (payload) => {
          sent.push(payload);
          return true;
        },
        isOpen: () => true,
      },
      { creditTimeoutMs: 60, transferTimeoutMs: 5_000 },
    );
    expect(await sender.run()).toBe("aborted");
    const abort = sent
      .map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .find((f) => f.type === "reply-abort");
    expect(abort).toMatchObject({ id: "stall-1" });
    expect(String((abort as { error?: unknown })?.error)).toMatch(/credit/);
  }, 15_000);

  it("keeps a sibling responsive with health/control interleaving during a large peer", async () => {
    const big = { items: historyPayload(15, 100_000) };
    const gate = Promise.withResolvers<unknown>();
    const onRequest = vi.fn<(request: { id: string }) => Promise<unknown>>(
      async (request: { id: string }) => {
        if (request.id === "peer-big") {
          await gate.promise;
          return big;
        }
        return { small: true };
      },
    );
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const peer = await readyClient(info);
    const sibling = await readyClient(info);
    peer.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "peer-big",
        operation: "database",
        name: "dbGetThreadRuntimeItems",
        payload: {},
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    gate.resolve(null);
    sibling.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "sib-small",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    const sibReply = await Promise.race([
      nextFrame(sibling),
      new Promise((_, reject) => setTimeout(() => reject(new Error("sibling stalled")), 5_000)),
    ]);
    expect(sibReply).toMatchObject({ type: "reply", id: "sib-small", ok: true });
    stream.publish({
      type: "thread-state",
      threadId: "thread-1",
      status: "working",
      attention: "none",
      canResumeWithConfig: false,
    });
    const collected = await collectLargeReply(peer, "peer-big");
    const joined = collected.chunks
      .sort((a, b) => a.seq - b.seq)
      .map((c) => c.data)
      .join("");
    expect(JSON.parse(joined)).toEqual(big);
    expect(peer.socket.readyState).toBe(WebSocket.OPEN);
    expect(sibling.socket.readyState).toBe(WebSocket.OPEN);
    peer.socket.close();
    sibling.socket.close();
  }, 30_000);
});
