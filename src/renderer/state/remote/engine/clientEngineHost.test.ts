import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ENGINE_MAX_PENDING,
  CLIENT_ENGINE_PROTOCOL_VERSION,
  CLIENT_ENGINE_TIMEOUT_MS,
  type ClientEngineRequest,
  type ClientEngineResponse,
} from "./protocol";
import {
  ClientEngineOverflowError,
  decodeBackendSync,
  getClientEngineHost,
  isClientEngineWorkerActive,
  resetClientEngineHostForTests,
} from "./clientEngineHost";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<ClientEngineResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly posted: ClientEngineRequest[] = [];

  constructor(_url: URL | string, _options?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(data: ClientEngineRequest): void {
    this.posted.push(data);
  }

  terminate(): void {}

  respond(data: ClientEngineResponse): void {
    this.onmessage?.({ data } as MessageEvent<ClientEngineResponse>);
  }
}

const helloRaw = JSON.stringify({
  version: BACKEND_RENDERER_STREAM_VERSION,
  type: "hello",
  latestSeq: 4,
});

beforeEach(() => {
  FakeWorker.instances.length = 0;
  resetClientEngineHostForTests();
});

afterEach(() => {
  resetClientEngineHostForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ClientEngineHost", () => {
  it("uses the sync fallback when Worker is unavailable", async () => {
    const host = getClientEngineHost();
    expect(isClientEngineWorkerActive()).toBe(false);
    const sync = decodeBackendSync(helloRaw);
    expect(sync).toEqual({
      ok: true,
      message: {
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "hello",
        latestSeq: 4,
      },
    });
    await expect(host.decodeBackend(helloRaw)).resolves.toEqual(sync);
    expect(decodeBackendSync("{")).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects overflow, notifies the host, and resets generation", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const onOverflow = vi.fn<() => void>();
    const host = getClientEngineHost();
    host.setOnOverflow(onOverflow);
    expect(isClientEngineWorkerActive()).toBe(true);

    const pending = Array.from({ length: CLIENT_ENGINE_MAX_PENDING }, () =>
      host.decodeBackend(helloRaw),
    );
    const overflow = host.decodeBackend(helloRaw);
    await expect(overflow).rejects.toBeInstanceOf(ClientEngineOverflowError);
    expect(onOverflow).toHaveBeenCalledOnce();
    const settled = await Promise.allSettled(pending);
    expect(settled.every((result) => result.status === "rejected")).toBe(true);

    const worker = FakeWorker.instances[0]!;
    expect(worker.posted.some((message) => message.type === "reset")).toBe(true);
    const reset = worker.posted.find((message) => message.type === "reset");
    expect(reset).toMatchObject({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      type: "reset",
      generation: 1,
    });
  });

  it("drops stale replies after a generation reset", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const host = getClientEngineHost();
    const promise = host.decodeBackend(helloRaw);
    const worker = FakeWorker.instances[0]!;
    const request = worker.posted[0];
    expect(request).toMatchObject({
      type: "decode-backend",
      generation: 0,
      raw: helloRaw,
    });
    if (!request || request.type !== "decode-backend") throw new Error("expected decode request");

    host.reset();
    worker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: request.generation,
      id: request.id,
      type: "decode-backend",
      ok: true,
      message: { hijacked: true },
    });
    await expect(promise).rejects.toThrow(/reset/);

    const next = host.decodeBackend(helloRaw);
    const nextRequest = worker.posted.find(
      (message) => message.type === "decode-backend" && message.generation === 1,
    );
    expect(nextRequest).toMatchObject({ type: "decode-backend", generation: 1 });
    if (!nextRequest || nextRequest.type !== "decode-backend") {
      throw new Error("expected next decode request");
    }
    worker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: nextRequest.generation,
      id: nextRequest.id,
      type: "decode-backend",
      ok: true,
      message: JSON.parse(helloRaw),
    });
    await expect(next).resolves.toEqual(decodeBackendSync(helloRaw));
  });

  it("falls back to sync decode when the worker times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const host = getClientEngineHost();
    const promise = host.decodeBackend(helloRaw);
    await vi.advanceTimersByTimeAsync(CLIENT_ENGINE_TIMEOUT_MS);
    await expect(promise).resolves.toEqual(decodeBackendSync(helloRaw));
    const worker = FakeWorker.instances[0]!;
    expect(worker.posted.some((message) => message.type === "ack")).toBe(true);
  });
});
