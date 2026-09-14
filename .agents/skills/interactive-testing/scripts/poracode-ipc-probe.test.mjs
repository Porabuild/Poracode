// Tests for poracode-ipc-probe: real disposable Node children with an IPC
// channel plus a live inspector endpoint (node --inspect=127.0.0.1:0).
// Every child is spawned by these tests, runs a deterministic command loop,
// and is killed in teardown. No Electron and no production provider involved.
//
// Run with: node --test .agents/skills/interactive-testing/scripts/poracode-ipc-probe.test.mjs

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SNAPSHOT_SCHEMA,
  ProbeError,
  captureProbe,
  getProbeSnapshot,
  installProbe,
  resetProbe,
  uninstallProbe,
  validateProbeUrl,
} from "./poracode-ipc-probe.mjs";

const execFileAsync = promisify(execFile);

// Scratch lives under the repo's gitignored tmp/, per repo working rules.
const scratchRoot = fileURLToPath(new URL("../../../../tmp/v4-ipc-probe/", import.meta.url));

// The fixture answers control commands and reports results on STDERR, not via
// process.send, so its own replies never pass through (and never pollute) the
// probe wrapper counters. Only explicitly commanded envelopes cross process.send.
const FIXTURE_SOURCE = `"use strict";
const inspector = require("node:inspector");
const originalSend = process.send;
let capturedCurrent = null;
// Failed IPC sends without a callback surface as an async 'error' event on
// process; the fixture must survive them to keep its inspector alive.
process.on("error", (err) => {
  reply({ evt: "process-error", code: err && err.code ? err.code : null });
});
function reply(evt) {
  try { process.stderr.write(JSON.stringify(evt) + "\\n"); } catch (e) {}
}
reply({
  evt: "info",
  pid: process.pid,
  inspectorUrl: inspector.url(),
  script: __filename,
  hasOriginalSend: typeof originalSend === "function",
});
process.on("message", (msg) => {
  if (!msg || typeof msg.cmd !== "string") return;
  switch (msg.cmd) {
    case "send": {
      try {
        if (msg.withCallback) {
          const returned = process.send(msg.envelope, (err) => {
            reply({ evt: "callback", errorCode: err && err.code ? err.code : null });
          });
          if (msg.report) reply({ evt: "returned", value: returned === true });
        } else {
          const returned = process.send(msg.envelope);
          if (msg.report) reply({ evt: "returned", value: returned === true });
        }
      } catch (err) {
        reply({ evt: "threw", code: err && err.code ? err.code : (err && err.name) || "Error" });
      }
      break;
    }
    case "owner-marker":
      reply({
        evt: "owner-marker",
        isOriginal: process.send === originalSend,
        marker: (typeof process.send === "function" && process.send.__poracodeIpcProbeOwner) || null,
      });
      break;
    case "wrap-current": {
      capturedCurrent = process.send;
      const layer = function foreignLayer() { return capturedCurrent.apply(this, arguments); };
      layer.__fixtureForeign = true;
      process.send = layer;
      reply({ evt: "wrapped" });
      break;
    }
    case "unwrap-foreign":
      if (capturedCurrent) {
        process.send = capturedCurrent;
        capturedCurrent = null;
      }
      reply({ evt: "unwrapped" });
      break;
    case "close-and-send": {
      // Once the channel is closed the parent cannot command this child via
      // IPC anymore, so the send attempt happens right here, synchronously
      // after the disconnect, while stderr is still writable. Node answers a
      // closed channel with a false return, not a throw.
      reply({ evt: "closing" });
      process.disconnect();
      try {
        const returned = process.send(msg.envelope);
        reply({ evt: "send-after-close", returned: returned === false });
      } catch (err) {
        reply({ evt: "threw", code: err && err.code ? err.code : (err && err.name) || "Error" });
      }
      break;
    }
    case "send-bigint": {
      // A BigInt cannot cross the parent's own IPC serialization, so the
      // unserializable frame is constructed here. JSON-serialized IPC answers
      // it with a synchronous TypeError from the original send.
      try {
        process.send({ version: 13, kind: "supervisor-event", event: { type: "thread-state", threadId: "t1" }, tail: 1n });
        reply({ evt: "bigint-no-throw" });
      } catch (err) {
        reply({ evt: "threw", code: err && err.code ? err.code : (err && err.constructor && err.constructor.name) || "Error" });
      }
      break;
    }
    case "exit":
      process.exit(0);
      break;
  }
});
setInterval(() => {}, 1000);
`;

