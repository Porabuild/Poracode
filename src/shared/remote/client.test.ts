import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "./client";

describe("RemoteDesktopClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("exchanges pairing credentials without requiring a browser navigator", async () => {
    vi.stubGlobal("navigator", undefined);
    let body: unknown;
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      async (_url, init) => {
        body = JSON.parse(init?.body ?? "{}") as unknown;
        return new Response(
          JSON.stringify({
            accessToken: "lc_access_test",
            tokenType: "Bearer",
            expiresAt: "2099-01-01T00:00:00.000Z",
            scopes: ["session:read"],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await expect(
      client.exchangePairingCredential({
        credential: "lc_pair_test",
        scopes: ["session:read"],
      }),
    ).resolves.toMatchObject({ accessToken: "lc_access_test" });
    expect(body).toMatchObject({
      client: {
        label: "Lightcode web app",
        deviceType: "browser",
      },
    });
  });

  it("preserves endpoint path prefixes when issuing HTTP requests", async () => {
    let requestedUrl = "";
    let authorization = "";
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async (url, init) => {
        requestedUrl = String(url);
        authorization = init?.headers?.authorization ?? "";
        return new Response(
          JSON.stringify({
            ticket: "lc_ws_test",
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await expect(client.websocketTicket()).resolves.toBe("lc_ws_test");

    expect(requestedUrl).toBe("https://relay.example.test/s/server-1/api/auth/websocket-ticket");
    expect(authorization).toBe("Bearer lc_access_test");
  });

  it("passes an abort signal to remote fetches", async () => {
    let signal: AbortSignal | undefined;
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async (_url, init) => {
        signal = init?.signal;
        return new Response(
          JSON.stringify({
            ticket: "lc_ws_test",
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await expect(client.websocketTicket()).resolves.toBe("lc_ws_test");

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it("times out requests even when the transport ignores abort signals", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      (_url, init) => {
        signal = init?.signal;
        return new Promise<Response>(() => {});
      },
      { requestTimeoutMs: 10 },
    );

    const request = client.environment();
    const result = request.then(
      () => "resolved",
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10);

    expect(signal?.aborted).toBe(true);
    await expect(result).resolves.toMatchObject({
      code: "timeout",
      status: 0,
      message: "Remote request timed out after 10ms.",
    });
  });

  it("rejects direct remote responses above the configured body limit", async () => {
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      async () =>
        new Response("{}", {
          headers: { "content-length": "4", "content-type": "application/json" },
        }),
      { maxResponseBodyBytes: 3 },
    );

    await expect(client.environment()).rejects.toThrow("response body too large");
  });

  it("preserves endpoint path prefixes in WebSocket URLs", () => {
    const client = new RemoteDesktopClient("https://relay.example.test/s/server-1");

    expect(client.websocketUrl("lc_ws_test", 42)).toBe(
      "wss://relay.example.test/s/server-1/ws?ticket=lc_ws_test&lastSeenSeq=42",
    );
  });
});
