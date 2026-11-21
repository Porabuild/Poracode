import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REMOTE_HTTP_BRIDGE_VERSION,
  REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
  type RemoteHttpBridgeOpenDescriptor,
  type RemoteHttpBridgePortDownstreamMessage,
  type RemoteHttpBridgePortUpstreamMessage,
} from "@/shared/remote/httpBridgeProtocol";
import {
  RemoteHttpBridgeService,
  type RemoteHttpBridgeWorkerPort,
} from "./remoteHttpBridgeService";

class ScriptedWorkerPort implements RemoteHttpBridgeWorkerPort {
  readonly sent: RemoteHttpBridgePortDownstreamMessage[] = [];
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly closeListeners = new Set<() => void>();

  postMessage(message: unknown): void {
    this.sent.push(message as RemoteHttpBridgePortDownstreamMessage);
  }
  start(): void {}
  close(): void {
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
}

function makeDescriptor(
  overrides: Partial<RemoteHttpBridgeOpenDescriptor> = {},
): RemoteHttpBridgeOpenDescriptor {
  return {
    v: REMOTE_HTTP_BRIDGE_VERSION,
    kind: "open",
    generation: 1,
    senderId: 7,
    requestId: crypto.randomUUID(),
    url: "https://remote.example.test/api/snapshot",
    method: "GET",
    headers: { authorization: "Bearer test-token" },
    hasBody: false,
    bodyBytes: 0,
    ...overrides,
  };
}

describe("RemoteHttpBridgeService stale keep-alive socket retry", () => {
  const services: RemoteHttpBridgeService[] = [];

  afterEach(() => {
    for (const service of services.splice(0)) service.abortAll();
  });

  it("retries a non-pinned safe GET once on undici UND_ERR_SOCKET and succeeds", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = vi.fn<typeof fetch>(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const service = new RemoteHttpBridgeService({ fetchImpl, portLingerMs: 25 });
    services.push(service);
    const port = new ScriptedWorkerPort();
    const request = makeDescriptor({ method: "GET" });
    service.open(request, port);

    await vi.waitFor(() => expect(port.frames("head")).toHaveLength(1));
    port.send({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "credit",
      requestId: request.requestId,
      bytes: REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
    });
    await vi.waitFor(() => expect(port.frames("end")).toHaveLength(1));
    expect(calls).toBe(2);
    expect(port.frames("error")).toHaveLength(0);
  });

  it("does not retry non-idempotent POST on stale keep-alive socket error", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = vi.fn<typeof fetch>(async () => {
      calls += 1;
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
      });
    });
    const service = new RemoteHttpBridgeService({ fetchImpl, portLingerMs: 25 });
    services.push(service);
    const port = new ScriptedWorkerPort();
    const request = makeDescriptor({
      method: "POST",
      hasBody: false,
      bodyBytes: 0,
    });
    service.open(request, port);

    await vi.waitFor(() => expect(port.frames("error")).toHaveLength(1));
    expect(port.frames("error")[0]).toMatchObject({ code: "network" });
    expect(calls).toBe(1);
  });

  it("does not retry GET on ECONNREFUSED", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = vi.fn<typeof fetch>(async () => {
      calls += 1;
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
      });
    });
    const service = new RemoteHttpBridgeService({ fetchImpl, portLingerMs: 25 });
    services.push(service);
    const port = new ScriptedWorkerPort();
    const request = makeDescriptor({ method: "GET" });
    service.open(request, port);

    await vi.waitFor(() => expect(port.frames("error")).toHaveLength(1));
    expect(port.frames("error")[0]).toMatchObject({ code: "network" });
    expect(calls).toBe(1);
  });
});
