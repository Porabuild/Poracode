import { deriveForwardOwner, ForwardOriginPolicy } from "@/main/remote/portForward/forwardOrigin";
import { PORACODE_RELAY_PROTOCOL_VERSION } from "@/shared/remote/relayProtocol";
import { describe, expect, it, vi } from "vitest";
import { startRelayHost, type RelaySocket } from "./relayHost";

interface FakeRelaySocket extends RelaySocket {
  readonly sent: string[];
  readyState: number;
  bufferedAmount: number;
  closed: boolean;
}

function fakeSocket(send?: (data: string) => void, readyState = 1): FakeRelaySocket {
  return {
    sent: [],
    readyState,
    bufferedAmount: 0,
    closed: false,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data: string) {
      if (send) {
        send(data);
        return;
      }
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

describe("startRelayHost", () => {
  it("reports control socket creation failures and retries", async () => {
    vi.useFakeTimers();
    try {
      const error = new Error("dial failed");
      const control = fakeSocket();
      const reportError = vi.fn<(error: unknown) => void>();
      let attempts = 0;
      const socketFactory = vi.fn<(url: string) => RelaySocket>(() => {
        attempts += 1;
        if (attempts === 1) throw error;
        return control;
      });
      const handle = startRelayHost({
        relayUrl: "ws://relay.test/host",
        serverId: "srv-1",
        secret: "secret",
        localHttpUrl: "http://127.0.0.1:38987",
        minReconnectMs: 10,
        maxReconnectMs: 10,
        socketFactory,
        reportError,
      });

      expect(socketFactory).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(error);

      await vi.advanceTimersByTimeAsync(10);
      expect(socketFactory).toHaveBeenCalledTimes(2);
      control.onopen?.();
      expect(control.sent.map((data) => JSON.parse(data) as unknown)).toContainEqual({
        t: "register",
        protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
        serverId: "srv-1",
        secret: "secret",
      });
      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports and closes the control socket when registration send fails", () => {
    const error = new Error("send failed");
    const control = fakeSocket(() => {
      throw error;
    });
    const reportError = vi.fn<(error: unknown) => void>();
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      reportError,
    });

    expect(() => control.onopen?.()).not.toThrow();
    expect(reportError).toHaveBeenCalledWith(error);
    expect(control.closed).toBe(true);
    handle.dispose();
  });

  it("closes the control socket when its outbound queue is full", () => {
    const control = fakeSocket();
    control.bufferedAmount = 128;
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      maxWebSocketOutboundBufferBytes: 64,
      socketFactory: () => control,
    });

    control.onopen?.();

    expect(control.closed).toBe(true);
    expect(control.sent).toEqual([]);
    handle.dispose();
  });

  it("reports local websocket send failures and closes the relay channel", () => {
    const error = new Error("local send failed");
    const control = fakeSocket();
    const local = fakeSocket(() => {
      throw error;
    });
    const reportError = vi.fn<(error: unknown) => void>();
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      wsFactory: () => local,
      reportError,
    });

    control.onopen?.();
    control.onmessage?.(frame({ t: "ws-open", id: "ch-1", path: "/ws?ticket=t" }));
    control.onmessage?.(frame({ t: "ws-data", id: "ch-1", data: "hello" }));

    expect(reportError).toHaveBeenCalledWith(error);
    expect(local.closed).toBe(true);
    expect(control.sent.map((data) => JSON.parse(data) as unknown)).toContainEqual({
      t: "ws-close",
      id: "ch-1",
      reason: "local socket error",
    });
    handle.dispose();
  });

  it("queues relay websocket frames until the local websocket opens", () => {
    const control = fakeSocket();
    const local = fakeSocket(undefined, 0);
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      wsFactory: () => local,
    });

    control.onopen?.();
    control.onmessage?.(frame({ t: "ws-open", id: "ch-1", path: "/ws?ticket=t" }));
    control.onmessage?.(frame({ t: "ws-data", id: "ch-1", data: "early-1" }));
    control.onmessage?.(frame({ t: "ws-data", id: "ch-1", data: "early-2" }));

    expect(local.sent).toEqual([]);

    local.readyState = 1;
    local.onopen?.();

    expect(local.sent).toEqual(["early-1", "early-2"]);
    handle.dispose();
  });

  it("closes the relay channel when pre-open local websocket frames exceed the queue cap", () => {
    const control = fakeSocket();
    const local = fakeSocket(undefined, 0);
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      maxWebSocketOutboundBufferBytes: 256,
      socketFactory: () => control,
      wsFactory: () => local,
    });

    control.onopen?.();
    control.onmessage?.(frame({ t: "ws-open", id: "ch-1", path: "/ws?ticket=t" }));
    control.onmessage?.(frame({ t: "ws-data", id: "ch-1", data: "x".repeat(300) }));

    expect(local.closed).toBe(true);
    expect(control.sent.map((data) => JSON.parse(data) as unknown)).toContainEqual({
      t: "ws-close",
      id: "ch-1",
      reason: "local socket error",
    });
    handle.dispose();
  });

  it("closes the local websocket when its outbound queue is full", () => {
    const control = fakeSocket();
    const local = fakeSocket();
    local.bufferedAmount = 128;
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      maxWebSocketOutboundBufferBytes: 64,
      socketFactory: () => control,
      wsFactory: () => local,
    });

    control.onopen?.();
    control.onmessage?.(frame({ t: "ws-open", id: "ch-1", path: "/ws?ticket=t" }));
    control.onmessage?.(frame({ t: "ws-data", id: "ch-1", data: "hello" }));

    expect(local.closed).toBe(true);
    expect(control.sent.map((data) => JSON.parse(data) as unknown)).toContainEqual({
      t: "ws-close",
      id: "ch-1",
      reason: "local socket error",
    });
    handle.dispose();
  });

  it("closes the local websocket when relay control is too backed up for local frames", () => {
    const control = fakeSocket();
    const local = fakeSocket();
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      maxWebSocketOutboundBufferBytes: 64,
      socketFactory: () => control,
      wsFactory: () => local,
    });

    control.onopen?.();
    control.onmessage?.(frame({ t: "ws-open", id: "ch-1", path: "/ws?ticket=t" }));
    control.bufferedAmount = 128;
    local.onmessage?.({ data: "hello" });

    expect(control.closed).toBe(true);
    expect(local.closed).toBe(true);
    handle.dispose();
  });

  it("drops high-volume stream frames before they disconnect every relay channel", () => {
    const control = fakeSocket();
    const terminalLocal = fakeSocket();
    const otherLocal = fakeSocket();
    const locals = [terminalLocal, otherLocal];
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      maxWebSocketOutboundBufferBytes: 512,
      socketFactory: () => control,
      wsFactory: () => locals.shift()!,
    });

    control.onopen?.();
    control.onmessage?.(frame({ t: "ws-open", id: "terminal", path: "/ws?ticket=t1" }));
    control.onmessage?.(frame({ t: "ws-open", id: "other", path: "/ws?ticket=t2" }));
    control.bufferedAmount = 300;
    terminalLocal.onmessage?.({
      data: JSON.stringify({ type: "terminal-output", id: "thread-1", data: "noisy" }),
    });
    otherLocal.onmessage?.({ data: JSON.stringify({ type: "ready", seq: 1 }) });

    const sent = control.sent.map((data) => JSON.parse(data) as { t: string; id?: string });
    expect(sent).not.toContainEqual(expect.objectContaining({ t: "ws-data", id: "terminal" }));
    expect(sent).toContainEqual(expect.objectContaining({ t: "ws-data", id: "other" }));
    expect(control.closed).toBe(false);
    expect(terminalLocal.closed).toBe(false);
    expect(otherLocal.closed).toBe(false);
    handle.dispose();
  });

  it.each([
    {
      path: "/ws?ticket=t",
      message: {
        type: "terminal-output",
        id: "terminal-1",
        data: "final",
        cursorSync: {
          version: 1,
          watchId: "watch-1",
          generation: "generation-1",
          fromCursor: 0,
          toCursor: 5,
        },
      },
    },
    { path: "/forward/app/ws", message: { type: "terminal-output", data: "application data" } },
    { path: "/forward/app/ws", message: { type: "browser-frame", data: "application data" } },
  ])("preserves reliable frames under soft congestion on $path", ({ path, message }) => {
    const control = fakeSocket();
    const local = fakeSocket();
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      maxWebSocketOutboundBufferBytes: 1_024,
      socketFactory: () => control,
      wsFactory: () => local,
    });
    control.onopen?.();
    control.onmessage?.(frame({ t: "ws-open", id: "channel", path }));
    control.bufferedAmount = 600;
    const data = JSON.stringify(message);
    local.onmessage?.({ data });
    expect(control.sent.map((value) => JSON.parse(value) as unknown)).toContainEqual({
      t: "ws-data",
      id: "channel",
      data,
    });
    expect(control.closed).toBe(false);
    expect(local.closed).toBe(false);
    handle.dispose();
  });

  it("closes the relay channel when opening the local websocket fails", () => {
    const error = new Error("local open failed");
    const control = fakeSocket();
    const reportError = vi.fn<(error: unknown) => void>();
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      wsFactory: () => {
        throw error;
      },
      reportError,
    });

    control.onopen?.();
    control.onmessage?.(frame({ t: "ws-open", id: "ch-1", path: "/ws?ticket=t" }));

    expect(reportError).toHaveBeenCalledWith(error);
    expect(control.sent.map((data) => JSON.parse(data) as unknown)).toContainEqual({
      t: "ws-close",
      id: "ch-1",
      reason: "local socket error",
    });
    handle.dispose();
  });

  it("requests manual redirects and forwards a 3xx status/location without following it", async () => {
    const control = fakeSocket();
    let capturedInit: RequestInit | undefined;
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async (_url, init) => {
        capturedInit = init;
        return new Response(null, { status: 307, headers: { location: "/elsewhere" } });
      },
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/some/path", headers: {} }),
    );

    await vi.waitFor(() => {
      expect(control.sent.map((data) => JSON.parse(data) as unknown)).toContainEqual({
        t: "res",
        id: "req-1",
        status: 307,
        headers: { location: "/elsewhere" },
        body: "",
      });
    });
    // Node's fetch would otherwise silently follow the redirect and hand back
    // the *followed* response, hiding the 3xx/Location from the visitor.
    expect(capturedInit?.redirect).toBe("manual");
    handle.dispose();
  });

  it("forwards the relay's clientId as a stable x-forwarded-for identity across requests", async () => {
    const control = fakeSocket();
    const identities: string[] = [];
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async (_url, init) => {
        identities.push(new Headers(init?.headers).get("x-forwarded-for") ?? "");
        return new Response(null, { status: 200 });
      },
    });

    control.onopen?.();
    // Different per-request frame ids, same visitor clientId: the local
    // server's rate-limit bucket must be keyed on the stable identity, not on
    // the frame id (which would mint every request a fresh, bypassable one).
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/", headers: {}, clientId: "abc123" }),
    );
    control.onmessage?.(
      frame({ t: "req", id: "req-2", method: "GET", path: "/", headers: {}, clientId: "abc123" }),
    );

    await vi.waitFor(() => expect(identities.length).toBe(2));
    expect(identities).toEqual(["relay:abc123", "relay:abc123"]);
    handle.dispose();
  });

  it("gives distinct relay clientIds distinct identities", async () => {
    const control = fakeSocket();
    const identities: string[] = [];
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async (_url, init) => {
        identities.push(new Headers(init?.headers).get("x-forwarded-for") ?? "");
        return new Response(null, { status: 200 });
      },
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/", headers: {}, clientId: "client-a" }),
    );
    control.onmessage?.(
      frame({ t: "req", id: "req-2", method: "GET", path: "/", headers: {}, clientId: "client-b" }),
    );

    await vi.waitFor(() => expect(identities.length).toBe(2));
    expect(identities).toEqual(["relay:client-a", "relay:client-b"]);
    handle.dispose();
  });

  it("gives every request of a pre-clientId relay the same conservative identity", async () => {
    const control = fakeSocket();
    const identities: string[] = [];
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async (_url, init) => {
        identities.push(new Headers(init?.headers).get("x-forwarded-for") ?? "");
        return new Response(null, { status: 200 });
      },
    });

    control.onopen?.();
    // Old relay: no clientId on the frames. The fallback must be a CONSTANT —
    // sharing one bucket is acceptable throttling; a per-frame fallback was
    // the rate-limit bypass.
    control.onmessage?.(frame({ t: "req", id: "req-1", method: "GET", path: "/", headers: {} }));
    control.onmessage?.(frame({ t: "req", id: "req-2", method: "GET", path: "/", headers: {} }));

    await vi.waitFor(() => expect(identities.length).toBe(2));
    expect(identities).toEqual(["relay:legacy", "relay:legacy"]);
    handle.dispose();
  });

  it("never lets a visitor-supplied x-forwarded-for steer its identity", async () => {
    const control = fakeSocket();
    const identities: string[] = [];
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async (_url, init) => {
        identities.push(new Headers(init?.headers).get("x-forwarded-for") ?? "");
        return new Response(null, { status: 200 });
      },
    });

    control.onopen?.();
    control.onmessage?.(
      frame({
        t: "req",
        id: "req-1",
        method: "GET",
        path: "/",
        headers: { "x-forwarded-for": "6.6.6.6" },
        clientId: "abc123",
      }),
    );

    await vi.waitFor(() => expect(identities.length).toBe(1));
    expect(identities).toEqual(["relay:abc123"]);
    handle.dispose();
  });

  it("falls back to the shared legacy identity for malformed clientIds", async () => {
    const control = fakeSocket();
    const identities: string[] = [];
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async (_url, init) => {
        identities.push(new Headers(init?.headers).get("x-forwarded-for") ?? "");
        return new Response(null, { status: 200 });
      },
    });

    control.onopen?.();
    // Values that pass the protocol schema (length-bounded only) but fail the
    // host's stricter pattern: they never reach the outbound header raw; they
    // degrade to the shared conservative bucket.
    control.onmessage?.(
      frame({
        t: "req",
        id: "req-1",
        method: "GET",
        path: "/",
        headers: {},
        clientId: "not a safe header value",
      }),
    );
    control.onmessage?.(
      frame({
        t: "req",
        id: "req-2",
        method: "GET",
        path: "/",
        headers: {},
        clientId: "bad\nheader",
      }),
    );

    await vi.waitFor(() => expect(identities.length).toBe(2));
    expect(identities).toEqual(["relay:legacy", "relay:legacy"]);
    handle.dispose();
  });

  it("dials the local websocket with the same identity the HTTP requests carry", () => {
    const control = fakeSocket();
    const local = fakeSocket();
    const seenHeaders: Array<Record<string, string> | undefined> = [];
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      wsFactory: (_url, headers) => {
        seenHeaders.push(headers);
        return local;
      },
    });

    control.onopen?.();
    control.onmessage?.(
      frame({
        t: "ws-open",
        id: "channel",
        path: "/forward/app/ws",
        clientId: "abc123",
        cookie: "lc_forward=xyz",
      }),
    );
    control.onmessage?.(frame({ t: "ws-open", id: "channel-2", path: "/ws", clientId: "abc123" }));

    expect(seenHeaders[0]).toEqual({ "x-forwarded-for": "relay:abc123", cookie: "lc_forward=xyz" });
    expect(seenHeaders[1]).toEqual({ "x-forwarded-for": "relay:abc123" });
    handle.dispose();
  });

  it("preserves response cookies without deriving routing authority from their names", async () => {
    const control = fakeSocket();
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async () => {
        const headers = new Headers();
        headers.append("set-cookie", "lc_forward=abc123; Path=/; HttpOnly");
        headers.append("set-cookie", "unrelated=xyz; Path=/");
        headers.set("location", "/");
        return new Response(null, { status: 302, headers });
      },
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/forward/f1/enter", headers: {} }),
    );

    await vi.waitFor(() => {
      const sent = control.sent.map((data) => JSON.parse(data) as unknown);
      expect(sent).toContainEqual({
        t: "res",
        id: "req-1",
        status: 302,
        headers: { location: "/" },
        setCookies: ["lc_forward=abc123; Path=/; HttpOnly", "unrelated=xyz; Path=/"],
        body: "",
      });
    });
    handle.dispose();
  });

  it("preserves ordinary response cookies separately from plain headers", async () => {
    const control = fakeSocket();
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async () => {
        const headers = new Headers();
        headers.append("set-cookie", "unrelated=xyz; Path=/");
        return new Response(null, { status: 200, headers });
      },
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-2", method: "GET", path: "/api/snapshot", headers: {} }),
    );

    await vi.waitFor(() => {
      const sent = control.sent.map((data) => JSON.parse(data) as unknown);
      expect(sent).toContainEqual({
        t: "res",
        id: "req-2",
        status: 200,
        headers: {},
        setCookies: ["unrelated=xyz; Path=/"],
        body: "",
      });
    });
    handle.dispose();
  });

  it("never forwards a content-encoding for a body fetch already decoded", async () => {
    const control = fakeSocket();
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      // `fetch` transparently inflates a gzip response but leaves the header in
      // place. Echoing it would label these plaintext bytes as gzip and the
      // visitor would fail to decode them.
      fetchImpl: async () =>
        new Response('{"ok":true}', {
          headers: {
            "content-type": "application/json",
            "content-encoding": "gzip",
            "content-length": "999",
            etag: '"abc"',
          },
        }),
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/api/snapshot", headers: {} }),
    );

    await vi.waitFor(() => {
      const response = control.sent
        .map((data) => JSON.parse(data) as { t: string; headers?: Record<string, string> })
        .find((message) => message.t === "res");
      expect(response).toBeDefined();
      expect(response!.headers).not.toHaveProperty("content-encoding");
      // Stale once the body is re-encoded for the tunnel.
      expect(response!.headers).not.toHaveProperty("content-length");
      // Validators must still survive so conditional GETs keep working.
      expect(response!.headers).toMatchObject({ etag: '"abc"' });
    });
    handle.dispose();
  });

  it("does not ask the local server to compress a loopback response", async () => {
    const control = fakeSocket();
    let forwarded: Record<string, string> | undefined;
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      socketFactory: () => control,
      fetchImpl: async (_url, init) => {
        forwarded = init?.headers as Record<string, string>;
        return new Response('{"ok":true}');
      },
    });

    control.onopen?.();
    control.onmessage?.(
      frame({
        t: "req",
        id: "req-1",
        method: "GET",
        path: "/api/snapshot",
        headers: { "accept-encoding": "gzip, br", "if-none-match": '"abc"' },
      }),
    );

    await vi.waitFor(() => {
      expect(forwarded).toBeDefined();
      expect(forwarded).toHaveProperty("accept-encoding", "identity");
      // Conditional-request headers must still reach the origin.
      expect(forwarded).toMatchObject({ "if-none-match": '"abc"' });
    });
    handle.dispose();
  });

  it("rejects local HTTP responses that exceed the relay body limit", async () => {
    const control = fakeSocket();
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "secret",
      localHttpUrl: "http://127.0.0.1:38987",
      maxBodyBytes: 3,
      socketFactory: () => control,
      fetchImpl: async () => new Response("abcd"),
    });

    control.onopen?.();
    control.onmessage?.(
      frame({ t: "req", id: "req-1", method: "GET", path: "/api/snapshot", headers: {} }),
    );

    await vi.waitFor(() => {
      expect(control.sent.map((data) => JSON.parse(data) as unknown)).toContainEqual({
        t: "req-error",
        id: "req-1",
        message: "response body too large",
      });
    });
    handle.dispose();
  });

  it("times out local HTTP requests that do not resolve", async () => {
    vi.useFakeTimers();
    try {
      const control = fakeSocket();
      let signal: AbortSignal | undefined;
      const handle = startRelayHost({
        relayUrl: "ws://relay.test/host",
        serverId: "srv-1",
        secret: "secret",
        localHttpUrl: "http://127.0.0.1:38987",
        requestTimeoutMs: 10,
        socketFactory: () => control,
        fetchImpl: (_url, init) => {
          signal = init?.signal ?? undefined;
          return new Promise<Response>(() => {});
        },
      });

      control.onopen?.();
      control.onmessage?.(
        frame({ t: "req", id: "req-1", method: "GET", path: "/api/snapshot", headers: {} }),
      );
      await vi.advanceTimersByTimeAsync(10);

      expect(signal?.aborted).toBe(true);
      await vi.waitFor(() => {
        expect(control.sent.map((data) => JSON.parse(data) as unknown)).toContainEqual({
          t: "req-error",
          id: "req-1",
          message: "local request timed out after 10ms",
        });
      });
      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out local HTTP response bodies that stop streaming", async () => {
    vi.useFakeTimers();
    try {
      const control = fakeSocket();
      const handle = startRelayHost({
        relayUrl: "ws://relay.test/host",
        serverId: "srv-1",
        secret: "secret",
        localHttpUrl: "http://127.0.0.1:38987",
        requestTimeoutMs: 10,
        socketFactory: () => control,
        fetchImpl: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("partial"));
              },
            }),
          ),
      });

      control.onopen?.();
      control.onmessage?.(
        frame({ t: "req", id: "req-1", method: "GET", path: "/api/snapshot", headers: {} }),
      );
      await vi.advanceTimersByTimeAsync(10);

      await vi.waitFor(() => {
        expect(control.sent.map((data) => JSON.parse(data) as unknown)).toContainEqual({
          t: "req-error",
          id: "req-1",
          message: "local request timed out after 10ms",
        });
      });
      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isolated forwarding adapter", () => {
  function setup() {
    const control = fakeSocket();
    const local = fakeSocket();
    const fetchImpl = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async () => new Response("ok"));
    const wsFactory = vi.fn<(url: string, headers?: Record<string, string>) => RelaySocket>(
      () => local,
    );
    const originSecret = Buffer.alloc(32, 1).toString("base64url");
    const dispatchKey = Buffer.alloc(32, 2).toString("base64url");
    const ownerId = deriveForwardOwner(originSecret, "srv-1");
    const policy = new ForwardOriginPolicy("https://apps.example.test");
    const forwardId = "01234567-89ab-4cde-8f01-23456789abcd";
    const forward = { forwardId, origin: policy.originFor(ownerId, forwardId) };
    const handle = startRelayHost({
      relayUrl: "ws://relay.test/host",
      serverId: "srv-1",
      secret: "relay password",
      localHttpUrl: "http://127.0.0.1:38987",
      forwardOriginSecret: originSecret,
      forwardDispatchKey: dispatchKey,
      socketFactory: () => control,
      fetchImpl,
      wsFactory,
      maxWebSocketOutboundBufferBytes: 1024,
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
    return { control, local, fetchImpl, wsFactory, forward, handle, dispatchKey, ownerId };
  }

  it.each([
    { serverId: "another-host", baseUrl: "https://apps.example.test" },
    { serverId: "srv-1", baseUrl: "https://127.0.0.1" },
  ])(
    "closes invalid registration acknowledgements: $serverId $baseUrl",
    ({ serverId, baseUrl }) => {
      const test = setup();
      try {
        test.control.onmessage?.(
          frame({ t: "ws-open", id: "app", path: "/ws", forward: test.forward }),
        );
        test.control.onmessage?.(
          frame({
            t: "registered",
            serverId,
            publicUrl: "https://relay.test/s/srv-1/",
            forwardOrigin: { baseUrl, ownerId: test.ownerId },
          }),
        );
        expect(test.control.closed).toBe(true);
        expect(test.local.closed).toBe(true);
      } finally {
        test.handle.dispose();
      }
    },
  );

  it("constructs dispatch authority from registered context and strips forged visitor headers", async () => {
    const test = setup();
    try {
      const forged = {
        "X-Poracode-Forward-Key": "visitor-key",
        "x-poracode-forward-id": "visitor-id",
        "x-poracode-forward-origin": "https://evil.test",
      };
      test.control.onmessage?.(
        frame({
          t: "req",
          id: "forward",
          method: "GET",
          path: "/api/data",
          headers: forged,
          forward: test.forward,
        }),
      );
      await vi.waitFor(() => expect(test.fetchImpl).toHaveBeenCalledTimes(1));
      const headers = new Headers(test.fetchImpl.mock.calls[0]![1]?.headers);
      expect(headers.get("x-poracode-forward-key")).toBe(test.dispatchKey);
      expect(headers.get("x-poracode-forward-id")).toBe(test.forward.forwardId);
      expect(headers.get("x-poracode-forward-origin")).toBe(test.forward.origin);
      test.control.onmessage?.(
        frame({ t: "req", id: "api", method: "GET", path: "/api/data", headers: forged }),
      );
      await vi.waitFor(() => expect(test.fetchImpl).toHaveBeenCalledTimes(2));
      const ordinary = new Headers(test.fetchImpl.mock.calls[1]![1]?.headers);
      // Ordinary API ingress carries only the host's dispatch key plus the
      // `route: api` marker (never the child-flow id/origin pair), and none of
      // the visitor's forged values survive the strip.
      expect(ordinary.get("x-poracode-forward-key")).toBe(test.dispatchKey);
      expect(ordinary.get("x-poracode-forward-route")).toBe("api");
      expect([...ordinary.keys()].filter((key) => key.startsWith("x-poracode-forward-"))).toEqual([
        "x-poracode-forward-key",
        "x-poracode-forward-route",
      ]);
    } finally {
      test.handle.dispose();
    }
  });

  it("rejects mismatched forwarding origins before dialing local HTTP or WS", async () => {
    const test = setup();
    try {
      const forward = { ...test.forward, origin: "https://another.example.test" };
      test.control.onmessage?.(
        frame({ t: "req", id: "bad-http", method: "GET", path: "/", headers: {}, forward }),
      );
      test.control.onmessage?.(frame({ t: "ws-open", id: "bad-ws", path: "/ws", forward }));
      await vi.waitFor(() =>
        expect(test.control.sent.map((value) => JSON.parse(value))).toContainEqual(
          expect.objectContaining({ t: "req-error", id: "bad-http" }),
        ),
      );
      expect(test.fetchImpl).not.toHaveBeenCalled();
      expect(test.wsFactory).not.toHaveBeenCalled();
    } finally {
      test.handle.dispose();
    }
  });

  it("keeps forwarded /ws application data lossless under soft congestion", () => {
    const test = setup();
    try {
      test.control.onmessage?.(
        frame({ t: "ws-open", id: "app", path: "/ws", forward: test.forward }),
      );
      expect(test.wsFactory.mock.calls[0]![1]).toMatchObject({
        "x-poracode-forward-key": test.dispatchKey,
        origin: test.forward.origin,
      });
      test.control.bufferedAmount = 600;
      const data = JSON.stringify({ type: "terminal-output", data: "application data" });
      test.local.onmessage?.({ data });
      expect(test.control.sent.map((value) => JSON.parse(value))).toContainEqual({
        t: "ws-data",
        id: "app",
        data,
      });
    } finally {
      test.handle.dispose();
    }
  });

  it("ignores requests delivered by a closed control connection", () => {
    const test = setup();
    try {
      test.control.onclose?.();
      test.control.onmessage?.(
        frame({ t: "req", id: "stale", method: "POST", path: "/api/mutate", headers: {} }),
      );
      expect(test.fetchImpl).not.toHaveBeenCalled();
    } finally {
      test.handle.dispose();
    }
  });
});
