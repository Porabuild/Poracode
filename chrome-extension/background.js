/**
 * Poracode Chrome Control — background service worker.
 *
 * Pairs with the Poracode desktop **app**, not any single thread. It stays in a
 * connect loop against the app's localhost bridge: while the app is closed it
 * quietly retries; the moment the app launches it connects automatically. No
 * buttons, no port, no pairing code, and no connection UI.
 *
 * The channel is a WebSocket on loopback, which every local process and OS
 * user shares: anything can listen on a scanned port and anything can assert
 * our Origin header. Both ends therefore prove the bridge's per-launch secret
 * without ever sending it. The worker reads the secret from Poracode's
 * per-user native messaging host, which Chrome launches only for this
 * extension's pinned ID; the hello carries a fresh nonce and an HMAC of it
 * bound to the dialed port, and the host's `helloAck` must carry its own HMAC
 * (another domain, same nonce and port) before the worker trusts the socket.
 * Until then it neither requests chat credentials nor serves any browser
 * control request. Actual control surfaces Chrome's own "Poracode started
 * debugging this browser" banner = consent.
 *
 * An app that sends no `helloAck` predates the sidebar, and the sidebar is
 * told to ask for an update. An unproven ack is only advisory: the host
 * authenticates only the first hello, so a connection opened before the native
 * host could answer is reopened once it can.
 *
 * Several apps may listen at once (an installed release and a dev build). The
 * native host's list of live bridges, not anything a socket says, picks the
 * port: the dialed port's own entry if it has one, else the newest entry. A
 * port the host does not know is left for that entry, at most once per secret.
 *
 * MV3 workers are evicted when idle, so we reconnect from a periodic alarm and
 * on startup, and scan/reconnect on socket close.
 */

const DEBUGGER_PROTOCOL_VERSION = "1.3";
const KEEPALIVE_ALARM = "poracode-keepalive";
const SCAN_DELAY_MS = 250;
const IDLE_RETRY_MS = 4000;

/**
 * Ports to try. Keep this in sync with the app's ChromeBridgeServer scan range.
 */
const DEFAULT_PORTS = [
  ...Array.from({ length: 13 }, (_, i) => 47820 + i),
  ...Array.from({ length: 13 }, (_, i) => 32120 + i),
];

// Each Poracode thread works inside its OWN tab group, named after the thread's
// task (mirrors the internal browser). The default group (no thread) keeps the
// legacy "Poracode" label. Chrome tab groups have no id we own, so we key groups
// by thread and remember the chrome groupId in storage (survives worker eviction).
const DEFAULT_GROUP_KEY = "poracode";
const DEFAULT_GROUP_TITLE = "Poracode";
const DEFAULT_GROUP_COLOR = "purple";

let ws = null;
/**
 * The socket whose hello frame has been sent (nothing else may precede it),
 * its port, the secret and nonce it proved, and the host's `helloAck`:
 * `undefined` while pending, `LEGACY_HOST` when none arrived in time, `null`
 * once the socket closed. `ack.authenticated` is true only for a verified
 * server proof.
 */
let hello = null;
let connecting = false;
let reconnectTimer = null;
let portIndex = 0;
/** The socket closed on purpose to reopen authenticated (same or another port). */
let reopeningSocket = null;
/** The native-host entry `{ port, token }` to dial next. Memory only: tokens change per app launch. */
let pendingBridge = null;
/**
 * Secrets already dialed by a reopen or redirect, so a stale or squatted entry
 * cannot make the worker loop. Memory only, and bounded.
 */
