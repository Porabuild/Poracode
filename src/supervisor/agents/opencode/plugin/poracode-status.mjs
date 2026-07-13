/**
 * OpenCode plugin forwarder for Poracode thread status.
 *
 * OpenCode imports this plugin in-process and calls hook callbacks directly —
 * unlike Claude/Codex/Gemini which spawn `forward.mjs` per hook event. The
 * handlers POST the same envelope shape the other forwarders use so the hook
 * ingress accepts events from every provider via one endpoint.
 *
 * IMPORTANT: OpenCode's `Hooks` interface only treats a handful of strings as
 * direct hook keys (`event`, `chat.message`, `tool.execute.before`,
 * `tool.execute.after`, `permission.ask`, `auth`, `provider`, ...). Session
 * lifecycle (`session.created` / `session.idle` / `session.error`) and
 * permission notifications (`permission.asked` / `permission.updated` /
 * `permission.replied`) are NOT direct keys — they arrive on the unified
 * `event` callback and discriminate via `event.type`. Subscribing to those
 * names as top-level keys silently never fires.
 *
 * IMPORTANT: this module **default-exports** a single V1 plugin object —
 * `{ id, server }` — rather than a named export. OpenCode's `readV1Plugin`
 * (v1.14.31, packages/opencode/src/plugin/shared.ts) only inspects
 * `mod.default` for the V1 shape; a named export silently falls through to
 * the legacy `getLegacyPlugins` path, which iterates `Object.values(mod)`
 * and registers each function as a separate plugin (silent duplicate). Do
 * not add additional named OR default exports beyond this single object.
 *
 * Filename note: deliberately `poracode-status.mjs` in the source tree.
 * The supervisor drops it as `poracode-status.js` into OpenCode's
 * auto-discovery directory (`~/.config/opencode/plugins/`) — OpenCode's glob
 * is `{plugin,plugins}/*.{ts,js}` so `.mjs` would be silently ignored. Bun
 * (OpenCode's runtime) handles ESM syntax in `.js` natively. The displayed
 * plugin name in OpenCode's TUI status panel (`dialog-status.tsx`) is the
 * basename of the dropped file before the first dot, so naming the drop
 * `poracode-status.js` produces "poracode-status". The Windows panel
 * display is buggy upstream — OpenCode `split("/")`s a native `\`-path —
 * and cannot be fixed plugin-side. `id` is still set because newer OpenCode
 * builds will read it.
 *
 * Safe outside Poracode: when the env vars are missing the handlers no-op.
 */

import { readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

// Manifest is colocated under two layouts:
//   1. Deployed in OpenCode's plugins/ dir → sibling `<basename>.plugin.json`
//      (the installer drops both files together so `import.meta.url` reaches
//      the manifest at runtime). OpenCode auto-loads `.{ts,js}` only, so the
//      deployed plugin file is `poracode-status.js` and its manifest is
//      `poracode-status.plugin.json`.
//   2. Staged in our agent-plugins/ dir → sibling `plugin.json` (matches
//      `installerBase`'s canonical filename, used by tests / dev paths). The
//      staged file is `poracode-status.mjs`.
function readPluginVersionFromManifest() {
  try {
    const filePath = fileURLToPath(import.meta.url);
    const dir = dirname(filePath);
    const stem = basename(filePath, extname(filePath));
    for (const candidate of [`${stem}.plugin.json`, "plugin.json"]) {
      try {
        const raw = readFileSync(join(dir, candidate), "utf8");
        const manifest = JSON.parse(raw);
        if (typeof manifest.version === "string" && manifest.version.length > 0) {
          return manifest.version;
        }
      } catch {
        // try next candidate
      }
    }
  } catch {
    // ignore
  }
  return "0.0.0";
}

const PLUGIN_VERSION = readPluginVersionFromManifest();
const PROTOCOL_VERSION = 1;

function hookDebugEnabled() {
  const v = process.env.PORACODE_HOOK_DEBUG;
  return v === "1" || v === "true" || Boolean(v && v !== "0" && v !== "false");
}

function debugLog(message) {
  if (hookDebugEnabled()) {
    process.stderr.write(`[poracode-opencode] ${message}\n`);
  }
}

// `event.type` → Poracode intent. `permission.updated` and the (per-docs but
// untyped in the SDK) `permission.asked` both surface a request for approval,
// so they share `session.needs_approval`. `tool.execute.after` /
// `permission.replied` are intentionally unmapped — noisy and `session.idle`
// is the canonical turn-finished signal.
function intentForEventType(eventType) {
  switch (eventType) {
    case "session.created":
      return "session.started";
    case "session.idle":
      return "session.turn_finished";
    case "session.error":
      return "session.turn_errored";
    case "permission.asked":
    case "permission.updated":
      return "session.needs_approval";
    default:
      return undefined;
  }
}

// Per the OpenCode SDK, `sessionID` lives on different paths inside
// `event.properties` depending on `event.type`:
//   - session.created → properties.info.id
//   - session.idle    → properties.sessionID
//   - permission.*    → properties.sessionID
function extractSessionIdFromEventProperties(eventType, properties) {
  if (!properties || typeof properties !== "object") return undefined;
  if (eventType === "session.created") {
    const id = properties.info?.id;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  }
  const sid = properties.sessionID;
  return typeof sid === "string" && sid.length > 0 ? sid : undefined;
}

function truncate(text, max = 500) {
  if (typeof text !== "string") return undefined;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function buildExtraFromEventProperties(eventType, properties) {
  const extra = { agentNativeEvent: eventType };
  if (properties && typeof properties === "object") {
    if (typeof properties.type === "string") extra.tool = properties.type;
    const meta = properties.metadata;
    if (meta && typeof meta === "object") {
      const preview = meta.command ?? meta.file_path ?? meta.filePath;
      const previewText = truncate(typeof preview === "string" ? preview : undefined);
      if (previewText) extra.message = previewText;
    }
    const messageText = truncate(
      typeof properties.message === "string" ? properties.message : undefined,
    );
    if (messageText) extra.message = messageText;
  }
  return extra;
}

async function postWithRetry(url, headers, body, attempts = 2) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { method: "POST", headers, body });
      if (response.ok || response.status === 426) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (i + 1 < attempts) await sleep(50);
  }
  if (lastError) {
    debugLog(`forward failed: ${String(lastError)}`);
  }
}

