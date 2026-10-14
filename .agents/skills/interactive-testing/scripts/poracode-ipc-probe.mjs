#!/usr/bin/env node
// poracode-ipc-probe — bounded, diagnostic-only recorder for backend -> main
// `process.send` traffic (F7 transport milestone evidence support).
//
// The helper attaches to a caller-provided Node inspector WebSocket endpoint
// (ws://127.0.0.1:<port>/<id> or a loopback equivalent), verifies the target's
// PID and absolute entry script path via Runtime.evaluate BEFORE touching
// anything, then installs an opt-in wrapper around `process.send` in that
// verified target only. The wrapper keeps bounded numeric counters inside the
// target; it never retains payload strings, never changes application
// behavior, and is removable with an ownership-checked uninstall.
//
// Not a performance benchmark. Not complete F7 verification. Byte counters are
// JSON re-serialization estimates measured at the send boundary — they are not
// native IPC wire bytes.

import path from "node:path";

/** Key under which the probe state object is stored in the target's globalThis. */
export const PROBE_STATE_KEY = "__poracodeIpcProbe__";
/** Own-marker property set on the installed wrapper function. */
export const OWNER_MARKER = "__poracodeIpcProbeOwner";
/** Bump when the snapshot/counters shape becomes incompatible. */
export const SNAPSHOT_SCHEMA = 1;

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_CHARS = 1_000_000;
const CLOSE_GRACE_MS = 750;

/** RuntimeEvent types whose payload is bulk stream content (mirrors isBulkRuntimeContentEvent in src/shared/liveEventInterests.ts). */
const BULK_RUNTIME_EVENT_TYPES = [
  "item.started",
  "item.updated",
  "item.completed",
  "content.delta",
];

/**
 * Error with a stable machine-readable code. Messages are authored by this
 * module and never contain target argv, environment values, tokens, or event
 * payload material.
 */
export class ProbeError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ProbeError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/**
 * Validate a caller-provided inspector URL. Only unencrypted ws:// to a
 * loopback host with an explicit port and target id is accepted. The helper
 * never discovers endpoints by itself (no /json/list, no port scanning).
 */
export function validateProbeUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    throw new ProbeError("bad-url", "an explicit inspector ws:// URL is required");
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ProbeError("bad-url", "inspector URL is not a valid URL");
  }
  if (url.protocol !== "ws:") {
    throw new ProbeError("bad-url-scheme", "inspector URL must use the ws: scheme");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!LOOPBACK_HOSTNAMES.has(hostname)) {
    throw new ProbeError(
      "non-loopback-host",
      "refusing non-loopback inspector host; only 127.0.0.1, localhost, and ::1 are allowed",
    );
  }
  if (!/^\d{1,5}$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65_535) {
    throw new ProbeError("bad-url", "inspector URL must include an explicit TCP port");
  }
  if (url.pathname === "/" || url.pathname === "") {
    throw new ProbeError(
      "bad-url",
      "inspector URL must include the target id path segment (ws://host:port/<id>)",
    );
  }
  if (url.username || url.password) {
    throw new ProbeError("bad-url", "inspector URL must not carry credentials");
  }
  return url.toString();
}

/**
 * Validate caller-specified identity expectations. There is no PID or entry
 * script guessing: both must be supplied explicitly, and the script path must
 * be absolute.
 */
export function validateExpectations({ expectedPid, expectedScriptPath }) {
  if (!Number.isInteger(expectedPid) || expectedPid <= 0) {
    throw new ProbeError("bad-expect-pid", "expectedPid must be a positive integer");
  }
  if (
    typeof expectedScriptPath !== "string" ||
    expectedScriptPath.length === 0 ||
    !path.isAbsolute(expectedScriptPath)
  ) {
    throw new ProbeError("bad-expect-script", "expectedScriptPath must be an absolute path");
  }
  return { expectedPid, expectedScriptPath: path.resolve(expectedScriptPath) };
}

