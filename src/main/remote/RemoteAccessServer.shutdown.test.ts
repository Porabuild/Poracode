import { mkdtemp, rm } from "node:fs/promises";
import { connect, createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { WebSocket } from "ws";
import { expect, it, vi } from "vitest";
import { closeDatabase, dbGetState, dbSetState, initDatabase } from "@/main/db";
import { sqliteAvailable } from "@/main/db/runtimeItems.testFixtures";
import { RemoteAuthStore } from "./auth";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";

function createServerOptions(overrides: Partial<RemoteAccessServerOptions> = {}) {
  return {
    appVersion: "shutdown-fixture",
    identity: { desktopId: "shutdown-fixture", label: "Shutdown fixture" },
    host: "127.0.0.1",
    port: 0,
    ownsSupervisorPersistence: false,
    webSocketHeartbeatIntervalMs: 0,
    truncateThreadRuntime() {},
    callSupervisor: async () => {
      throw new Error("Unexpected supervisor call in shutdown fixture.");
    },
    ...overrides,
  } satisfies RemoteAccessServerOptions;
}

it.skipIf(!sqliteAvailable).each([
  { disconnect: false, waitMs: 5_150 },
  { disconnect: true, waitMs: 100 },
])(
  "joins an admitted HTTP callback before SQLite close (client disconnect=$disconnect)",
  async ({ disconnect, waitMs }) => {
    const directory = await mkdtemp(join(tmpdir(), "poracode-http-drain-"));
    const dbPath = join(directory, "state.sqlite");
    const admitted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const auth = new RemoteAuthStore();
    const credential = auth.issuePairingCredential({ scopes: ["projects:manage"] });
    const { accessToken } = auth.exchangePairingCredential({ credential: credential.credential });
    const order: string[] = [];
    const server = new RemoteAccessServer(
      createServerOptions({
        authStore: auth,
        updates: {
          currentVersion: () => "fixture",
          status: () => null,
          install() {},
          async check() {
            admitted.resolve();
            await release.promise;
            dbSetState("http-drain-fixture", "written");
            order.push("write");
          },
        },
      }),
    );
    let response: Promise<Response | Error> | undefined;
    let stopping: Promise<void> | undefined;
    initDatabase(dbPath);
    try {
      const info = await server.start();
      const cancellation = new AbortController();
      response = fetch(new URL("/api/host-update/check", info.httpBaseUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        signal: cancellation.signal,
      }).catch((error: unknown) => error as Error);
      await admitted.promise;
      if (disconnect) {
        cancellation.abort();
        await response;
      }
      stopping = server.dispose().then(() => {
        closeDatabase();
        order.push("database-close");
      });
      await delay(waitMs);
      expect(order).toEqual([]);
      release.resolve();
      await stopping;
      await response;
      expect(order).toEqual(["write", "database-close"]);
      initDatabase(dbPath);
      expect(dbGetState("http-drain-fixture")).toBe("written");
    } finally {
      release.resolve();
      await Promise.allSettled([response, stopping]);
      await server.dispose();
      closeDatabase();
      await rm(directory, { recursive: true, force: true });
    }
  },
  10_000,
);

it("shares a concurrent start and refuses start once disposal begins", async () => {
  const server = new RemoteAccessServer(createServerOptions());
  try {
    const [first, second] = await Promise.all([server.start(), server.start()]);
    expect(second).toEqual(first);
    const stopping = server.dispose();
    await expect(server.start()).rejects.toThrow(/stopping|closed/i);
    await stopping;
  } finally {
    await server.dispose();
  }
});

it("returns a usable current pairing credential after the original startup token rotates", async () => {
  const server = new RemoteAccessServer(createServerOptions());
  try {
    await server.start();
    server.issuePairingUrl("Synthetic rotation");
    const info = await server.start();
    const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential }),
    });
    expect(response.status).toBe(200);
    await response.json();
  } finally {
    await server.dispose();
  }
});

it("withdraws start availability and joins repeated disposal immediately", async () => {
  const server = new RemoteAccessServer(createServerOptions());
  try {
    await server.start();
    const stopping = server.dispose();
    expect(server.dispose()).toBe(stopping);
    await expect(server.start()).rejects.toThrow(/stopping|closed/i);
    await stopping;
  } finally {
    await server.dispose();
  }
});

