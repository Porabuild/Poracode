import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const workerSource = await readFile(
  new URL("../chrome-extension/background.js", import.meta.url),
  "utf8",
);
const protocolSource = await readFile(
  new URL("../src/shared/chromeSidebarProtocol.ts", import.meta.url),
  "utf8",
);
// The fake bridge signs with the shared host constants, so a drifted worker
// mirror fails every proven-path test, not only the literal check below.
const sharedConstant = (name) =>
  new RegExp(`export const ${name} = "([^"]+)"`, "u").exec(protocolSource)?.[1];
const SIDEBAR = Number(
  /export const CHROME_SIDEBAR_PROTOCOL_VERSION = (\d+)/u.exec(protocolSource)?.[1],
);
assert.ok(SIDEBAR > 1, "protocol 1 was the installed 0.2.0 raw-token hello");
const CLIENT_DOMAIN = sharedConstant("CHROME_BRIDGE_CLIENT_PROOF_DOMAIN");
const SERVER_DOMAIN = sharedConstant("CHROME_BRIDGE_SERVER_PROOF_DOMAIN");
assert.ok(CLIENT_DOMAIN && SERVER_DOMAIN && CLIENT_DOMAIN !== SERVER_DOMAIN);
const PORT = 47820;
const TOKEN = "native-bridge-token";
const hmac = (secret, fields) =>
  createHmac("sha256", Buffer.from(secret, "utf8")).update(fields.join("\n")).digest("hex");
const clientProof = (nonce, { secret = TOKEN, port = PORT } = {}) =>
  hmac(secret, [CLIENT_DOMAIN, port, nonce]);
const serverProof = (nonce, { secret = TOKEN, port = PORT, version = SIDEBAR } = {}) =>
  hmac(secret, [SERVER_DOMAIN, port, nonce, version ?? "null", true]);
const bridges = { type: "bridges", version: 1, bridges: [{ port: PORT, token: TOKEN }] };
const bootstrap = { endpoint: "http://127.0.0.1:9000", pairingUrl: "http://127.0.0.1:9000/#t" };

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  sent = [];
  listeners = new Map();
  constructor(url) {
    this.url = url;
    FakeSocket.created.push(this);
  }
  addEventListener(type, listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    queueMicrotask(() => this.emit("close"));
  }
  accept() {
    this.readyState = FakeSocket.OPEN;
    this.emit("open");
  }
  receive(message) {
    this.emit("message", { data: JSON.stringify(message) });
  }
}

const settle = async () => {
  for (let index = 0; index < 20; index += 1) await new Promise((r) => setImmediate(r));
};

/** Loads the service worker against a fake Chrome whose native host answers with `native()`. */
function loadWorker(t, native, initialStorage = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  FakeSocket.created = [];
  const storage = { ...initialStorage };
  const browserCalls = [];
  let onMessage;
  const nativeCalls = [];
  const listener = { addListener() {} };
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: storage[key] }),
        set: async (values) => Object.assign(storage, values),
        remove: async (key) => delete storage[key],
      },
    },
    tabs: {
      query: async () => {
        browserCalls.push("tabs.query");
        return [{ id: 7, url: "https://example.test/", title: "Example", active: true }];
      },
      get: async (tabId) => ({ id: tabId, url: "", title: "", active: true }),
    },
    runtime: {
      getManifest: () => ({ version: "0.2.0" }),
      sendNativeMessage: async (name, message) => {
        nativeCalls.push({ name, message });
        return native(nativeCalls.length);
      },
      onMessage: { addListener: (fn) => (onMessage = fn) },
      onStartup: listener,
    },
    alarms: { create() {}, onAlarm: listener },
    debugger: {
      onEvent: listener,
      onDetach: listener,
      attach: (_target, _version, done) => {
        browserCalls.push("debugger.attach");
        done();
      },
      sendCommand: (_target, method, _params, done) => {
        browserCalls.push(`cdp:${method}`);
        done({});
      },
      detach: (_target, done) => done(),
    },
    sidePanel: { setPanelBehavior: async () => {} },
  };
  vm.runInNewContext(workerSource, {
    chrome,
    WebSocket: FakeSocket,
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    Date: { now: () => Date.now() },
    crypto: globalThis.crypto,
    TextEncoder,
  });
  // Runtime messages are serialized, as Chrome does across contexts.
  const ask = (cmd = "getChatBootstrap") =>
    new Promise((resolve) => {
      const respond = (value) => resolve(value === undefined ? value : structuredClone(value));
      if (onMessage({ cmd }, {}, respond) !== true) resolve(undefined);
    });
  return { storage, nativeCalls, browserCalls, ask, sockets: FakeSocket.created };
}