const dialedSecrets = new Set();
const MAX_DIALED_SECRETS = 16;
let lastNativeAttemptAt = -Infinity;
const sidebarRequests = new Map();
// Mirrors CHROME_SIDEBAR_PROTOCOL_VERSION and CHROME_SIDEBAR_RUNTIME_ISSUES in
// src/shared/chromeSidebarProtocol.ts.
const SIDEBAR_PROTOCOL_VERSION = 2;
const UPGRADE_REQUIRED_ISSUE = "upgradeRequired";
// Mirrors CHROME_NATIVE_HOST_NAME / CHROME_NATIVE_HOST_PROTOCOL_VERSION in
// src/shared/chromeSidebarProtocol.ts.
const NATIVE_HOST_NAME = "com.poracode.chrome_bridge";
const NATIVE_HOST_PROTOCOL_VERSION = 1;
// Mirrors CHROME_BRIDGE_CLIENT_PROOF_DOMAIN / CHROME_BRIDGE_SERVER_PROOF_DOMAIN
// and the field order of chromeBridge{Client,Server}ProofMessage in
// src/shared/chromeSidebarProtocol.ts.
const CLIENT_PROOF_DOMAIN = "poracode-chrome-bridge/client-proof/v1";
const SERVER_PROOF_DOMAIN = "poracode-chrome-bridge/server-proof/v1";
const HEX_256 = /^[0-9a-f]{64}$/;
/** Host requests that read or control the browser; served only to a proven bridge. */
const RELAY_REQUESTS = new Set(["listTabs", "attach", "openTab", "detach", "cdp"]);
const NATIVE_HOST_TIMEOUT_MS = 3000;
/** Native-host retries for an unauthenticated connection, while the sidebar asks. */
const NATIVE_RETRY_MS = 10000;
const HELLO_ACK_TIMEOUT_MS = 5000;
const SIDEBAR_REQUEST_TIMEOUT_MS = 5000;
const LEGACY_HOST = "legacy";
/** tabIds we currently hold a debugger attachment on. */
const attachedTabs = new Set();

function isOpen() {
  return ws && ws.readyState === WebSocket.OPEN;
}

function isReady() {
  return isOpen() && hello !== null && hello.socket === ws;
}

function send(msg) {
  if (isReady()) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }
}

function startHello(socket, port, proof) {
  const state = { socket, port, ...proof, ack: undefined };
  state.acked = new Promise((resolve) => {
    const timer = setTimeout(() => state.settle(LEGACY_HOST), HELLO_ACK_TIMEOUT_MS);
    state.settle = (ack) => {
      if (state.ack !== undefined) return;
      clearTimeout(timer);
      state.ack = ack;
      resolve(ack);
    };
  });
  return state;
}

async function candidatePorts() {
  // Prefer the last port we successfully connected on, then the default range.
  const { port } = await chrome.storage.local.get("port");
  const stored = Number(port);
  if (stored && Number.isFinite(stored)) {
    return [stored, ...DEFAULT_PORTS.filter((p) => p !== stored)];
  }
  return DEFAULT_PORTS;
}

async function connect() {
  if (isOpen() || connecting) return;
  connecting = true;

  const ports = await candidatePorts();
  const port = pendingBridge ? pendingBridge.port : ports[portIndex % ports.length];

  let socket;
  try {
    // Never a secret in the URL: the hello proves it instead.
    socket = new WebSocket(`ws://127.0.0.1:${port}/`);
  } catch {
    connecting = false;
    pendingBridge = null;
    scheduleReconnect();
    return;
  }
  ws = socket;

  const onOpen = async () => {
    connecting = false;
    portIndex = 0;
    const dialed = pendingBridge && pendingBridge.port === port ? pendingBridge : null;
    pendingBridge = null;
    let secret = dialed ? dialed.token : null;
    if (!dialed) {
      // Ask only once a bridge answers, so a closed app never spawns the host.
      const bridge = pickBridge(
        await nativeBridges(),
        port,
        (entry) => entry.port === port || !dialedSecrets.has(entry.token),
      );
      if (bridge && bridge.port !== port) {
        // Another app holds this port; the one the native host knows is elsewhere.
        if (ws === socket && socket.readyState === WebSocket.OPEN) redial(socket, bridge);
        return;
      }
      secret = bridge ? bridge.token : null;
    }
    const nonce = randomHex();
    let key = null;
    let clientProof = null;
    try {
      if (secret) {
        key = await hmacKey(secret);
        clientProof = await hmacHex(key, [CLIENT_PROOF_DOMAIN, port, nonce]);
      }
    } catch {
      key = null;
      clientProof = null;
    }
    if (ws !== socket || socket.readyState !== WebSocket.OPEN) return;
    hello = startHello(socket, port, { secret, key, nonce });
    send({
      type: "hello",
      extensionVersion: chrome.runtime.getManifest().version,
      sidebarBootstrapVersion: SIDEBAR_PROTOCOL_VERSION,
      ...(clientProof ? { nonce, clientProof } : {}),
    });
  };
  socket.addEventListener("open", () => {
    void onOpen();
  });

  socket.addEventListener("message", (event) => {
    void handleRequest(event.data, socket);
  });

  socket.addEventListener("close", () => {
    if (ws === socket) ws = null;
    if (hello && hello.socket === socket) {
      hello.settle(null);
      hello = null;
    }
    connecting = false;
    // Reopening to authenticate dials `pendingBridge`; anything else advances the scan.
    if (reopeningSocket === socket) reopeningSocket = null;
    else {
      portIndex += 1;
      // A redial target that never opened: back to scanning.
      if (pendingBridge && pendingBridge.port === port) pendingBridge = null;
    }
    // The app went away (or this was a failed probe) — clear any debugger
    // banners so the browser returns to normal until the app is back.
    detachAll();
    for (const resolve of sidebarRequests.values()) resolve(null);
    sidebarRequests.clear();
    scheduleReconnect();
  });
}

