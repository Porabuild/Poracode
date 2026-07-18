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
    send(data) {
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
        protocolVersion: 1,
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

  it("forwards Set-Cookie values as a `setCookies` array (with bindVisitor when the forward session cookie is present), separately from the plain header record", async () => {
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
      // The host sets `bindVisitor` (not the relay sniffing `setCookies`) when
      // its response mints the forward-session cookie, so the relay can bind the
      // visitor for prefixless routing without inspecting the tunneled cookies.
      expect(sent).toContainEqual({
        t: "res",
        id: "req-1",
        status: 302,
        headers: { location: "/" },
        setCookies: ["lc_forward=abc123; Path=/; HttpOnly", "unrelated=xyz; Path=/"],
        bindVisitor: true,
        body: "",
      });
    });
    handle.dispose();
  });

  it("omits bindVisitor when the response carries Set-Cookie but not the forward session cookie", async () => {
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
