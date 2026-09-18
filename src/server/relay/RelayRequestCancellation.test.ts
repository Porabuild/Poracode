import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { connect as netConnect, type AddressInfo, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { headersToRecord } from "@/shared/http";
import { deriveForwardOwner, ForwardOriginPolicy } from "@/main/remote/portForward/forwardOrigin";
import {
  PORACODE_RELAY_PROTOCOL_VERSION,
  relayHostFrameSchema,
  relayServerFrameSchema,
} from "@/shared/remote/relayProtocol";
import { startRelayHost, type RelayHostHandle, type RelaySocket } from "./relayHost";
import { RelayServer } from "./relayServer";

/** Let settled fetches/timeouts drain their microtasks before asserting that a
 * canceled request stayed silent (no positive condition to wait for). */
const flush = (ms = 25): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("req-cancel protocol compatibility", () => {
  const cancel = { t: "req-cancel", id: "req-1" };

  it("parses a bounded cancel frame on the host's inbound union", () => {
    expect(relayServerFrameSchema.parse(cancel)).toEqual(cancel);
    expect(relayServerFrameSchema.safeParse({ t: "req-cancel", id: "" }).success).toBe(false);
    expect(relayServerFrameSchema.safeParse({ t: "req-cancel" }).success).toBe(false);
  });

  it("stays additive: legacy frames still parse and the relay still drops req-cancel", () => {
    // Every pre-cancel relay→host frame keeps parsing unchanged.
    expect(
      relayServerFrameSchema.parse({ t: "req", id: "r", method: "GET", path: "/", headers: {} }).t,
    ).toBe("req");
    // `req-cancel` is relay→host only: it is not in the host→relay union.
    // That is also exactly how a host predating this frame behaves — the
    // discriminated union's safeParse fails on the unknown `t` and the frame
    // is dropped silently.
    expect(relayHostFrameSchema.safeParse(cancel).success).toBe(false);
  });

  it("was introduced additively in v2 and is retained unchanged in v3", () => {
    // `req-cancel` shipped inside protocol 2 without a bump: hosts predating
    // it drop the unknown discriminator silently, and older relays never send
    // it — in that pairing an aborted visitor's request unwinds via the
    // host's own request timeout, exactly as before. Protocol 3 was bumped
    // for binary ws-data fidelity (relayBinaryFrame), NOT for this frame;
    // `req-cancel` rides v3 byte-identically (the parses above prove the
    // unions are unchanged) and the host still honors it.
    expect(PORACODE_RELAY_PROTOCOL_VERSION).toBe(3);
  });
});

interface FakeRelaySocket extends RelaySocket {
  readonly sent: string[];
  readyState: number;
  bufferedAmount: number;
  closed: boolean;
}

function fakeSocket(): FakeRelaySocket {
  return {
    sent: [],
    readyState: 1,
    bufferedAmount: 0,
    closed: false,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    // These suites only exercise text frames; the annotation keeps `sent`
    // string-typed while the method stays bivariantly assignable to the
    // widened RelaySocket.
    send(data: string) {
      this.sent.push(data);
    },
    close() {
      this.closed = true;
    },
  };
}

function frame(data: unknown): { data: string } {
  return { data: JSON.stringify(data) };
}

function sentFrames(control: FakeRelaySocket): Array<Record<string, unknown>> {
  return control.sent.map((data) => JSON.parse(data) as Record<string, unknown>);
}

/** A hanging fetch whose settle/abort controls the test holds. */
function hangingFetch(): {
  fetchImpl: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
  signal: () => AbortSignal | undefined;
  settle: (response: Response) => void;
  fail: (error: Error) => void;
} {
  let capturedSignal: AbortSignal | undefined;
  let resolveResponse: ((response: Response) => void) | undefined;
  let rejectResponse: ((error: Error) => void) | undefined;
  return {
    fetchImpl: (_url, init) =>
      new Promise<Response>((resolve, reject) => {
        capturedSignal = init?.signal ?? undefined;
        resolveResponse = resolve;
        rejectResponse = reject;
      }),
    signal: () => capturedSignal,
    settle: (response) => resolveResponse?.(response),
    fail: (error) => rejectResponse?.(error),
  };
}

describe("relay host request cancellation (control framing)", () => {
  const baseOptions = {
    relayUrl: "ws://relay.test/host",
    serverId: "srv-1",
    secret: "secret",
    localHttpUrl: "http://127.0.0.1:38987",
  };

  it("aborts the local fetch on req-cancel and stays silent when the work settles late", async () => {
    const control = fakeSocket();
    const fetcher = hangingFetch();
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      fetchImpl: fetcher.fetchImpl,
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/slow", headers: {} }),
    );
    await vi.waitFor(() => expect(fetcher.signal()).toBeDefined());
    expect(fetcher.signal()!.aborted).toBe(false);

    control.onmessage?.(frame({ t: "req-cancel", id: "req-1" }));
    expect(fetcher.signal()!.aborted).toBe(true);

    // The local work completes anyway — a canceled id must never answer.
    fetcher.settle(new Response("late body"));
    await flush();
    expect(sentFrames(control).filter((f) => f.id === "req-1")).toEqual([]);
    handle.dispose();
  });

  it("suppresses the timeout report when a cancel arrived first", async () => {
    vi.useFakeTimers();
    try {
      const control = fakeSocket();
      const fetcher = hangingFetch();
      const handle = startRelayHost({
        ...baseOptions,
        requestTimeoutMs: 50,
        socketFactory: () => control,
        fetchImpl: fetcher.fetchImpl,
      });

      control.onopen?.();
      control.onmessage?.(
        frame({ t: "req", id: "req-1", method: "GET", path: "/slow", headers: {} }),
      );
      expect(fetcher.signal()).toBeDefined();
      control.onmessage?.(frame({ t: "req-cancel", id: "req-1" }));
      expect(fetcher.signal()!.aborted).toBe(true);

      // Well past the host's own deadline: the canceled entry is gone, so the
      // timer finds nothing to abort and no `req-error` may go out.
      await vi.advanceTimersByTimeAsync(500);
      expect(sentFrames(control).filter((f) => f.t === "req-error")).toEqual([]);
      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts in-flight local requests when the control socket is lost", async () => {
    const control = fakeSocket();
    const fetcher = hangingFetch();
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      fetchImpl: fetcher.fetchImpl,
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/slow", headers: {} }),
    );
    await vi.waitFor(() => expect(fetcher.signal()).toBeDefined());

    control.onclose?.();
    expect(fetcher.signal()!.aborted).toBe(true);
    fetcher.fail(new Error("The operation was aborted"));
    await flush();
    expect(sentFrames(control).filter((f) => f.t === "req-error")).toEqual([]);
    handle.dispose();
  });

  it("aborts in-flight local requests on dispose", async () => {
    const control = fakeSocket();
    const fetcher = hangingFetch();
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      fetchImpl: fetcher.fetchImpl,
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/slow", headers: {} }),
    );
    await vi.waitFor(() => expect(fetcher.signal()).toBeDefined());

    handle.dispose();
    expect(fetcher.signal()!.aborted).toBe(true);
    fetcher.settle(new Response("late body"));
    await flush();
    expect(sentFrames(control).filter((f) => f.id === "req-1")).toEqual([]);
  });

  it("cancels only the canceled request: a concurrent request still completes", async () => {
    const control = fakeSocket();
    const fetcher = hangingFetch();
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      fetchImpl: (url, init) => {
        const path = String(url).replace("http://127.0.0.1:38987", "");
        if (path === "/slow") return fetcher.fetchImpl(url, init);
        return Promise.resolve(new Response(`ok:${path}`));
      },
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/slow", headers: {} }),
    );
    await vi.waitFor(() => expect(fetcher.signal()).toBeDefined());
    control.onmessage?.(frame({ t: "req-cancel", id: "req-1" }));
    control.onmessage?.(
      frame({ t: "req", id: "req-2", method: "GET", path: "/fast", headers: {} }),
    );

    await vi.waitFor(() => {
      expect(sentFrames(control)).toContainEqual(
        expect.objectContaining({ t: "res", id: "req-2", status: 200 }),
      );
    });
    expect(sentFrames(control).filter((f) => f.id === "req-1")).toEqual([]);
    handle.dispose();
  });

  it("treats a cancel for an unknown or already-finished id as a no-op", async () => {
    const control = fakeSocket();
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      fetchImpl: async () => new Response("ok"),
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/fast", headers: {} }),
    );
    await vi.waitFor(() => {
      expect(sentFrames(control)).toContainEqual(
        expect.objectContaining({ t: "res", id: "req-1" }),
      );
    });
    expect(() => {
      control.onmessage?.(frame({ t: "req-cancel", id: "req-1" }));
      control.onmessage?.(frame({ t: "req-cancel", id: "never-dispatched" }));
    }).not.toThrow();
    expect(sentFrames(control).filter((f) => f.t === "req-error")).toEqual([]);
    handle.dispose();
  });

  it("answers a normally completed request even while cancellation support is active", async () => {
    const control = fakeSocket();
    const handle = startRelayHost({
      ...baseOptions,
      socketFactory: () => control,
      fetchImpl: async () => new Response("payload"),
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/api/snapshot", headers: {} }),
    );

    await vi.waitFor(() => {
      expect(sentFrames(control)).toContainEqual(
        expect.objectContaining({ t: "res", id: "req-1", status: 200 }),
      );
    });
    const res = sentFrames(control).find((f) => f.t === "res");
    expect(Buffer.from(String(res!.body), "base64").toString("utf8")).toBe("payload");
    handle.dispose();
  });
});