async function startFixture(t) {
  await mkdir(scratchRoot, { recursive: true });
  const dir = await mkdtemp(join(scratchRoot, "fixture-"));
  const scriptPath = join(dir, "fixture.cjs");
  await writeFile(scriptPath, FIXTURE_SOURCE);
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, ["--inspect=127.0.0.1:0", scriptPath], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  // IPC send failures after a closed channel must never crash the test runner.
  child.on("error", () => {});
  const queue = [];
  let waiters = [];
  let buffered = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    buffered += chunk;
    for (;;) {
      const newlineAt = buffered.indexOf("\n");
      if (newlineAt < 0) break;
      const line = buffered.slice(0, newlineAt);
      buffered = buffered.slice(newlineAt + 1);
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed.evt === "string") {
          queue.push(parsed);
          // Drop waiters that consumed their event (true); keep pending ones.
          waiters = waiters.filter((waiter) => !waiter());
        }
      } catch {
        if (process.env.PROBE_TEST_DEBUG === "1")
          console.error(`[fixture-stderr-raw] ${line.slice(0, 120)}`);
        // Inspector banners and other non-JSON stderr output are ignored.
      }
    }
  });
  const waitFor = (name, timeoutMs = 8000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters = waiters.filter((candidate) => candidate !== attempt);
        reject(new Error(`fixture never emitted ${name}`));
      }, timeoutMs);
      const attempt = () => {
        const index = queue.findIndex((entry) => entry.evt === name);
        if (index >= 0) {
          clearTimeout(timer);
          resolve(queue.splice(index, 1)[0]);
          return true;
        }
        return false;
      };
      waiters.push(attempt);
      attempt();
    });
  const command = (msg) => {
    if (child.connected) child.send(msg);
  };
  t.after(async () => {
    command({ cmd: "exit" });
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    child.stderr.destroy();
    await rm(dir, { recursive: true, force: true });
  });
  const info = await waitFor("info");
  assert.equal(info.pid, child.pid);
  assert.equal(typeof info.inspectorUrl, "string");
  assert.ok(info.inspectorUrl.startsWith("ws://127.0.0.1:"));
  assert.equal(info.hasOriginalSend, true);
  return { child, info, waitFor, command, scriptPath };
}

function supervisorEnvelope(event) {
  return { version: 13, kind: "supervisor-event", event };
}

async function expectProbeError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ProbeError, `expected ProbeError, got ${error?.constructor?.name}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ProbeError with code ${code}`);
}

async function sendEnvelope(fixture, envelope, extra = {}) {
  fixture.command({ cmd: "send", envelope, report: true, ...extra });
  return fixture.waitFor("returned");
}

test("install refuses on PID mismatch and installs nothing", async (t) => {
  const fixture = await startFixture(t);
  await expectProbeError(
    installProbe(fixture.info.inspectorUrl, {
      expectedPid: fixture.child.pid + 1,
      expectedScriptPath: fixture.scriptPath,
    }),
    "pid-mismatch",
  );
  assert.equal(
    await getProbeSnapshot(fixture.info.inspectorUrl, {
      expectedPid: fixture.child.pid,
      expectedScriptPath: fixture.scriptPath,
    }),
    null,
  );
  fixture.command({ cmd: "owner-marker" });
  const marker = await fixture.waitFor("owner-marker");
  assert.equal(marker.isOriginal, true);
  assert.equal(marker.marker, null);
});

