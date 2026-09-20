import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REMOTE_HTTP_BRIDGE_VERSION,
  REMOTE_HTTP_MAX_REQUEST_BODY_BYTES,
  REMOTE_HTTP_MAX_RESPONSE_BODY_BYTES,
  REMOTE_HTTP_REQUEST_TIMEOUT_MS,
  REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
  REMOTE_HTTP_UPLOAD_CREDIT_BYTES,
  REMOTE_HTTP_UPLOAD_RETENTION_BUDGET_BYTES,
  type RemoteHttpBridgeOpenDescriptor,
  type RemoteHttpBridgePortDownstreamMessage,
  type RemoteHttpBridgePortUpstreamMessage,
  type RemoteHttpBridgeSettledMessage,
} from "@/shared/remote/httpBridgeProtocol";
import {
  RemoteHttpBridgeService,
  type RemoteHttpBridgeWorkerPort,
} from "./remoteHttpBridgeService";
import type { IncomingMessage } from "node:http";
import {
  payloadOf,
  sha256Bytes,
  startLoopbackHttpServer,
  type LoopbackHttpServer,
} from "./remoteHttpBridgeTestHarness";

class ScriptedWorkerPort implements RemoteHttpBridgeWorkerPort {
  readonly sent: RemoteHttpBridgePortDownstreamMessage[] = [];
  closed = false;
  closeCount = 0;
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly closeListeners = new Set<() => void>();

  postMessage(message: unknown): void {
    this.sent.push(message as RemoteHttpBridgePortDownstreamMessage);
  }

  start(): void {}

  close(): void {
    this.closed = true;
    this.closeCount += 1;
    for (const listener of [...this.closeListeners]) listener();
  }

  onMessage(listener: (message: unknown) => void): void {
    this.messageListeners.add(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener);
  }

  send(message: RemoteHttpBridgePortUpstreamMessage): void {
    for (const listener of [...this.messageListeners]) listener(message);
  }

  frames<K extends RemoteHttpBridgePortDownstreamMessage["kind"]>(
    kind: K,
  ): Array<Extract<RemoteHttpBridgePortDownstreamMessage, { kind: K }>> {
    return this.sent.filter(
      (frame): frame is Extract<RemoteHttpBridgePortDownstreamMessage, { kind: K }> =>
        frame.kind === kind,
    );
  }

  chunkBytes(): number {
    return this.frames("chunk").reduce((total, frame) => total + frame.data.byteLength, 0);
  }
}

function descriptor(
  overrides: Partial<RemoteHttpBridgeOpenDescriptor> = {},
): RemoteHttpBridgeOpenDescriptor {
  return {
    v: REMOTE_HTTP_BRIDGE_VERSION,
    kind: "open",
    generation: 1,
    senderId: 7,
    requestId: crypto.randomUUID(),
    url: "http://127.0.0.1:1/none",
    method: "GET",
    headers: {},
    hasBody: false,
    bodyBytes: 0,
    ...overrides,
  };
}

function credit(requestId: string, bytes: number): RemoteHttpBridgePortUpstreamMessage {
  return { v: REMOTE_HTTP_BRIDGE_VERSION, kind: "credit", requestId, bytes };
}