function normalizeScriptPathForCompare(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

// ---------------------------------------------------------------------------
// Minimal CDP-over-WebSocket client for the Node inspector protocol.
//
// node:inspector in Node 24 does not expose a remote connect-by-URL API
// (verified on v24.20.0: `inspector.connect` does not exist; `Session` is
// same-thread only). The documented remote path is an external client speaking
// the inspector protocol over the ws:// endpoint, which the built-in
// WebSocket client provides. Only Runtime.evaluate is used.
// ---------------------------------------------------------------------------

class InspectorConnection {
  #ws;
  #pending = new Map();
  #nextId = 1;
  #closed = false;
  #maxResponseChars;
  /** Resolves once the underlying socket is closed (by either side). */
  closedPromise;

  constructor(ws, maxResponseChars) {
    this.#ws = ws;
    this.#maxResponseChars = maxResponseChars;
    this.closedPromise = new Promise((resolve) => {
      ws.addEventListener("close", () => resolve());
    });
    ws.addEventListener("message", (event) => this.#onMessage(event));
    ws.addEventListener("close", () =>
      this.#failPending(new ProbeError("connection-closed", "inspector connection closed by peer")),
    );
    ws.addEventListener("error", () => {
      this.#failPending(new ProbeError("connection-error", "inspector connection failed"));
      void this.close();
    });
  }

  /** Open and complete the WebSocket handshake within the connect timeout. */
  static async connect(
    urlString,
    {
      connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
      maxResponseChars = DEFAULT_MAX_RESPONSE_CHARS,
    } = {},
  ) {
    const ws = new WebSocket(urlString);
    const connection = new InspectorConnection(ws, maxResponseChars);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        // Reject explicitly: closing a socket stuck in CONNECTING surfaces as
        // an undici 'error', which must not masquerade as a refusal.
        try {
          ws.close();
        } catch {
          // Closing a socket that never opened is fine.
        }
        reject(
          new ProbeError(
            "connect-timeout",
            "inspector endpoint did not complete the WebSocket handshake within the configured timeout",
          ),
        );
      }, connectTimeoutMs);
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(
          new ProbeError(
            "connect-refused",
            "inspector endpoint refused or closed the connection during handshake",
          ),
        );
      };
      const onError = () => {
        cleanup();
        reject(new ProbeError("connect-refused", "could not connect to inspector endpoint"));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("close", onClose);
        ws.removeEventListener("error", onError);
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("close", onClose);
      ws.addEventListener("error", onError);
    }).catch((error) => {
      connection.#failPending(
        error instanceof ProbeError
          ? error
          : new ProbeError("connect-refused", "could not connect to inspector endpoint"),
      );
      throw error;
    });
    return connection;
  }

  #onMessage(event) {
    const raw = typeof event.data === "string" ? event.data : "";
    if (raw.length > this.#maxResponseChars) {
      // Bound our retention: drop the frame without parsing it.
      this.#failPending(
        new ProbeError(
          "response-too-large",
          "inspector response exceeded the configured byte bound",
        ),
      );
      void this.close();
      return;
    }
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      this.#failPending(new ProbeError("protocol-error", "inspector sent a malformed frame"));
      void this.close();
      return;
    }
    if (message && typeof message.id === "number" && this.#pending.has(message.id)) {
      const { resolve, reject, timer } = this.#pending.get(message.id);
      clearTimeout(timer);
      this.#pending.delete(message.id);
      if (message.error) {
        const description =
          typeof message.error.message === "string"
            ? message.error.message.slice(0, 200)
            : "unknown inspector error";
        reject(new ProbeError("cdp-error", `inspector protocol error: ${description}`));
      } else {
        resolve(message.result ?? {});
      }
    }
    // Non-response notifications are ignored; the probe evaluates only.
  }

  /**
   * Issue one CDP command with a hard timeout. On timeout the whole
   * connection is closed: a timed-out command may still be executing in the
   * (event-loop-blocked) target, so further commands on the same socket are
   * not safe to correlate.
   */
  post(method, params, timeoutMs) {
    if (this.#closed) {
      return Promise.reject(new ProbeError("connection-closed", "inspector connection is closed"));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        void this.close();
        reject(
          new ProbeError(
            "command-timeout",
            `inspector command ${method} did not answer within the configured timeout`,
          ),
        );
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#ws.send(JSON.stringify({ id, method, params }));
      } catch {
        clearTimeout(timer);
        this.#pending.delete(id);
        void this.close();
        reject(new ProbeError("connection-closed", "inspector connection failed while sending"));
      }
    });
  }

  #failPending(error) {
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.#pending.clear();
    this.#closed = true;
  }

  /** Close the socket and wait briefly for a clean close event. Idempotent. */
  async close() {
    if (this.#closed && this.#pending.size === 0) {
      return;
    }
    this.#failPending(new ProbeError("connection-closed", "inspector connection closed"));
    const ws = this.#ws;
    if (ws.readyState === 0 || ws.readyState === 1) {
      try {
        ws.close();
      } catch {
        // Already closing.
      }
      await Promise.race([
        new Promise((resolve) => ws.addEventListener("close", resolve, { once: true })),
        new Promise((resolve) => setTimeout(resolve, CLOSE_GRACE_MS)),
      ]);
    }
  }
}