test("install refuses on entry script mismatch and installs nothing", async (t) => {
  const fixture = await startFixture(t);
  await expectProbeError(
    installProbe(fixture.info.inspectorUrl, {
      expectedPid: fixture.child.pid,
      expectedScriptPath: join(fixture.scriptPath, "..", "not-the-entry.cjs"),
    }),
    "entry-script-mismatch",
  );
  fixture.command({ cmd: "owner-marker" });
  const marker = await fixture.waitFor("owner-marker");
  assert.equal(marker.isOriginal, true);
});

test("install requires an IPC channel", async (t) => {
  await mkdir(scratchRoot, { recursive: true });
  const dir = await mkdtemp(join(scratchRoot, "noipc-"));
  const scriptPath = join(dir, "no-ipc.cjs");
  await writeFile(scriptPath, "setInterval(() => {}, 1000);\n");
  const { spawn } = await import("node:child_process");
  // No ipc stdio: this child has no process.send at all. Its inspector URL is
  // taken from the --inspect banner on stderr.
  const child = spawn(process.execPath, ["--inspect=127.0.0.1:0", scriptPath], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await rm(dir, { recursive: true, force: true });
  });
  const inspectorUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no inspector banner")), 8000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      const match = String(chunk).match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  await expectProbeError(
    installProbe(inspectorUrl, { expectedPid: child.pid, expectedScriptPath: scriptPath }),
    "no-ipc-channel",
  );
});