async function forwardIntent(eventType, intent, sessionId, extra) {
  const url = process.env.PORACODE_HOOK_URL;
  const secret = process.env.PORACODE_HOOK_SECRET;
  const threadId = process.env.PORACODE_THREAD_ID;
  const agentKind = process.env.PORACODE_AGENT_KIND ?? "opencode";
  const supervisorProtocol = Number(process.env.PORACODE_HOOK_PROTOCOL_VERSION ?? PROTOCOL_VERSION);
  const negotiatedProtocol = Math.min(PROTOCOL_VERSION, supervisorProtocol || PROTOCOL_VERSION);

  if (!url || !secret) {
    debugLog(`skip ${eventType}: missing PORACODE_HOOK_URL or PORACODE_HOOK_SECRET`);
    return;
  }

  const envelope = {
    protocolVersion: negotiatedProtocol,
    agentKind,
    pluginVersion: PLUGIN_VERSION,
    ts: Date.now(),
    intent,
    extra,
  };
  if (threadId) envelope.threadId = threadId;
  if (sessionId) envelope.sessionId = sessionId;

  await postWithRetry(
    url,
    {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    JSON.stringify(envelope),
  );

  debugLog(`posted intent=${intent} for ${eventType} sid=${sessionId ?? "-"}`);
}

export default {
  id: "poracode-status",
  server: async () => ({
    // Unified event dispatcher — see file header for why session/permission
    // lifecycle hooks must come through here, not as top-level keys.
    event: async ({ event }) => {
      try {
        if (!event || typeof event !== "object") return;
        const eventType = typeof event.type === "string" ? event.type : undefined;
        if (!eventType) return;
        const intent = intentForEventType(eventType);
        if (!intent) return;
        const properties = event.properties;
        const sessionId = extractSessionIdFromEventProperties(eventType, properties);
        const extra = buildExtraFromEventProperties(eventType, properties);
        await forwardIntent(eventType, intent, sessionId, extra);
      } catch (error) {
        debugLog(`event uncaught: ${String(error)}`);
      }
    },

    // `chat.message` fires the moment a new user message arrives, before the
    // LLM call. The only "turn started" signal that fires for text-only
    // responses (where no tools execute), so dropping this means a "user →
    // assistant text reply" turn never transitions to "working".
    "chat.message": async (input) => {
      try {
        const sessionId =
          typeof input?.sessionID === "string" && input.sessionID.length > 0
            ? input.sessionID
            : undefined;
        await forwardIntent("chat.message", "session.turn_started", sessionId, {
          agentNativeEvent: "chat.message",
        });
      } catch (error) {
        debugLog(`chat.message uncaught: ${String(error)}`);
      }
    },

    // Also maps to session.turn_started so a tool resuming after a permission
    // approval re-marks the agent as working. Duplicate turn_started events
    // (paired with chat.message) are idempotent in the state machine.
    "tool.execute.before": async (input) => {
      try {
        const sessionId =
          typeof input?.sessionID === "string" && input.sessionID.length > 0
            ? input.sessionID
            : undefined;
        const extra = { agentNativeEvent: "tool.execute.before" };
        if (typeof input?.tool === "string") extra.tool = input.tool;
        await forwardIntent("tool.execute.before", "session.turn_started", sessionId, extra);
      } catch (error) {
        debugLog(`tool.execute.before uncaught: ${String(error)}`);
      }
    },
  }),
};