// ---------------------------------------------------------------------------
// In-target evaluation expressions. Every expression is a self-contained IIFE
// that returns plain JSON-serializable data (returnByValue). Target-side
// accounting never stores payload strings — counters are numbers only, and
// any accounting failure is swallowed into accountingErrors so application
// behavior can never change.
// ---------------------------------------------------------------------------

function expressionPrologue() {
  return `(function(){
  "use strict";
  var KEY = ${JSON.stringify(PROBE_STATE_KEY)};
  var MARKER = ${JSON.stringify(OWNER_MARKER)};
  var SCHEMA = ${SNAPSHOT_SCHEMA};
  var BULK_TYPES = ${JSON.stringify(BULK_RUNTIME_EVENT_TYPES)};
`;
}

function expressionEpilogue() {
  return "})()";
}

function buildIdentityExpression() {
  return `${expressionPrologue()}
  var entries = [];
  try {
    if (process.mainModule && typeof process.mainModule.filename === "string") entries.push(process.mainModule.filename);
  } catch (e) {}
  try {
    if (Array.isArray(process.argv) && typeof process.argv[1] === "string") entries.push(process.argv[1]);
  } catch (e) {}
  return {
    pid: (typeof process === "object" && process !== null && typeof process.pid === "number") ? process.pid : null,
    hasIpc: typeof process.send === "function",
    entries: entries
  };
${expressionEpilogue()}`;
}