test("bulk, control, mixed, and non-supervisor frames are counted exactly with byte attribution", async (t) => {
  const fixture = await startFixture(t);
  const options = { expectedPid: fixture.child.pid, expectedScriptPath: fixture.scriptPath };
  const installed = await installProbe(fixture.info.inspectorUrl, options);
  assert.equal(installed.status, "installed");
  assert.equal(installed.schema, SNAPSHOT_SCHEMA);

  const envelopes = [
    supervisorEnvelope({
      type: "thread-output",
      threadId: "t1",
      data: "hello",
      outputLength: 5,
      terminalInstanceId: "term-1",
    }),
    supervisorEnvelope({
      type: "thread-output",
      threadId: "t1",
      data: "",
      outputLength: 0,
      terminalInstanceId: "term-1",
    }),
    supervisorEnvelope({
      type: "thread-runtime-event",
      threadId: "t1",
      event: { type: "content.delta", delta: "x" },
    }),
    supervisorEnvelope({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [{ type: "content.delta", delta: "y" }, { type: "state.changed" }],
    }),
    supervisorEnvelope({
      type: "thread-runtime-events-multi",
      batches: [
        { threadId: "t1", events: [{ type: "item.started", itemType: "tool" }] },
        { threadId: "t2", events: [{ type: "state.changed" }] },
      ],
    }),
    supervisorEnvelope({
      type: "thread-state",
      threadId: "t1",
      status: "running",
      attention: { level: "none" },
      canResumeWithConfig: false,
    }),
    // Targeted per-window fallback copy of bulk: still bulk content.
    {
      version: 13,
      kind: "supervisor-event",
      event: {
        type: "thread-output",
        threadId: "t1",
        data: "targeted",
        outputLength: 8,
        terminalInstanceId: "term-1",
      },
      rendererSequence: 77,
      target: { windowId: 7, generation: 1 },
    },
    // Generation-fenced recovery barrier: recovery control traffic, never bulk.
    {
      version: 13,
      kind: "renderer-stream-recovery",
      windowId: 7,
      generation: 1,
      fromSequence: 3,
      toSequence: 9,
      threadIds: ["t1"],
    },
    { version: 13, kind: "reply", replyTo: "req-1", ok: true, data: null },
    supervisorEnvelope({
      type: "thread-runtime-events-multi",
      batches: [{ threadId: "t1", events: "malformed" }],
    }),
  ];
  const bytes = envelopes.map((envelope) => Buffer.byteLength(JSON.stringify(envelope)));

  // Real wire cross-check: attach the parent-side message counter BEFORE the
  // sends so every frame that clears the channel is observed arriving here.
  let receivedAtParent = 0;
  const onMessage = () => {
    receivedAtParent += 1;
  };
  fixture.child.on("message", onMessage);

  for (const envelope of envelopes) {
    fixture.command({ cmd: "send", envelope, report: true });
    await fixture.waitFor("returned");
  }
  await new Promise((resolve) => setImmediate(resolve));
  fixture.child.off("message", onMessage);
  assert.equal(receivedAtParent, 10, "every attempt must arrive at the peer exactly once");

  const snapshot = await getProbeSnapshot(fixture.info.inspectorUrl, options);
  assert.equal(snapshot.status, "present");
  assert.equal(snapshot.wrapperOwned, true);
  const counters = snapshot.counters;
  assert.equal(counters.attempts, 10);
  assert.equal(counters.sendTrue, 10);
  assert.equal(counters.sendFalse, 0);
  assert.equal(counters.sendThrew, 0);
  assert.equal(counters.supervisorEnvelopes, 8);
  assert.equal(counters.bulkEnvelopes, 3);
  assert.equal(counters.targetedEnvelopes, 1);
  assert.equal(counters.recoveryBarriers, 1);
  assert.equal(counters.controlEnvelopes, 2);
  assert.equal(counters.mixedEnvelopes, 2);
  assert.equal(counters.unclassifiedEnvelopes, 1);
  assert.equal(counters.nonSupervisorMessages, 1);
  assert.equal(counters.bulkThreadOutput, 2);
  assert.equal(counters.bulkThreadOutputEmpty, 1);
  assert.equal(counters.bulkRuntimeItems, 3);
  assert.equal(counters.controlRuntimeItems, 2);
  assert.equal(counters.accountingErrors, 1);
  // Bytes are measured by re-serializing each frame at the send boundary, so
  // they must match the sender's own JSON encoding exactly. The targeted
  // bulk copy (6) counts as bulk bytes; the recovery barrier (7) and the
  // reply (8) are non-supervisor bytes.
  assert.equal(
    counters.jsonBytesTotal,
    bytes[0] + bytes[1] + bytes[2] + bytes[3] + bytes[4] + bytes[5] + bytes[6] + bytes[9],
  );
  assert.equal(counters.jsonBytesBulkEnvelopes, bytes[0] + bytes[2] + bytes[6]);
  assert.equal(counters.jsonBytesControlEnvelopes, bytes[1] + bytes[5]);
  assert.equal(counters.jsonBytesMixedEnvelopes, bytes[3] + bytes[4]);
  assert.equal(counters.jsonBytesNonSupervisor, bytes[7] + bytes[8]);

  // Draining check on a fresh window: reset must zero counters and keep meta.
  const reset = await resetProbe(fixture.info.inspectorUrl, options);
  assert.equal(reset.status, "reset");
  assert.equal(reset.before.attempts, 10);
  assert.equal(reset.before.jsonBytesTotal, counters.jsonBytesTotal);
  assert.equal(reset.after.attempts, 0);
  assert.equal(reset.after.jsonBytesTotal, 0);
  assert.equal(reset.installedAtEpochMs, snapshot.installedAtEpochMs);
  const afterReset = await getProbeSnapshot(fixture.info.inspectorUrl, options);
  assert.equal(afterReset.counters.attempts, 0);
});

