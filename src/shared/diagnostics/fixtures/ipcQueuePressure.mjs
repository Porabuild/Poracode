// Bundle this fixture with tsdown --no-config before running it. All state is
// synthetic and lives beneath the supplied scratch directory. This verifies
// measurement under real IPC pressure, not application latency or throughput.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { SupervisorIpcSender } from "../../../supervisor/supervisorIpcSender.ts";
import { startNodePerformanceDiagnostics } from "../nodePerformanceDiagnostics.ts";

const messageCount = 128;
const privateFixture = "synthetic-message-must-not-be-recorded";

if (process.argv[2] === "child") {
  const releasePath = join(process.argv[3], "release");
  let received = 0;
  process.on("message", (message) => {
    if (message.kind === "payload") {
      received++;
      if (received === messageCount) process.send({ kind: "received", count: received });
    } else if (message.kind === "finish") process.disconnect();
  });
  process.send({ kind: "ready" }, () => {
    // Hold the receiver's event loop behind a parent-controlled, bounded gate.
    // IPC socket closure/ACK semantics are otherwise the actual Node implementation.
    const deadline = performance.now() + 6_000;
    const waitCell = new Int32Array(new SharedArrayBuffer(4));
    while (!existsSync(releasePath)) {
      if (performance.now() > deadline) throw new Error("Fixture release timed out.");
      Atomics.wait(waitCell, 0, 0, 10);
    }
  });
} else {
  assert(process.argv[2], "Expected an existing scratch output directory.");
  const root = await mkdtemp(join(resolve(process.argv[2]), "ipc-pressure-"));
  const child = fork(fileURLToPath(import.meta.url), ["child", root], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    execArgv: [],
  });
  const ready = Promise.withResolvers();
  const received = Promise.withResolvers();
  const closed = Promise.withResolvers();
  let exitObserved = false;
  let childError = "";
  child.stderr.on("data", (value) => {
    childError = `${childError}${value}`.slice(-4096);
  });
  child.once("close", (code, signal) => {
    exitObserved = true;
    closed.resolve({ code, signal });
    ready.reject(new Error("Fixture child exited before readiness."));
    received.reject(new Error("Fixture child exited before receiving all messages."));
  });
  child.once("error", (error) => {
    ready.reject(error);
    received.reject(error);
  });
  child.on("message", (message) => {
    if (message.kind === "ready") ready.resolve();
    if (message.kind === "received") received.resolve(message.count);
  });
  void ready.promise.catch(() => {});
  void received.promise.catch(() => {});
  const deadline = setTimeout(() => {
    ready.reject(new Error("Fixture readiness deadline."));
    received.reject(new Error("Fixture delivery deadline."));
    if (!exitObserved) child.kill("SIGKILL");
  }, 8_000);
  const recorder = startNodePerformanceDiagnostics("backend", {
    PORACODE_PERF_OUTPUT_DIR: root,
    PORACODE_PERF_INTERVAL_MS: "100",
  });
  assert(recorder);
  const errors = [];
  const sender = new SupervisorIpcSender({
    queueDiagnostics: recorder.queueCapture,
    backpressureTimeoutMs: null,
    send: (message, callback) => child.send(message, callback),
    onError: (error) => errors.push(error.message),
  });
  recorder.observeIpcQueue("backend-to-main", () => sender.getQueueDiagnostics());
  let held;
  let after;
  let exit;
  try {
    await ready.promise;
    for (let index = 0; index < messageCount; index++) {
      sender.sendMessage({ kind: "payload", index, data: `${privateFixture}${"🧪".repeat(8192)}` });
    }
    await delay(250);
    held = sender.getQueueDiagnostics();
    assert(held.waitingMessages > 0);
    assert(held.waitingEstimatedBytes > 0);
    assert(held.oldestQueuedMessageAgeMs >= 200);
    assert.equal(held.backpressured, true);
    await writeFile(join(root, "release"), "released", { flag: "wx" });
    assert.equal(await received.promise, messageCount);
    assert.equal(await sender.flushAndWait(3_000), true);
    after = sender.getQueueDiagnostics();
    assert.equal(after.waitingMessages, 0);
    assert.equal(after.inFlightMessages, 0);
    assert.equal(after.sendAttempts, messageCount);
    child.send({ kind: "finish" });
    exit = await closed.promise;
    assert.equal(exit.code, 0, childError);
    assert.equal(exit.signal, null);
    assert.deepEqual(errors, []);
  } finally {
    clearTimeout(deadline);
    if (!exitObserved) child.kill("SIGKILL");
    await closed.promise;
    await recorder.stop();
  }
  const file = (await readdir(root)).find((name) => name.endsWith(".ndjson"));
  assert(file);
  const text = await readFile(join(root, file), "utf8");
  const records = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(records[0].formatVersion, 2);
  assert.equal(records.at(-1).complete, true);
  assert.equal(records.at(-1).beforeFinal.droppedRecords, 0);
  assert.equal(text.includes(privateFixture), false);
  assert(
    records.some(
      (record) =>
        record.kind === "sample" &&
        record.ipcQueues.queues.some(
          (queue) => queue.status === "observed" && queue.sample.waitingMessages > 0,
        ),
    ),
  );
  process.stdout.write(
    `${JSON.stringify({
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron ?? null,
      fixtureRoot: root,
      childPid: child.pid,
      exit,
      held,
      after,
      records: records.length,
      end: records.at(-1),
      payloadRecorded: false,
    })}\n`,
  );
}