function buildInstallExpression() {
  return `${expressionPrologue()}
  function zeroCounters() {
    return {
      attempts: 0,
      sendTrue: 0,
      sendFalse: 0,
      sendThrew: 0,
      callsWithCallback: 0,
      supervisorEnvelopes: 0,
      targetedEnvelopes: 0,
      recoveryBarriers: 0,
      controlEnvelopes: 0,
      bulkEnvelopes: 0,
      mixedEnvelopes: 0,
      unclassifiedEnvelopes: 0,
      nonSupervisorMessages: 0,
      bulkThreadOutput: 0,
      bulkThreadOutputEmpty: 0,
      bulkRuntimeItems: 0,
      controlRuntimeItems: 0,
      jsonBytesTotal: 0,
      jsonBytesBulkEnvelopes: 0,
      jsonBytesControlEnvelopes: 0,
      jsonBytesMixedEnvelopes: 0,
      jsonBytesNonSupervisor: 0,
      accountingErrors: 0
    };
  }
  var existing = globalThis[KEY];
  if (existing && existing.installed === true) {
    return {
      status: "already-installed",
      probeId: existing.probeId,
      pid: process.pid,
      schema: existing.schema,
      installedAtEpochMs: existing.installedAtEpochMs,
      wrapperOwned: typeof process.send === "function" && process.send[MARKER] === existing.probeId,
      counters: existing.summary()
    };
  }
  if (typeof process.send !== "function") {
    return { status: "no-ipc-channel", pid: process.pid };
  }
  var original = process.send;
  var probeId = (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
    ? globalThis.crypto.randomUUID()
    : "probe-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
  var counters = zeroCounters();
  var installedAtEpochMs = Date.now();

  function add(name, amount) {
    try {
      counters[name] += amount;
    } catch (e) {
      counters.accountingErrors++;
    }
  }
  function byteLengthOf(text) {
    try {
      return (typeof Buffer === "function" && Buffer !== null && typeof Buffer.byteLength === "function")
        ? Buffer.byteLength(text)
        : text.length;
    } catch (e) {
      counters.accountingErrors++;
      return 0;
    }
  }
  function jsonBytesOf(value) {
    try {
      var text = JSON.stringify(value);
      return typeof text === "string" ? byteLengthOf(text) : 0;
    } catch (e) {
      // Circular structures, BigInt, or throwing getters: account the miss,
      // never disturb the send.
      counters.accountingErrors++;
      return 0;
    }
  }
  function isBulkRuntimeEvent(event) {
    if (!event || typeof event !== "object") return false;
    var type = event.type;
    for (var i = 0; i < BULK_TYPES.length; i++) {
      if (type === BULK_TYPES[i]) return true;
    }
    return false;
  }
  function classifyRuntimeEventList(events) {
    if (!Array.isArray(events)) return { kind: "unclassified", bulk: 0, control: 0, malformed: true };
    var bulk = 0;
    var control = 0;
    for (var i = 0; i < events.length; i++) {
      if (isBulkRuntimeEvent(events[i])) bulk++;
      else control++;
    }
    var kind = bulk > 0 && control > 0 ? "mixed" : bulk > 0 ? "bulk" : "control";
    return { kind: kind, bulk: bulk, control: control, malformed: false };
  }
  function classifySupervisorEvent(event) {
    if (!event || typeof event !== "object") return { kind: "unclassified" };
    switch (event.type) {
      case "thread-output":
        // Bulk only when the terminal/output frame actually carries data.
        return (typeof event.data === "string" && event.data.length > 0)
          ? { kind: "bulk", threadOutput: 1 }
          : { kind: "control", threadOutputEmpty: 1 };
      case "thread-runtime-event": {
        var single = isBulkRuntimeEvent(event.event);
        return { kind: single ? "bulk" : "control", bulk: single ? 1 : 0, control: single ? 0 : 1 };
      }
      case "thread-runtime-events":
        return classifyRuntimeEventList(event.events);
      case "thread-runtime-events-multi": {
        if (!Array.isArray(event.batches)) return { kind: "unclassified", malformed: true };
        var totalBulk = 0;
        var totalControl = 0;
        var malformed = false;
        for (var b = 0; b < event.batches.length; b++) {
          var batch = event.batches[b];
          var list = batch && typeof batch === "object" ? batch.events : undefined;
          var classified = classifyRuntimeEventList(list);
          if (classified.malformed) malformed = true;
          totalBulk += classified.bulk;
          totalControl += classified.control;
        }
        var multiKind = totalBulk > 0 && totalControl > 0 ? "mixed" : totalBulk > 0 ? "bulk" : totalControl > 0 ? "control" : malformed ? "unclassified" : "control";
        return { kind: multiKind, bulk: totalBulk, control: totalControl, malformed: malformed };
      }
      default:
        return { kind: "control" };
    }
  }
  function accountMessage(message) {
    try {
      if (!message || typeof message !== "object" || message.kind !== "supervisor-event") {
        // Generation-fenced recovery barriers are per-window control
        // traffic on the same ordered channel; account them separately so a
        // renamed envelope cannot hide bulk content past this probe (bulk is
        // only ever classified from the supervisor event content itself).
        if (message && typeof message === "object" && message.kind === "renderer-stream-recovery") {
          add("recoveryBarriers", 1);
          add("jsonBytesNonSupervisor", jsonBytesOf(message));
          return;
        }
        add("nonSupervisorMessages", 1);
        add("jsonBytesNonSupervisor", jsonBytesOf(message));
        return;
      }
      add("supervisorEnvelopes", 1);
      var bytes = jsonBytesOf(message);
      add("jsonBytesTotal", bytes);
      var classified = classifySupervisorEvent(message.event);
      // Targeted per-window fallback copies carry a target; their content is
      // still classified by the same supervisor-event predicate, so bulk
      // crossing to one window is counted as bulk regardless of addressing.
      if (message.target) add("targetedEnvelopes", 1);
      if (classified.kind === "bulk") {
        add("bulkEnvelopes", 1);
        add("jsonBytesBulkEnvelopes", bytes);
      } else if (classified.kind === "mixed") {
        add("mixedEnvelopes", 1);
        add("jsonBytesMixedEnvelopes", bytes);
      } else if (classified.kind === "control") {
        add("controlEnvelopes", 1);
        add("jsonBytesControlEnvelopes", bytes);
      } else {
        add("unclassifiedEnvelopes", 1);
      }
      if (classified.threadOutput) add("bulkThreadOutput", classified.threadOutput);
      if (classified.threadOutputEmpty) add("bulkThreadOutputEmpty", classified.threadOutputEmpty);
      if (classified.bulk) add("bulkRuntimeItems", classified.bulk);
      if (classified.control) add("controlRuntimeItems", classified.control);
      if (classified.malformed) add("accountingErrors", 1);
    } catch (e) {
      counters.accountingErrors++;
    }
  }
  function wrapped() {
    add("attempts", 1);
    var hasCallback = false;
    for (var i = 0; i < arguments.length; i++) {
      if (typeof arguments[i] === "function") {
        hasCallback = true;
        break;
      }
    }
    if (hasCallback) add("callsWithCallback", 1);
    if (arguments.length > 0) accountMessage(arguments[0]);
    var result;
    try {
      result = original.apply(this, arguments);
    } catch (err) {
      add("sendThrew", 1);
      throw err;
    }
    if (result === true) add("sendTrue", 1);
    else if (result === false) add("sendFalse", 1);
    return result;
  }
  try {
    Object.defineProperty(wrapped, "name", { value: "poracodeIpcProbeSend", configurable: true });
  } catch (e) {}
  wrapped[MARKER] = probeId;
  var state = {
    installed: true,
    schema: SCHEMA,
    probeId: probeId,
    pid: process.pid,
    installedAtEpochMs: installedAtEpochMs,
    originalSend: original,
    wrapped: wrapped,
    counters: counters,
    summary: function () {
      var copy = {};
      for (var name in counters) {
        if (Object.prototype.hasOwnProperty.call(counters, name)) copy[name] = counters[name];
      }
      return copy;
    }
  };
  try {
    process.send = wrapped;
    if (process.send !== wrapped) throw new Error("assignment rejected");
    globalThis[KEY] = state;
  } catch (e) {
    // Roll back so a failed installation never leaves the wrapper behind.
    try {
      if (process.send === wrapped) process.send = original;
    } catch (e2) {}
    return { status: "install-refused", pid: process.pid };
  }
  return {
    status: "installed",
    probeId: probeId,
    pid: process.pid,
    schema: SCHEMA,
    installedAtEpochMs: installedAtEpochMs,
    counters: state.summary()
  };
${expressionEpilogue()}`;
}