test("callback, return value, and thrown error fidelity are preserved", async (t) => {
  const fixture = await startFixture(t);
  const options = { expectedPid: fixture.child.pid, expectedScriptPath: fixture.scriptPath };
  await installProbe(fixture.info.inspectorUrl, options);

  // Return value + callback: a real IPC callback fires once the frame flushes.
  const bulk = supervisorEnvelope({
    type: "thread-output",
    threadId: "t1",
    data: "abc",
    outputLength: 3,
    terminalInstanceId: "term-1",
  });
  fixture.command({ cmd: "send", envelope: bulk, report: true, withCallback: true });
  const returned = await fixture.waitFor("returned");
  assert.equal(returned.value, true);
  const callback = await fixture.waitFor("callback");
  assert.equal(callback.errorCode, null);

  let snapshot = await getProbeSnapshot(fixture.info.inspectorUrl, options);
  assert.equal(snapshot.counters.attempts, 1);
  assert.equal(snapshot.counters.sendTrue, 1);
  assert.equal(snapshot.counters.callsWithCallback, 1);
  assert.equal(snapshot.counters.sendThrew, 0);

  // Thrown error: an unserializable frame makes the original send throw
  // synchronously; the wrapper must rethrow the same failure unchanged and
  // record the byte-measurement miss as an accounting error.
  fixture.command({ cmd: "send-bigint" });
  const threw = await fixture.waitFor("threw");
  assert.equal(threw.code, "TypeError");

  snapshot = await getProbeSnapshot(fixture.info.inspectorUrl, options);
  assert.equal(snapshot.counters.attempts, 2);
  assert.equal(snapshot.counters.sendTrue, 1);
  assert.equal(snapshot.counters.sendThrew, 1);
  assert.equal(snapshot.counters.accountingErrors, 1);
  assert.equal(snapshot.counters.supervisorEnvelopes, 2);

  // Closed channel: Node answers with a false return or a synchronous throw
  // depending on how far the channel teardown has progressed; whichever
  // occurs, the wrapper must forward it unchanged and count exactly one
  // not-queued attempt.
  fixture.command({ cmd: "close-and-send", envelope: bulk });
  await fixture.waitFor("closing");
  const returnedPromise = fixture.waitFor("send-after-close", 4000);
  const threwPromise = fixture.waitFor("threw", 4000);
  returnedPromise.catch(() => {});
  threwPromise.catch(() => {});
  const closed = await Promise.any([
    returnedPromise.then((event) => ({ kind: "returned", value: event.returned })),
    threwPromise.then((event) => ({ kind: "threw", code: event.code })),
  ]);
  assert.ok(
    (closed.kind === "returned" && closed.value === true) ||
      (closed.kind === "threw" && closed.code === "ERR_IPC_CHANNEL_CLOSED"),
    `unexpected closed-channel outcome: ${JSON.stringify(closed)}`,
  );

  snapshot = await getProbeSnapshot(fixture.info.inspectorUrl, options);
  assert.equal(snapshot.counters.attempts, 3);
  assert.equal(snapshot.counters.sendTrue, 1);
  assert.equal(snapshot.counters.sendFalse + snapshot.counters.sendThrew, 2);
});

test("state stays bounded and no payload text is retained", async (t) => {
  const fixture = await startFixture(t);
  const options = { expectedPid: fixture.child.pid, expectedScriptPath: fixture.scriptPath };
  await installProbe(fixture.info.inspectorUrl, options);

  const canary = "PROBE-LEAK-CANARY-7f3a91";
  const envelope = supervisorEnvelope({
    type: "thread-output",
    threadId: "t1",
    data: `${"x".repeat(8192)}${canary}`,
    outputLength: 8192 + canary.length,
    terminalInstanceId: "term-1",
  });
  for (let i = 0; i < 200; i++) {
    const returned = await sendEnvelope(fixture, envelope);
    assert.equal(returned.value, true);
  }
  const snapshot = await getProbeSnapshot(fixture.info.inspectorUrl, options);
  assert.equal(snapshot.counters.attempts, 200);
  assert.equal(snapshot.counters.bulkThreadOutput, 200);
  assert.equal(snapshot.counters.accountingErrors, 0);

  const serialized = JSON.stringify(snapshot);
  assert.ok(serialized.length < 4096, `snapshot must stay bounded, was ${serialized.length} chars`);
  assert.ok(!serialized.includes(canary), "snapshot must not retain payload text");
  for (const value of Object.values(snapshot.counters)) {
    assert.equal(typeof value, "number");
    assert.ok(Number.isFinite(value));
  }
});

