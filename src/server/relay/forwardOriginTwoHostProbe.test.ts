import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import {
  createForwardOriginIdentity,
  type ForwardOriginIdentity,
} from "@/main/remote/portForward/forwardOriginIdentity";
import {
  FORWARD_ORIGIN_EXCHANGE_PATH,
  FORWARD_ORIGIN_SESSION_COOKIE_NAME,
} from "@/main/remote/portForward/portProxy";
import { createPortForwarding } from "@/main/remote/portForward/portForwarding";
import {
  rawRequestWithAuthority,
  type CleanupRegistry,
} from "@/main/remote/portForward/testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "@/main/remote/RemoteAccessServer";
import { startRelayHost } from "./relayHost";
import { RelayServer } from "./relayServer";

/**
 * The node-level two-host probe demanded by
 * docs/PORT_FORWARD_ORIGIN_ISOLATION.md: "two applications on one host and two
 * hosts behind one relay — alternate tabs, fetch root-relative resources,
 * reconnect sockets, stop one forward, restart the host/relay, and verify
 * target identity and independent recovery". It composes the REAL pieces end
 * to end (RemoteAccessServer + port forwarding + origin-bound `__Host-`
 * sessions, the real RelayServer, and the real `startRelayHost` adapter) and
 * simulates the browser side only where a browser is unreplaceable in Node:
 * one cookie jar whose cookies are stored per origin, and explicit
 * `Host`/`Origin` headers for the generated child authorities (which do not
 * resolve in DNS).
 *
 * The real-Safari confirmation of the same scenarios stays a manual boundary
 * drill (scripted under `tmp/b3-lane3/`); this file is the automated half of
 * that acceptance.
 */

const cleanup: CleanupRegistry = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

interface UpstreamApp {
  readonly label: string;
  readonly port: number;
}

/** One synthetic forwarded application: JSON marker endpoints (which report
 * the app label, the path that reached it, and the cookie it saw) plus a
 * WebSocket echo at every path, so reconnects observe which app answered. */
async function startUpstreamApp(label: string): Promise<UpstreamApp> {
  const wss = new WebSocketServer({ noServer: true });
  const server = createHttpServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ app: label, path: req.url, cookie: req.headers.cookie ?? null }));
  });
  server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("message", (data) => {
        ws.send(JSON.stringify({ app: label, echo: data.toString() }));
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { label, port: (server.address() as AddressInfo).port };
}

interface ProbeHost {
  readonly serverId: string;
  readonly info: RemoteAccessServerInfo;
  readonly originSecret: string;
  readonly dispatchKey: string;
  /** The registered relay origin identity, updated by the adapter. */
  relayOrigin: ForwardOriginIdentity | null;
  /** `apiBase` defaults to the host's own origin; pass the relay's
   * `/s/<serverId>` base to create the forward through the relay (which is
   * what selects the relay child-origin namespace for the entry token). */
  createForward(targetPort: number, apiBase?: string): Promise<{ id: string; enterPath: string }>;
  stopForward(id: string): Promise<void>;
  dispose(): Promise<void>;
}

async function startProbeHost(input: {
  readonly serverId: string;
  /** Direct child-origin base (`PORACODE_REMOTE_FORWARD_BASE_URL` shape). */
  readonly directForwardBaseUrl?: string;
}): Promise<ProbeHost> {
  const originSecret = randomBytes(32).toString("base64url");
  const dispatchKey = randomBytes(32).toString("base64url");
  const directOrigin = input.directForwardBaseUrl
    ? createForwardOriginIdentity({
        baseUrl: input.directForwardBaseUrl,
        originSecret,
        serverId: input.serverId,
      })
    : undefined;
  const portForwarding = createPortForwarding({
    bindHost: "127.0.0.1",
    remoteAccessPort: 0,
    ...(directOrigin ? { forwardOrigin: directOrigin } : {}),
  });
  cleanup.push(async () => {
    portForwarding.gateway.dispose();
    portForwarding.proxy.dispose();
  });
  let relayOrigin: ForwardOriginIdentity | null = null;
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "probe",
    identity: { desktopId: input.serverId, label: input.serverId },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    portForward: portForwarding.gateway,
    portProxy: portForwarding.proxy,
    ...(directOrigin ? { forwardOrigin: directOrigin } : {}),
    forwardDispatchKey: dispatchKey,
    getRelayForwardOrigin: () => relayOrigin,
  });
  cleanup.push(async () => server.dispose());
  const info = await server.start();

  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["ports:forward"],
      client: { label: "probe", deviceType: "mobile" },
    }),
  });
  expect(tokenResponse.status).toBe(200);
  const { accessToken } = (await tokenResponse.json()) as { accessToken: string };
  const bearer = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };

  return {
    serverId: input.serverId,
    info,
    originSecret,
    dispatchKey,
    get relayOrigin() {
      return relayOrigin;
    },
    set relayOrigin(value: ForwardOriginIdentity | null) {
      relayOrigin = value;
    },
    async createForward(targetPort: number, apiBase?: string) {
      const base = (apiBase ?? info.httpBaseUrl).replace(/\/+$/, "");
      const created = await fetch(`${base}/api/ports/forward`, {
        method: "POST",
        headers: bearer,
        body: JSON.stringify({ targetPort }),
      });
      expect(created.status).toBe(200);
      const result = (await created.json()) as { forward: { id: string }; enterPath: string };
      return { id: result.forward.id, enterPath: result.enterPath };
    },
    async stopForward(id: string) {
      const response = await fetch(new URL("/api/ports/unforward", info.httpBaseUrl), {
        method: "POST",
        headers: bearer,
        body: JSON.stringify({ id }),
      });
      expect(response.status).toBe(200);
    },
    async dispose() {
      await server.dispose();
      portForwarding.gateway.dispose();
      portForwarding.proxy.dispose();
    },
  };
}