function buildStatusExpression(includeSummary) {
  return `${expressionPrologue()}
  var state = globalThis[KEY];
  if (!state || state.installed !== true) {
    return { status: "not-installed", pid: process.pid };
  }
  var result = {
    status: "present",
    probeId: state.probeId,
    pid: process.pid,
    schema: state.schema,
    installedAtEpochMs: state.installedAtEpochMs,
    wrapperOwned: typeof process.send === "function" && process.send === state.wrapped && process.send[MARKER] === state.probeId
  };
  ${includeSummary ? "result.counters = state.summary();" : ""}
  return result;
${expressionEpilogue()}`;
}

function buildResetExpression() {
  // Recreates the zeroed counter layout inline so both install and reset
  // agree on the counter field set.
  return `${expressionPrologue()}
  var state = globalThis[KEY];
  if (!state || state.installed !== true) {
    return { status: "not-installed", pid: process.pid };
  }
  var before = state.summary();
  // Zero the live counter object in place: the wrapper and summary() hold this
  // same reference from the install closure, so replacing it would fork the
  // accounting.
  for (var name in state.counters) {
    if (Object.prototype.hasOwnProperty.call(state.counters, name)) state.counters[name] = 0;
  }
  var after = state.summary();
  return {
    status: "reset",
    probeId: state.probeId,
    pid: process.pid,
    installedAtEpochMs: state.installedAtEpochMs,
    before: before,
    after: after
  };
${expressionEpilogue()}`;
}

function buildUninstallExpression() {
  return `${expressionPrologue()}
  var state = globalThis[KEY];
  if (!state || state.installed !== true) {
    return { status: "not-installed", pid: process.pid };
  }
  var current = process.send;
  if (typeof current === "function" && current === state.wrapped && current[MARKER] === state.probeId) {
    try {
      process.send = state.originalSend;
    } catch (e) {
      return { status: "restore-failed", probeId: state.probeId, pid: process.pid };
    }
    if (process.send === state.wrapped) {
      return { status: "restore-failed", probeId: state.probeId, pid: process.pid };
    }
    try {
      delete current[MARKER];
    } catch (e) {}
    delete globalThis[KEY];
    return {
      status: "uninstalled",
      probeId: state.probeId,
      pid: process.pid,
      finalCounters: state.summary()
    };
  }
  // A third-party wrapper has been layered on top (or replaced ours). Restoring
  // our stale originalSend would clobber their wrapper and break their chain,
  // so the probe leaves everything in place and reports honestly.
  return {
    status: "foreign-wrapper",
    probeId: state.probeId,
    pid: process.pid,
    wrapperOwned: false,
    counters: state.summary()
  };
${expressionEpilogue()}`;
}

function buildOwnershipCheckExpression(probeId) {
  return `(function(){
  "use strict";
  var state = globalThis[${JSON.stringify(PROBE_STATE_KEY)}];
  return {
    statePresent: !!(state && state.installed === true),
    wrapperOwned: typeof process.send === "function" && !!state && process.send === state.wrapped && process.send[${JSON.stringify(OWNER_MARKER)}] === state.probeId,
    probeIdMatches: !!(state && state.probeId === ${JSON.stringify(probeId)})
  };
})()`;
}

// ---------------------------------------------------------------------------
// Probe-side session. One session = one inspector connection bound to one
// verified target. Identity is verified at open time and nothing is installed
// before that verification succeeds.
// ---------------------------------------------------------------------------

async function evaluateJson(connection, expression, timeoutMs) {
  const response = await connection.post(
    "Runtime.evaluate",
    { expression, returnByValue: true },
    timeoutMs,
  );
  if (response && response.exceptionDetails) {
    const className = response.exceptionDetails?.exception?.className;
    throw new ProbeError(
      "evaluate-exception",
      `target-side evaluation threw ${typeof className === "string" ? className : "an exception"}`,
    );
  }
  const value = response?.result;
  if (!value || value.subtype === "null" || typeof value.value === "undefined") {
    throw new ProbeError("evaluate-shape", "target-side evaluation returned no serializable value");
  }
  return value.value;
}

