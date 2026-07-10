/**
 * Poracode Chrome Control — background service worker.
 *
 * Pairs with the Poracode desktop **app**, not any single thread. It stays in a
 * connect loop against the app's localhost bridge: while the app is closed it
 * quietly retries; the moment the app launches it connects and the popup shows
 * "Connected". No buttons, no port, no pairing code — fully automatic.
 *
 * The channel is a WebSocket carrying this extension's `chrome-extension://`
 * origin (web pages can't forge that) on loopback. Actual control surfaces
 * Chrome's own "Poracode started debugging this browser" banner = consent.
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
let connecting = false;
let reconnectTimer = null;
let portIndex = 0;
let lastError = null;
/** tabIds we currently hold a debugger attachment on. */
const attachedTabs = new Set();

function isOpen() {
  return ws && ws.readyState === WebSocket.OPEN;
}

function send(msg) {
  if (isOpen()) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      lastError = String(err);
    }
  }
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
  const port = ports[portIndex % ports.length];
  const { token } = await chrome.storage.local.get("token");
  const url = `ws://127.0.0.1:${port}/` + (token ? `?token=${encodeURIComponent(token)}` : "");

  let socket;
  try {
    socket = new WebSocket(url);
  } catch (err) {
    connecting = false;
    lastError = String(err);
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.addEventListener("open", () => {
    connecting = false;
    portIndex = 0;
    lastError = null;
    void chrome.storage.local.set({ port });
    send({ type: "hello", extensionVersion: chrome.runtime.getManifest().version });
    broadcastStatus();
  });

  socket.addEventListener("message", (event) => {
    void handleRequest(event.data);
  });

  socket.addEventListener("close", () => {
    if (ws === socket) ws = null;
    connecting = false;
    portIndex += 1; // advance the scan to the next candidate port
    // The app went away (or this was a failed probe) — clear any debugger
    // banners so the browser returns to normal until the app is back.
    detachAll();
    broadcastStatus();
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    lastError = "Looking for Poracode…";
  });
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

async function handleRequest(data) {
  let msg;
  try {
    msg = JSON.parse(typeof data === "string" ? data : String(data));
  } catch {
    return;
  }
  const { id, type } = msg;
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
// Popup status (read-only — the connection is fully automatic)
// ---------------------------------------------------------------------------

function currentStatus() {
  return {
    connected: isOpen(),
    connecting: connecting || (!!ws && ws.readyState === WebSocket.CONNECTING),
    attachedTabs: Array.from(attachedTabs),
    lastError,
    version: chrome.runtime.getManifest().version,
  };
}

function broadcastStatus() {
  chrome.runtime.sendMessage({ event: "status", status: currentStatus() }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.cmd === "getStatus") {
    // Opening the popup is a good moment to make sure we're trying.
    void connect();
    sendResponse(currentStatus());
  }
  return true;
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

void connect();