/** Opens the latest socket and returns the hello the worker sent on it. */
async function open(sockets, port = PORT) {
  await settle();
  const socket = sockets.at(-1);
  assert.match(socket.url, new RegExp(`:${port}/`));
  socket.accept();
  await settle();
  assert.equal(socket.sent[0]?.type, "hello");
  return { socket, hello: socket.sent[0] };
}

const ack = (sidebarBootstrapVersion, authenticated, proof) => ({
  type: "helloAck",
  sidebarBootstrapVersion,
  authenticated,
  ...(proof ? { serverProof: proof } : {}),
});

/** The genuine bridge's ack: it verifies the client proof and proves itself back. */
function provenAck(hello, options = {}) {
  assert.match(hello.nonce, /^[0-9a-f]{64}$/u);
  assert.equal(hello.clientProof, clientProof(hello.nonce, options));
  return ack(SIDEBAR, true, serverProof(hello.nonce, options));
}

/** Host → worker relay request; resolves with the worker's result frame. */
async function relay(socket, request) {
  const id = Math.floor(Math.random() * 1e9);
  socket.receive({ id, ...request });
  await settle();
  return socket.sent.find((frame) => frame.type === "result" && frame.id === id);
}

/** Nothing the worker sent or dialed may contain the raw secret. */
function assertSecretNeverSent(worker) {
  for (const socket of worker.sockets) {
    assert.ok(!socket.url.includes("token"), `no secret query in ${socket.url}`);
    assert.ok(!JSON.stringify(socket.sent).includes(TOKEN), "the secret never crosses the socket");
    assert.ok(socket.sent.every((frame) => frame.bridgeToken === undefined));
  }
  assert.ok(!JSON.stringify(worker.storage).includes(TOKEN), "the secret is never persisted");
}

void test("reopens the same port authenticated once the native host answers, then pairs", async (t) => {
  const worker = loadWorker(t, (call) =>
    call === 1 ? Promise.reject(new Error("absent")) : bridges,
  );
  const first = await open(worker.sockets);
  assert.equal(first.hello.bridgeToken, undefined);
  first.socket.receive(ack(SIDEBAR, false));

  // Within the retry interval the native host is not respawned.
  assert.equal(await worker.ask(), null);
  assert.equal(worker.nativeCalls.length, 1);
  assert.equal(first.socket.readyState, FakeSocket.OPEN);

  t.mock.timers.tick(10_000);
  assert.equal(await worker.ask(), null);
  assert.equal(worker.nativeCalls.length, 2);
  await settle();
  assert.equal(first.socket.readyState, FakeSocket.CLOSED);
  t.mock.timers.tick(250);

  const second = await open(worker.sockets);
  assert.equal(worker.sockets.length, 2, "reconnects without scanning other ports");
  assert.equal(worker.nativeCalls.length, 2, "the reopened hello reuses the fetched token");
  second.socket.receive(provenAck(second.hello));

  const reply = worker.ask();
  await settle();
  const request = second.socket.sent.at(-1);
  assert.deepEqual(
    { type: request.type, version: request.version },
    { type: "sidebarBootstrap", version: SIDEBAR },
  );
  second.socket.receive({
    type: "sidebarBootstrapResult",
    version: SIDEBAR,
    requestId: request.requestId,
    bootstrap,
  });
  assert.deepEqual(await reply, bootstrap);
  assertSecretNeverSent(worker);
});

