import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { WebSocketServer } from "ws";
import {
  assertUnchangedProjectCatalog,
  combineQualificationFailures,
  forceStopChild,
  formatQualificationError,
  stopQualificationChild,
} from "./server-install-qualification.mjs";
import {
  jsonRequest,
  PROTOCOL_VERSION_HEADER,
  readQualificationEnvironment,
  readQualificationProtocolVersion,
} from "./qualification-http.mjs";
import {
  runOneThreadTurn,
  supportsReliableTerminalWatch,
  TERMINAL_WATCH_VERSION,
  terminalTurnInput,
} from "./qualification-terminal.mjs";
import { pairAndAuthenticate } from "./server-n1-qualification/server-session.mjs";
import { redactSecrets } from "./server-n1-qualification/redaction.mjs";

// The latest stable release (v1.8.2) predates terminal cursor-sync capability
// advertising and uses the legacy terminal-watch message.
const STABLE_1_8_2_DESCRIPTOR = {
  protocolVersion: 10,
  desktopId: "stable-host",
  label: "Stable host",
  appVersion: "1.8.2",
  auth: {
    policy: "remote-reachable",
    bootstrapMethods: ["one-time-token"],
    sessionMethods: ["bearer-access-token"],
    scopes: ["terminal:read", "terminal:operate"],
  },
  endpoints: { httpBaseUrl: "http://127.0.0.1:1", wsBaseUrl: "ws://127.0.0.1:1" },
};

void test("rejected writer catalog checks compare structured Windows paths", () => {
  const before = { status: 200, body: { projects: [{ path: "C:\\existing\\project" }] } };
  assert.doesNotThrow(() => assertUnchangedProjectCatalog(before, structuredClone(before)));
  assert.throws(
    () =>
      assertUnchangedProjectCatalog(before, {
        status: 200,
        body: { projects: [...before.body.projects, { path: "C:\\qualification\\project" }] },
      }),
    /changed the project catalog/u,
  );
  assert.throws(
    () => assertUnchangedProjectCatalog(before, { status: 500, body: before.body }),
    /catalog read failed/u,
  );
});