interface ProbeRelayAdapter {
  /** Resolves once the relay answered this registration. */
  readonly waitRegistered: () => Promise<void>;
  dispose(): void;
}

/** The production `startRelayHost` adapter wired the way the headless
 * composition wires it: origin secret + dispatch key in, registered relay
 * origin back out to the host's `getRelayForwardOrigin`. */
function startProbeRelayAdapter(host: ProbeHost, relayWsUrl: string): ProbeRelayAdapter {
  let notifyRegistered: () => void = () => {};
  const registered = new Promise<void>((resolve) => {
    notifyRegistered = resolve;
  });
  const handle = startRelayHost({
    relayUrl: relayWsUrl,
    serverId: host.serverId,
    secret: `registration-secret-${host.serverId}`,
    forwardOriginSecret: host.originSecret,
    forwardDispatchKey: host.dispatchKey,
    localHttpUrl: host.info.httpBaseUrl,
    minReconnectMs: 50,
    maxReconnectMs: 200,
    onForwardOrigin: (origin) => {
      host.relayOrigin = origin ? { ownerId: origin.ownerId, baseUrl: origin.baseUrl } : null;
    },
    onRegistered: () => notifyRegistered(),
  });
  cleanup.push(async () => handle.dispose());
  return {
    waitRegistered: () => registered,
    dispose: () => {
      handle.dispose();
    },
  };
}

/** The per-origin session cookie minted by the child-origin exchange, as a
 * ready `Cookie` header crumb. */
function cookieValueFromSetCookie(setCookie: readonly string[] | undefined): string {
  const raw = setCookie?.[0] ?? "";
  const value = new RegExp(`^${FORWARD_ORIGIN_SESSION_COOKIE_NAME}=([^;]+)`).exec(raw)?.[1];
  expect(value, `expected a ${FORWARD_ORIGIN_SESSION_COOKIE_NAME} cookie in "${raw}"`).toBeTruthy();
  return `${FORWARD_ORIGIN_SESSION_COOKIE_NAME}=${value}`;
}

/** One browser tab's view: an origin plus the cookie its jar holds for it. */
interface Tab {
  readonly origin: string;
  cookie: string | null;
}

