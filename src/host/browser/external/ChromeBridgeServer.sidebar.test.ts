import { createHmac, randomBytes } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { ChromeBridgeServer } from "./ChromeBridgeServer";
import {
  RemoteAccessServer,
  type RemoteAccessServerOptions,
} from "@/host/remote/RemoteAccessServer";
import {
  CHROME_SIDEBAR_EXTENSION_IDS,
  CHROME_SIDEBAR_PROTOCOL_VERSION as SIDEBAR,
  chromeBridgeClientProofMessage,
  chromeBridgeServerProofMessage,
  type ChromeSidebarHelloAck,
  chromeSidebarBootstrapResponseSchema,
  chromeSidebarHelloAckSchema,
} from "@/shared/chromeSidebarProtocol";

const origin = `chrome-extension://${CHROME_SIDEBAR_EXTENSION_IDS[0]}`;
const otherExtension = `chrome-extension://${"a".repeat(32)}`;
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

type BootstrapIssuer = NonNullable<
  ConstructorParameters<typeof ChromeBridgeServer>[0]["getChatBootstrap"]
>;

async function startHost(options: { advertisedHost?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "poracode-sidebar-"));
  cleanups.push(() => rmSync(root, { force: true, recursive: true }));
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "sidebar-fixture", label: "Sidebar fixture" },
    host: "127.0.0.1",
    port: 0,
    ...(options.advertisedHost ? { advertisedHost: options.advertisedHost } : {}),
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
  });
  await server.start();
  cleanups.push(() => server.dispose());
  const issue = vi.fn<BootstrapIssuer>(async () => {
    const credential = server.mintLoopbackRendererCredential({ browserExtension: true });
    return credential ? { endpoint: credential.endpoint, pairingUrl: credential.pairingUrl } : null;
  });
  const nativeHostDir = join(root, "native-host");
  const bridge = new ChromeBridgeServer({
    pairingFilePath: join(root, "bridge.json"),
    ports: [0],
    getChatBootstrap: issue,
    extensionIds: CHROME_SIDEBAR_EXTENSION_IDS,
    nativeHostDir,
  });
  const info = await bridge.start();
  cleanups.push(() => bridge.dispose());
  return { root, server, issue, bridge, info, nativeHostDir };
}

/**
 * `proof`: the extension's mutual handshake. The rest are attacks or legacy
 * paths: `url` the manual/debug query, `raw` the removed raw-token hello field,
 * `wrong` a proof under another secret, `relayed` a valid proof bound to another
 * port (an impostor forwarding the extension's hello), `tampered` a flipped bit.
 */
type Auth = "proof" | "url" | "none" | "wrong" | "raw" | "relayed" | "tampered";

/** The `helloAck` each connected client received, consumed before any CDP frame. */
const acks = new WeakMap<WebSocket, ChromeSidebarHelloAck>();
const nonces = new WeakMap<WebSocket, string>();

const hmac = (secret: string, message: string) =>
  createHmac("sha256", Buffer.from(secret, "utf8")).update(message, "utf8").digest("hex");

function helloAuth(auth: Auth, info: { port: number; token: string }, nonce: string) {
  const sign = (secret: string, port: number) =>
    hmac(secret, chromeBridgeClientProofMessage(port, nonce));
  switch (auth) {
    case "proof":
      return { nonce, clientProof: sign(info.token, info.port) };
    case "wrong":
      return { nonce, clientProof: sign("f".repeat(48), info.port) };
    case "relayed":
      return { nonce, clientProof: sign(info.token, info.port + 1) };
    case "tampered": {
      const proof = sign(info.token, info.port);
      return { nonce, clientProof: `${proof[0] === "0" ? "1" : "0"}${proof.slice(1)}` };
    }
    case "raw":
      return { bridgeToken: info.token };
    default:
      return {};
  }
}

async function connect(
  host: Awaited<ReturnType<typeof startHost>>,
  hello: Record<string, unknown>,
  options: { auth?: Auth; clientOrigin?: string } = {},
) {
  const auth = options.auth ?? "proof";
  const query = auth === "url" ? `?token=${host.info.token}` : "";
  const client = new WebSocket(`ws://127.0.0.1:${host.info.port}/${query}`, {
    origin: options.clientOrigin ?? origin,
  });
  cleanups.push(() => client.terminate());
  await once(client, "open");
  const nonce = randomBytes(32).toString("hex");
  nonces.set(client, nonce);
  const changed = new Promise<void>((resolve) => {
    const off = host.bridge.onChange(() => {
      off();
      resolve();
    });
  });
  const acked = once(client, "message").then(([frame]) =>
    chromeSidebarHelloAckSchema.parse(JSON.parse(String(frame))),
  );
  client.send(
    JSON.stringify({
      type: "hello",
      extensionVersion: "0.2.0",
      ...hello,
      ...helloAuth(auth, host.info, nonce),
    }),
  );
  await changed;
  acks.set(client, await acked);
  return client;
}