async function verifyIdentity(connection, { expectedPid, expectedScriptPath }, timeoutMs) {
  const identity = await evaluateJson(connection, buildIdentityExpression(), timeoutMs);
  if (identity.pid !== expectedPid) {
    // The target PID is not sensitive; the entry script candidates are
    // argv-derived, so on mismatch we report only the boolean, never values.
    throw new ProbeError(
      "pid-mismatch",
      "target PID does not match the caller-provided expectation",
      {
        expectedPid,
        actualPid: identity.pid,
        entryScriptMatched: false,
      },
    );
  }
  if (!identity.hasIpc) {
    throw new ProbeError(
      "no-ipc-channel",
      "target has no process.send IPC channel; nothing to observe",
    );
  }
  const expected = normalizeScriptPathForCompare(expectedScriptPath);
  const entries = Array.isArray(identity.entries) ? identity.entries : [];
  const matched = entries.some(
    (candidate) =>
      typeof candidate === "string" && normalizeScriptPathForCompare(candidate) === expected,
  );
  if (!matched) {
    throw new ProbeError(
      "entry-script-mismatch",
      "target entry script does not match the caller-provided absolute path (actual entry withheld)",
      {
        expectedScriptPath,
      },
    );
  }
  return { pid: identity.pid };
}

function assertProbeId(state, expectedProbeId) {
  if (expectedProbeId && state.probeId !== expectedProbeId) {
    throw new ProbeError(
      "probe-id-mismatch",
      "target probe id does not match the caller-provided probe id",
    );
  }
}

/**
 * A short-lived session against one verified target. Reuse it for several
 * operations over a single inspector connection; every public one-shot
 * function below opens a fresh session per call.
 */
export async function openProbeSession(url, options = {}) {
  const urlString = validateProbeUrl(url);
  const { expectedPid, expectedScriptPath } = validateExpectations(options);
  const commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const maxResponseChars = options.maxResponseChars ?? DEFAULT_MAX_RESPONSE_CHARS;
  const probeId = options.probeId;

  const connection = await InspectorConnection.connect(urlString, {
    connectTimeoutMs,
    maxResponseChars,
  });
  let open = true;

  async function run(expression) {
    return evaluateJson(connection, expression, commandTimeoutMs);
  }

  const session = {
    /** Identity-verified at open; expose the checked pid for callers. */
    verifiedPid: undefined,

    async install() {
      const result = await run(buildInstallExpression());
      if (result.status === "installed") {
        // Belt and braces: confirm the wrapper really owns process.send.
        const ownership = await run(buildOwnershipCheckExpression(result.probeId));
        if (!ownership.wrapperOwned || !ownership.probeIdMatches) {
          const rolledBack = await run(`(function(){
  var state = globalThis[${JSON.stringify(PROBE_STATE_KEY)}];
  if (state && process.send === state.wrapped) {
    process.send = state.originalSend;
    delete globalThis[${JSON.stringify(PROBE_STATE_KEY)}];
    return true;
  }
  return false;
})()`);
          throw new ProbeError(
            "install-verify-failed",
            "installed wrapper failed the post-install ownership check; rolled back",
            { rolledBack: rolledBack === true },
          );
        }
      } else if (result.status === "already-installed") {
        assertProbeId(result, probeId);
        if (result.wrapperOwned !== true) {
          throw new ProbeError(
            "foreign-wrapper",
            "a probe is registered in the target but the wrapper is no longer owned by it",
          );
        }
      } else if (result.status === "no-ipc-channel") {
        throw new ProbeError(
          "no-ipc-channel",
          "target has no process.send IPC channel; nothing to observe",
        );
      } else {
        throw new ProbeError("install-refused", "target refused the probe installation");
      }
      return result;
    },

    async get() {
      const result = await run(buildStatusExpression(true));
      if (result.status !== "present") {
        throw new ProbeError("not-installed", "no probe is installed in the target");
      }
      assertProbeId(result, probeId);
      return result;
    },

    async reset() {
      const result = await run(buildResetExpression());
      if (result.status !== "reset") {
        throw new ProbeError("not-installed", "no probe is installed in the target");
      }
      assertProbeId(result, probeId);
      return result;
    },

    async uninstall() {
      const result = await run(buildUninstallExpression());
      if (result.status === "uninstalled") {
        assertProbeId(result, probeId);
        return { uninstalled: true, finalCounters: result.finalCounters, probeId: result.probeId };
      }
      if (result.status === "foreign-wrapper") {
        assertProbeId(result, probeId);
        return {
          uninstalled: false,
          reason: "foreign-wrapper",
          counters: result.counters,
          probeId: result.probeId,
        };
      }
      if (result.status === "restore-failed") {
        throw new ProbeError(
          "uninstall-restore-failed",
          "the target refused to restore the original process.send",
        );
      }
      return { uninstalled: false, reason: "not-installed" };
    },

    async close() {
      if (!open) return;
      open = false;
      await connection.close();
    },

    /** Resolves when the inspector socket closes (e.g. target exit). */
    waitForClose() {
      return connection.closedPromise;
    },
  };

  const identity = await verifyIdentity(
    connection,
    { expectedPid, expectedScriptPath },
    commandTimeoutMs,
  );
  session.verifiedPid = identity.pid;
  return session;
}

