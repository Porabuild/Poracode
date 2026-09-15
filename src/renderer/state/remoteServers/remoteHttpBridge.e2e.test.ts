import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
  REMOTE_HTTP_BRIDGE_VERSION,
  REMOTE_HTTP_UPLOAD_CREDIT_BYTES,
  type RemoteHttpBridgeOpenRequest,
  type RemoteHttpBridgeOpenResult,
} from "@/shared/remote/httpBridgeProtocol";
import { RemoteHttpBridgeService } from "@/main/remoteHttp/remoteHttpBridgeService";
import {
  createInMemoryBridgePortPair,
  createQueuedCloningBridgePortPair,
  payloadOf,
  sha256Bytes,
  startLoopbackHttpServer,
  toClientPort,
  toWorkerPort,
  type InMemoryBridgePort,
  type LoopbackHttpServer,
  type QueuedCloningBridgePortPair,
} from "@/main/remoteHttp/remoteHttpBridgeTestHarness";
import {
  createRemoteHttpBridgeClient,
  type RemoteHttpBridgeClient,
  type RemoteHttpBridgePortListener,
  type RemoteHttpBridgeTransport,
} from "./remoteHttpBridgeClient";

const GENERATION = 9;

interface E2eHarnessOptions {
  readonly createPair?: () => { client: InMemoryBridgePort; worker: InMemoryBridgePort };
  readonly openHook?: (url: string) => void;
  readonly fetchImpl?: typeof fetch;
}