it("joins an admitted WebSocket action after its connection is closed", async () => {
  const admitted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const auth = new RemoteAuthStore();
  const credential = auth.issuePairingCredential({ scopes: ["session:read", "session:operate"] });
  const { accessToken } = auth.exchangePairingCredential({ credential: credential.credential });
  const { ticket } = auth.issueWebSocketTicket({ accessToken });
  const order: string[] = [];
  const server = new RemoteAccessServer(
    createServerOptions({
      authStore: auth,
      browser: {
        state: () => ({ tabs: [], activeTabId: null }),
        command: async () => ({ tabs: [], activeTabId: null }),
        watch: () => () => {},
        refresh() {},
        dispose() {},
        async dispatchInput() {
          admitted.resolve();
          await release.promise;
          order.push("action-completed");
        },
      },
    }),
  );
  let client: WebSocket | undefined;
  let stopping: Promise<void> | undefined;
  try {
    const info = await server.start();
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    client = new WebSocket(url);
    await once(client, "open");
    client.send(JSON.stringify({ type: "browser-input", input: { kind: "key", key: "enter" } }));
    await admitted.promise;
    stopping = server.dispose().then(() => {
      order.push("disposed");
    });
    await once(client, "close");
    await delay(20);
    expect(order).toEqual([]);
    release.resolve();
    await stopping;
    expect(order).toEqual(["action-completed", "disposed"]);
  } finally {
    release.resolve();
    client?.terminate();
    await stopping;
    await server.dispose();
  }
});

it("refuses another request on an already connected socket once shutdown starts", async () => {
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
      updates: { currentVersion: () => "fixture", status: () => null, install() {}, check },
      shutdownConnectionGraceMs: 100,
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
    const request =
      `POST /api/host-update/check HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
      `Authorization: Bearer ${accessToken}\r\nContent-Length: 0\r\n\r\n`;
    client.write(request);
    await admitted.promise;
    stopping = server.dispose();
    client.write(request);
    await delay(20);
    expect(check).toHaveBeenCalledOnce();
    release.resolve();
    await stopping;
  } finally {
    release.resolve();
    client.destroy();
    await stopping;
    await server.dispose();
  }
});

it("bounds admitted HTTP continuations with an explicit busy response", async () => {
  const admitted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const auth = new RemoteAuthStore();
  const credential = auth.issuePairingCredential({ scopes: ["projects:manage"] });
  const { accessToken } = auth.exchangePairingCredential({ credential: credential.credential });
  const server = new RemoteAccessServer(
    createServerOptions({
      authStore: auth,
      maxConcurrentIngressWork: 1,
      updates: {
        currentVersion: () => "fixture",
        status: () => null,
        install() {},
        async check() {
          admitted.resolve();
          await release.promise;
        },
      },
    }),
  );
  let first: Promise<Response> | undefined;
  try {
    const info = await server.start();
    first = fetch(new URL("/api/host-update/check", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    await admitted.promise;
    const second = await fetch(new URL("/api/host-update/check", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(second.status).toBe(503);
    await expect(second.json()).resolves.toMatchObject({
      error: { code: "host_busy" },
    });
    release.resolve();
    await expect(first).resolves.toMatchObject({ status: 200 });
  } finally {
    release.resolve();
    await first?.catch(() => undefined);
    await server.dispose();
  }
});

it("closes a partial request body at the transport deadline without a late auth mutation", async () => {
  const auth = new RemoteAuthStore();
  const exchange = vi.spyOn(auth, "exchangePairingCredential");
  const server = new RemoteAccessServer(
    createServerOptions({ authStore: auth, shutdownConnectionGraceMs: 20 }),
  );
  const info = await server.start();
  const port = Number(new URL(info.httpBaseUrl).port);
  const client = connect(port, "127.0.0.1");
  client.on("error", () => {});
  client.resume();
  try {
    await once(client, "connect");
    const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    const body = JSON.stringify({ grantType: "pairing-token", credential });
    client.write(
      `POST /oauth/token HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
        `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n` +
        body.slice(0, -1),
    );
    await delay(10);
    const closed = once(client, "close");
    await server.dispose();
    await closed;
    expect(exchange).not.toHaveBeenCalled();
    expect(client.destroyed).toBe(true);
  } finally {
    client.destroy();
    await server.dispose();
  }
});

it("joins and cancels a listen retry before reporting disposal", async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const port = (blocker.address() as AddressInfo).port;
  const server = new RemoteAccessServer(
    createServerOptions({ port, listenRetryAttempts: 10, listenRetryDelayMs: 100 }),
  );
  const starting = server.start();
  void starting.catch(() => undefined);
  try {
    await delay(20);
    await server.dispose();
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await expect(starting).rejects.toThrow(/stopping|closed/i);
    const probe = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(port, "127.0.0.1", resolve);
      });
    } finally {
      await new Promise<void>((resolve) => probe.close(() => resolve()));
    }
  } finally {
    blocker.close();
    await starting.catch(() => undefined);
    await server.dispose();
  }
});

it("can retry a failed listen before disposal without retaining a rejected startup", async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const port = (blocker.address() as AddressInfo).port;
  const server = new RemoteAccessServer(createServerOptions({ port, listenRetryAttempts: 1 }));
  try {
    await expect(server.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    const info = await server.start();
    expect(new URL(info.httpBaseUrl).port).toBe(String(port));
  } finally {
    blocker.close();
    await server.dispose();
  }
});
