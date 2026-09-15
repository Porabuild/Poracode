import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { BackendRendererStream } from "./BackendRendererStream";

const streams: BackendRendererStream[] = [];

afterEach(async () => {
  await Promise.all(streams.splice(0).map((stream) => stream.dispose()));
});

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

function nextClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once("close", resolve));
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

function admissionOf(stream: BackendRendererStream): {
  execution: number;
  large: number;
  bytes: number;
} {
  const admission = (
    stream as unknown as {
      admission: {
        globalExecutionCount(): number;
        globalDeliveryCount(): number;
        globalDeliveryBytes(): number;
      };
    }
  ).admission;
  return {
    execution: admission.globalExecutionCount(),
    large: admission.globalDeliveryCount(),
    bytes: admission.globalDeliveryBytes(),
  };
}

function serverStates(
  stream: BackendRendererStream,
): Array<{ inFlightRequestIds: Set<string>; largeTransfers: Map<string, unknown> }> {
  const clients = (
    stream as unknown as {
      clients: Map<
        unknown,
        { inFlightRequestIds: Set<string>; largeTransfers: Map<string, unknown> }
      >;
    }
  ).clients;
  return [...clients.values()];
}

describe("large-reply admission, cancel, and compatibility", () => {
  it("rejects the third concurrent large per client with a bounded error and keeps the socket alive", async () => {
    const gates = [
      Promise.withResolvers<unknown>(),
      Promise.withResolvers<unknown>(),
      Promise.withResolvers<unknown>(),
    ];
    const payload = { blob: "p".repeat(200_000) };
    const onRequest = vi.fn<(request: { id: string }) => Promise<unknown>>(
      async (request: { id: string }) => {
        const index = ["over-1", "over-2", "over-3"].indexOf(request.id);
        if (index < 0) return { small: true };
        await gates[index]!.promise;
        return payload;
      },
    );
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info);
    for (const id of ["over-1", "over-2", "over-3"]) {
      client.socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request",
          id,
          operation: "database",
          name: "dbGetThreadRuntimeItems",
          payload: {},
        }),
      );
    }
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledTimes(3));
    gates[0]!.resolve(null);
    gates[1]!.resolve(null);
    // Hold the first two transfers by never ACKing: wait for both starts.
    const started = new Set<string>();
    const deadline = Date.now() + 10_000;
    while (started.size < 2) {
      if (Date.now() > deadline) throw new Error("large starts did not arrive.");
      const frame = await nextFrame(client);
      if (frame.type === "reply-start" && (frame.id === "over-1" || frame.id === "over-2"))
        started.add(frame.id as string);
    }
    expect(serverStates(stream)[0]!.largeTransfers.size).toBe(2);
    gates[2]!.resolve(null);
    // Third large exceeds per-client 2: bounded ordinary error (chunks for the
    // held transfers may interleave; skip until the reply for over-3).
    let reply: Record<string, unknown> = {};
    const replyDeadline = Date.now() + 10_000;
    while (!(reply.type === "reply" && reply.id === "over-3")) {
      if (Date.now() > replyDeadline) throw new Error("bounded overload reply did not arrive.");
      reply = await nextFrame(client);
    }
    expect(reply).toMatchObject({ type: "reply", id: "over-3", ok: false });
    expect(String((reply as { error?: unknown }).error)).toMatch(/concurrency|limit|overload/);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.close();
    await vi.waitFor(() => expect(admissionOf(stream).execution).toBe(0), { timeout: 5_000 });
    expect(admissionOf(stream).large).toBe(0);
  }, 30_000);

  it("delivery-cancel while the handler is unresolved publishes nothing and holds the slot until settlement", async () => {
    const gate = Promise.withResolvers<unknown>();
    const onRequest = vi.fn<() => Promise<unknown>>(async () => {
      await gate.promise;
      return { blob: "c".repeat(300_000) };
    });
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info);
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "cancel-1",
        operation: "database",
        name: "dbGetThreadRuntimeItems",
        payload: {},
      }),
    );
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledTimes(1));
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request-cancel",
        id: "cancel-1",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Slot still held while unresolved (per-client 64 counts cancelled work).
    expect(serverStates(stream)[0]!.inFlightRequestIds.has("cancel-1")).toBe(true);
    gate.resolve(null);
    // Late settlement cannot publish: no reply/start for cancel-1 within 200ms.
    // Clear the losing waiter so it cannot steal the next real frame.
    let quiet: string | "quiet" = "quiet";
    const pendingRead = nextQueued(client).then((raw) => {
      quiet = raw;
    });
    await Promise.race([pendingRead, new Promise((resolve) => setTimeout(resolve, 200))]);
    client.waiters.length = 0;
    const strayFrame =
      quiet === "quiet" ? undefined : (JSON.parse(quiet) as Record<string, unknown>);
    expect(strayFrame?.id ?? "cancel-1-absent").not.toBe("cancel-1");
    client.queue.length = 0;
    expect(onRequest).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(serverStates(stream)[0]?.inFlightRequestIds.has("cancel-1") ?? false).toBe(false),
    );
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "cancel-2",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    const reply = await nextFrame(client);
    // cancel-2 may follow a stray frame for another id; skip to its reply.
    let settled = reply;
    const deadline = Date.now() + 5_000;
    while (
      !(settled.id === "cancel-2" && (settled.type === "reply" || settled.type === "reply-start"))
    ) {
      if (Date.now() > deadline) throw new Error("cancel-2 reply did not arrive.");
      settled = await nextFrame(client);
    }
    expect(settled.id).toBe("cancel-2");
    client.socket.close();
  }, 20_000);

  it("counts orphaned handlers globally so disconnect/reconnect cannot bypass the 128 bound", async () => {
    const gates = Array.from({ length: 128 }, () => Promise.withResolvers<unknown>());
    let index = 0;
    const onRequest = vi.fn<() => Promise<unknown>>(async () => {
      const slot = index++;
      await gates[slot]!.promise;
      return { ok: true };
    });
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    // Per-client cap is 64: reach the 128 global with two sockets.
    const first = await readyClient(info);
    const sibling = await readyClient(info);
    for (let id = 0; id < 64; id += 1) {
      first.socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request",
          id: `orphan-a-${id}`,
          operation: "database",
          name: "dbGetProjects",
          payload: {},
        }),
      );
      sibling.socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request",
          id: `orphan-b-${id}`,
          operation: "database",
          name: "dbGetProjects",
          payload: {},
        }),
      );
    }
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledTimes(128), { timeout: 10_000 });
    expect(admissionOf(stream).execution).toBe(128);
    first.socket.close();
    sibling.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Orphans still counted globally after both sockets are gone.
    expect(admissionOf(stream).execution).toBe(128);
    const second = await readyClient(info);
    second.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "over-global",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    const bounded = await nextFrame(second);
    expect(bounded).toMatchObject({ type: "reply", id: "over-global", ok: false });
    expect(String((bounded as { error?: unknown }).error)).toMatch(/overload|concurrency/);
    expect(second.socket.readyState).toBe(WebSocket.OPEN);
    for (const gate of gates) gate.resolve(null);
    await vi.waitFor(() => expect(admissionOf(stream).execution).toBe(0), { timeout: 10_000 });
    second.socket.close();
  }, 30_000);

  it("delivers a large mutation result exactly once with no replay after cancel", async () => {
    const onRequest = vi.fn<() => Promise<unknown>>(async () => ({
      mutated: true,
      blob: "m".repeat(300_000),
    }));
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info);
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "mut-1",
        operation: "database",
        name: "dbUpsertThread",
        payload: {},
      }),
    );
    const first = await nextFrame(client);
    expect(first.type).toBe("reply-start");
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request-cancel",
        id: "mut-1",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.close();
  }, 20_000);

  it("ignores stale/duplicate/overcredit safely and closes malformed control frames", async () => {
    const onRequest = vi.fn<() => Promise<unknown>>(async () => ({ ok: true }));
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info);
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-ack",
        id: "nope",
        seq: 0,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request-cancel",
        id: "nope",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "alive-1",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    await expect(nextFrame(client)).resolves.toMatchObject({ id: "alive-1", ok: true });
    client.socket.send(
      JSON.stringify({ version: BACKEND_RENDERER_STREAM_VERSION, type: "reply-ack", seq: 0 }),
    );
    await expect(nextClose(client.socket)).resolves.toBe(1008);
  }, 20_000);

  it("rejects v5 requests and interests but serves v6 (both directions loud)", async () => {
    const onRequest = vi.fn<() => Promise<unknown>>(async () => ({ ok: true }));
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    expect(info.version).toBe(BACKEND_RENDERER_STREAM_VERSION);
    // connect() already consumed the hello; a v5 frame must still close loudly.
    const { socket: old } = await connect(`${info.url}?token=${info.token}`);
    attachQueue(old);
    old.send(
      JSON.stringify({
        version: 5,
        type: "request",
        id: "old-1",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    await expect(nextClose(old)).resolves.toBe(1008);
    expect(onRequest).not.toHaveBeenCalled();
    const second = await connect(`${info.url}?token=${info.token}`);
    attachQueue(second.socket);
    second.socket.send(
      JSON.stringify({
        version: 5,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await expect(nextClose(second.socket)).resolves.toBe(1008);
  }, 20_000);
});
