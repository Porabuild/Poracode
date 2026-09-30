import { once } from "node:events";
import { connect } from "node:net";
import { WebSocket } from "ws";
import { expect, it, vi } from "vitest";
import { RemoteAuthStore } from "./auth";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";

// Plan D5: managed-host shutdown announces itself to connected clients with a
// standards-based going-away close before the transport deadline terminates
// whoever ignores it. The announcement must not add a second budget or release
// anything early.
function createServerOptions(overrides: Partial<RemoteAccessServerOptions> = {}) {
  return {
    appVersion: "shutdown-announcement-fixture",
    identity: {
      desktopId: "shutdown-announcement-fixture",
      label: "Shutdown announcement fixture",
    },
    host: "127.0.0.1",
    port: 0,
    ownsSupervisorPersistence: false,
    webSocketHeartbeatIntervalMs: 0,
    truncateThreadRuntime() {},
    callSupervisor: async () => {
      throw new Error("Unexpected supervisor call in shutdown announcement fixture.");
    },
    ...overrides,
  } satisfies RemoteAccessServerOptions;
}

function pairedTicket(auth: RemoteAuthStore): string {
  const credential = auth.issuePairingCredential({
    scopes: ["session:read", "session:operate", "projects:manage"],
  });
  const { accessToken } = auth.exchangePairingCredential({ credential: credential.credential });
  return auth.issueWebSocketTicket({ accessToken }).ticket;
}

it("announces going away to an active WebSocket and lets it close before the transport deadline", async () => {
  const auth = new RemoteAuthStore();
  const server = new RemoteAccessServer(
    createServerOptions({ authStore: auth, shutdownConnectionGraceMs: 5_000 }),
  );
  let client: WebSocket | undefined;
  try {
    const info = await server.start();
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", pairedTicket(auth));
    client = new WebSocket(url);
    // Attach the ready waiter before opening: the server emits `ready` only
    // after the session is registered, and it can arrive with the open frame.
    const ready = once(client, "message");
    await once(client, "open");
    await ready;
    const closed = once(client, "close");
    const started = Date.now();
    const stopping = server.dispose();
    const [code, reason] = (await closed) as [number, Buffer];
    await stopping;
    expect(code).toBe(1001);
    expect(reason.toString()).toBe("Server shutting down.");
    // The cooperative client finished the close handshake on the announcement
    // instead of waiting for the 5s transport deadline.
    expect(Date.now() - started).toBeLessThan(4_500);
  } finally {
    client?.terminate();
    await server.dispose();
  }
});

it("bounds a peer that ignores the close frame by the declared connection grace", async () => {
  const auth = new RemoteAuthStore();
  const server = new RemoteAccessServer(
    createServerOptions({ authStore: auth, shutdownConnectionGraceMs: 300 }),
  );
  let client: WebSocket | undefined;
  try {
    const info = await server.start();
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", pairedTicket(auth));
    client = new WebSocket(url);
    const ready = once(client, "message");
    await once(client, "open");
    await ready;
    // Pausing the client socket means it neither reads the close frame nor
    // acknowledges it. `ws` would otherwise keep its own close handshake open
    // for its 30s close timeout.
    client.pause();
    const started = Date.now();
    await server.dispose();
    const elapsed = Date.now() - started;
    // The announcement is not a separate wait: the stalled peer is destroyed
    // at the declared grace, and the transport (including retained bytes) is
    // not released before that actual teardown.
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(2_000);
  } finally {
    client?.terminate();
    await server.dispose();
  }
});

it("joins an in-flight HTTP write whose transport is destroyed at the deadline", async () => {
  const admitted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const check = vi.fn<() => Promise<void>>(async () => {
    admitted.resolve();
    await release.promise;
  });
  const auth = new RemoteAuthStore();
  const credential = auth.issuePairingCredential({ scopes: ["projects:manage"] });
  const { accessToken } = auth.exchangePairingCredential({ credential: credential.credential });
  const server = new RemoteAccessServer(
    createServerOptions({
      authStore: auth,
      shutdownConnectionGraceMs: 250,
      updates: { currentVersion: () => "fixture", status: () => null, install() {}, check },
    }),
  );
  const info = await server.start();
  const port = Number(new URL(info.httpBaseUrl).port);
  const client = connect(port, "127.0.0.1");
  client.on("error", () => {});
  client.resume();
  let stopping: Promise<void> | undefined;
  try {
    await once(client, "connect");
    client.write(
      `POST /api/host-update/check HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
        `Authorization: Bearer ${accessToken}\r\nContent-Length: 0\r\n\r\n`,
    );
    await admitted.promise;
    const closed = once(client, "close");
    const started = Date.now();
    stopping = server.dispose();
    // The response transport is torn down at the declared grace while the
    // admitted handler still owns the request; disposal fires the write into a
    // destroyed response and then joins the handler rather than draining it.
    await closed;
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    release.resolve();
    await stopping;
    expect(check).toHaveBeenCalledOnce();
    expect(Date.now() - started).toBeLessThan(2_500);
  } finally {
    release.resolve();
    client.destroy();
    await stopping;
    await server.dispose();
  }
});