/** GET on a child origin (direct host or through the relay — the caller picks
 * the dial port): `Host` carries the child authority a browser would resolve
 * via DNS. */
async function childGet(
  dialPort: number,
  tab: Tab,
  path: string,
): Promise<{ status: number; body: string }> {
  const response = await rawRequestWithAuthority({
    port: dialPort,
    path,
    authority: new URL(tab.origin).host,
    ...(tab.cookie ? { headers: { cookie: tab.cookie } } : {}),
  });
  return { status: response.status, body: await response.text() };
}

async function expectApp(dialPort: number, tab: Tab, app: string, path: string): Promise<void> {
  const result = await childGet(dialPort, tab, path);
  expect(
    { status: result.status, ...(JSON.parse(result.body) as object) },
    `${tab.origin}${path} should serve ${app}`,
  ).toMatchObject({ status: 200, app, path });
}

interface EnteredSession {
  readonly forwardId: string;
  readonly tab: Tab;
}

/** Drives the two-hop browser entry (API-origin enter → child-origin
 * exchange) and stores the minted session in the returned tab. `enterPath` is
 * resolved against the API base — the direct origin, or the relay's
 * `/s/<id>` prefix — and the exchange lands on the child origin the host
 * selected for its active ingress identity. */
async function enterForward(input: {
  readonly apiBase: string;
  readonly dialPort: number;
  readonly enterPath: string;
  readonly forwardId: string;
}): Promise<EnteredSession> {
  // `enterPath` is root-relative; string concat preserves the relay's
  // `/s/<serverId>` prefix that `new URL(enterPath, base)` would strip, while
  // the base's trailing slash is normalized away.
  const entry = await fetch(`${input.apiBase.replace(/\/+$/, "")}${input.enterPath}`, {
    redirect: "manual",
  });
  expect(entry.status, `enter ${input.enterPath} -> ${await entry.text()}`).toBe(302);
  const location = entry.headers.get("location")!;
  const child = new URL(location);
  expect(child.pathname).toBe(FORWARD_ORIGIN_EXCHANGE_PATH);
  expect(child.searchParams.get("fx")).toBeTruthy();
  const origin = child.origin;
  const exchanged = await rawRequestWithAuthority({
    port: input.dialPort,
    path: `${child.pathname}${child.search}`,
    authority: child.host,
    headers: { origin },
  });
  expect(exchanged.status).toBe(302);
  return {
    forwardId: input.forwardId,
    tab: { origin, cookie: cookieValueFromSetCookie(exchanged.headers["set-cookie"]) },
  };
}

async function wsEcho(
  dialPort: number,
  tab: Tab,
  text: string,
): Promise<{ app: string; echo: string }> {
  const socket = new WebSocket(`ws://127.0.0.1:${dialPort}/`, {
    headers: {
      host: new URL(tab.origin).host,
      origin: tab.origin,
      ...(tab.cookie ? { cookie: tab.cookie } : {}),
    },
  });
  cleanup.push(async () => socket.terminate());
  try {
    const first = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("websocket echo timed out")), 5_000);
      socket.once("open", () => socket.send(text));
      socket.once("message", (data) => {
        clearTimeout(timer);
        resolve(data.toString());
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.once("close", () => {
        clearTimeout(timer);
        reject(new Error("websocket closed before echoing"));
      });
    });
    return JSON.parse(first) as { app: string; echo: string };
  } finally {
    socket.close();
  }
}