function createE2eHarness(options: E2eHarnessOptions = {}): {
  client: RemoteHttpBridgeClient;
  service: RemoteHttpBridgeService;
  opens: RemoteHttpBridgeOpenRequest[];
  cancels: string[];
} {
  const createPair = options.createPair ?? createInMemoryBridgePortPair;
  const service = new RemoteHttpBridgeService({
    portLingerMs: 10,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  const listeners = new Set<RemoteHttpBridgePortListener>();
  const opens: RemoteHttpBridgeOpenRequest[] = [];
  const cancels: string[] = [];
  const transport: RemoteHttpBridgeTransport = {
    version: REMOTE_HTTP_BRIDGE_VERSION,
    openRemoteHttpBridge: async (request) => {
      opens.push(request);
      options.openHook?.(request.url);
      const pair = createPair();
      service.open(
        {
          v: REMOTE_HTTP_BRIDGE_VERSION,
          kind: "open",
          generation: GENERATION,
          senderId: 1,
          requestId: request.requestId,
          url: request.url,
          method: request.method,
          headers: request.headers,
          hasBody: request.hasBody,
          bodyBytes: request.bodyBytes,
        },
        toWorkerPort(pair.worker),
      );
      // Deliver before the reply resolves: the renderer must buffer the port.
      queueMicrotask(() => {
        const envelope = {
          channel: REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
          v: REMOTE_HTTP_BRIDGE_VERSION,
          requestId: request.requestId,
          generation: GENERATION,
        };
        for (const listener of [...listeners]) listener(envelope, toClientPort(pair.client));
      });
      return { generation: GENERATION } satisfies RemoteHttpBridgeOpenResult;
    },
    cancelRemoteHttpBridge: async ({ requestId }) => {
      cancels.push(requestId);
      service.cancel(requestId, GENERATION);
    },
  };
  const client = createRemoteHttpBridgeClient({
    transport,
    subscribePorts: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { client, service, opens, cancels };
}

const servers: LoopbackHttpServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("off-main remote HTTP bridge end to end", () => {
  it("delivers an 8 MiB binary response with byte identity and order", async () => {
    const payload = payloadOf(8 * 1024 * 1024);
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": String(payload.byteLength),
      });
      res.end(Buffer.from(payload));
    });
    servers.push(server);
    const harness = createE2eHarness();

    const response = await harness.client.fetch(`${server.origin}/binary`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    const received = new Uint8Array(await response.arrayBuffer());

    expect(received.byteLength).toBe(payload.byteLength);
    expect(sha256Bytes(received)).toBe(sha256Bytes(payload));
    expect(harness.service.stats()).toMatchObject({
      activeRequests: 0,
      completedRequests: 1,
      downloadedBytes: payload.byteLength,
    });
    expect(server.requests).toHaveLength(1);
    // Main-side admission metadata carries no body bytes.
    expect(Object.keys(harness.opens[0]!).sort()).toEqual([
      "bodyBytes",
      "hasBody",
      "headers",
      "method",
      "requestId",
      "url",
    ]);
  });

  it("does not let an unpulled consumer stall a sibling request", async () => {
    const slowPayload = payloadOf(128 * 1024);
    const fastPayload = payloadOf(32 * 1024);
    const server = await startLoopbackHttpServer((req, res) => {
      if (req.url?.startsWith("/slow")) {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        let offset = 0;
        const step = 32 * 1024;
        const write = () => {
          if (offset >= slowPayload.byteLength) {
            res.end();
            return;
          }
          res.write(Buffer.from(slowPayload.subarray(offset, offset + step)));
          offset += step;
          setTimeout(write, 20);
        };
        write();
        return;
      }
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.from(fastPayload));
    });
    servers.push(server);
    const harness = createE2eHarness();

    const slowResponse = await harness.client.fetch(`${server.origin}/slow`);
    // Never pull the slow body: credit must stay at zero and must not stall
    // the sibling request.
    const fastResponse = await harness.client.fetch(`${server.origin}/fast`);
    const fastBytes = new Uint8Array(await fastResponse.arrayBuffer());
    expect(sha256Bytes(fastBytes)).toBe(sha256Bytes(fastPayload));

    const slowBytes = new Uint8Array(await slowResponse.arrayBuffer());
    expect(sha256Bytes(slowBytes)).toBe(sha256Bytes(slowPayload));
    await vi.waitFor(() => expect(harness.service.stats().activeRequests).toBe(0));
  });

  it("aborts mid-body, rejects AbortError, and closes the server socket", async () => {
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.write(Buffer.alloc(64 * 1024, 7));
      // Hold the response open until the client goes away.
    });
    servers.push(server);
    const harness = createE2eHarness();
    const controller = new AbortController();
    const response = await harness.client.fetch(`${server.origin}/stall`, {
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    await reader.read();

    controller.abort();

    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(server.requests[0]?.aborted).toBe(true));
    await vi.waitFor(() => expect(harness.service.stats().activeRequests).toBe(0));
  });

  it("cancels a body through ReadableStream.cancel and releases promptly", async () => {
    const server = await startLoopbackHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.write(Buffer.alloc(16 * 1024, 3));
    });
    servers.push(server);
    const harness = createE2eHarness();
    const response = await harness.client.fetch(`${server.origin}/stall`);
    await response.body!.cancel();

    await vi.waitFor(() => expect(server.requests[0]?.aborted).toBe(true));
    await vi.waitFor(() => expect(harness.service.stats().activeRequests).toBe(0));
    expect(harness.service.stats().cancelledRequests).toBe(1);
  });

  it("uploads through a cross-origin 307 replay with byte identity and no credential leakage", async () => {
    const payload = payloadOf(1024 * 1024);
    let targetBody: Buffer = Buffer.alloc(0);
    let targetHeaders: Record<string, string | string[] | undefined> = {};
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
      res.writeHead(307, {
        location: `${target.origin}/final`,
        "set-cookie": "sid=host-only; Path=/",
      });
      res.end();
    });
    servers.push(redirector);
    const harness = createE2eHarness();

    const response = await harness.client.fetch(`${redirector.origin}/start`, {
      method: "POST",
      headers: { authorization: "Bearer fixture-token" },
      body: payload,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(sha256Bytes(targetBody)).toBe(sha256Bytes(payload));
    expect(redirector.requests[0]?.headers.authorization).toBe("Bearer fixture-token");
    expect(targetHeaders.authorization).toBeUndefined();
    expect(targetHeaders.origin).toBeUndefined();
    expect(targetHeaders.cookie).toBeUndefined();
    expect(harness.service.stats().retainedUploadBytes).toBe(0);
  });

  it("handles HEAD/204/205/304, empty bodies, and the declared response cap", async () => {
    const server = await startLoopbackHttpServer((req, res) => {
      const path = req.url ?? "/";
      if (path === "/empty") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end();
        return;
      }
      if (path === "/huge") {
        res.writeHead(200, { "content-length": String(64 * 1024 * 1024 + 1) });
        res.write("x");
        return;
      }
      if (req.method === "HEAD") {
        res.writeHead(200, { "content-length": "12" });
        res.end();
        return;
      }
      res.writeHead(Number(path.replace("/", "")));
      res.end();
    });
    servers.push(server);
    const harness = createE2eHarness();

    const empty = await harness.client.fetch(`${server.origin}/empty`);
    expect(await empty.text()).toBe("");

    for (const [path, status] of [
      ["/204", 204],
      ["/205", 205],
      ["/304", 304],
    ] as const) {
      const response = await harness.client.fetch(`${server.origin}${path}`);
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
    }
    const head = await harness.client.fetch(`${server.origin}/head`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();

    await expect(harness.client.fetch(`${server.origin}/huge`)).rejects.toMatchObject({
      status: 0,
      code: "network",
    });
  });

  it("delivers a 65-header response and a 9000-character header value through client and service", async () => {
    const manyHeaders = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`x-regression-${index}`, "v"]),
    );
    const server = await startLoopbackHttpServer((req, res) => {
      if (req.url === "/long-value") {
        res.writeHead(200, { "content-type": "text/plain", "x-long": "b".repeat(9000) });
        res.end("long-ok");
        return;
      }
      res.writeHead(200, { "content-type": "text/plain", ...manyHeaders });
      res.end("many-ok");
    });
    servers.push(server);
    const harness = createE2eHarness();

    const many = await harness.client.fetch(`${server.origin}/many-headers`);
    expect(many.status).toBe(200);
    expect(await many.text()).toBe("many-ok");
    expect([...many.headers.keys()].filter((key) => key.startsWith("x-regression-"))).toHaveLength(
      65,
    );

    const long = await harness.client.fetch(`${server.origin}/long-value`);
    expect(long.status).toBe(200);
    expect(long.headers.get("x-long")).toHaveLength(9000);
    expect(await long.text()).toBe("long-ok");
    expect(harness.service.stats()).toMatchObject({
      completedRequests: 2,
      failedRequests: 0,
      activeRequests: 0,
    });
  });

  it("holds a paused utility to the bounded upload window and completes on release", async () => {
    const payload = payloadOf(3 * 1024 * 1024);
    let receivedSha = "";
    const server = await startLoopbackHttpServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        receivedSha = sha256Bytes(Buffer.concat(chunks));
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("uploaded");
      });
    });
    servers.push(server);
    let pair: QueuedCloningBridgePortPair | null = null;
    const harness = createE2eHarness({
      createPair: () => {
        pair = createQueuedCloningBridgePortPair();
        // The utility is slow before the client ever sends: upload frames are
        // cloned into the queue but not processed.
        pair.hold("worker");
        return pair;
      },
    });

    const pending = harness.client.fetch(`${server.origin}/upload`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: payload,
    });
    await vi.waitFor(() => expect(pair).not.toBeNull());
    // One bounded 1 MiB frame may queue; the whole 3 MiB body is never cloned.
    await vi.waitFor(() => expect(pair!.queuedDepth("worker")).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(pair!.queuedDepth("worker")).toBe(1);
    expect(server.requests).toHaveLength(0);

    pair!.release("worker");
    const response = await pending;
    expect(await response.text()).toBe("uploaded");
    expect(receivedSha).toBe(sha256Bytes(payload));
    await vi.waitFor(() => expect(pair!.queuedDepth("worker")).toBe(0));
    expect(harness.service.stats()).toMatchObject({
      activeRequests: 0,
      completedRequests: 1,
      retainedUploadBytes: 0,
      reservedUploadBytes: 0,
      uploadAccountedBytes: 0,
    });
  });

  it("does not let a stalled upload block a healthy upload sibling", async () => {
    const slowPayload = payloadOf(2 * 1024 * 1024);
    const fastPayload = payloadOf(256 * 1024);
    let slowBody: Buffer = Buffer.alloc(0);
    let fastBody: Buffer = Buffer.alloc(0);
    const server = await startLoopbackHttpServer((req, res) => {
      const chunks: Buffer[] = [];
      const target = req.url === "/slow" ? "slow" : "fast";
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        if (target === "slow") slowBody = Buffer.concat(chunks);
        else fastBody = Buffer.concat(chunks);
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(target);
      });
    });
    servers.push(server);
    let slowPair: QueuedCloningBridgePortPair | null = null;
    const harness = createE2eHarness({
      createPair: () => {
        const pair = createQueuedCloningBridgePortPair();
        if (slowPair === null) {
          slowPair = pair;
          pair.hold("worker");
        }
        return pair;
      },
    });

    const slow = harness.client.fetch(`${server.origin}/slow`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: slowPayload,
    });
    await vi.waitFor(() => expect(slowPair).not.toBeNull());
    const fast = await harness.client.fetch(`${server.origin}/fast`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: fastPayload,
    });
    expect(await fast.text()).toBe("fast");
    expect(sha256Bytes(fastBody)).toBe(sha256Bytes(fastPayload));
    // The paused sibling contributes at most its bounded window.
    expect(slowPair!.queuedDepth("worker")).toBe(1);

    slowPair!.release("worker");
    expect(await (await slow).text()).toBe("slow");
    expect(sha256Bytes(slowBody)).toBe(sha256Bytes(slowPayload));
    expect(harness.service.stats().activeRequests).toBe(0);
    expect(harness.service.stats().uploadAccountedBytes).toBe(0);
  });

  it("posts exact-length upload chunks for a view of a larger backing store", async () => {
    // A 64 MiB backing store with a 20 MiB attachment view: structured clone
    // preserves the whole viewed buffer, so a subarray frame would clone
    // 64 MiB per 1 MiB chunk and leak bytes outside the view.
    const backing = new Uint8Array(64 * 1024 * 1024).fill(0xab);
    const viewBytes = 20 * 1024 * 1024;
    const body = backing.subarray(4096, 4096 + viewBytes);
    for (let index = 0; index < body.byteLength; index += 1) body[index] = index % 251;

    let pair: QueuedCloningBridgePortPair | null = null;
    const harness = createE2eHarness({
      createPair: () => {
        pair = createQueuedCloningBridgePortPair();
        return pair;
      },
      fetchImpl: async () => new Response(null, { status: 204 }),
    });

    const response = await harness.client.fetch("https://host.test/upload", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(204);

    const chunks = pair!.worker.received.filter(
      (message) => (message as { kind?: string }).kind === "upload-chunk",
    ) as Array<{ data: Uint8Array }>;
    expect(chunks).toHaveLength(viewBytes / REMOTE_HTTP_UPLOAD_CREDIT_BYTES);
    for (const chunk of chunks) {
      expect(chunk.data.byteLength).toBe(REMOTE_HTTP_UPLOAD_CREDIT_BYTES);
      // Exact-length owned copies: the clone carries exactly this chunk and
      // zero bytes from the rest of the 64 MiB backing store.
      expect(chunk.data.buffer.byteLength).toBe(REMOTE_HTTP_UPLOAD_CREDIT_BYTES);
      expect(chunk.data.byteOffset).toBe(0);
    }
    const uploaded = new Uint8Array(viewBytes);
    for (const [index, chunk] of chunks.entries()) {
      uploaded.set(chunk.data, index * REMOTE_HTTP_UPLOAD_CREDIT_BYTES);
    }
    expect(sha256Bytes(uploaded)).toBe(sha256Bytes(body));
    expect(harness.service.stats()).toMatchObject({
      activeRequests: 0,
      completedRequests: 1,
      uploadedBytes: viewBytes,
      uploadAccountedBytes: 0,
    });
  });

  it("pins the upload credit window at one chunk of bounded delivery", () => {
    expect(REMOTE_HTTP_UPLOAD_CREDIT_BYTES).toBe(1024 * 1024);
  });
});