describe("relay API ingress dispatch marker", () => {
  function setupWithDispatchKey() {
    const control = fakeSocket();
    const seenRequestHeaders: Array<Record<string, string>> = [];
    const seenWsHeaders: Array<Record<string, string> | undefined> = [];
    const originSecret = Buffer.alloc(32, 1).toString("base64url");
    const dispatchKey = Buffer.alloc(32, 2).toString("base64url");
    const ownerId = deriveForwardOwner(originSecret, "srv-1");
    const policy = new ForwardOriginPolicy("https://apps.example.test");
    const forwardId = "01234567-89ab-4cde-8f01-23456789abcd";
    const forward = { forwardId, origin: policy.originFor(ownerId, forwardId) };
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      forwardOriginSecret: originSecret,
      forwardDispatchKey: dispatchKey,
      socketFactory: () => control,
      fetchImpl: async (_url, init) => {
        seenRequestHeaders.push(headersToRecord(new Headers(init?.headers)));
        return new Response("ok");
      },
      wsFactory: (_url, headers) => {
        seenWsHeaders.push(headers);
        return fakeSocket();
      },
    });
    control.onopen?.();
    control.onmessage?.(
      frame({
        t: "registered",
        serverId: "srv-1",
        publicUrl: "https://relay.test/s/srv-1/",
        forwardOrigin: { baseUrl: policy.baseUrl, ownerId },
      }),
    );
    return { control, seenRequestHeaders, seenWsHeaders, dispatchKey, forward, handle };
  }

  it("marks ordinary API requests with only the dispatch key and route: api", async () => {
    const test = setupWithDispatchKey();
    try {
      // A visitor attempting to forge route/identity headers cannot: they are
      // stripped before the host mints its own.
      test.control.onmessage?.(
        frame({
          t: "req",
          id: "api-1",
          method: "GET",
          path: "/api/snapshot",
          headers: {
            "x-poracode-forward-route": "evil",
            "x-poracode-forward-key": "forged",
          },
        }),
      );
      await vi.waitFor(() => expect(test.seenRequestHeaders.length).toBe(1));
      const headers = test.seenRequestHeaders[0]!;
      expect(headers["x-poracode-forward-key"]).toBe(test.dispatchKey);
      expect(headers["x-poracode-forward-route"]).toBe("api");
      // Nothing else from the forward namespace may ride along on API ingress.
      const forwardHeaders = Object.keys(headers).filter((key) =>
        key.startsWith("x-poracode-forward-"),
      );
      expect(forwardHeaders.sort()).toEqual(["x-poracode-forward-key", "x-poracode-forward-route"]);
    } finally {
      test.handle.dispose();
    }
  });

  it("keeps child forward requests on the full id/origin triple with no route marker", async () => {
    const test = setupWithDispatchKey();
    try {
      test.control.onmessage?.(
        frame({
          t: "req",
          id: "child-1",
          method: "GET",
          path: "/",
          headers: {},
          forward: test.forward,
        }),
      );
      await vi.waitFor(() => expect(test.seenRequestHeaders.length).toBe(1));
      const headers = test.seenRequestHeaders[0]!;
      expect(headers["x-poracode-forward-key"]).toBe(test.dispatchKey);
      expect(headers["x-poracode-forward-id"]).toBe(test.forward.forwardId);
      expect(headers["x-poracode-forward-origin"]).toBe(test.forward.origin);
      expect(headers).not.toHaveProperty("x-poracode-forward-route");
    } finally {
      test.handle.dispose();
    }
  });

  it("adds no marker to ordinary WebSocket upgrades or hosts without a dispatch key", async () => {
    const withKey = setupWithDispatchKey();
    try {
      withKey.control.onmessage?.(frame({ t: "ws-open", id: "ch-1", path: "/ws?ticket=t" }));
      expect(withKey.seenWsHeaders[0]).toBeDefined();
      expect(
        Object.keys(withKey.seenWsHeaders[0]!).filter((key) =>
          key.startsWith("x-poracode-forward-"),
        ),
      ).toEqual([]);
    } finally {
      withKey.handle.dispose();
    }

    const control = fakeSocket();
    const seenRequestHeaders: Array<Record<string, string>> = [];
    const plain = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async (_url, init) => {
        seenRequestHeaders.push(headersToRecord(new Headers(init?.headers)));
        return new Response("ok");
      },
    });
    try {
      control.onopen?.();
      control.onmessage?.(
        frame({ t: "req", id: "api-2", method: "GET", path: "/api/snapshot", headers: {} }),
      );
      await vi.waitFor(() => expect(seenRequestHeaders.length).toBe(1));
      expect(
        Object.keys(seenRequestHeaders[0]!).filter((key) => key.startsWith("x-poracode-forward-")),
      ).toEqual([]);
    } finally {
      plain.dispose();
    }
  });
});

