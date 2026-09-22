/**
 * Test-only fixture used by the SSH bootstrap suites.
 *
 * It emulates the three observable pieces of a remote owner: the authenticated
 * `status --json` host-control client, the `pair --json` CLI, and a helper
 * server exposing `/.well-known/poracode/environment` that can hold a data-root
 * lease and drain slowly on SIGTERM. Because it is run by the generated shell
 * scripts as `server.cjs`, the suites exercise the real scripts end to end
 * instead of mocking the script text.
 */
export const SSH_FIXTURE_SERVER_SOURCE = String.raw`"use strict";
const http = require("node:http");
const fs = require("node:fs");

const args = process.argv.slice(2);
const statusFile = process.env.PORACODE_FIXTURE_STATUS_FILE;
const generation = process.env.PORACODE_FIXTURE_GENERATION || "";

// Status failure/hang can be scoped to one runtime hash, so a test can make
// the recorded (old) runtime unauthenticated while the replacement owner's
// status still answers.
const statusScopeHash = process.env.PORACODE_FIXTURE_STATUS_SCOPE_HASH;
function statusScopeMatches() {
  if (!statusScopeHash) return true;
  const match = /\/runtime\/([0-9a-f]+)\/server\.cjs$/u.exec(process.argv[1] || "");
  return Boolean(match && match[1] === statusScopeHash);
}

function statusPayload() {
  if (statusScopeMatches()) {
    if (process.env.PORACODE_FIXTURE_STATUS_EXIT) process.exit(Number(process.env.PORACODE_FIXTURE_STATUS_EXIT));
    // Emulates a wedged old runtime: the caller's bounded status run must kill
    // this process instead of stalling the launch.
    const hangMs = Number(process.env.PORACODE_FIXTURE_STATUS_HANG_MS || "0");
    if (hangMs > 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, hangMs);
    }
  }
  if (!statusFile || !fs.existsSync(statusFile)) process.exit(1);
  let live = null;
  try { live = JSON.parse(fs.readFileSync(statusFile, "utf8")); } catch { live = null; }
  if (!live) process.exit(1);
  const base = process.env.PORACODE_BASE_DIR || "";
  const protocol = Number(process.env.PORACODE_FIXTURE_PROTOCOL || "12");
  process.stdout.write(JSON.stringify({
    requestId: "00000000-0000-4000-8000-000000000000",
    ownerGeneration: live.generation || generation,
    description: {
      profileNamespace: base,
      dataRoot: base + ".host-v1",
      mode: "headless",
      state: "ready",
      operations: ["describe", "issue-pairing"],
      capabilities: { ssh: false },
      remoteProtocolVersion: protocol,
      endpoint: "http://127.0.0.1:" + live.port + "/",
    },
  }) + "\n");
  process.exit(0);
}

if (args[0] === "status") {
  statusPayload();
}
if (args[0] === "pair") {
  process.stdout.write(JSON.stringify({ pairingUrl: "poracode://pair?token=lc_pair_fixture" }) + "\n");
  process.exit(0);
}

const logPath = process.env.PORACODE_FIXTURE_LOG;
function log(line) {
  if (logPath) fs.appendFileSync(logPath, line + "\n");
}
// Owners started by the launch script are detached, so the harness keeps a
// guard file in its temp home; removing it (including after failed assertions)
// ends the fixture instead of leaking a process.
const lifetimeGuard = process.env.PORACODE_FIXTURE_LIFETIME_GUARD;
if (lifetimeGuard) {
  setInterval(() => {
    if (!fs.existsSync(lifetimeGuard)) process.exit(0);
  }, 300);
}
const leasePath = process.env.PORACODE_FIXTURE_LEASE_PATH;
const port = Number(process.env.PORACODE_REMOTE_ACCESS_PORT || "0");
const protocol = Number(process.env.PORACODE_FIXTURE_PROTOCOL || "12");
if (leasePath && fs.existsSync(leasePath)) {
  process.stderr.write("Poracode already owns " + (process.env.PORACODE_BASE_DIR || "") + ".host-v1.\n");
  process.exit(3);
}
if (leasePath) fs.writeFileSync(leasePath, String(process.pid));

const server = http.createServer((req, res) => {
  if (req.url === "/.well-known/poracode/environment") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      protocolVersion: protocol,
      hostMode: "helper",
      desktopId: "fixture",
      label: "Fixture",
      appVersion: process.env.PORACODE_FIXTURE_APP_VERSION || "1.0.0",
      platform: "linux",
      auth: { policy: "remote-reachable", bootstrapMethods: ["one-time-token"], sessionMethods: ["bearer-access-token"], scopes: [] },
      endpoints: { httpBaseUrl: "http://127.0.0.1:" + port + "/", wsBaseUrl: "ws://127.0.0.1:" + port + "/" },
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const startDelay = Number(process.env.PORACODE_FIXTURE_START_DELAY_MS || "0");
const drainMs = Number(process.env.PORACODE_FIXTURE_DRAIN_MS || "0");
function stop() {
  log("stopping pid=" + process.pid);
  setTimeout(() => {
    const finish = () => {
      if (leasePath) { try { fs.unlinkSync(leasePath); } catch {} }
      if (statusFile) { try { fs.unlinkSync(statusFile); } catch {} }
      log("stopped pid=" + process.pid);
      process.exit(0);
    };
    server.close(finish);
    setTimeout(finish, 2000).unref();
  }, drainMs);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
setTimeout(() => {
  server.listen(port, "127.0.0.1", () => {
    if (statusFile) fs.writeFileSync(statusFile, JSON.stringify({ generation, port }));
    log("started pid=" + process.pid + " port=" + port);
  });
}, startDelay);
`;