/**
 * The running bridges `{ port, token }`, newest first, from the per-user native
 * messaging host (Chrome launches it only for this extension), or `[]` when it
 * is not installed or unreachable. Never persisted: tokens change per launch.
 */
async function nativeBridges() {
  lastNativeAttemptAt = Date.now();
  try {
    const response = await Promise.race([
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
        type: "getBridges",
        version: NATIVE_HOST_PROTOCOL_VERSION,
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), NATIVE_HOST_TIMEOUT_MS)),
    ]);
    if (
      !response ||
      response.type !== "bridges" ||
      response.version !== NATIVE_HOST_PROTOCOL_VERSION ||
      !Array.isArray(response.bridges)
    )
      return [];
    return response.bridges.filter(
      (entry) =>
        entry &&
        Number.isInteger(entry.port) &&
        entry.port > 0 &&
        entry.port < 65536 &&
        typeof entry.token === "string" &&
        entry.token.length > 0,
    );
  } catch {
    return [];
  }
}

/** The usable entry for `port` if any, else the newest usable entry, else `null`. */
function pickBridge(bridges, port, usable) {
  const candidates = bridges.filter(usable);
  return candidates.find((entry) => entry.port === port) ?? candidates[0] ?? null;
}

/** Closes `socket` so the next connect dials `bridge` and proves its token. */
function redial(socket, bridge) {
  if (dialedSecrets.size >= MAX_DIALED_SECRETS) {
    dialedSecrets.delete(dialedSecrets.values().next().value);
  }
  dialedSecrets.add(bridge.token);
  pendingBridge = { port: bridge.port, token: bridge.token };
  reopeningSocket = socket;
  socket.close();
}

function randomHex() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmacHex(key, fields) {
  const message = new TextEncoder().encode(fields.join("\n"));
  return hex(await crypto.subtle.sign("HMAC", key, message));
}

/**
 * Whether `proof` is the bridge's HMAC over this hello's nonce and dialed port
 * and the ack it vouches for: only the holder of the secret the native host
 * handed us can produce it. `verify` compares in constant time.
 */