function requestBootstrap(client: WebSocket, requestId: string) {
  const reply = new Promise<ReturnType<typeof chromeSidebarBootstrapResponseSchema.parse>>(
    (resolve) => {
      const onMessage = (frame: unknown) => {
        const parsed = chromeSidebarBootstrapResponseSchema.safeParse(JSON.parse(String(frame)));
        if (!parsed.success || parsed.data.requestId !== requestId) return;
        client.off("message", onMessage);
        resolve(parsed.data);
      };
      client.on("message", onMessage);
    },
  );
  client.send(JSON.stringify({ type: "sidebarBootstrap", version: SIDEBAR, requestId }));
  return reply;
}

async function expectCdpRelay(bridge: ChromeBridgeServer, client: WebSocket) {
  const request = once(client, "message");
  const tabs = bridge.getConnection()!.listTabs();
  const [frame] = await request;
  const message = JSON.parse(String(frame)) as { type: string; id: number };
  expect(message.type).toBe("listTabs");
  client.send(JSON.stringify({ type: "result", id: message.id, ok: true, tabs: [] }));
  await expect(tabs).resolves.toEqual([]);
}

function pairingCredential(pairingUrl: string) {
  return new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
}

describe("sidebar bootstrap compatibility and authentication", () => {
  it("pairs a pinned extension that proves the native-host token, without weakening bearer authentication", async () => {
    const host = await startHost();
    const client = await connect(host, { sidebarBootstrapVersion: SIDEBAR });
    const ack = acks.get(client)!;
    const nonce = nonces.get(client)!;
    expect(ack).toEqual({
      type: "helloAck",
      sidebarBootstrapVersion: SIDEBAR,
      authenticated: true,
      serverProof: hmac(
        host.info.token,
        chromeBridgeServerProofMessage(host.info.port, nonce, ack),
      ),
    });
    // The server proof is domain-separated from the client's and bound to the port.
    expect(ack.serverProof).not.toBe(
      hmac(host.info.token, chromeBridgeClientProofMessage(host.info.port, nonce)),
    );
    expect(ack.serverProof).not.toBe(
      hmac(host.info.token, chromeBridgeServerProofMessage(host.info.port + 1, nonce, ack)),
    );
    const result = await requestBootstrap(client, "sidebar-1");
    expect(result.bootstrap?.endpoint).toBe(host.server.getInfo()?.localHttpBaseUrl);
    const bootstrap = result.bootstrap!;
    const credential = pairingCredential(bootstrap.pairingUrl);
    const exchange = await fetch(new URL("/oauth/token", bootstrap.endpoint), {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        clientLabel: "Chrome sidebar",
      }),
    });
    expect(exchange.status).toBe(200);
    expect(exchange.headers.get("access-control-allow-origin")).toBe(origin);
    const tokenResult = (await exchange.json()) as { accessToken: string };
    expect(tokenResult.accessToken).toBeTruthy();
    const unauthenticated = await fetch(new URL("/api/host/describe", bootstrap.endpoint), {
      headers: { origin },
    });
    expect(unauthenticated.status).toBe(401);
    const authenticated = await fetch(new URL("/api/host/describe", bootstrap.endpoint), {
      headers: { origin, authorization: `Bearer ${tokenResult.accessToken}` },
    });
    expect(authenticated.status).toBe(200);
    const reused = await fetch(new URL("/oauth/token", bootstrap.endpoint), {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        clientLabel: "Chrome sidebar",
      }),
    });
    expect(reused.status).not.toBe(200);
  });

  it("also accepts the existing ?token= query as authentication", async () => {
    const host = await startHost();
    const client = await connect(host, { sidebarBootstrapVersion: SIDEBAR }, { auth: "url" });
    // A token holder needs no proof of the server; the ack carries none.
    expect(acks.get(client)).toEqual({
      type: "helloAck",
      sidebarBootstrapVersion: SIDEBAR,
      authenticated: true,
    });
    expect((await requestBootstrap(client, "url")).bootstrap).not.toBeNull();
  });

  it.each<Auth>(["none", "wrong", "raw", "relayed", "tampered"])(
    "never issues a credential or a server proof to a pinned origin without a valid proof (%s) — any local process can forge the Origin header",
    async (auth) => {
      const host = await startHost();
      const client = await connect(host, { sidebarBootstrapVersion: SIDEBAR }, { auth });
      // A current host whose native host was unreachable: same protocol, so the
      // extension retries authentication rather than asking for an update.
      expect(acks.get(client)).toEqual({
        type: "helloAck",
        sidebarBootstrapVersion: SIDEBAR,
        authenticated: false,
      });
      const result = await requestBootstrap(client, `forged-${auth}`);
      expect(result.bootstrap).toBeNull();
      expect(host.issue).not.toHaveBeenCalled();
      // The pre-existing CDP relay remains for older extensions.
      await expectCdpRelay(host.bridge, client);
    },
  );

  it("refuses other extensions and web origins at the upgrade when they have no token", async () => {
    const host = await startHost();
    for (const clientOrigin of [
      otherExtension,
      `moz-extension://${"b".repeat(32)}`,
      "https://evil.example",
    ]) {
      const client = new WebSocket(`ws://127.0.0.1:${host.info.port}/`, { origin: clientOrigin });
      client.on("error", () => {});
      const [, response] = (await once(client, "unexpected-response")) as [
        unknown,
        { statusCode: number },
      ];
      expect(response.statusCode).toBe(401);
    }
    expect(host.issue).not.toHaveBeenCalled();
  });

  it("does not issue chat credentials to token-authenticated non-extension or unpinned clients", async () => {
    for (const clientOrigin of ["http://localhost:3100", otherExtension]) {
      const host = await startHost();
      const client = await connect(
        host,
        { sidebarBootstrapVersion: SIDEBAR },
        { auth: "url", clientOrigin },
      );
      expect(acks.get(client)).toMatchObject({
        sidebarBootstrapVersion: null,
        authenticated: true,
      });
      client.send(
        JSON.stringify({ type: "sidebarBootstrap", version: SIDEBAR, requestId: "nope" }),
      );
      await expectCdpRelay(host.bridge, client);
      expect(host.issue).not.toHaveBeenCalled();
    }
  });

  it("does not let an unauthenticated origin displace an authenticated extension", async () => {
    const host = await startHost();
    const trusted = await connect(host, { sidebarBootstrapVersion: SIDEBAR });
    const connection = host.bridge.getConnection();
    const forged = new WebSocket(`ws://127.0.0.1:${host.info.port}/`, { origin });
    cleanups.push(() => forged.terminate());
    await once(forged, "open");
    forged.send(
      JSON.stringify({ type: "hello", extensionVersion: "x", sidebarBootstrapVersion: SIDEBAR }),
    );
    const [code] = (await once(forged, "close")) as [number];
    expect(code).toBe(1008);
    expect(host.bridge.getConnection()).toBe(connection);
    expect((await requestBootstrap(trusted, "still-trusted")).bootstrap).not.toBeNull();
  });

  it("gives an already-installed pre-upgrade 0.2.0 worker (raw bridgeToken, protocol 1) no credential, proof or authentication", async () => {
    expect(SIDEBAR).toBeGreaterThan(1);
    const host = await startHost();
    const client = await connect(host, { sidebarBootstrapVersion: 1 }, { auth: "raw" });
    expect(acks.get(client)).toEqual({
      type: "helloAck",
      sidebarBootstrapVersion: null,
      authenticated: false,
    });
    for (const version of [1, SIDEBAR]) {
      client.send(
        JSON.stringify({ type: "sidebarBootstrap", version, requestId: `pre-upgrade-${version}` }),
      );
    }
    // The next frame is the relay request: no bootstrap reply preceded it.
    await expectCdpRelay(host.bridge, client);
    expect(host.issue).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { sidebarBootstrapVersion: 0 },
    { sidebarBootstrapVersion: 1 },
    { sidebarBootstrapVersion: SIDEBAR + 1 },
  ])("keeps an older/unsupported hello on the existing CDP relay: %j", async (hello) => {
    const host = await startHost();
    const client = await connect(host, hello);
    // Relay-only extensions ignore the ack; a newer sidebar sees it cannot pair.
    expect(acks.get(client)).toMatchObject({
      type: "helloAck",
      sidebarBootstrapVersion: null,
      authenticated: true,
    });
    client.send(
      JSON.stringify({ type: "sidebarBootstrap", version: SIDEBAR, requestId: "unsupported" }),
    );
    await expectCdpRelay(host.bridge, client);
    expect(host.issue).not.toHaveBeenCalled();
  });

  it("answers concurrent requests in order with distinct credentials and refuses overflow immediately", async () => {
    const host = await startHost();
    const release = Promise.withResolvers<void>();
    const mint = host.issue.getMockImplementation()!;
    host.issue.mockImplementation(async () => {
      await release.promise;
      return mint();
    });
    const client = await connect(host, { sidebarBootstrapVersion: SIDEBAR });
    // One in flight + four queued; the sixth is refused without waiting.
    const replies = Array.from({ length: 6 }, (_, index) =>
      requestBootstrap(client, `concurrent-${index}`),
    );
    const refused = await replies[5]!;
    expect(refused.bootstrap).toBeNull();
    release.resolve();
    const answered = await Promise.all(replies.slice(0, 5));
    const urls = answered.map((reply) => reply.bootstrap?.pairingUrl);
    expect(urls.every(Boolean)).toBe(true);
    expect(new Set(urls).size).toBe(5);
    expect(host.issue).toHaveBeenCalledTimes(5);
  });

  it("caps mints per minute and answers the excess with null", async () => {
    const host = await startHost();
    const client = await connect(host, { sidebarBootstrapVersion: SIDEBAR });
    const results = [];
    for (let index = 0; index < 13; index += 1) {
      results.push(await requestBootstrap(client, `rate-${index}`));
    }
    expect(results.slice(0, 12).every((result) => result.bootstrap !== null)).toBe(true);
    expect(results[12]!.bootstrap).toBeNull();
    expect(host.issue).toHaveBeenCalledTimes(12);
  });

  it("does not mint an unusable credential when the server is not plain-http loopback", async () => {
    const host = await startHost({ advertisedHost: "192.0.2.10" });
    const issuePairing = vi.spyOn(
      (host.server as unknown as { auth: { issuePairingCredential: () => unknown } }).auth,
      "issuePairingCredential",
    );
    const client = await connect(host, { sidebarBootstrapVersion: SIDEBAR });
    expect((await requestBootstrap(client, "lan")).bootstrap).toBeNull();
    expect(issuePairing).not.toHaveBeenCalled();
    // The co-located desktop renderer keeps its existing credential path.
    expect(host.server.mintLoopbackRendererCredential()?.endpoint).toContain("192.0.2.10");
  });

  it.skipIf(process.platform === "win32")(
    "keeps the pairing file and native-host entry private and removes the entry on shutdown",
    async () => {
      const host = await startHost();
      expect(statSync(join(host.root, "bridge.json")).mode & 0o777).toBe(0o600);
      expect(statSync(host.nativeHostDir).mode & 0o777).toBe(0o700);
      const bridgesDir = join(host.nativeHostDir, "bridges");
      expect(statSync(bridgesDir).mode & 0o777).toBe(0o700);
      const [entry] = readdirSync(bridgesDir);
      const entryPath = join(bridgesDir, entry!);
      expect(statSync(entryPath).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(entryPath, "utf8"))).toMatchObject({
        port: host.info.port,
        token: host.info.token,
        pid: process.pid,
      });
      await host.bridge.dispose();
      expect(existsSync(entryPath)).toBe(false);
    },
  );
});

describe("extension CORS allowlist", () => {
  it("rejects malformed, unpinned and proxy-forwarded extension origins", async () => {
    const { server } = await startHost();
    const descriptor = new URL(
      "/.well-known/poracode/environment",
      server.getInfo()!.localHttpBaseUrl,
    );
    for (const invalid of [
      "chrome-extension://short",
      otherExtension,
      origin + "/path",
      origin + ".evil.example",
      "https://evil.example",
    ]) {
      const response = await fetch(descriptor, { headers: { origin: invalid } });
      expect(response.status).toBe(403);
    }
    const proxied = await fetch(descriptor, {
      headers: { origin, "x-forwarded-for": "203.0.113.1" },
    });
    expect(proxied.status).toBe(403);
    const pinned = await fetch(descriptor, { headers: { origin } });
    expect(pinned.headers.get("access-control-allow-origin")).toBe(origin);
  });
});