test("uninstall restores the original send and is a safe no-op afterwards", async (t) => {
  const fixture = await startFixture(t);
  const options = { expectedPid: fixture.child.pid, expectedScriptPath: fixture.scriptPath };
  await installProbe(fixture.info.inspectorUrl, options);
  const uninstalled = await uninstallProbe(fixture.info.inspectorUrl, options);
  assert.equal(uninstalled.uninstalled, true);
  assert.equal(uninstalled.finalCounters.attempts, 0);

  fixture.command({ cmd: "owner-marker" });
  const marker = await fixture.waitFor("owner-marker");
  assert.equal(marker.isOriginal, true);
  assert.equal(marker.marker, null);

  assert.equal(await getProbeSnapshot(fixture.info.inspectorUrl, options), null);
  const again = await uninstallProbe(fixture.info.inspectorUrl, options);
  assert.equal(again.uninstalled, false);
  assert.equal(again.reason, "not-installed");
});

test("uninstall refuses to restore under a foreign wrapper and stays consistent", async (t) => {
  const fixture = await startFixture(t);
  const options = { expectedPid: fixture.child.pid, expectedScriptPath: fixture.scriptPath };
  await installProbe(fixture.info.inspectorUrl, options);

  // A third-party wrapper layered on top of the probe (capturing the probe's
  // wrapper as its original, as a real late wrapper would).
  fixture.command({ cmd: "wrap-current" });
  await fixture.waitFor("wrapped");

  const refused = await uninstallProbe(fixture.info.inspectorUrl, options);
  assert.equal(refused.uninstalled, false);
  assert.equal(refused.reason, "foreign-wrapper");

  // The probe state stays intact and the chain still counts through it.
  await sendEnvelope(
    fixture,
    supervisorEnvelope({
      type: "thread-state",
      threadId: "t1",
      status: "running",
      attention: { level: "none" },
      canResumeWithConfig: false,
    }),
  );
  const snapshot = await getProbeSnapshot(fixture.info.inspectorUrl, options);
  assert.equal(snapshot.counters.attempts, 1);
  assert.equal(snapshot.wrapperOwned, false);

  // Once the foreign layer unwinds itself, uninstall fully restores the true
  // original.
  fixture.command({ cmd: "unwrap-foreign" });
  await fixture.waitFor("unwrapped");
  const done = await uninstallProbe(fixture.info.inspectorUrl, options);
  assert.equal(done.uninstalled, true);
  fixture.command({ cmd: "owner-marker" });
  const marker = await fixture.waitFor("owner-marker");
  assert.equal(marker.isOriginal, true);
});

test("installing twice is idempotent and preserves the probe id and counters", async (t) => {
  const fixture = await startFixture(t);
  const options = { expectedPid: fixture.child.pid, expectedScriptPath: fixture.scriptPath };
  const first = await installProbe(fixture.info.inspectorUrl, options);
  await sendEnvelope(
    fixture,
    supervisorEnvelope({
      type: "thread-output",
      threadId: "t1",
      data: "abc",
      outputLength: 3,
      terminalInstanceId: "term-1",
    }),
  );
  const second = await installProbe(fixture.info.inspectorUrl, options);
  assert.equal(second.status, "already-installed");
  assert.equal(second.probeId, first.probeId);
  assert.equal(second.counters.attempts, 1);
  assert.equal(second.wrapperOwned, true);
});