async function terminalFixture(t, { status = 200 } = {}) {
  const watch = Promise.withResolvers();
  const writes = [];
  const sockets = new WebSocketServer({ noServer: true });
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      writes.push({ path: request.url, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      void watch.promise
        .then(({ socket, message }) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end("{}");
          if (status === 200) {
            const cursorSync = message.cursorSync
              ? { watchId: message.cursorSync.watchId }
              : undefined;
            socket.send(
              JSON.stringify({ type: "terminal-output", id: "other", data: "pty-192-turn" }),
            );
            socket.send(
              JSON.stringify({
                type: "terminal-output",
                id: message.id,
                data: "pty-192-",
                cursorSync,
              }),
            );
            socket.send(
              JSON.stringify({ type: "terminal-output", id: message.id, data: "turn", cursorSync }),
            );
          }
        })
        .catch((error) => response.destroy(error));
    });
  });
  server.on("upgrade", (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit("connection", ws));
  });
  sockets.on("connection", (socket) => {
    socket.once("message", (data) => watch.resolve({ socket, message: JSON.parse(String(data)) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const socket of sockets.clients) socket.terminate();
    await new Promise((resolve) => sockets.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  });
  return { httpBase: `http://127.0.0.1:${server.address().port}`, watch: watch.promise, writes };
}

function terminalTurn(fixture, descriptor) {
  return runOneThreadTurn({
    httpBase: fixture.httpBase,
    token: "fixture-token",
    protocolVersion: 71,
    shellId: "fixture-shell",
    ticket: "fixture-ticket",
    descriptor,
  });
}

void test("terminal qualification waits for a versioned watch before writing", async (t) => {
  const fixture = await terminalFixture(t);
  const descriptor = { capabilities: { terminalCursorSync: { versions: [1, 2] } } };
  const turn = terminalTurn(fixture, descriptor);
  const { socket, message } = await fixture.watch;
  assert.equal(typeof message.cursorSync.watchId, "string");
  assert.deepEqual({ ...message.cursorSync, watchId: "fixed" }, { version: 1, watchId: "fixed" });
  assert.equal(message.id, "fixture-shell");
  socket.send(
    JSON.stringify({
      type: "terminal-watch-result",
      id: message.id,
      cursorSync: { version: 1, watchId: "other", result: { status: "ready" } },
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.writes.length, 0);
  socket.send(
    JSON.stringify({
      type: "terminal-watch-result",
      id: message.id,
      cursorSync: { version: 1, watchId: message.cursorSync.watchId, result: { status: "ready" } },
    }),
  );
  await turn;
  assert.deepEqual(fixture.writes, [
    { path: "/api/threads/fixture-shell/terminal/write", body: { data: terminalTurnInput() } },
  ]);
});

void test("terminal qualification retains the legacy watch for an older descriptor", async (t) => {
  const fixture = await terminalFixture(t);
  const turn = terminalTurn(fixture, STABLE_1_8_2_DESCRIPTOR);
  const { message } = await fixture.watch;
  assert.deepEqual(message, { type: "terminal-watch", id: "fixture-shell" });
  await turn;
  assert.equal(fixture.writes.length, 1);
  assert.throws(
    () =>
      supportsReliableTerminalWatch({ capabilities: { terminalCursorSync: { versions: [2] } } }),
    /version 1 is not available/u,
  );
});

void test("terminal qualification refuses a rejected watch without writing", async (t) => {
  const fixture = await terminalFixture(t);
  const turn = terminalTurn(fixture, { capabilities: { terminalCursorSync: { versions: [1] } } });
  const { socket, message } = await fixture.watch;
  socket.send(
    JSON.stringify({
      type: "terminal-watch-result",
      id: message.id,
      cursorSync: {
        version: 1,
        watchId: message.cursorSync.watchId,
        result: { status: "error", code: "unavailable", retryable: true },
      },
    }),
  );
  await assert.rejects(turn, /reliable PTY watch was not accepted/u);
  assert.equal(fixture.writes.length, 0);
});

void test("terminal qualification refuses a future-only watch before writing", async (t) => {
  const fixture = await terminalFixture(t);
  await assert.rejects(
    terminalTurn(fixture, { capabilities: { terminalCursorSync: { versions: [2] } } }),
    /version 1 is not available/u,
  );
  assert.equal(fixture.writes.length, 0);
});

void test("qualification environment keeps old descriptors and their protocol version", async () => {
  const old = STABLE_1_8_2_DESCRIPTOR;
  const fetchOld = async () => new Response(JSON.stringify(old), { status: 200 });
  assert.deepEqual(
    await readQualificationEnvironment(fetchOld, "http://fixture.test", {
      versions: { remoteProtocolVersion: 10 },
    }),
    old,
  );
  assert.equal(supportsReliableTerminalWatch(old), false);
  assert.throws(
    () => supportsReliableTerminalWatch({ capabilities: { terminalCursorSync: { versions: 1 } } }),
    /version 1 is not available/u,
  );
  const contract = await readFile(
    new URL("../src/shared/remote/protocol/core.ts", import.meta.url),
    "utf8",
  );
  assert.ok(contract.includes(`TERMINAL_CURSOR_SYNC_VERSION = ${TERMINAL_WATCH_VERSION} as const`));
});

void test("qualification requests declare host generation and preserve auth only in memory", async (t) => {
  let version = 71;
  let mutations = 0;
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url, method: request.method, headers: request.headers });
    response.setHeader("content-type", "application/json");
    if (request.url === "/.well-known/poracode/environment") {
      response.end(JSON.stringify({ protocolVersion: version }));
    } else if (request.url === "/oauth/token") {
      response.end(JSON.stringify({ accessToken: "synthetic-bearer" }));
    } else if (request.url === "/api/auth/websocket-ticket") {
      response.end(JSON.stringify({ ticket: "synthetic-ticket" }));
    } else if (request.url === "/api/projects" && request.method === "GET") {
      response.end(JSON.stringify({ projects: [] }));
    } else if (request.headers[PROTOCOL_VERSION_HEADER] !== String(version)) {
      response.statusCode = 409;
      response.end(JSON.stringify({ error: { code: "protocol_version_mismatch" } }));
    } else {
      mutations++;
      response.end("{}");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const httpBase = `http://127.0.0.1:${server.address().port}`;
  const doctor = () => ({ versions: { remoteProtocolVersion: version } });
  const runCli = () => ({
    stdout: JSON.stringify({ pairingUrl: `${httpBase}/pair#token=synthetic-credential` }),
  });
  const old = await pairAndAuthenticate(runCli, "entry", {}, httpBase, fetch, doctor());
  assert.equal(old.token, "synthetic-bearer");
  assert.equal(old.protocolVersion, 71);
  assert.equal(requests[0].headers[PROTOCOL_VERSION_HEADER], undefined);
  assert.equal(requests[1].headers[PROTOCOL_VERSION_HEADER], undefined);
  const ticket = await jsonRequest(fetch, `${httpBase}/api/auth/websocket-ticket`, {
    token: old.token,
    method: "POST",
    protocolVersion: old.protocolVersion,
  });
  assert.equal(ticket.body.ticket, "synthetic-ticket");
  await jsonRequest(fetch, `${httpBase}/api/projects`, {
    token: old.token,
    protocolVersion: old.protocolVersion,
  });
  assert.equal(requests.at(-1).headers[PROTOCOL_VERSION_HEADER], undefined);
  const add = await jsonRequest(fetch, `${httpBase}/api/projects/command`, {
    token: old.token,
    method: "POST",
    protocolVersion: old.protocolVersion,
    body: { kind: "add-existing" },
  });
  assert.equal(add.status, 200);
  assert.equal(requests.at(-1).headers.authorization, "Bearer synthetic-bearer");
  assert.equal(requests.at(-1).headers[PROTOCOL_VERSION_HEADER], "71");
  version = 72; // Candidate replaces N-1 at the exact same origin.
  const refused = await jsonRequest(fetch, `${httpBase}/api/projects/command`, {
    token: old.token,
    method: "POST",
    protocolVersion: old.protocolVersion,
  });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, "protocol_version_mismatch");
  assert.equal(mutations, 1);
  const current = await pairAndAuthenticate(runCli, "entry", {}, httpBase, fetch, doctor());
  assert.equal(current.protocolVersion, 72);
  await jsonRequest(fetch, `${httpBase}/api/projects/command`, {
    token: current.token,
    method: "POST",
    protocolVersion: current.protocolVersion,
  });
  assert.equal(mutations, 2);
  const beforeMissing = requests.length;
  await assert.rejects(
    jsonRequest(fetch, `${httpBase}/api/projects/command`, { token: old.token, method: "POST" }),
    /positive safe integer/u,
  );
  assert.equal(requests.length, beforeMissing);
  assert.equal(
    redactSecrets(JSON.stringify({ accessToken: old.token })).includes(old.token),
    false,
  );
  assert.equal(redactSecrets(`Bearer ${old.token}`).includes(old.token), false);
  assert.equal(
    redactSecrets(`${httpBase}/ws?ticket=${ticket.body.ticket}`).includes(ticket.body.ticket),
    false,
  );
});

void test("qualification protocol discovery rejects malformed or contradictory declarations", async () => {
  const declared = (version) => async () =>
    new Response(JSON.stringify({ protocolVersion: version }));
  for (const version of [undefined, "13", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      readQualificationProtocolVersion(declared(version), "http://fixture.test", {
        versions: { remoteProtocolVersion: 13 },
      }),
      /positive safe integer/u,
    );
  }
  await assert.rejects(
    readQualificationProtocolVersion(declared(13), "http://fixture.test", {
      versions: { remoteProtocolVersion: 12 },
    }),
    /disagrees with doctor/u,
  );
  await assert.rejects(
    readQualificationProtocolVersion(declared(13), "http://fixture.test", {}),
    /doctor must declare/u,
  );
  const contract = await readFile(
    new URL("../src/shared/remote/protocol/core.ts", import.meta.url),
    "utf8",
  );
  assert.ok(contract.includes(`REMOTE_PROTOCOL_VERSION_HEADER = "${PROTOCOL_VERSION_HEADER}"`));
});

/** An event-controlled ChildProcess stand-in: no real daemon is spawned. */
class FakeQualificationChild extends EventEmitter {
  constructor(pid = 4242) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.kills = [];
  }

  exit(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }

  kill(signal) {
    this.kills.push(signal);
    this.exitCode = null;
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  }
}

void test("stopQualificationChild joins a clean graceful exit without force-reaping", async () => {
  const child = new FakeQualificationChild();
  let requested = 0;
  let forced = 0;
  const requestStop = () => {
    requested++;
    setImmediate(() => child.exit(0));
  };
  const forceStop = () => {
    forced++;
  };
  await stopQualificationChild(child, requestStop, forceStop, { joinTimeoutMs: 2_000 });
  assert.equal(requested, 1);
  assert.equal(forced, 0);
  assert.equal(child.exitCode, 0);
  assert.deepEqual(child.kills, []);

  // An already-exited child short-circuits without touching either callback.
  const exited = new FakeQualificationChild();
  exited.exit(0);
  let untouched = 0;
  await stopQualificationChild(
    exited,
    () => {
      untouched++;
    },
    () => {
      untouched++;
    },
  );
  assert.equal(untouched, 0);
});

void test("stopQualificationChild force-reaps on a failed stop request and rethrows the original", async () => {
  const child = new FakeQualificationChild();
  const original = new Error("poracode-server stop did not report a stopped owner");
  let forced = 0;
  const requestStop = () => {
    throw original;
  };
  const forceStop = () => {
    forced++;
    child.exit(1);
  };
  await assert.rejects(
    stopQualificationChild(child, requestStop, forceStop),
    (error) => error === original,
  );
  assert.equal(forced, 1, "a failed graceful request must still reap the owned child");
  assert.equal(child.exitCode, 1);
});

void test("stopQualificationChild rethrows a graceful-stop rejection carrying undefined", async () => {
  const child = new FakeQualificationChild();
  let forced = 0;
  // A callback can reject with a non-Error (even `undefined`); the old
  // `undefined` sentinel misread that as a clean stop and masked the failure.
  const rejectionReason = undefined;
  const requestStop = () => Promise.reject(rejectionReason);
  const forceStop = () => {
    forced++;
    child.exit(1);
  };
  let didThrow = false;
  try {
    await stopQualificationChild(child, requestStop, forceStop);
  } catch (error) {
    didThrow = true;
    assert.equal(error, undefined);
  }
  assert.equal(didThrow, true, "a graceful-stop rejection with undefined must be rethrown");
  assert.equal(forced, 1, "the exact owned child is still force-reaped");
  assert.equal(child.exitCode, 1);
});

void test("stopQualificationChild aggregates the graceful-stop and cleanup failures", async () => {
  const child = new FakeQualificationChild();
  const original = new Error("stop request failed");
  const cleanup = new Error("taskkill failed");
  const requestStop = () => {
    throw original;
  };
  const forceStop = () => {
    throw cleanup;
  };
  await assert.rejects(
    stopQualificationChild(child, requestStop, forceStop),
    (error) =>
      error instanceof AggregateError &&
      error.cause === cleanup &&
      error.errors.length === 2 &&
      error.errors[0] === original &&
      error.errors[1] === cleanup,
  );
});

void test("stopQualificationChild force-reaps when the graceful child-exit join expires", async () => {
  const child = new FakeQualificationChild();
  let forced = 0;
  const requestStop = () => {}; // graceful request resolves, child ignores it
  const forceStop = () => {
    forced++;
    child.exit(1);
  };
  await assert.rejects(
    stopQualificationChild(child, requestStop, forceStop, {
      joinTimeoutMs: 40,
      cleanupTimeoutMs: 500,
    }),
    /qualification daemon did not exit within 40ms/u,
  );
  assert.equal(forced, 1, "an expired join must force-reap, not become a clean pass");
});

void test("qualification retains both probe and cleanup failures with the probe first", () => {
  const secret = "synthetic-access-token-0123456789";
  const probe = new Error(`probe failed with Bearer ${secret}`);
  const cleanup = new Error("daemon cleanup failed");
  const combined = combineQualificationFailures(probe, cleanup);
  assert.ok(combined instanceof AggregateError);
  assert.deepEqual(combined.errors, [probe, cleanup]);

  const rendered = formatQualificationError(combined);
  assert.match(rendered, /probe failed/u);
  assert.match(rendered, /daemon cleanup failed/u);
  assert.ok(rendered.indexOf("probe failed") < rendered.indexOf("daemon cleanup failed"));
  assert.ok(!rendered.includes(secret), "raw app credential must be redacted");
  assert.match(rendered, /Bearer \[redacted\]/u);

  // Normal success and single failures are preserved, never wrapped.
  assert.equal(combineQualificationFailures(probe, null), probe);
  assert.equal(combineQualificationFailures(null, cleanup), cleanup);
  assert.equal(combineQualificationFailures(null, null), null);

  // Nested AggregateError members (the stop path's own aggregation) are printed.
  const nested = new AggregateError(
    [new Error("graceful stop failed"), new Error("taskkill failed")],
    "stop and cleanup failed",
  );
  const nestedRendered = formatQualificationError(combineQualificationFailures(probe, nested));
  assert.match(nestedRendered, /graceful stop failed/u);
  assert.match(nestedRendered, /taskkill failed/u);
});

void test("forceStopChild uses fully-qualified taskkill.exe /PID /T /F with a bounded timeout", () => {
  const calls = [];
  const run = (file, args, options) => {
    calls.push({ file, args, options });
  };
  const child = new FakeQualificationChild(840);
  forceStopChild(child, { platform: "win32", env: { SystemRoot: "C:\\Windows" }, run });
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.match(call.file, /taskkill\.exe$/u);
  assert.match(call.file, /System32/u);
  assert.match(call.file, /C:\\Windows/u);
  assert.deepEqual(call.args, ["/PID", "840", "/T", "/F"]);
  assert.ok(call.options.timeout > 0 && call.options.timeout <= 10_000);
  assert.equal(call.options.windowsHide, true);
  assert.deepEqual(child.kills, [], "a valid Windows pid must not fall back to a bare kill");

  // No name-based selection and no taskkill for an invalid pid.
  const invalid = new FakeQualificationChild(NaN);
  forceStopChild(invalid, { platform: "win32", env: { windir: "C:\\Windows" }, run });
  assert.equal(calls.length, 1);
  assert.deepEqual(invalid.kills, ["SIGKILL"]);

  // An already-exited child is never reaped.
  const exited = new FakeQualificationChild(999);
  exited.exit(0);
  forceStopChild(exited, { platform: "win32", env: { SystemRoot: "C:\\Windows" }, run });
  assert.equal(calls.length, 1);
});