async function finishWithCredit(port: ScriptedWorkerPort, requestId: string): Promise<void> {
  await vi.waitFor(() => expect(port.frames("head")).toHaveLength(1));
  // The utility clamps accumulated credit to the documented 1 MiB ceiling, so
  // a full-body stream is completed with ordinary per-pull grants.
  for (let index = 0; index < 512; index += 1) {
    if (port.frames("end").length > 0 || port.frames("error").length > 0) break;
    port.send(credit(requestId, REMOTE_HTTP_RESPONSE_CREDIT_BYTES));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await vi.waitFor(() => expect(port.frames("end")).toHaveLength(1));
}

const services: RemoteHttpBridgeService[] = [];
const servers: LoopbackHttpServer[] = [];

function createService(
  options: ConstructorParameters<typeof RemoteHttpBridgeService>[0] = {},
): RemoteHttpBridgeService {
  const service = new RemoteHttpBridgeService({
    portLingerMs: 10,
    ...options,
  });
  services.push(service);
  return service;
}

afterEach(async () => {
  services.splice(0);
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("RemoteHttpBridgeService", () => {
  it("pins the pre-F8 limits and the versioned contract", () => {
    expect(REMOTE_HTTP_MAX_RESPONSE_BODY_BYTES).toBe(64 * 1024 * 1024);
    expect(REMOTE_HTTP_REQUEST_TIMEOUT_MS).toBe(60_000);
    expect(REMOTE_HTTP_MAX_REQUEST_BODY_BYTES).toBe(64 * 1024 * 1024);
    expect(REMOTE_HTTP_UPLOAD_RETENTION_BUDGET_BYTES).toBe(96 * 1024 * 1024);
    expect(REMOTE_HTTP_UPLOAD_CREDIT_BYTES).toBe(1024 * 1024);
    expect(REMOTE_HTTP_BRIDGE_VERSION).toBe(3);
  });

  it("streams an 8 MiB binary response in order with byte identity", async () => {
    const payload = payloadOf(8 * 1024 * 1024);
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.from(payload));
    });
    servers.push(server);
    const service = createService();
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/binary` });
    service.open(request, port);

    await vi.waitFor(() => expect(port.frames("head")).toHaveLength(1));
    await finishWithCredit(port, request.requestId);

    const received = Buffer.concat(port.frames("chunk").map((frame) => Buffer.from(frame.data)));
    expect(received.byteLength).toBe(payload.byteLength);
    expect(sha256Bytes(received)).toBe(sha256Bytes(payload));
    for (const frame of port.frames("chunk")) {
      // Response chunks posted by the utility are exact-length owned copies,
      // never subarray views of a larger reader backing store.
      expect(frame.data.buffer.byteLength).toBe(frame.data.byteLength);
      expect(frame.data.byteOffset).toBe(0);
    }
    expect(port.frames("head")[0]).toMatchObject({ status: 200 });
    expect(service.stats()).toMatchObject({
      activeRequests: 0,
      completedRequests: 1,
      downloadedBytes: payload.byteLength,
    });
  });

  it("sends no body chunk before consumer credit and never exceeds it", async () => {
    const payload = payloadOf(64 * 1024);
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200, { "content-length": String(payload.byteLength) });
      res.end(Buffer.from(payload));
    });
    servers.push(server);
    const service = createService();
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/binary` });
    service.open(request, port);

    await vi.waitFor(() => expect(port.frames("head")).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(port.frames("chunk")).toHaveLength(0);
    expect(service.stats().activeRequests).toBe(1);

    port.send(credit(request.requestId, 1000));
    await vi.waitFor(() => expect(port.chunkBytes()).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(port.chunkBytes()).toBeLessThanOrEqual(1000);

    port.send(credit(request.requestId, payload.byteLength));
    await vi.waitFor(() => expect(port.frames("end")).toHaveLength(1));
    expect(port.chunkBytes()).toBe(payload.byteLength);
  });

  it("clamps burst or duplicate response credit to the documented 1 MiB window", async () => {
    const payload = payloadOf(3 * 1024 * 1024);
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200, { "content-length": String(payload.byteLength) });
      res.end(Buffer.from(payload));
    });
    servers.push(server);
    const service = createService();
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/binary` });
    service.open(request, port);
    await vi.waitFor(() => expect(port.frames("head")).toHaveLength(1));

    // A burst of ordinary per-grant frames (each within the frame validator's
    // bound) must not accumulate into a full-body response burst.
    for (let index = 0; index < 3; index += 1) {
      port.send(credit(request.requestId, REMOTE_HTTP_RESPONSE_CREDIT_BYTES));
    }
    await vi.waitFor(() => expect(port.chunkBytes()).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(port.chunkBytes()).toBeLessThanOrEqual(REMOTE_HTTP_RESPONSE_CREDIT_BYTES);
    expect(port.frames("end")).toHaveLength(0);
    expect(port.frames("error")).toHaveLength(0);

    // A consumer that keeps pulling still receives the whole body in order.
    for (let index = 0; index < 4 && port.frames("end").length === 0; index += 1) {
      port.send(credit(request.requestId, REMOTE_HTTP_RESPONSE_CREDIT_BYTES));
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await vi.waitFor(() => expect(port.frames("end")).toHaveLength(1));
    const received = Buffer.concat(port.frames("chunk").map((frame) => Buffer.from(frame.data)));
    expect(sha256Bytes(received)).toBe(sha256Bytes(payload));
  });

  it("rejects an oversized declared response before any body byte", async () => {
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200, { "content-length": String(64 * 1024 * 1024 + 1) });
      res.write("x");
    });
    servers.push(server);
    const service = createService();
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/huge` });
    service.open(request, port);

    await vi.waitFor(() => expect(port.frames("error")).toHaveLength(1));
    expect(port.frames("error")[0]).toMatchObject({
      code: "too-large",
      message: "response body too large",
    });
    expect(port.frames("chunk")).toHaveLength(0);
    expect(service.stats().failedRequests).toBe(1);
  });

  it("enforces the response byte cap mid-body and cleans up", async () => {
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200);
      res.write(Buffer.alloc(256 * 1024, 1));
      res.end(Buffer.alloc(256 * 1024, 2));
    });
    servers.push(server);
    const service = createService({ maxResponseBodyBytes: 64 * 1024 });
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/overrun` });
    service.open(request, port);
    port.send(credit(request.requestId, REMOTE_HTTP_RESPONSE_CREDIT_BYTES));

    await vi.waitFor(() => expect(port.frames("error")).toHaveLength(1));
    expect(port.frames("error")[0]).toMatchObject({ code: "too-large" });
    await vi.waitFor(() => expect(service.stats().activeRequests).toBe(0));
  });

  it("retains a replayable upload until settle, then releases the account", async () => {
    const payload = payloadOf(512 * 1024);
    let receivedSha = "";
    const server = await startLoopbackHttpServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        receivedSha = sha256Bytes(Buffer.concat(chunks));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    servers.push(server);
    const service = createService();
    const port = new ScriptedWorkerPort();
    const request = descriptor({
      url: `${server.origin}/upload`,
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      hasBody: true,
      bodyBytes: payload.byteLength,
    });
    service.open(request, port);
    // Admission reserved the declared length before any byte was accepted.
    expect(service.stats()).toMatchObject({
      reservedUploadBytes: payload.byteLength,
      retainedUploadBytes: 0,
      uploadAccountedBytes: payload.byteLength,
    });
    expect(port.frames("upload-grant")[0]).toMatchObject({
      bytes: Math.min(payload.byteLength, REMOTE_HTTP_UPLOAD_CREDIT_BYTES),
    });
    const half = payload.byteLength / 2;
    port.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "upload-chunk",
      requestId: request.requestId,
      data: payload.subarray(0, half),
    });
    port.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "upload-chunk",
      requestId: request.requestId,
      data: payload.subarray(half),
    });
    expect(service.stats()).toMatchObject({
      reservedUploadBytes: 0,
      retainedUploadBytes: payload.byteLength,
      uploadAccountedBytes: payload.byteLength,
    });
    port.send({ v: REMOTE_HTTP_BRIDGE_VERSION, kind: "upload-end", requestId: request.requestId });

    await finishWithCredit(port, request.requestId);
    expect(receivedSha).toBe(sha256Bytes(payload));
    expect(service.stats()).toMatchObject({
      reservedUploadBytes: 0,
      retainedUploadBytes: 0,
      uploadAccountedBytes: 0,
      peakRetainedUploadBytes: payload.byteLength,
      peakUploadAccountedBytes: payload.byteLength,
      uploadedBytes: payload.byteLength,
    });
  });

  it("rejects an over-budget declared upload at admission before any payload or grant", async () => {
    const server = await startLoopbackHttpServer((_req, res) => res.end("unused"));
    servers.push(server);
    const service = createService({ uploadRetentionBudgetBytes: 1024, maxRequestBodyBytes: 2048 });
    const holder = new ScriptedWorkerPort();
    const holderRequest = descriptor({
      url: `${server.origin}/holder`,
      method: "POST",
      hasBody: true,
      bodyBytes: 768,
    });
    service.open(holderRequest, holder);
    expect(service.stats().reservedUploadBytes).toBe(768);

    const sibling = new ScriptedWorkerPort();
    const siblingRequest = descriptor({
      url: `${server.origin}/sibling`,
      method: "POST",
      hasBody: true,
      bodyBytes: 768,
    });
    service.open(siblingRequest, sibling);

    await vi.waitFor(() => expect(sibling.frames("error")).toHaveLength(1));
    expect(sibling.frames("error")[0]).toMatchObject({ code: "overloaded" });
    expect(sibling.frames("upload-grant")).toHaveLength(0);
    expect(sibling.frames("chunk")).toHaveLength(0);
    expect(service.stats()).toMatchObject({
      reservedUploadBytes: 768,
      uploadAccountedBytes: 768,
      rejectedRequests: 1,
    });

    // A smaller reservation still fits the remaining budget.
    const fitting = new ScriptedWorkerPort();
    const fittingRequest = descriptor({
      url: `${server.origin}/fitting`,
      method: "POST",
      hasBody: true,
      bodyBytes: 256,
    });
    service.open(fittingRequest, fitting);
    expect(fitting.frames("upload-grant")).toHaveLength(1);
    expect(service.stats().reservedUploadBytes).toBe(1024);

    holder.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "cancel",
      requestId: holderRequest.requestId,
    });
    await vi.waitFor(() => expect(service.stats().reservedUploadBytes).toBe(256));
    expect(service.stats().uploadAccountedBytes).toBe(256);
  });

  it("settles a budget-rejected open back to main exactly once", async () => {
    const server = await startLoopbackHttpServer((_req, res) => res.end("unused"));
    servers.push(server);
    const settled: RemoteHttpBridgeSettledMessage[] = [];
    const service = createService({
      uploadRetentionBudgetBytes: 1024,
      maxRequestBodyBytes: 2048,
      onSettled: (message: RemoteHttpBridgeSettledMessage) => settled.push(message),
    });
    const holder = new ScriptedWorkerPort();
    const holderRequest = descriptor({
      url: `${server.origin}/holder`,
      method: "POST",
      hasBody: true,
      bodyBytes: 768,
    });
    service.open(holderRequest, holder);

    const sibling = new ScriptedWorkerPort();
    const siblingRequest = descriptor({
      url: `${server.origin}/sibling`,
      method: "POST",
      hasBody: true,
      bodyBytes: 768,
    });
    service.open(siblingRequest, sibling);
    await vi.waitFor(() => expect(sibling.frames("error")).toHaveLength(1));

    // The rejection is a valid descriptor that failed admission: main's
    // reservation is released immediately instead of after the 90 s timer.
    expect(settled).toEqual([
      {
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "settled",
        generation: siblingRequest.generation,
        requestId: siblingRequest.requestId,
        outcome: "failed",
        receivedBytes: 0,
        sentBytes: 0,
      },
    ]);
    expect(service.stats().activeRequests).toBe(1);

    // Closing the rejected port and the normal settle of the accepted request
    // each keep the notification exact: one per accepted/rejected descriptor.
    sibling.close();
    holder.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "cancel",
      requestId: holderRequest.requestId,
    });
    await vi.waitFor(() => expect(service.stats().activeRequests).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toHaveLength(2);
    expect(settled[1]).toMatchObject({
      requestId: holderRequest.requestId,
      outcome: "cancelled",
    });
  });

  it("rejects an upload chunk beyond the per-request body cap without dispatching", async () => {
    const server = await startLoopbackHttpServer((_req, res) => res.end("unused"));
    servers.push(server);
    const service = createService({ maxRequestBodyBytes: 8 });
    const port = new ScriptedWorkerPort();
    const request = descriptor({
      url: `${server.origin}/upload`,
      method: "POST",
      hasBody: true,
      bodyBytes: 8,
    });
    service.open(request, port);
    port.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "upload-chunk",
      requestId: request.requestId,
      data: new Uint8Array(9),
    });

    await vi.waitFor(() => expect(port.frames("error")).toHaveLength(1));
    expect(port.frames("error")[0]).toMatchObject({
      code: "too-large",
      message: "request body too large",
    });
    expect(server.requests).toHaveLength(0);
    expect(service.stats().retainedUploadBytes).toBe(0);
  });

  it("bounds the aggregate upload account across active requests and releases it", async () => {
    const server = await startLoopbackHttpServer((_req, res) => res.end("ok"));
    servers.push(server);
    const service = createService({ uploadRetentionBudgetBytes: 10, maxRequestBodyBytes: 64 });
    const holder = new ScriptedWorkerPort();
    const holderRequest = descriptor({
      url: `${server.origin}/upload`,
      method: "POST",
      hasBody: true,
      bodyBytes: 8,
    });
    service.open(holderRequest, holder);
    holder.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "upload-chunk",
      requestId: holderRequest.requestId,
      data: new Uint8Array(8),
    });
    expect(service.stats()).toMatchObject({
      retainedUploadBytes: 8,
      reservedUploadBytes: 0,
      uploadAccountedBytes: 8,
    });

    const second = new ScriptedWorkerPort();
    const secondRequest = descriptor({
      url: `${server.origin}/upload`,
      method: "POST",
      hasBody: true,
      bodyBytes: 8,
    });
    service.open(secondRequest, second);
    // The reservation tripped at admission: no grant and no accepted bytes.
    await vi.waitFor(() => expect(second.frames("error")).toHaveLength(1));
    expect(second.frames("error")[0]).toMatchObject({ code: "overloaded" });
    expect(second.frames("upload-grant")).toHaveLength(0);
    expect(service.stats().retainedUploadBytes).toBe(8);

    holder.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "upload-end",
      requestId: holderRequest.requestId,
    });
    await finishWithCredit(holder, holderRequest.requestId);
    expect(service.stats()).toMatchObject({
      retainedUploadBytes: 0,
      reservedUploadBytes: 0,
      uploadAccountedBytes: 0,
    });
  });

  it("grants upload credit back as chunks are retained and rejects over-declared chunks", async () => {
    const server = await startLoopbackHttpServer((_req, res) => res.end("ok"));
    servers.push(server);
    const service = createService({ maxRequestBodyBytes: 64 });
    const port = new ScriptedWorkerPort();
    const request = descriptor({
      url: `${server.origin}/upload`,
      method: "POST",
      hasBody: true,
      bodyBytes: 32,
    });
    service.open(request, port);
    expect(port.frames("upload-grant")).toEqual([
      expect.objectContaining({ bytes: 32, requestId: request.requestId }),
    ]);

    port.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "upload-chunk",
      requestId: request.requestId,
      data: new Uint8Array(20),
    });
    // Accepted bytes are granted back, capped at the remaining declared length.
    expect(port.frames("upload-grant").at(-1)).toMatchObject({ bytes: 12 });

    port.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "upload-chunk",
      requestId: request.requestId,
      data: new Uint8Array(13),
    });
    await vi.waitFor(() => expect(port.frames("error")).toHaveLength(1));
    expect(port.frames("error")[0]).toMatchObject({
      code: "too-large",
      message: "request body too large",
    });
    // The violation retires the request and releases its whole upload account.
    expect(service.stats()).toMatchObject({
      retainedUploadBytes: 0,
      reservedUploadBytes: 0,
      uploadAccountedBytes: 0,
    });
  });

  it("serves a 65-header response and a 9000-character header value without stalling", async () => {
    const manyHeaders = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`x-many-${index}`, "v"]),
    );
    const server = await startLoopbackHttpServer((req, res) => {
      if (req.url === "/long") {
        res.writeHead(200, { "content-type": "text/plain", "x-long": "a".repeat(9000) });
        res.end("ok");
        return;
      }
      res.writeHead(200, { "content-type": "text/plain", ...manyHeaders });
      res.end("ok");
    });
    servers.push(server);

    for (const path of ["/many", "/long"]) {
      const service = createService();
      const port = new ScriptedWorkerPort();
      const request = descriptor({ url: `${server.origin}${path}` });
      service.open(request, port);
      await vi.waitFor(() => expect(port.frames("head")).toHaveLength(1));
      expect(port.frames("head")[0]!.headers.length).toBeGreaterThanOrEqual(
        path === "/many" ? 66 : 2,
      );
      await finishWithCredit(port, request.requestId);
      expect(port.frames("error")).toHaveLength(0);
    }
  });

  it("replaces an unpostable response head with a bounded error instead of a silent stall", async () => {
    const service = createService({
      fetchImpl: async () =>
        new Response("body", {
          status: 200,
          statusText: "OK",
          headers: { "x-huge": "a".repeat(70 * 1024) },
        }),
    });
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: "http://127.0.0.1:1/huge-headers" });
    service.open(request, port);

    await vi.waitFor(() => expect(port.frames("error")).toHaveLength(1));
    expect(port.frames("error")[0]).toMatchObject({
      code: "too-large",
      message: "response metadata too large",
    });
    expect(port.frames("head")).toHaveLength(0);
    expect(port.frames("chunk")).toHaveLength(0);
    expect(service.stats().failedRequests).toBe(1);
  });

  it("aborts after headers, observes the server close, and frees the slot", async () => {
    let closed = false;
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("first");
      res.on("close", () => {
        closed = true;
      });
    });
    servers.push(server);
    const service = createService();
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/stall` });
    service.open(request, port);

    await vi.waitFor(() => expect(port.frames("head")).toHaveLength(1));
    port.send({ v: REMOTE_HTTP_BRIDGE_VERSION, kind: "cancel", requestId: request.requestId });

    await vi.waitFor(() => expect(closed).toBe(true));
    await vi.waitFor(() => expect(service.stats().activeRequests).toBe(0));
    expect(service.stats().cancelledRequests).toBe(1);
  });

  it("cancels a collecting upload before any dispatch", async () => {
    const server = await startLoopbackHttpServer((_req, res) => res.end("unused"));
    servers.push(server);
    const service = createService();
    const port = new ScriptedWorkerPort();
    const request = descriptor({
      url: `${server.origin}/upload`,
      method: "POST",
      hasBody: true,
      bodyBytes: 4,
    });
    service.open(request, port);
    port.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "upload-chunk",
      requestId: request.requestId,
      data: new Uint8Array(4),
    });
    port.send({ v: REMOTE_HTTP_BRIDGE_VERSION, kind: "cancel", requestId: request.requestId });

    await vi.waitFor(() => expect(service.stats().activeRequests).toBe(0));
    expect(server.requests).toHaveLength(0);
    expect(service.stats().retainedUploadBytes).toBe(0);
    expect(service.stats().cancelledRequests).toBe(1);
  });

  it("times a stalled request out with the pre-F8 message and closes the socket", async () => {
    let closed = false;
    const server = await startLoopbackHttpServer((_req, _res) => {
      // Hold the response open.
      _req.on("close", () => {
        closed = true;
      });
    });
    servers.push(server);
    const service = createService({ timeoutMs: 40 });
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/stall` });
    service.open(request, port);

    await vi.waitFor(() => expect(port.frames("error")).toHaveLength(1));
    expect(port.frames("error")[0]).toMatchObject({
      code: "timeout",
      message: "Remote request timed out after 40ms.",
    });
    await vi.waitFor(() => expect(closed).toBe(true));
    expect(service.stats().timedOutRequests).toBe(1);
  });

  it("treats HEAD/204/205/304 as null-body responses", async () => {
    const server = await startLoopbackHttpServer((req, res) => {
      if (req.method === "HEAD") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end();
        return;
      }
      const status = Number(req.url?.replace("/", "") ?? "204");
      res.writeHead(status);
      res.end();
    });
    servers.push(server);

    for (const [method, path] of [
      ["HEAD", "/200"],
      ["GET", "/204"],
      ["GET", "/205"],
      ["GET", "/304"],
    ] as const) {
      const service = createService();
      const port = new ScriptedWorkerPort();
      service.open(
        descriptor({
          url: `${server.origin}/${path.replace("/", "")}`,
          method,
          requestId: crypto.randomUUID(),
        }),
        port,
      );
      await vi.waitFor(() => expect(port.frames("end")).toHaveLength(1));
      expect(port.frames("chunk")).toHaveLength(0);
      expect(port.frames("end")).toHaveLength(1);
    }
  });

  it.each([307, 308] as const)(
    "replays a cross-origin %s upload with byte identity and strips authorization",
    async (redirectStatus) => {
      const payload = payloadOf(64 * 1024);
      let targetBody: Buffer = Buffer.alloc(0);
      let targetHeaders: IncomingMessage["headers"] = {};
      const target = await startLoopbackHttpServer((req, res) => {
        const chunks: Buffer[] = [];
        targetHeaders = req.headers;
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          targetBody = Buffer.concat(chunks);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
      });
      servers.push(target);
      const redirector = await startLoopbackHttpServer((_req, res) => {
        res.writeHead(redirectStatus, {
          location: `${target.origin}/final`,
          "set-cookie": "sid=server-side; Path=/",
        });
        res.end();
      });
      servers.push(redirector);

      const service = createService();
      const port = new ScriptedWorkerPort();
      const request = descriptor({
        url: `${redirector.origin}/start`,
        method: "POST",
        headers: {
          authorization: "Bearer fixture-token",
          "content-type": "application/octet-stream",
        },
        hasBody: true,
        bodyBytes: payload.byteLength,
      });
      service.open(request, port);
      port.send({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "upload-chunk",
        requestId: request.requestId,
        data: payload,
      });
      port.send({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "upload-end",
        requestId: request.requestId,
      });

      await finishWithCredit(port, request.requestId);
      expect(sha256Bytes(targetBody)).toBe(sha256Bytes(payload));
      expect(redirector.requests[0]?.headers.authorization).toBe("Bearer fixture-token");
      expect(targetHeaders.authorization).toBeUndefined();
      expect(targetHeaders.origin).toBeUndefined();
      expect(targetHeaders.cookie).toBeUndefined();
    },
  );

  it("rejects duplicate request ids and ignores unknown frames", async () => {
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    servers.push(server);
    const service = createService();
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/ok` });
    service.open(request, port);
    const duplicate = new ScriptedWorkerPort();
    service.open(request, duplicate);

    await vi.waitFor(() => expect(duplicate.frames("error")).toHaveLength(1));
    expect(duplicate.frames("error")[0]).toMatchObject({ code: "protocol" });

    port.send({ v: REMOTE_HTTP_BRIDGE_VERSION, kind: "unknown-kind" } as never);
    expect(service.stats().protocolViolations).toBe(1);
    await vi.waitFor(() => expect(port.frames("head")).toHaveLength(1));
  });

  it("never settles the accepted request when a duplicate id is rejected", async () => {
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    servers.push(server);
    const settled: RemoteHttpBridgeSettledMessage[] = [];
    const service = createService({
      onSettled: (message: RemoteHttpBridgeSettledMessage) => settled.push(message),
    });
    const accepted = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/ok` });
    service.open(request, accepted);

    const duplicate = new ScriptedWorkerPort();
    service.open(request, duplicate);
    await vi.waitFor(() => expect(duplicate.frames("error")).toHaveLength(1));
    expect(duplicate.frames("error")[0]).toMatchObject({ code: "protocol" });
    expect(settled).toHaveLength(0);
    expect(service.stats().activeRequests).toBe(1);

    accepted.send({ v: REMOTE_HTTP_BRIDGE_VERSION, kind: "cancel", requestId: request.requestId });
    await vi.waitFor(() => expect(settled).toHaveLength(1));
    expect(settled[0]).toMatchObject({ requestId: request.requestId, outcome: "cancelled" });
  });

  it("fails active requests when the utility-side port closes", async () => {
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200);
      res.write("held");
    });
    servers.push(server);
    const service = createService();
    const port = new ScriptedWorkerPort();
    const request = descriptor({ url: `${server.origin}/held` });
    service.open(request, port);
    await vi.waitFor(() => expect(port.frames("head")).toHaveLength(1));

    port.send({ v: REMOTE_HTTP_BRIDGE_VERSION, kind: "unknown" } as never);
    port.close();

    await vi.waitFor(() => expect(service.stats().activeRequests).toBe(0));
    expect(service.stats().cancelledRequests).toBe(1);
  });
});