test("a suspended target times out and later calls recover on a fresh connection", async (t) => {
  const fixture = await startFixture(t);
  const options = { expectedPid: fixture.child.pid, expectedScriptPath: fixture.scriptPath };
  await installProbe(fixture.info.inspectorUrl, options);
  const sent = await sendEnvelope(
    fixture,
    supervisorEnvelope({
      type: "thread-state",
      threadId: "t1",
      status: "running",
      attention: { level: "none" },
      canResumeWithConfig: false,
    }),
  );
  assert.equal(sent.value, true);

  // SIGSTOP suspends every thread, including the inspector's, so the ws
  // handshake cannot complete. (A plain JS busy loop does NOT stall the
  // inspector: V8 services inspector interrupts between bytecodes.)
  fixture.child.kill("SIGSTOP");
  const startedAt = Date.now();
  let stallError = null;
  try {
    await getProbeSnapshot(fixture.info.inspectorUrl, {
      ...options,
      commandTimeoutMs: 400,
      connectTimeoutMs: 400,
    });
  } catch (error) {
    stallError = error;
  } finally {
    fixture.child.kill("SIGCONT");
  }
  assert.ok(stallError instanceof ProbeError, "expected a ProbeError against the suspended target");
  assert.ok(
    stallError.code === "command-timeout" || stallError.code === "connect-timeout",
    `unexpected code ${stallError.code}`,
  );
  assert.ok(Date.now() - startedAt < 2000, "timeout must fire promptly");

  const snapshot = await getProbeSnapshot(fixture.info.inspectorUrl, options);
  assert.equal(snapshot.counters.attempts, 1);
});