void test("an app without a hello ack predates the sidebar and needs an update", async (t) => {
  const worker = loadWorker(t, () => null);
  const { socket } = await open(worker.sockets);
  const reply = worker.ask();
  await settle();
  t.mock.timers.tick(5000);
  assert.deepEqual(await reply, { issue: "upgradeRequired" });
  // Ignored late frames and repeated asks keep the answer; the native host is
  // asked again at most every 10 s, in case another app's bridge appears.
  socket.receive(ack(SIDEBAR, true));
  assert.deepEqual(await worker.ask(), { issue: "upgradeRequired" });
  assert.equal(worker.nativeCalls.length, 1);
  t.mock.timers.tick(10_000);
  assert.deepEqual(await worker.ask(), { issue: "upgradeRequired" });
  assert.deepEqual(await worker.ask(), { issue: "upgradeRequired" });
  assert.equal(worker.nativeCalls.length, 2);
  assert.ok(socket.sent.every((frame) => frame.type !== "sidebarBootstrap"));
});

void test("an ack for another sidebar protocol needs an update immediately", async (t) => {
  const worker = loadWorker(t, () => bridges);
  const { socket, hello } = await open(worker.sockets);
  socket.receive(ack(null, true, serverProof(hello.nonce, { version: null })));
  assert.deepEqual(await worker.ask(), { issue: "upgradeRequired" });
  assert.ok(socket.sent.every((frame) => frame.type !== "sidebarBootstrap"));
});

void test("a current app whose native host stays unavailable retries quietly and boundedly", async (t) => {
  const worker = loadWorker(t, () => null);
  const { socket } = await open(worker.sockets);
  socket.receive(ack(SIDEBAR, false));
  for (let index = 0; index < 8; index += 1) {
    assert.equal(await worker.ask(), null);
    t.mock.timers.tick(4000);
  }
  // 32 s of 4 s sidebar polling: the open attempt plus retries at 12 s and 24 s.
  assert.equal(worker.nativeCalls.length, 3);
  assert.equal(socket.readyState, FakeSocket.OPEN);
  assert.ok(socket.sent.every((frame) => frame.type !== "sidebarBootstrap"));
});

for (const [name, forge] of [
  ["a bare authenticated claim", () => undefined],
  [
    "a tampered proof",
    (hello) => serverProof(hello.nonce).replace(/^./u, (c) => (c === "0" ? "1" : "0")),
  ],
  [
    "a proof for another port (relayed from the real bridge)",
    (hello) => serverProof(hello.nonce, { port: PORT + 1 }),
  ],
  ["a reflected client proof", (hello) => hello.clientProof],
  ["a proof for another nonce", () => serverProof("ab".repeat(32))],
  ["a proof under another secret", (hello) => serverProof(hello.nonce, { secret: "stale-token" })],
]) {
  void test(`an impostor bridge with ${name} gets no credential and no browser control`, async (t) => {
    const worker = loadWorker(t, () => bridges);
    const { socket, hello } = await open(worker.sockets);
    socket.receive(ack(SIDEBAR, true, forge(hello)));
    const reply = worker.ask();
    await settle();
    assert.ok(socket.sent.every((frame) => frame.type !== "sidebarBootstrap"));
    t.mock.timers.tick(5000);
    assert.equal(await reply, null);
    for (const request of [
      { type: "listTabs" },
      { type: "attach", tabId: 7 },
      { type: "openTab", url: "https://example.test/" },
      { type: "cdp", tabId: 7, method: "Runtime.evaluate", params: { expression: "1" } },
    ]) {
      const result = await relay(socket, request);
      assert.equal(result?.ok, false, `${request.type} is refused`);
    }
    assert.deepEqual(worker.browserCalls, []);
    assert.ok(socket.sent.every((frame) => frame.type !== "sidebarBootstrap"));
    // Retrying the same secret cannot help: the worker never reopens for it.
    t.mock.timers.tick(10_000);
    assert.equal(await worker.ask(), null);
    await settle();
    assert.equal(socket.readyState, FakeSocket.OPEN);
    assertSecretNeverSent(worker);
  });
}

void test("an impostor that never got a client proof cannot claim authentication", async (t) => {
  // No native entry at all: the hello carries no proof.
  const worker = loadWorker(t, () => ({ ...bridges, bridges: [] }));
  const { socket, hello } = await open(worker.sockets);
  assert.equal(hello.nonce, undefined);
  assert.equal(hello.clientProof, undefined);
  socket.receive(ack(SIDEBAR, true, serverProof("00".repeat(32))));
  assert.equal((await relay(socket, { type: "listTabs" }))?.ok, false);
  assert.equal(await worker.ask(), null);
  assert.deepEqual(worker.browserCalls, []);
});

