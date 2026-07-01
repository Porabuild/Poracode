import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { RemoteAccessServer, RemoteAuthStore } from "@/main/remote";
import { RelayServer } from "./relayServer";
import { startRelayHost, type RelayHostHandle } from "./relayHost";

/**
 * End-to-end relay round-trip over real localhost sockets: a RemoteAccessServer
 * bound to loopback, a RelayServer, and a relayHost bridging the two. Proves
 * that a device pointed at `<relay>/s/<id>/` reaches the server's HTTP control
 * plane (incl. the auth handshake) and its WebSocket event stream — with no
 * changes to RemoteAccessServer.
 */
describe("relay end-to-end", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function setup() {
    const authStore = new RemoteAuthStore();
    const pairing = authStore.issuePairingCredential({});
    const rac = new RemoteAccessServer({
      appVersion: "9.9.9",
      identity: { desktopId: "srv-1", label: "Relay Test Server" },
      authStore,
      host: "127.0.0.1",
      advertisedHost: "127.0.0.1",
      port: 0,
      callSupervisor: (async () => ({})) as never,
    });
    const racInfo = await rac.start();
    cleanups.push(() => rac.dispose());

    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());

    const racPort = new URL(racInfo.httpBaseUrl).port;
    let handle: RelayHostHandle | null = null;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("relay registration timed out")), 5000);
      handle = startRelayHost({
        relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
        serverId: "srv-1",
        secret: "shhh",
        localHttpUrl: `http://127.0.0.1:${racPort}`,
        onRegistered: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
    cleanups.push(() => handle?.dispose());

    const base = `http://127.0.0.1:${relayInfo.port}/s/srv-1`;
    return { base, relayInfo, pairing };
  }

  it("tunnels the HTTP control plane (environment + oauth + ticket)", async () => {
    const { base, pairing } = await setup();

    // Unauthenticated descriptor.
    const envRes = await fetch(`${base}/.well-known/lightcode/environment`);
    expect(envRes.status).toBe(200);
    const env = (await envRes.json()) as { desktopId: string; label: string };
    expect(env.desktopId).toBe("srv-1");
    expect(env.label).toBe("Relay Test Server");

    // Pairing exchange through the relay.
    const tokenRes = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential: pairing.credential }),
    });
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as { accessToken: string };
    expect(token.accessToken).toMatch(/^lc_access_/);

    // A websocket ticket (bearer-authenticated) through the relay.
    const ticketRes = await fetch(`${base}/api/auth/websocket-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    expect(ticketRes.status).toBe(200);
    const ticket = (await ticketRes.json()) as { ticket: string };
    expect(ticket.ticket).toMatch(/^lc_ws_/);
  });

  it("returns 502 for an unknown server id", async () => {
    const { relayInfo } = await setup();
    const res = await fetch(`http://127.0.0.1:${relayInfo.port}/s/does-not-exist/x`);
    expect(res.status).toBe(502);
  });

  it("tunnels the WebSocket event stream (ready frame)", async () => {
    const { base, pairing } = await setup();
    const token = (await (
      await fetch(`${base}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantType: "pairing-token", credential: pairing.credential }),
      })
    ).json()) as { accessToken: string };
    const ticket = (await (
      await fetch(`${base}/api/auth/websocket-ticket`, {
        method: "POST",
        headers: { authorization: `Bearer ${token.accessToken}` },
      })
    ).json()) as { ticket: string };

    const wsUrl = `${base.replace(/^http/, "ws")}/ws?ticket=${encodeURIComponent(ticket.ticket)}`;
    const firstMessage = await new Promise<unknown>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("no ready frame over the relay"));
      }, 5000);
      socket.on("message", (data) => {
        clearTimeout(timer);
        socket.close();
        resolve(JSON.parse(String(data)));
      });
      socket.on("error", reject);
    });
    expect(firstMessage).toMatchObject({ type: "ready" });
  });
});