async function serverProven(state, sidebarBootstrapVersion, proof) {
  if (!state.key || typeof proof !== "string" || !HEX_256.test(proof)) return false;
  const signature = new Uint8Array(proof.match(/../g).map((pair) => parseInt(pair, 16)));
  const message = [
    SERVER_PROOF_DOMAIN,
    state.port,
    state.nonce,
    sidebarBootstrapVersion ?? "null",
    true,
  ].join("\n");
  try {
    return await crypto.subtle.verify(
      "HMAC",
      state.key,
      signature,
      new TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}

/**
 * Whether `socket` is the current connection and its bridge proved the secret.
 * An unproven but current host may only prompt a bounded native-host retry.
 */
async function provenBridge(socket) {
  const current = hello;
  if (!current || current.socket !== socket) return false;
  const ack = await current.acked;
  if (ack === null || hello !== current) return false;
  if (ack !== LEGACY_HOST && ack.authenticated) return true;
  void reauthenticate(current);
  return false;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  // Fast sweep across the port range on first pass, then settle into slow retry.
  const delay = portIndex < DEFAULT_PORTS.length ? SCAN_DELAY_MS : IDLE_RETRY_MS;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
}

// ---------------------------------------------------------------------------
// CDP relay
// ---------------------------------------------------------------------------

async function handleRequest(data, socket) {
  let msg;
  try {
    msg = JSON.parse(typeof data === "string" ? data : String(data));
  } catch {
    return;
  }
  const { id, type } = msg;
  if (type === "helloAck") {
    const current = hello;
    if (current && current.socket === socket && current.ack === undefined) {
      const sidebarBootstrapVersion = Number.isInteger(msg.sidebarBootstrapVersion)
        ? msg.sidebarBootstrapVersion
        : null;
      // A bare `authenticated: true` is what an impostor would say.
      const authenticated =
        msg.authenticated === true &&
        (await serverProven(current, sidebarBootstrapVersion, msg.serverProof));
      current.settle({ sidebarBootstrapVersion, authenticated });
      if (authenticated && hello === current) {
        // A proven secret may be redialed after a drop; prefer its port next scan.
        dialedSecrets.delete(current.secret);
        void chrome.storage.local.set({ port: current.port });
      }
    }
    return;
  }
  if (type === "sidebarBootstrapResult" && msg.version === SIDEBAR_PROTOCOL_VERSION) {
    sidebarRequests.get(msg.requestId)?.(msg.bootstrap ?? null);
    return;
  }
  if (RELAY_REQUESTS.has(type) && !(await provenBridge(socket))) {
    if (ws === socket) replyError(id, "Poracode could not be verified; browser control is paused.");
    return;
  }
  try {
    if (type === "listTabs") {
      const tabs = await chrome.tabs.query({});
      reply(id, {
        tabs: tabs
          .filter((t) => typeof t.id === "number")
          .map((t) => ({
            tabId: t.id,
            url: t.url || "",
            title: t.title || "",
            active: !!t.active,
            windowId: t.windowId,
          })),
      });
      return;
    }
    if (type === "attach") {
      const tab = await resolveTargetTab(msg.tabId);
      await debuggerAttach(tab.id);
      reply(id, {
        tab: { tabId: tab.id, url: tab.url || "", title: tab.title || "", active: !!tab.active },
      });
      return;
    }
    if (type === "openTab") {
      // Background workspace: prefer REUSING an existing tab in the thread's tab
      // group (navigating it) so the agent doesn't pile up tabs; only create a
      // new one when none exists or newTab was requested. Tabs are never closed.
      const spec = groupSpec(msg);
      const reuse = msg.reuse !== false;
      const existing = reuse ? await findWorkspaceTab(spec) : null;
      if (existing) {
        if (msg.url) await chrome.tabs.update(existing.id, { url: msg.url });
        // Keep the group's label in sync with the (evolving) task title on reuse.
        await addToGroup(existing.id, spec);
        await debuggerAttach(existing.id);
        reply(id, {
          tab: {
            tabId: existing.id,
            url: msg.url || existing.url || "",
            title: existing.title || "",
            active: !!existing.active,
            reused: true,
          },
        });
        return;
      }
      const created = await chrome.tabs.create({ url: msg.url || "about:blank", active: false });
      await addToGroup(created.id, spec);
      await debuggerAttach(created.id);
      reply(id, {
        tab: {
          tabId: created.id,
          url: created.url || msg.url || "",
          title: created.title || "",
          active: false,
          reused: false,
        },
      });
      return;
    }
    if (type === "detach") {
      if (typeof msg.tabId === "number") await debuggerDetach(msg.tabId);
      reply(id, { ok: true });
      return;
    }
    if (type === "cdp") {
      const tabId = msg.tabId;
      if (typeof tabId !== "number") throw new Error("cdp requires tabId");
      if (!attachedTabs.has(tabId)) await debuggerAttach(tabId);
      const result = await sendCdp(tabId, msg.method, msg.params || {});
      reply(id, { result });
      return;
    }
    if (type === "ping") {
      reply(id, { pong: true });
      return;
    }
    replyError(id, `unknown request: ${type}`);
  } catch (err) {
    replyError(id, err && err.message ? err.message : String(err));
  }
}

function reply(id, payload) {
  if (typeof id !== "number") return;
  send({ id, type: "result", ok: true, ...payload });
}

function replyError(id, error) {
  if (typeof id !== "number") return;
  send({ id, type: "result", ok: false, error });
}

async function resolveTargetTab(tabId) {
  if (typeof tabId === "number") {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || typeof tab.id !== "number") throw new Error(`tab ${tabId} not found`);
    return tab;
  }
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!active || typeof active.id !== "number") throw new Error("no active tab");
  return active;
}

