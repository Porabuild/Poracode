import {
  BACKEND_RENDERER_STREAM_VERSION,
  type BackendRendererStreamInfo,
  type RendererStreamRecoveryBarrier,
} from "@/shared/backendHostProtocol";
import { utf8ByteLength } from "@/shared/rendererStreamChunks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import type { SupervisorEvent } from "@/shared/ipc";
import { ElectronBackendTransport } from "./electronBackendTransport";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  closeCode: number | null = null;
  private readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
  constructor(readonly url: string | URL) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(
    type: string,
    listener: (event: { data?: string }) => void,
    options?: { once?: boolean },
  ): void {
    const wrapped = options?.once
      ? (event: { data?: string }) => {
          this.removeEventListener(type, wrapped);
          listener(event);
        }
      : listener;
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(wrapped);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: { data?: string }) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((c) => c !== listener),
    );
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.closeCode = code ?? 1005;
    this.emit("close", {});
  }
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }
  message(value: unknown, raw?: string): void {
    this.emit("message", { data: raw ?? JSON.stringify(value) });
  }
  private emit(type: string, event: { data?: string }): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

const GRANT = { windowId: 11, generation: 3, binding: "binding-11" };

function makeHost() {
  const invokeProcedure = vi.fn<() => Promise<undefined>>(async () => undefined);
  const getBackendRendererStreamInfo = vi.fn<() => Promise<BackendRendererStreamInfo>>(
    async (): Promise<BackendRendererStreamInfo> => ({
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: "ws://127.0.0.1:43210/events",
      token: "secret",
    }),
  );
  const getRendererStreamOwnershipGrant = vi.fn<() => Promise<typeof GRANT>>(async () => GRANT);
  let recovery: ((barrier: RendererStreamRecoveryBarrier) => void) | null = null;
  const host = {
    onSupervisorEvent: () => () => {},
    onSupervisorEventGap: () => () => {},
    onRendererStreamRecovery: (listener: (barrier: RendererStreamRecoveryBarrier) => void) => {
      recovery = listener;
      return () => {};
    },
    onBackendRendererStreamChanged: () => () => {},
    getBackendRendererStreamInfo,
    getRendererStreamOwnershipGrant,
    invokeProcedure,
  } as unknown as ElectronHostBridge;
  return {
    host,
    invokeProcedure,
    recover: (barrier: RendererStreamRecoveryBarrier) => recovery?.(barrier),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function connected(): Promise<{
  socket: FakeWebSocket;
  transport: ElectronBackendTransport;
  recover: (b: RendererStreamRecoveryBarrier) => void;
}> {
  const { host, recover } = makeHost();
  const transport = new ElectronBackendTransport(host);
  await flush();
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  await vi.advanceTimersByTimeAsync(0);
  socket.message({
    version: BACKEND_RENDERER_STREAM_VERSION,
    type: "interests-ack",
    latestSeq: 0,
    ownership: { windowId: 11, generation: 3 },
  });
  return { socket, transport, recover };
}

describe("transport large-reply wiring", () => {
  it("resolves a chunked reply and ACKs each accepted chunk", async () => {
    const { socket, transport } = await connected();
    const data = { hello: "world", blob: "x".repeat(20_000) };
    const serialized = JSON.stringify(data);
    const total = utf8ByteLength(serialized);
    // Keep each encoded frame under 64KiB: split into 8KiB logical pieces.
    const step = 8_192;
    const call = transport.call("database", "dbGetThreadRuntimeItems", {}, ["fallback"]);
    await flush();
    const request = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((f: { type: string }) => f.type === "request");
    const id = (request as { id: string }).id as string;
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-start",
      id,
      totalBytes: total,
    });
    let seq = 0;
    for (let offset = 0; offset < serialized.length; offset += step, seq += 1) {
      socket.message({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-chunk",
        id,
        seq,
        data: serialized.slice(offset, offset + step),
      });
    }
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .filter((f: { type: string }) => f.type === "reply-ack"),
    ).toHaveLength(seq);
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-end",
      id,
      totalBytes: total,
    });
    await expect(call).resolves.toEqual(data);
  });

  it("sends delivery-cancel on timeout and drops the partial", async () => {
    const { socket, transport } = await connected();
    const call = transport.call("database", "dbGetThreadRuntimeItems", {}, ["fallback"]);
    // Map the pending call to a plain boolean early so the timeout rejection
    // is handled before timers advance; the sync assertion below then needs
    // no stored async expect.
    const timedOut = call.then(
      () => false,
      (error: unknown) => error instanceof Error && /timed out/.test(error.message),
    );
    await flush();
    const request = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((f: { type: string }) => f.type === "request");
    const id = (request as { id: string }).id as string;
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-start",
      id,
      totalBytes: 100,
    });
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-chunk",
      id,
      seq: 0,
      data: '{"a":',
    });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(await timedOut).toBe(true);
    const cancel = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((f: { type: string }) => f.type === "request-cancel");
    expect(cancel).toMatchObject({ id });
  });

  it("drops partials on close but keeps them across event-only resync", async () => {
    const { socket, transport } = await connected();
    const call = transport.call("database", "dbGetThreadRuntimeItems", {}, ["fallback"]);
    await flush();
    const request = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((f: { type: string }) => f.type === "request");
    const id = (request as { id: string }).id as string;
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-start",
      id,
      totalBytes: 100,
    });
    // Event-only resync-required must not drop the partial: a later chunk still ACKs.
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "resync-required",
      latestSeq: 9,
    });
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-chunk",
      id,
      seq: 0,
      data: '{"a":1}',
    });
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .some((f: { type: string }) => f.type === "reply-ack"),
    ).toBe(true);
    socket.close();
    await expect(call).rejects.toThrow(/disconnected/);
    void transport;
  });

  it("closes loudly on a v5 reply frame (no silent fallback)", async () => {
    const { socket } = await connected();
    socket.message({ version: 5, type: "reply", id: "old", ok: true, data: {} });
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("rejects an oversized head with a bounded error and keeps the socket alive", async () => {
    const { socket, transport } = await connected();
    const call = transport.call("database", "dbGetThreadRuntimeItems", {}, ["fallback"]);
    await flush();
    const request = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((f: { type: string }) => f.type === "request");
    const id = (request as { id: string }).id as string;
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-start",
      id,
      totalBytes: 64 * 1024 * 1024 + 1,
    });
    await expect(call).rejects.toThrow(/transport limit/);
    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
    const cancel = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((f: { type: string }) => f.type === "request-cancel");
    expect(cancel).toMatchObject({ id });
  });

  it("ignores a stale barrier without dropping the partial, and fences a live barrier", async () => {
    const { socket, transport, recover } = await connected();
    const events: SupervisorEvent[] = [];
    transport.subscribe((event) => events.push(event));
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    const call = transport.call("database", "dbGetThreadRuntimeItems", {}, ["fallback"]);
    await flush();
    const request = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((f: { type: string }) => f.type === "request");
    const id = (request as { id: string }).id as string;
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-start",
      id,
      totalBytes: 100,
    });
    // Stale generation: ignored, partial survives (next chunk still ACKs).
    recover({ windowId: 11, generation: 1, fromSequence: 1, toSequence: 99 });
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-chunk",
      id,
      seq: 0,
      data: '{"a":1}',
    });
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .some((f: { type: string }) => f.type === "reply-ack"),
    ).toBe(true);
    // Live barrier fences the socket and rejects the pending chunked call.
    // Cursor is 0 (no events yet); use a premise-holding window so the scoped
    // rebuild fires for the subscribed thread.
    recover({
      windowId: 11,
      generation: 3,
      fromSequence: 1,
      toSequence: 1,
      threadIds: ["thread-1"],
    });
    await expect(call).rejects.toThrow(/revoked/);
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(events).toEqual([{ type: "thread-reset", threadId: "thread-1" }]);
  });
});