/**
 * Real-socket cancellation: a real RelayServer, a real relay host dialing it
 * over a real WebSocket, and a real local origin HTTP server — cancellation is
 * observed where it matters, at the local origin's request handler.
 */
describe("relay request cancellation end-to-end (real sockets)", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  /**
   * Local origin with three behaviors: `/slow` hangs until its client goes
   * away (recording the abort), `/delayed` answers after a short delay, and
   * everything else answers immediately. `events` records handler progress.
   */
  async function startLocalOrigin(): Promise<{ url: string; events: string[] }> {
    const events: string[] = [];
    const server: HttpServer = createHttpServer((req, res) => {
      const path = req.url ?? "/";
      if (path === "/slow") {
        events.push("slow-start");
        res.on("close", () => {
          if (!res.writableEnded) events.push("slow-aborted");
        });
        return; // hang: only cancellation can end this request
      }
      if (path === "/delayed") {
        events.push("delayed-start");
        setTimeout(() => {
          if (!res.destroyed) {
            res.writeHead(200, { "content-type": "text/plain" });
            res.end("delayed-ok");
            events.push("delayed-finished");
          }
        }, 50);
        return;
      }
      events.push(`hit:${path}`);
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`ok:${path}`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    cleanups.push(async () => {
      server.closeIdleConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    return { url: `http://127.0.0.1:${port}`, events };
  }

  interface RelayStack {
    readonly relayBase: string;
    readonly events: string[];
    readonly controls: WebSocket[];
    readonly handle: RelayHostHandle;
  }

  async function startRelayStack(
    options: {
      readonly relayRequestTimeoutMs?: number;
      readonly minReconnectMs?: number;
    } = {},
  ): Promise<RelayStack> {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      ...(options.relayRequestTimeoutMs !== undefined
        ? { requestTimeoutMs: options.relayRequestTimeoutMs }
        : {}),
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const local = await startLocalOrigin();
    const controls: WebSocket[] = [];
    let onRegistered: ((publicUrl: string) => void) | null = null;
    const registration = new Promise<string>((resolve) => {
      onRegistered = resolve;
    });
    const handle = startRelayHost({
      relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
      serverId: "srv-cancel",
      secret: "shhh",
      localHttpUrl: local.url,
      ...(options.minReconnectMs !== undefined ? { minReconnectMs: options.minReconnectMs } : {}),
      socketFactory: (url) => {
        const ws = new WebSocket(url);
        controls.push(ws);
        return ws as unknown as RelaySocket;
      },
      onRegistered: (publicUrl) => onRegistered?.(publicUrl),
    });
    cleanups.push(() => handle.dispose());
    await registration;
    return {
      relayBase: `http://127.0.0.1:${relayInfo.port}/s/srv-cancel`,
      events: local.events,
      controls,
      handle,
    };
  }

  /** A raw visitor socket that issues one request against the relay and stays
   * connected until the test destroys it. */
  async function openRawVisitor(relayBase: string, path: string): Promise<Socket> {
    const base = new URL(relayBase);
    const socket = netConnect(Number(base.port), "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    // The visitor targets the relay's `/s/<id>` namespace, not the root.
    socket.write(
      `GET ${base.pathname}${path} HTTP/1.1\r\nHost: ${base.host}\r\nConnection: close\r\n\r\n`,
    );
    cleanups.push(() => {
      socket.destroy();
    });
    return socket;
  }

  it("completes a normal request untouched", async () => {
    const stack = await startRelayStack();
    const response = await fetch(`${stack.relayBase}/delayed`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("delayed-ok");
    expect(stack.events).toContain("delayed-start");
    expect(stack.events).toContain("delayed-finished");
  });

  it("aborts the local fetch when the visitor disconnects early, and other visitors succeed", async () => {
    const stack = await startRelayStack();

    const slowVisitor = await openRawVisitor(stack.relayBase, "/slow");
    await vi.waitFor(() => expect(stack.events).toContain("slow-start"), { timeout: 10_000 });

    // A second, unrelated visitor is never affected by the cancellation path.
    const healthy = await fetch(`${stack.relayBase}/healthy`);
    expect(healthy.status).toBe(200);
    expect(await healthy.text()).toBe("ok:/healthy");
    expect(stack.events).toContain("hit:/healthy");

    slowVisitor.destroy();
    // Without propagation the local origin would never observe an abort inside
    // this window (both defaults are 60s timeouts); with it, the relay's
    // `req-cancel` reaches the host and its fetch is aborted at once.
    await vi.waitFor(() => expect(stack.events).toContain("slow-aborted"), { timeout: 10_000 });

    // The relay and host stay healthy afterwards.
    const after = await fetch(`${stack.relayBase}/after`);
    expect(after.status).toBe(200);
    expect(await after.text()).toBe("ok:/after");
  });

  it("aborts the local work when the relay⇄host control is lost, then recovers", async () => {
    const stack = await startRelayStack({ minReconnectMs: 100 });

    const slowVisitor = await openRawVisitor(stack.relayBase, "/slow");
    await vi.waitFor(() => expect(stack.events).toContain("slow-start"), { timeout: 10_000 });

    expect(stack.controls[0]).toBeDefined();
    stack.controls[0]!.terminate();

    await vi.waitFor(() => expect(stack.events).toContain("slow-aborted"), { timeout: 10_000 });
    // The host re-registers and serves again after the loss.
    await vi.waitFor(
      async () => {
        const response = await fetch(`${stack.relayBase}/recovered`);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("ok:/recovered");
      },
      { timeout: 10_000 },
    );
    slowVisitor.destroy();
  });

  it("aborts the local work when the host is disposed", async () => {
    const stack = await startRelayStack();

    const slowVisitor = await openRawVisitor(stack.relayBase, "/slow");
    await vi.waitFor(() => expect(stack.events).toContain("slow-start"), { timeout: 10_000 });

    stack.handle.dispose();
    await vi.waitFor(() => expect(stack.events).toContain("slow-aborted"), { timeout: 10_000 });
    slowVisitor.destroy();
  });

  it("propagates a relay request timeout to the host before the host's own deadline", async () => {
    // The relay gives up at 300ms; the host's own default deadline is 60s.
    // Only propagated cancellation can stop the local origin's work promptly.
    const stack = await startRelayStack({ relayRequestTimeoutMs: 300 });

    const pending = fetch(`${stack.relayBase}/slow`);
    await vi.waitFor(() => expect(stack.events).toContain("slow-start"), { timeout: 10_000 });

    await vi.waitFor(() => expect(stack.events).toContain("slow-aborted"), { timeout: 10_000 });
    const response = await pending;
    expect(response.status).toBe(502);
    expect(await response.text()).toContain("timed out");
  });

  it("never dispatches a request whose visitor vanished during the body upload", async () => {
    const stack = await startRelayStack();
    const base = new URL(stack.relayBase);

    const socket = netConnect(Number(base.port), "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    cleanups.push(() => {
      socket.destroy();
    });
    socket.write(
      `POST ${base.pathname}/upload HTTP/1.1\r\nHost: ${base.host}\r\nContent-Length: 1000\r\nConnection: close\r\n\r\n10-bytes-`,
    );
    await flush(50);
    socket.destroy();

    // No host work may start for a request that never fully arrived; the relay
    // must keep serving afterwards.
    await flush(100);
    expect(stack.events).not.toContain("hit:/upload");
    const healthy = await fetch(`${stack.relayBase}/healthy`);
    expect(healthy.status).toBe(200);
    expect(await healthy.text()).toBe("ok:/healthy");
  });
});