/** Fails every dial until the worker dials `port` again; returns that socket and the dial count. */
async function scanTo(t, worker, port) {
  const before = worker.sockets.length;
  for (let step = 0; step < 60; step += 1) {
    t.mock.timers.tick(4000);
    await settle();
    const socket = worker.sockets.at(-1);
    if (socket.readyState !== FakeSocket.CONNECTING) continue;
    if (socket.url.includes(`:${port}/`)) return { socket, dials: worker.sockets.length - before };
    socket.close();
  }
  assert.fail(`never dialed ${port} again`);
}

void test("an older app on the first port is left for the bridge the native host knows, which is proven", async (t) => {
  const other = PORT + 1;
  const worker = loadWorker(t, () => ({
    ...bridges,
    // Newest first; the older entry is not chosen.
    bridges: [
      { port: other, token: TOKEN },
      { port: PORT + 5, token: "older-launch-token" },
    ],
  }));
  // An installed older app answers the first scanned port.
  await settle();
  const old = worker.sockets.at(-1);
  assert.match(old.url, new RegExp(`:${PORT}/`));
  old.accept();
  await settle();
  assert.deepEqual(old.sent, [], "nothing, not even a hello, goes to the unknown port");
  assert.equal(old.readyState, FakeSocket.CLOSED);
  // Whatever it says cannot steer the worker: only the native host picks ports.
  old.receive(ack(SIDEBAR, true, serverProof("00".repeat(32))));

  t.mock.timers.tick(250);
  const proven = await open(worker.sockets, other);
  assert.equal(worker.nativeCalls.length, 1, "the redial reuses the fetched entry");
  proven.socket.receive(provenAck(proven.hello, { port: other }));

  const reply = worker.ask();
  await settle();
  const request = proven.socket.sent.at(-1);
  assert.equal(request.type, "sidebarBootstrap");
  proven.socket.receive({
    type: "sidebarBootstrapResult",
    version: SIDEBAR,
    requestId: request.requestId,
    bootstrap,
  });
  assert.deepEqual(await reply, bootstrap);
  assert.equal((await relay(proven.socket, { type: "listTabs" }))?.ok, true);
  assert.deepEqual(worker.browserCalls, ["tabs.query"]);
  assert.equal(worker.storage.port, other, "the proven port is preferred next time");
  assert.equal(worker.sockets.length, 2);
  assertSecretNeverSent(worker);
});

void test("a redialed entry whose bridge cannot prove itself gets nothing and is not redialed", async (t) => {
  const other = 47999;
  const worker = loadWorker(t, () => ({ ...bridges, bridges: [{ port: other, token: TOKEN }] }));
  await settle();
  const old = worker.sockets.at(-1);
  old.accept();
  await settle();
  assert.deepEqual(old.sent, []);
  t.mock.timers.tick(250);
  // An impostor squats the entry's port and relays the real bridge's proof.
  const squatter = await open(worker.sockets, other);
  squatter.socket.receive(ack(SIDEBAR, true, serverProof(squatter.hello.nonce, { port: PORT })));
  assert.equal((await relay(squatter.socket, { type: "listTabs" }))?.ok, false);
  assert.equal(await worker.ask(), null);
  t.mock.timers.tick(10_000);
  assert.equal(await worker.ask(), null);
  assert.equal(squatter.socket.readyState, FakeSocket.OPEN, "the failed secret is not retried");
  assert.deepEqual(worker.browserCalls, []);
  assert.ok(squatter.socket.sent.every((frame) => frame.type !== "sidebarBootstrap"));

  // When it goes away the scan reaches the older app again, which keeps the port.
  squatter.socket.close();
  const { socket: again } = await scanTo(t, worker, PORT);
  again.accept();
  await settle();
  assert.equal(again.sent[0]?.type, "hello");
  assert.equal(again.sent[0].clientProof, undefined, "a dialed secret is not offered again");
  t.mock.timers.tick(10_000);
  assert.deepEqual(await worker.ask(), { issue: "upgradeRequired" });
  assert.equal(again.readyState, FakeSocket.OPEN);
  const otherDials = worker.sockets.filter((socket) => socket.url.includes(`:${other}/`));
  assert.equal(otherDials.length, 1, "bounded: one redial per secret");
  assertSecretNeverSent(worker);
});