// ---------------------------------------------------------------------------
// One-shot operations: each opens a fresh verified session and closes it.
// These back the CLI subcommands so successive short CLI invocations can
// install, sample, reset, and uninstall across separate processes.
// ---------------------------------------------------------------------------

async function withSession(url, options, fn) {
  const session = await openProbeSession(url, options);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

export async function installProbe(url, options = {}) {
  return withSession(url, options, (session) => session.install());
}

/** Returns the live snapshot, or null when no probe is installed. */
export async function getProbeSnapshot(url, options = {}) {
  try {
    return await withSession(url, options, (session) => session.get());
  } catch (error) {
    if (error instanceof ProbeError && error.code === "not-installed") return null;
    throw error;
  }
}

export async function resetProbe(url, options = {}) {
  return withSession(url, options, (session) => session.reset());
}

/** Always resolves: check `uninstalled` / `reason` on the result. */
export async function uninstallProbe(url, options = {}) {
  return withSession(url, options, (session) => session.uninstall());
}

/**
 * Bounded in-process capture: open one session, install (or adopt an existing
 * probe), optionally reset, observe real traffic for `durationMs`, snapshot,
 * and uninstall. The counters live in the target, so traffic does not need
 * this connection — the window just bounds how long the wrapper stays.
 *
 * If the target dies mid-capture the wrapper dies with it; if the connection
 * dies while the target lives, the wrapper remains installed until an
 * explicit uninstall (documented limitation).
 */
export async function captureProbe(url, options = {}) {
  const durationMs = options.durationMs ?? 1_000;
  const resetBefore = options.resetBefore ?? true;
  const startedAt = Date.now();
  return withSession(url, options, async (session) => {
    const installed = await session.install();
    let reset;
    if (resetBefore) {
      reset = await session.reset();
    }
    // Traffic is counted in the target regardless of this connection; the
    // window only bounds how long the wrapper stays installed. Peer death
    // during the window fails the capture promptly instead of sleeping on.
    await Promise.race([
      new Promise((resolve) => setTimeout(resolve, durationMs)),
      session.waitForClose().then(() => {
        throw new ProbeError(
          "connection-closed",
          "inspector connection closed during the capture window",
        );
      }),
    ]);
    const snapshot = await session.get();
    const uninstalled = await session.uninstall();
    return {
      status: "ok",
      installed,
      reset,
      snapshot,
      uninstalled,
      wallMs: Date.now() - startedAt,
    };
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage:
  node poracode-ipc-probe.mjs <command> --url <ws-url> --expect-pid <pid> --expect-script <abs-path> [options]

Commands:
  install     install the probe wrapper in the verified target
  get         read the current snapshot (bounded counters)
  reset       zero the counters, returning before/after
  uninstall   remove the wrapper (ownership-checked, safe no-op when absent)
  capture     install, optionally reset, wait, snapshot, uninstall in one call

Required:
  --url <ws-url>            inspector endpoint, ws://127.0.0.1:<port>/<id>
                            (localhost / [::1] accepted; nothing else is)
  --expect-pid <pid>        expected target PID (verified before install)
  --expect-script <path>    expected absolute target entry script path
                            (verified before install)

Options:
  --timeout-ms <n>          per-command and connect timeout (default 5000)
  --probe-id <id>           operate only on the probe with this id
  --duration-ms <n>         capture window for the capture command (default 1000)
  --no-reset                capture command: do not reset before the window
  --max-response-chars <n>  inspector response size bound (default 1000000)

Output: one JSON line on stdout. Errors: one JSON line on stderr, exit 1
(operational) or 2 (usage). Neither output ever includes target argv, env,
tokens, or event payloads.`;

function parseCliArgv(argv) {
  const parsed = { command: undefined, flags: new Map() };
  const known = new Set([
    "url",
    "expect-pid",
    "expect-script",
    "timeout-ms",
    "probe-id",
    "duration-ms",
    "max-response-chars",
  ]);
  const booleanFlags = new Set(["no-reset"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (parsed.command === undefined && !arg.startsWith("--")) {
      parsed.command = arg;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new ProbeError(
        "usage",
        `unexpected positional argument: only a command and --flags are accepted`,
      );
    }
    const flag = arg.slice(2);
    if (flag === "help") {
      parsed.help = true;
      continue;
    }
    if (booleanFlags.has(flag)) {
      parsed.flags.set(flag, true);
      continue;
    }
    if (!known.has(flag)) {
      throw new ProbeError("usage", `unknown option --${flag}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new ProbeError("usage", `option --${flag} requires a value`);
    }
    parsed.flags.set(flag, value);
    i++;
  }
  return parsed;
}

function integerFlag(flags, name, fallback) {
  const raw = flags.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ProbeError("usage", `--${name} must be a positive integer`);
  }
  return value;
}