/** Normalize an openTab message into a { key, title, color } group spec. */
function groupSpec(msg) {
  const key = typeof msg.groupKey === "string" && msg.groupKey ? msg.groupKey : DEFAULT_GROUP_KEY;
  const title =
    typeof msg.groupTitle === "string" && msg.groupTitle.trim()
      ? msg.groupTitle.trim().slice(0, 60)
      : DEFAULT_GROUP_TITLE;
  const color =
    typeof msg.groupColor === "string" && msg.groupColor ? msg.groupColor : DEFAULT_GROUP_COLOR;
  return { key, title, color };
}

/** thread key -> { groupId, title }, persisted so it survives worker eviction. */
async function loadGroupMap() {
  const { threadGroups } = await chrome.storage.local.get("threadGroups");
  return threadGroups && typeof threadGroups === "object" ? threadGroups : {};
}

async function rememberGroup(key, groupId, title) {
  const map = await loadGroupMap();
  map[key] = { groupId, title };
  await chrome.storage.local.set({ threadGroups: map });
}

async function forgetGroup(key) {
  const map = await loadGroupMap();
  if (map[key]) {
    delete map[key];
    await chrome.storage.local.set({ threadGroups: map });
  }
}

/**
 * Resolve the live chrome groupId for a thread's group, tolerating a stale
 * remembered id and falling back to a title match (so a group survives a fresh
 * worker even before it's been remembered).
 */
async function resolveGroup(spec) {
  const map = await loadGroupMap();
  const entry = map[spec.key];
  if (entry && typeof entry.groupId === "number") {
    try {
      await chrome.tabGroups.get(entry.groupId);
      return entry.groupId;
    } catch {
      await forgetGroup(spec.key);
    }
  }
  // Title-match fallback ONLY for the shared default group. Thread groups are
  // identified solely by their remembered id — two threads can share a title
  // (e.g. both fall back to "Poracode"), so matching by title would collide.
  if (spec.key === DEFAULT_GROUP_KEY) {
    try {
      const groups = await chrome.tabGroups.query({ title: spec.title });
      if (groups && groups[0]) {
        await rememberGroup(spec.key, groups[0].id, spec.title);
        return groups[0].id;
      }
    } catch {}
  }
  return null;
}

/** The first still-open tab in the thread's group, or null. Used to reuse the
 *  agent's background workspace instead of opening a new tab each time. */
async function findWorkspaceTab(spec) {
  const groupId = await resolveGroup(spec);
  if (groupId == null) return null;
  try {
    const tabs = await chrome.tabs.query({ groupId });
    return tabs && tabs[0] ? tabs[0] : null;
  } catch {
    return null;
  }
}

/** Add a tab to the thread's group, creating + labelling it on first use and
 *  keeping the title in sync with the evolving task title. */
async function addToGroup(tabId, spec) {
  try {
    const existing = await resolveGroup(spec);
    if (existing != null) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: existing });
      try {
        await chrome.tabGroups.update(existing, { title: spec.title });
      } catch {}
      await rememberGroup(spec.key, existing, spec.title);
    } else {
      const groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, { title: spec.title, color: spec.color });
      await rememberGroup(spec.key, groupId, spec.title);
    }
  } catch {
    // Grouping is best-effort; the tab still works ungrouped.
  }
}