void test("a proven bridge gets browser control", async (t) => {
  const worker = loadWorker(t, () => bridges, { token: "manually-pasted-0.1-token" });
  const proven = await open(worker.sockets);
  assert.equal(worker.storage.token, undefined, "the 0.1 pasted token is dropped");
  assert.ok(!proven.socket.url.includes("manually-pasted"));
  proven.socket.receive(provenAck(proven.hello));
  const listed = await relay(proven.socket, { type: "listTabs" });
  assert.equal(listed?.ok, true);
  assert.equal(listed.tabs[0].tabId, 7);
  assert.equal((await relay(proven.socket, { type: "attach", tabId: 7 }))?.ok, true);
  assert.deepEqual(worker.browserCalls, ["tabs.query", "debugger.attach"]);
  assertSecretNeverSent(worker);
});

void test("an app without a hello ack gets no browser control", async (t) => {
  const legacy = loadWorker(t, () => bridges);
  const { socket } = await open(legacy.sockets);
  const pending = relay(socket, { type: "listTabs" });
  t.mock.timers.tick(5000);
  assert.equal((await pending)?.ok, false);
  assert.deepEqual(legacy.browserCalls, []);
});

void test("a host request on an advisory ack retries the late native helper boundedly, then serves", async (t) => {
  const worker = loadWorker(t, (call) => (call === 1 ? null : bridges));
  const first = await open(worker.sockets);
  first.socket.receive(ack(SIDEBAR, false));
  assert.equal((await relay(first.socket, { type: "listTabs" }))?.ok, false);
  assert.equal(worker.nativeCalls.length, 1, "no respawn inside the retry interval");
  t.mock.timers.tick(10_000);
  assert.equal((await relay(first.socket, { type: "listTabs" }))?.ok, false);
  await settle();
  assert.equal(worker.nativeCalls.length, 2);
  assert.equal(first.socket.readyState, FakeSocket.CLOSED);
  t.mock.timers.tick(250);
  const second = await open(worker.sockets);
  second.socket.receive(provenAck(second.hello));
  assert.equal((await relay(second.socket, { type: "listTabs" }))?.ok, true);
  assert.deepEqual(worker.browserCalls, ["tabs.query"]);
  assertSecretNeverSent(worker);
});

void test("the worker exposes no popup status surface", async (t) => {
  const worker = loadWorker(t, () => bridges);
  assert.equal(await worker.ask("getStatus"), undefined);
});

void test("the worker mirrors the shared hello ack and runtime issue literals", async () => {
  const protocol = await readFile(
    new URL("../src/shared/chromeSidebarProtocol.ts", import.meta.url),
    "utf8",
  );
  const issues = /CHROME_SIDEBAR_RUNTIME_ISSUES = \[([^\]]*)\]/u.exec(protocol)?.[1];
  const workerIssue = /const UPGRADE_REQUIRED_ISSUE = "([^"]+)"/u.exec(workerSource)?.[1];
  assert.ok(workerIssue && issues?.includes(`"${workerIssue}"`));
  assert.match(protocol, /type: z\.literal\("helloAck"\)/u);
  assert.match(workerSource, /type === "helloAck"/u);
  const workerConstant = (name) =>
    new RegExp(`const ${name} = "([^"]+)"`, "u").exec(workerSource)?.[1];
  assert.equal(workerConstant("CLIENT_PROOF_DOMAIN"), CLIENT_DOMAIN);
  assert.equal(workerConstant("SERVER_PROOF_DOMAIN"), SERVER_DOMAIN);
  // Field order: domain, port, nonce[, sidebar version, authenticated].
  assert.match(protocol, /\[CHROME_BRIDGE_CLIENT_PROOF_DOMAIN, port, nonce\]\.join\("\\n"\)/u);
  assert.match(workerSource, /\[CLIENT_PROOF_DOMAIN, port, nonce\]/u);
});
