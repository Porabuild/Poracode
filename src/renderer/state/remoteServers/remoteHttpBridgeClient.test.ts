import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
  REMOTE_HTTP_BRIDGE_VERSION,
  REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
  type RemoteHttpBridgeOpenRequest,
  type RemoteHttpBridgeOpenResult,
  type RemoteHttpBridgePortDownstreamMessage,
  type RemoteHttpBridgePortEnvelope,
} from "@/shared/remote/httpBridgeProtocol";
import {
  createInMemoryBridgePortPair,
  toClientPort,
  type InMemoryBridgePort,
} from "@/main/remoteHttp/remoteHttpBridgeTestHarness";
import {
  createRemoteHttpBridgeClient,
  type RemoteHttpBridgeClient,
  type RemoteHttpBridgePortListener,
  type RemoteHttpBridgeTransport,
} from "./remoteHttpBridgeClient";

const V = REMOTE_HTTP_BRIDGE_VERSION;

function createHarness() {
  const listeners = new Set<RemoteHttpBridgePortListener>();
  const opens: RemoteHttpBridgeOpenRequest[] = [];
  const cancels: string[] = [];
  let openImplementation:
    | ((request: RemoteHttpBridgeOpenRequest) => Promise<RemoteHttpBridgeOpenResult>)
    | null = null;
  let generation = 5;
  const transport: RemoteHttpBridgeTransport = {
    version: V,
    openRemoteHttpBridge: (request) => {
      opens.push(request);
      return openImplementation ? openImplementation(request) : Promise.resolve({ generation });
    },
    cancelRemoteHttpBridge: async ({ requestId }) => {
      cancels.push(requestId);
    },
  };
  const client: RemoteHttpBridgeClient = createRemoteHttpBridgeClient({
    transport,
    subscribePorts: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return {
    client,
    opens,
    cancels,
    setGeneration: (value: number) => {
      generation = value;
    },
    setOpenImplementation: (
      implementation: (request: RemoteHttpBridgeOpenRequest) => Promise<RemoteHttpBridgeOpenResult>,
    ) => {
      openImplementation = implementation;
    },
    deliver(portEnvelope: RemoteHttpBridgePortEnvelope, clientEnd: InMemoryBridgePort) {
      for (const listener of [...listeners]) listener(portEnvelope, toClientPort(clientEnd));
    },
  };
}

function envelope(requestId: string, generation = 5): RemoteHttpBridgePortEnvelope {
  return { channel: REMOTE_HTTP_BRIDGE_PORT_CHANNEL, v: V, requestId, generation };
}

function head(
  requestId: string,
  overrides: Partial<RemoteHttpBridgePortDownstreamMessage> = {},
): RemoteHttpBridgePortDownstreamMessage {
  return {
    v: V,
    kind: "head",
    requestId,
    generation: 5,
    status: 200,
    statusText: "OK",
    headers: [["content-type", "text/plain"]],
    ...overrides,
  } as RemoteHttpBridgePortDownstreamMessage;
}

function chunk(
  requestId: string,
  data: Uint8Array,
  generation = 5,
): RemoteHttpBridgePortDownstreamMessage {
  return { v: V, kind: "chunk", requestId, generation, data };
}

function end(requestId: string, generation = 5): RemoteHttpBridgePortDownstreamMessage {
  return { v: V, kind: "end", requestId, generation };
}

async function firstRequestId(harness: ReturnType<typeof createHarness>): Promise<string> {
  await vi.waitFor(() => expect(harness.opens).toHaveLength(1));
  return harness.opens[0]!.requestId;
}

describe("RemoteHttpBridgeClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a port delivered before the open reply resolves", async () => {
    const harness = createHarness();
    const deferred = Promise.withResolvers<RemoteHttpBridgeOpenResult>();
    harness.setOpenImplementation(() => deferred.promise);
    const pending = harness.client.fetch("https://host.test/large");
    const requestId = await firstRequestId(harness);
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);
    deferred.resolve({ generation: 5 });

    pair.worker.postMessage(head(requestId));
    pair.worker.postMessage(chunk(requestId, new TextEncoder().encode("hello ")));
    pair.worker.postMessage(chunk(requestId, new TextEncoder().encode("bridge")));
    pair.worker.postMessage(end(requestId));

    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello bridge");
    expect(pair.client.closed).toBe(true);
  });

  it("fences frames to the minted generation", async () => {
    const harness = createHarness();
    const pending = harness.client.fetch("https://host.test/api");
    const requestId = await firstRequestId(harness);
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);

    pair.worker.postMessage(head(requestId));
    pair.worker.postMessage(chunk(requestId, new TextEncoder().encode("stale"), 4));
    pair.worker.postMessage(chunk(requestId, new TextEncoder().encode("fresh"), 5));
    pair.worker.postMessage(end(requestId));

    const response = await pending;
    expect(await response.text()).toBe("fresh");
  });

  it("closes duplicate and unknown ports", async () => {
    const harness = createHarness();
    const pending = harness.client.fetch("https://host.test/api");
    const requestId = await firstRequestId(harness);
    const first = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), first.client);
    const duplicate = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), duplicate.client);
    expect(duplicate.client.closed).toBe(true);

    const stranger = createInMemoryBridgePortPair();
    harness.deliver(
      {
        channel: REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
        v: V,
        requestId: "f7cf6f5a-bc12-4e3a-8d91-c0a602c350f0",
        generation: 5,
      },
      stranger.client,
    );
    expect(stranger.client.closed).toBe(true);

    first.worker.postMessage(head(requestId));
    first.worker.postMessage(end(requestId));
    await pending;
  });

  it("rejects a pre-head error as the status-zero transport error", async () => {
    const harness = createHarness();
    const pending = harness.client.fetch("https://host.test/api");
    const requestId = await firstRequestId(harness);
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);
    pair.worker.postMessage({
      v: V,
      kind: "error",
      requestId,
      generation: 5,
      code: "too-large",
      message: "response body too large",
    });

    await expect(pending).rejects.toMatchObject({
      status: 0,
      code: "network",
    });
  });

  it("preserves the certificate mismatch code instead of reporting offline", async () => {
    const harness = createHarness();
    const pending = harness.client.fetch("https://host.test/api", {
      certFingerprint: "a".repeat(64),
    });
    const requestId = await firstRequestId(harness);
    expect(harness.opens[0]?.certFingerprint).toBe("a".repeat(64));
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);
    pair.worker.postMessage({
      v: V,
      kind: "error",
      requestId,
      generation: 5,
      code: "certificate_fingerprint_mismatch",
      message: "certificate_fingerprint_mismatch",
    });
    await expect(pending).rejects.toMatchObject({
      status: 502,
      code: "certificate_fingerprint_mismatch",
    });
  });

  it("aborts while opening, cancels by id, and drops a late port", async () => {
    const harness = createHarness();
    const deferred = Promise.withResolvers<RemoteHttpBridgeOpenResult>();
    harness.setOpenImplementation(() => deferred.promise);
    const controller = new AbortController();
    const pending = harness.client.fetch("https://host.test/api", { signal: controller.signal });
    const requestId = await firstRequestId(harness);

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(harness.cancels).toContain(requestId);

    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);
    expect(pair.client.closed).toBe(true);
    deferred.resolve({ generation: 5 });
  });

  it("keeps cancellation alive after headers and cancels the transport port", async () => {
    const harness = createHarness();
    const controller = new AbortController();
    const pending = harness.client.fetch("https://host.test/api", { signal: controller.signal });
    const requestId = await firstRequestId(harness);
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);
    pair.worker.postMessage(head(requestId));
    pair.worker.postMessage(chunk(requestId, new TextEncoder().encode("partial")));
    const response = await pending;

    controller.abort();

    await expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
    expect(harness.cancels).toContain(requestId);
    await vi.waitFor(() =>
      expect(pair.worker.received).toContainEqual(
        expect.objectContaining({ kind: "cancel", requestId }),
      ),
    );
    expect(pair.client.closed).toBe(true);
  });

  it("signals ReadableStream.cancel to the utility", async () => {
    const harness = createHarness();
    const pending = harness.client.fetch("https://host.test/api");
    const requestId = await firstRequestId(harness);
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);
    pair.worker.postMessage(head(requestId));
    const response = await pending;

    await response.body!.cancel();

    await vi.waitFor(() =>
      expect(pair.worker.received).toContainEqual(
        expect.objectContaining({ kind: "cancel", requestId }),
      ),
    );
    expect(pair.client.closed).toBe(true);
    expect(harness.cancels).toContain(requestId);
  });

  it("returns a null body for HEAD and 204/205/304 without granting credit", async () => {
    for (const [status, method] of [
      [200, "HEAD"],
      [204, "GET"],
      [205, "GET"],
      [304, "GET"],
    ] as const) {
      const harness = createHarness();
      const pending = harness.client.fetch("https://host.test/api", { method });
      const requestId = await firstRequestId(harness);
      const pair = createInMemoryBridgePortPair();
      harness.deliver(envelope(requestId), pair.client);
      pair.worker.postMessage(head(requestId, { status }));
      pair.worker.postMessage(end(requestId));
      const response = await pending;
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
      expect(pair.worker.received).not.toContainEqual(expect.objectContaining({ kind: "credit" }));
    }
  });

  it("grants bounded credit as the stream fills and refills", async () => {
    const harness = createHarness();
    const pending = harness.client.fetch("https://host.test/api");
    const requestId = await firstRequestId(harness);
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);
    pair.worker.postMessage(head(requestId));
    const response = await pending;
    // The stream's one-chunk queue is consumer capacity: exactly one bounded
    // grant, never an unbounded window.
    await vi.waitFor(() =>
      expect(
        pair.worker.received.filter((message) => (message as { kind?: string }).kind === "credit"),
      ).toEqual([
        expect.objectContaining({
          kind: "credit",
          requestId,
          bytes: REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
        }),
      ]),
    );

    const reader = response.body!.getReader();
    pair.worker.postMessage(chunk(requestId, new TextEncoder().encode("0123456789")));
    const firstRead = await reader.read();
    expect(new TextDecoder().decode(firstRead.value)).toBe("0123456789");
    // Refill grants exactly the consumed bytes; total outstanding stays ≤ 1 MiB.
    await vi.waitFor(() =>
      expect(pair.worker.received).toContainEqual(
        expect.objectContaining({ kind: "credit", requestId, bytes: 10 }),
      ),
    );

    const secondRead = reader.read();
    pair.worker.postMessage(end(requestId));
    await expect(secondRead).resolves.toMatchObject({ done: true });
  });

  it("rejects an oversized header budget before opening", async () => {
    const harness = createHarness();
    await expect(
      harness.client.fetch("https://host.test/api", {
        headers: { big: "a".repeat(64 * 1024) },
      }),
    ).rejects.toMatchObject({ status: 0, code: "network" });
    expect(harness.opens).toHaveLength(0);
  });

  function uploadChunks(pair: { readonly worker: { readonly received: readonly unknown[] } }) {
    return pair.worker.received.filter(
      (message) => (message as { kind?: string }).kind === "upload-chunk",
    ) as Array<{ readonly kind: string; readonly data: Uint8Array }>;
  }

  function uploadGrant(requestId: string, bytes: number): RemoteHttpBridgePortDownstreamMessage {
    return { v: V, kind: "upload-grant", requestId, generation: 5, bytes };
  }

  it("waits for the utility upload window and never posts beyond it", async () => {
    const harness = createHarness();
    const body = new Uint8Array(9000).fill(7);
    const pending = harness.client.fetch("https://host.test/upload", { method: "POST", body });
    const requestId = await firstRequestId(harness);
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);

    // No payload byte before the utility grants an upload window.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(uploadChunks(pair)).toHaveLength(0);

    pair.worker.postMessage(uploadGrant(requestId, 2000));
    await vi.waitFor(() => expect(uploadChunks(pair)).toHaveLength(1));
    expect(uploadChunks(pair)[0]!.data.byteLength).toBe(2000);
    // A granted window that is fully sent does not keep posting.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(uploadChunks(pair)).toHaveLength(1);

    pair.worker.postMessage(uploadGrant(requestId, 2000));
    await vi.waitFor(() => expect(uploadChunks(pair)).toHaveLength(2));
    pair.worker.postMessage(uploadGrant(requestId, 2000));
    await vi.waitFor(() => expect(uploadChunks(pair)).toHaveLength(3));
    pair.worker.postMessage(uploadGrant(requestId, 2000));
    await vi.waitFor(() => expect(uploadChunks(pair)).toHaveLength(4));
    expect(uploadChunks(pair).reduce((total, part) => total + part.data.byteLength, 0)).toBe(8000);

    pair.worker.postMessage(uploadGrant(requestId, 1000));
    await vi.waitFor(() =>
      expect(pair.worker.received).toContainEqual(
        expect.objectContaining({ kind: "upload-end", requestId }),
      ),
    );
    expect(uploadChunks(pair)).toHaveLength(5);
    expect(uploadChunks(pair).reduce((total, part) => total + part.data.byteLength, 0)).toBe(9000);

    pair.worker.postMessage(head(requestId));
    pair.worker.postMessage(end(requestId));
    await expect(pending).resolves.toMatchObject({ status: 200 });
  });

  it("stops an in-flight upload when the request is aborted", async () => {
    const harness = createHarness();
    const controller = new AbortController();
    const body = new Uint8Array(4 * 1024 * 1024).fill(3);
    const pending = harness.client.fetch("https://host.test/upload", {
      method: "POST",
      body,
      signal: controller.signal,
    });
    const requestId = await firstRequestId(harness);
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);
    pair.worker.postMessage(uploadGrant(requestId, 1024 * 1024));
    await vi.waitFor(() => expect(uploadChunks(pair)).toHaveLength(1));

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() =>
      expect(pair.worker.received).toContainEqual(
        expect.objectContaining({ kind: "cancel", requestId }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    // The ungranted remainder of the body is never posted.
    expect(uploadChunks(pair)).toHaveLength(1);
  });

  it("fails an active request promptly on a malformed downstream frame", async () => {
    const harness = createHarness();
    const pending = harness.client.fetch("https://host.test/api");
    const requestId = await firstRequestId(harness);
    const pair = createInMemoryBridgePortPair();
    harness.deliver(envelope(requestId), pair.client);
    // Invalid status: the downstream validator rejects it, so the client must
    // fail now instead of waiting for the service deadline.
    pair.worker.postMessage({
      v: V,
      kind: "head",
      requestId,
      generation: 5,
      status: 99,
      statusText: "Bad",
      headers: [],
    });

    await expect(pending).rejects.toMatchObject({
      status: 0,
      code: "network",
      cause: { message: "The remote HTTP bridge sent a malformed frame." },
    });
    expect(pair.client.closed).toBe(true);
  });
});