async function debuggerAttach(tabId) {
  for (const attachedTabId of Array.from(attachedTabs)) {
    if (attachedTabId !== tabId) await debuggerDetach(attachedTabId);
  }
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION, () => {
      const err = chrome.runtime.lastError;
      if (err && !/already attached/i.test(err.message || "")) {
        reject(new Error(err.message));
        return;
      }
      attachedTabs.add(tabId);
      resolve();
    });
  });
}

function debuggerDetach(tabId) {
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError;
      attachedTabs.delete(tabId);
      resolve();
    });
  });
}

function detachAll() {
  for (const tabId of Array.from(attachedTabs)) {
    void debuggerDetach(tabId);
  }
  attachedTabs.clear();
}

function sendCdp(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(result);
    });
  });
}

// Forward CDP events (from any attached tab) back to Poracode.
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (typeof source.tabId !== "number") return;
  send({ type: "cdpEvent", tabId: source.tabId, method, params });
});

// The user closed the tab or dismissed the "Poracode is debugging" banner.
chrome.debugger.onDetach.addListener((source, reason) => {
  if (typeof source.tabId !== "number") return;
  attachedTabs.delete(source.tabId);
  send({ type: "detached", tabId: source.tabId, reason });
});

// ---------------------------------------------------------------------------
// Sidebar chat bootstrap
// ---------------------------------------------------------------------------

/**
 * A single-use local chat credential for the sidebar; `{ issue }` when this
 * app cannot provide one until it is updated; or `null` to retry later (app
 * closed, native host not reachable yet, or the request was refused).
 */
async function chatBootstrap() {
  if (!isReady()) {
    void connect();
    return null;
  }
  const current = hello;
  const ack = await current.acked;
  if (ack === null || hello !== current || !isReady()) return null;
  const proven = ack !== LEGACY_HOST && ack.authenticated;
  // An older app may hold this port while the native host knows a current one.
  if (!proven && (await reauthenticate(current))) return null;
  if (ack === LEGACY_HOST || ack.sidebarBootstrapVersion !== SIDEBAR_PROTOCOL_VERSION) {
    return { issue: UPGRADE_REQUIRED_ISSUE };
  }
  if (!proven) return null;
  return requestSidebarBootstrap();
}

/**
 * The native host may be unreachable when the connection opens (registration
 * still in progress, app starting, or a repair), or know a bridge on another
 * port than an older app holding this one. Ask it again at most every
 * NATIVE_RETRY_MS, and only while the sidebar or the host asks; once it knows
 * a secret not yet tried, redial that entry (this port first) so the first
 * hello proves it. Whether it redialed.
 */
async function reauthenticate(current) {
  if (Date.now() - lastNativeAttemptAt < NATIVE_RETRY_MS) return false;
  const bridge = pickBridge(
    await nativeBridges(),
    current.port,
    // The same secret already failed to get a server proof: not our bridge.
    (entry) => entry.token !== current.secret && !dialedSecrets.has(entry.token),
  );
  if (!bridge || hello !== current || !isReady()) return false;
  redial(current.socket, bridge);
  return true;
}

function requestSidebarBootstrap() {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      sidebarRequests.delete(requestId);
      resolve(null);
    }, SIDEBAR_REQUEST_TIMEOUT_MS);
    sidebarRequests.set(requestId, (bootstrap) => {
      clearTimeout(timer);
      sidebarRequests.delete(requestId);
      resolve(bootstrap);
    });
    send({ type: "sidebarBootstrap", version: SIDEBAR_PROTOCOL_VERSION, requestId });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.cmd === "getChatBootstrap") {
    chatBootstrap().then(sendResponse, () => sendResponse(null));
    return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// Lifecycle: connect on load/startup and keep the worker warm via an alarm.
// ---------------------------------------------------------------------------

chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  if (isOpen()) {
    send({ type: "ping" });
  } else {
    void connect();
  }
});

chrome.runtime.onStartup.addListener(() => {
  void connect();
});

// 0.1 kept a manually pasted bridge token here; the hello proof replaces it.
void chrome.storage.local.remove("token");

void connect();

// Keep one sidebar across tabs. Chat owns its authenticated remote client;
// the worker continues to own the existing browser-control relay.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