describe("two-host forward origin isolation probe (PORT_FORWARD_ORIGIN_ISOLATION)", () => {
  it("pins two applications on one host to their own origins across tabs, sockets, and a stop/recreate cycle", async () => {
    const host = await startProbeHost({
      serverId: "probe-host",
      directForwardBaseUrl: "https://apps.example.test",
    });
    const appA = await startUpstreamApp("app-a");
    const appB = await startUpstreamApp("app-b");

    const forwardA = await host.createForward(appA.port);
    const forwardB = await host.createForward(appB.port);
    const dialPort = Number(new URL(host.info.httpBaseUrl).port);

    // Invariant 1: a forward has an origin distinct from the API origin and
    // from every other forward.
    const apiOrigin = new URL(host.info.httpBaseUrl).origin;
    const enteredA = await enterForward({
      apiBase: host.info.httpBaseUrl,
      dialPort,
      enterPath: forwardA.enterPath,
      forwardId: forwardA.id,
    });
    const enteredB = await enterForward({
      apiBase: host.info.httpBaseUrl,
      dialPort,
      enterPath: forwardB.enterPath,
      forwardId: forwardB.id,
    });
    expect(enteredA.tab.origin).not.toBe(enteredB.tab.origin);
    expect(enteredA.tab.origin).not.toBe(apiOrigin);
    expect(enteredB.tab.origin).not.toBe(apiOrigin);

    // Invariant 2 (one host): alternate tabs — entering B never moves A's
    // routing, and root-relative fetches (/api/* included) stay on the
    // forwarded application.
    await expectApp(dialPort, enteredA.tab, appA.label, "/");
    await expectApp(dialPort, enteredB.tab, appB.label, "/");
    await expectApp(dialPort, enteredA.tab, appA.label, "/");
    await expectApp(dialPort, enteredA.tab, appA.label, "/api/data");
    await expectApp(dialPort, enteredB.tab, appB.label, "/api/data");

    // A's cookie cannot authenticate B's origin (the server-side
    // (forwardId, origin) binding — the copied-cookie case the old shared
    // `lc_forward` cookie allowed).
    const stolen = await childGet(dialPort, { ...enteredB.tab, cookie: enteredA.tab.cookie }, "/");
    expect(stolen.status).toBe(403);

    // Invariant 5: HMR-style WebSocket reconnects land on the same app.
    expect(await wsEcho(dialPort, enteredA.tab, "ping-a")).toMatchObject({
      app: appA.label,
      echo: "ping-a",
    });
    expect(await wsEcho(dialPort, enteredA.tab, "ping-a2")).toMatchObject({
      app: appA.label,
      echo: "ping-a2",
    });
    expect(await wsEcho(dialPort, enteredB.tab, "ping-b")).toMatchObject({ app: appB.label });

    // Invariant 4: stopping A revokes its origin and sessions with no
    // fallback to host content, while B keeps serving independently.
    await host.stopForward(forwardA.id);
    const stopped = await childGet(dialPort, enteredA.tab, "/");
    expect(stopped.status).toBe(404);
    expect(JSON.parse(stopped.body)).toMatchObject({ error: { code: "forward_not_found" } });
    await expectApp(dialPort, enteredB.tab, appB.label, "/");

    // Reuse of the target port mints a NEW origin; the old one stays reserved
    // (never serves Poracode or the new app), and old cookies authenticate
    // nothing on it.
    const forwardA2 = await host.createForward(appA.port);
    expect(forwardA2.id).not.toBe(forwardA.id);
    const enteredA2 = await enterForward({
      apiBase: host.info.httpBaseUrl,
      dialPort,
      enterPath: forwardA2.enterPath,
      forwardId: forwardA2.id,
    });
    expect(enteredA2.tab.origin).not.toBe(enteredA.tab.origin);
    await expectApp(dialPort, enteredA2.tab, appA.label, "/");
    const oldCookieOnNew = await childGet(
      dialPort,
      { ...enteredA2.tab, cookie: enteredA.tab.cookie },
      "/",
    );
    expect(oldCookieOnNew.status).toBe(403);
    const oldOrigin = await childGet(dialPort, { origin: enteredA.tab.origin, cookie: null }, "/");
    expect(oldOrigin.status).toBe(404);
  }, 30_000);

  it("pins two hosts behind one relay to their own registered origins and survives a host re-registration", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      forwardBaseUrl: "https://relay-apps.example.test",
    });
    cleanup.push(() => relay.dispose());
    const relayInfo = await relay.start();
    const relayPort = relayInfo.port;
    const relayWsUrl = `${relayInfo.url.replace(/^http/, "ws")}/host`;

    const hostA = await startProbeHost({ serverId: "probe-host-a" });
    const hostB = await startProbeHost({ serverId: "probe-host-b" });

    // Real adapters: production startRelayHost dialing the real relay.
    const adapterA = startProbeRelayAdapter(hostA, relayWsUrl);
    const adapterB = startProbeRelayAdapter(hostB, relayWsUrl);
    await adapterA.waitRegistered();
    await adapterB.waitRegistered();

    // Different origin secrets → different owner labels → disjoint origin
    // namespaces behind one relay (knowing a public serverId grants nothing).
    expect(hostA.relayOrigin).not.toBeNull();
    expect(hostB.relayOrigin).not.toBeNull();
    expect(hostA.relayOrigin!.ownerId).not.toBe(hostB.relayOrigin!.ownerId);

    const appA = await startUpstreamApp("relay-app-a");
    const appB = await startUpstreamApp("relay-app-b");
    // Created THROUGH the relay: the relay-api dispatch context is what makes
    // the host mint entry tokens for its registered relay origin namespace.
    const forwardA = await hostA.createForward(appA.port, `${relayInfo.url}/s/${hostA.serverId}`);
    const forwardB = await hostB.createForward(appB.port, `${relayInfo.url}/s/${hostB.serverId}`);

    // Entry rides the relay API prefix; the exchange lands on each host's own
    // relay child origin.
    const enteredA = await enterForward({
      apiBase: `${relayInfo.url}/s/${hostA.serverId}`,
      dialPort: relayPort,
      enterPath: forwardA.enterPath,
      forwardId: forwardA.id,
    });
    const enteredB = await enterForward({
      apiBase: `${relayInfo.url}/s/${hostB.serverId}`,
      dialPort: relayPort,
      enterPath: forwardB.enterPath,
      forwardId: forwardB.id,
    });
    expect(enteredA.tab.origin).not.toBe(enteredB.tab.origin);
    expect(new URL(enteredA.tab.origin).hostname.endsWith(".relay-apps.example.test")).toBe(true);
    expect(new URL(enteredB.tab.origin).hostname.endsWith(".relay-apps.example.test")).toBe(true);

    // Alternate tabs across hosts behind one relay: target identity follows
    // the origin, never a shared cookie or "current host" state.
    await expectApp(relayPort, enteredA.tab, appA.label, "/");
    await expectApp(relayPort, enteredB.tab, appB.label, "/");
    await expectApp(relayPort, enteredA.tab, appA.label, "/");
    await expectApp(relayPort, enteredA.tab, appA.label, "/api/data");

    // Host A's session authenticates nothing on host B's child origin.
    const stolen = await childGet(relayPort, { ...enteredB.tab, cookie: enteredA.tab.cookie }, "/");
    expect(stolen.status).toBe(403);

    // Socket reconnect through the relay stays pinned to host A's app.
    expect(await wsEcho(relayPort, enteredA.tab, "ping")).toMatchObject({
      app: appA.label,
      echo: "ping",
    });
    expect(await wsEcho(relayPort, enteredA.tab, "ping2")).toMatchObject({ app: appA.label });

    // Restart leg: host A's adapter drops and re-registers with the same
    // secret. The owner label re-derives identically, so the origin (and the
    // already-minted tab session) survives; traffic still reaches host A's
    // app only, and host B is unaffected throughout.
    adapterA.dispose();
    await expectApp(relayPort, enteredB.tab, appB.label, "/");
    const adapterA2 = startProbeRelayAdapter(hostA, relayWsUrl);
    await adapterA2.waitRegistered();
    expect(hostA.relayOrigin).not.toBeNull();
    await expectApp(relayPort, enteredA.tab, appA.label, "/");
    await expectApp(relayPort, enteredB.tab, appB.label, "/");
    expect(await wsEcho(relayPort, enteredA.tab, "after-restart")).toMatchObject({
      app: appA.label,
      echo: "after-restart",
    });
  }, 45_000);
});