async function runCli(argv) {
  const parsed = parseCliArgv(argv);
  if (parsed.help || !parsed.command) {
    process.stdout.write(`${USAGE}\n`);
    process.exitCode = parsed.help ? 0 : 2;
    return;
  }
  const { flags } = parsed;
  if (!["install", "get", "reset", "uninstall", "capture"].includes(parsed.command)) {
    throw new ProbeError("usage", `unknown command: ${parsed.command}`);
  }
  const timeoutMs = integerFlag(flags, "timeout-ms", DEFAULT_COMMAND_TIMEOUT_MS);
  const options = {
    commandTimeoutMs: timeoutMs,
    connectTimeoutMs: timeoutMs,
    maxResponseChars: integerFlag(flags, "max-response-chars", DEFAULT_MAX_RESPONSE_CHARS),
  };
  if (flags.has("probe-id")) options.probeId = flags.get("probe-id");

  // Validate URL and identity expectations up front: usage errors exit 2
  // before any network activity happens.
  validateProbeUrl(flags.get("url"));
  const expectations = validateExpectations({
    expectedPid: Number(flags.get("expect-pid")),
    expectedScriptPath: flags.get("expect-script"),
  });
  Object.assign(options, expectations);

  switch (parsed.command) {
    case "install": {
      const result = await installProbe(flags.get("url"), options);
      process.stdout.write(
        `${JSON.stringify({ command: "install", status: result.status, probeId: result.probeId, pid: result.pid, schema: result.schema, snapshot: { installedAtEpochMs: result.installedAtEpochMs, wrapperOwned: result.wrapperOwned ?? true, counters: result.counters } })}\n`,
      );
      break;
    }
    case "get": {
      const result = await getProbeSnapshot(flags.get("url"), options);
      if (!result) {
        process.stdout.write(`${JSON.stringify({ command: "get", status: "not-installed" })}\n`);
        break;
      }
      process.stdout.write(
        `${JSON.stringify({ command: "get", status: "present", probeId: result.probeId, pid: result.pid, schema: result.schema, snapshot: { installedAtEpochMs: result.installedAtEpochMs, wrapperOwned: result.wrapperOwned, counters: result.counters } })}\n`,
      );
      break;
    }
    case "reset": {
      const result = await resetProbe(flags.get("url"), options);
      process.stdout.write(
        `${JSON.stringify({ command: "reset", status: "reset", probeId: result.probeId, before: result.before, after: result.after })}\n`,
      );
      break;
    }
    case "uninstall": {
      const result = await uninstallProbe(flags.get("url"), options);
      process.stdout.write(`${JSON.stringify({ command: "uninstall", ...result })}\n`);
      break;
    }
    case "capture": {
      const captureOptions = {
        ...options,
        durationMs: integerFlag(flags, "duration-ms", 1_000),
        resetBefore: !flags.has("no-reset"),
      };
      const result = await captureProbe(flags.get("url"), captureOptions);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      break;
    }
  }
}

/** Argument-validation failures exit 2 before any network activity. */
const USAGE_ERROR_CODES = new Set([
  "usage",
  "bad-url",
  "bad-url-scheme",
  "non-loopback-host",
  "bad-expect-pid",
  "bad-expect-script",
]);

export async function main(argv) {
  try {
    await runCli(argv);
  } catch (error) {
    const code = error instanceof ProbeError ? error.code : "internal-error";
    const body = {
      error: code,
      message: error instanceof Error ? error.message : String(error),
    };
    process.stderr.write(`${JSON.stringify(body)}\n`);
    process.exitCode = USAGE_ERROR_CODES.has(code) ? 2 : 1;
  }
}

if (process.argv[1] === path.resolve(import.meta.filename ?? "")) {
  await main(process.argv.slice(2));
}