test("peer death while a capture is open rejects promptly instead of hanging", async (t) => {
  const fixture = await startFixture(t);
  const options = { expectedPid: fixture.child.pid, expectedScriptPath: fixture.scriptPath };
  const capturePromise = captureProbe(fixture.info.inspectorUrl, {
    ...options,
    durationMs: 5000,
    resetBefore: true,
    commandTimeoutMs: 2000,
    connectTimeoutMs: 2000,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  fixture.child.kill("SIGKILL");
  const startedAt = Date.now();
  await expectProbeError(capturePromise, "connection-closed");
  assert.ok(Date.now() - startedAt < 4000, "capture must reject promptly after peer death");
});

test("CLI install/get/reset/uninstall work across separate processes and validate arguments", async (t) => {
  const fixture = await startFixture(t);
  const cli = fileURLToPath(new URL("./poracode-ipc-probe.mjs", import.meta.url));
  const base = [
    "--url",
    fixture.info.inspectorUrl,
    "--expect-pid",
    String(fixture.child.pid),
    "--expect-script",
    fixture.scriptPath,
  ];

  const installed = JSON.parse(
    (await execFileAsync(process.execPath, [cli, "install", ...base], { timeout: 15_000 })).stdout,
  );
  assert.equal(installed.status, "installed");
  assert.equal(installed.snapshot.wrapperOwned, true);
  const probeId = installed.probeId;

  await sendEnvelope(
    fixture,
    supervisorEnvelope({
      type: "thread-output",
      threadId: "t1",
      data: "cli",
      outputLength: 3,
      terminalInstanceId: "term-1",
    }),
  );
  const got = JSON.parse(
    (await execFileAsync(process.execPath, [cli, "get", ...base], { timeout: 15_000 })).stdout,
  );
  assert.equal(got.status, "present");
  assert.equal(got.probeId, probeId);
  assert.equal(got.snapshot.counters.attempts, 1);

  const reset = JSON.parse(
    (await execFileAsync(process.execPath, [cli, "reset", ...base], { timeout: 15_000 })).stdout,
  );
  assert.equal(reset.before.attempts, 1);
  assert.equal(reset.after.attempts, 0);

  const mismatch = await execFileAsync(
    process.execPath,
    [cli, "get", ...base, "--probe-id", "not-the-probe"],
    { timeout: 15_000 },
  ).catch((error) => error);
  assert.equal(mismatch.code, 1);
  assert.equal(JSON.parse(mismatch.stderr).error, "probe-id-mismatch");

  const uninstalled = JSON.parse(
    (await execFileAsync(process.execPath, [cli, "uninstall", ...base], { timeout: 15_000 }))
      .stdout,
  );
  assert.equal(uninstalled.uninstalled, true);

  // Usage and validation errors exit 2 without touching the network.
  const cases = [
    [[cli, "install", "--expect-pid", "1", "--expect-script", fixture.scriptPath], "bad-url"],
    [
      [
        cli,
        "install",
        "--url",
        "ws://10.1.2.3:9229/abc",
        "--expect-pid",
        "1",
        "--expect-script",
        fixture.scriptPath,
      ],
      "non-loopback-host",
    ],
    [
      [
        cli,
        "install",
        "--url",
        "wss://127.0.0.1:9229/abc",
        "--expect-pid",
        "1",
        "--expect-script",
        fixture.scriptPath,
      ],
      "bad-url-scheme",
    ],
    [
      [
        cli,
        "install",
        "--url",
        "ws://127.0.0.1:9229",
        "--expect-pid",
        "1",
        "--expect-script",
        fixture.scriptPath,
      ],
      "bad-url",
    ],
    [
      [
        cli,
        "install",
        "--url",
        fixture.info.inspectorUrl,
        "--expect-pid",
        "abc",
        "--expect-script",
        fixture.scriptPath,
      ],
      "bad-expect-pid",
    ],
    [
      [
        cli,
        "install",
        "--url",
        fixture.info.inspectorUrl,
        "--expect-pid",
        "1",
        "--expect-script",
        "relative/path.cjs",
      ],
      "bad-expect-script",
    ],
    [[cli, "nonsense"], "usage"],
  ];
  for (const [args, code] of cases) {
    const failed = await execFileAsync(process.execPath, args, { timeout: 15_000 }).catch(
      (error) => error,
    );
    assert.equal(failed.code, 2, `expected exit 2 for ${JSON.stringify(args[2])}`);
    assert.equal(JSON.parse(failed.stderr).error, code);
  }
});

test("captureProbe performs a bounded in-process window end to end", async (t) => {
  const fixture = await startFixture(t);
  const options = { expectedPid: fixture.child.pid, expectedScriptPath: fixture.scriptPath };
  const capturePromise = captureProbe(fixture.info.inspectorUrl, {
    ...options,
    durationMs: 700,
    resetBefore: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  await sendEnvelope(
    fixture,
    supervisorEnvelope({
      type: "thread-output",
      threadId: "t1",
      data: "win",
      outputLength: 3,
      terminalInstanceId: "term-1",
    }),
  );
  await sendEnvelope(
    fixture,
    supervisorEnvelope({
      type: "thread-state",
      threadId: "t1",
      status: "running",
      attention: { level: "none" },
      canResumeWithConfig: false,
    }),
  );
  const result = await capturePromise;
  assert.equal(result.status, "ok");
  assert.equal(result.installed.status, "installed");
  assert.equal(result.snapshot.counters.attempts, 2);
  assert.equal(result.snapshot.counters.bulkEnvelopes, 1);
  assert.equal(result.snapshot.counters.controlEnvelopes, 1);
  assert.equal(result.uninstalled.uninstalled, true);
  assert.equal(await getProbeSnapshot(fixture.info.inspectorUrl, options), null);
});

test("probe URL validation only accepts loopback ws endpoints with an id path", () => {
  assert.doesNotThrow(() =>
    validateProbeUrl("ws://127.0.0.1:9229/166e272e-8a46-4a3e-a1d2-3f4b5c6d7e8f"),
  );
  assert.doesNotThrow(() => validateProbeUrl("ws://localhost:3211/id"));
  assert.doesNotThrow(() => validateProbeUrl("ws://[::1]:9229/id"));
  assert.throws(() => validateProbeUrl("http://127.0.0.1:9229/id"), /ws: scheme/);
  assert.throws(() => validateProbeUrl("ws://example.com:9229/id"), /non-loopback/);
  assert.throws(() => validateProbeUrl("ws://10.0.0.1:9229/id"), /non-loopback/);
  assert.throws(() => validateProbeUrl("ws://127.0.0.1:9229/"), /target id path/);
  assert.throws(() => validateProbeUrl("ws://user:pass@127.0.0.1:9229/id"), /credentials/);
  assert.throws(() => validateProbeUrl("not a url"), /valid URL/);
});
