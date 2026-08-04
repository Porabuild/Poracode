#!/usr/bin/env node
// Starts the website dev server, first stopping any dev server left running for
// this same directory.
//
// Next 16 refuses to start a second dev server for one project dir ("Another
// next dev server is already running") and prints a `kill <pid>` hint. That
// check lives in the native SWC binary, so its lock file isn't readable from
// JS — instead we identify the stale server by process identity: a `next dev`
// process whose cwd is this website directory, plus whoever holds the port we
// want. Detection is best-effort; if anything here fails we just start Next and
// let it report the conflict itself.

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readlinkSync } from "node:fs";

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const isWindows = process.platform === "win32";

/** The port Next will try first: an explicit flag wins, then PORT, then 3000. */
function desiredPort() {
  const flag = argv.findIndex((a) => a === "--port" || a === "-p");
  if (flag !== -1 && argv[flag + 1]) return Number(argv[flag + 1]);
  const inline = argv.find((a) => a.startsWith("--port="));
  if (inline) return Number(inline.slice("--port=".length));
  if (process.env.PORT) return Number(process.env.PORT);
  return 3000;
}

function run(cmd, args) {
  const out = spawnSync(cmd, args, { encoding: "utf8" });
  return out.status === 0 && out.stdout ? out.stdout : "";
}

function listenersOnPort(port) {
  if (isWindows) {
    // `netstat -ano` prints "TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  1234".
    return run("netstat", ["-ano", "-p", "tcp"])
      .split(/\r?\n/)
      .filter((line) => line.includes("LISTENING") && line.includes(`:${port} `))
      .map((line) => Number(line.trim().split(/\s+/).at(-1)))
      .filter(Boolean);
  }
  return run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
    .split(/\s+/)
    .map(Number)
    .filter(Boolean);
}

/** pid -> command line for every running process, from a single sweep. */
function processTable() {
  if (isWindows) {
    const rows = run("powershell", [
      "-NoProfile",
      "-Command",
      'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }',
    ]);
    return new Map(
      rows
        .split(/\r?\n/)
        .map((line) => line.trim().match(/^(\d+) (.*)$/))
        .filter(Boolean)
        .map((match) => [Number(match[1]), match[2]]),
    );
  }
  return new Map(
    run("ps", ["-eo", "pid=,command="])
      .split(/\r?\n/)
      .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
      .filter(Boolean)
      .map((match) => [Number(match[1]), match[2]]),
  );
}

/** cwd of a pid. Unix only; the caller skips Windows. */
function cwdOf(pid) {
  if (process.platform === "linux") {
    try {
      return readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      return "";
    }
  }
  // macOS: `lsof -Fn` emits the cwd path on a line prefixed with "n".
  const line = run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
    .split(/\r?\n/)
    .find((l) => l.startsWith("n"));
  return line ? line.slice(1) : "";
}

const isNextDev = (cmd) => /next/.test(cmd) && /\bdev\b/.test(cmd);

/** `next dev` processes belonging to this website directory. */
function staleDevServers(table) {
  if (isWindows) return [];
  const found = new Set();
  for (const [pid, command] of table) {
    if (pid === process.pid || pid === process.ppid) continue;
    if (!isNextDev(command)) continue;
    if (cwdOf(pid) === WEBSITE_DIR) found.add(pid);
  }
  return [...found];
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Block the main thread briefly; this script must finish before Next starts. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sendSignal(pid, name) {
  try {
    process.kill(pid, name);
    return true;
  } catch {
    return false;
  }
}

/** Signal every target first, then wait on them together, so the 3s ceiling is
 *  for the whole set rather than per process. */
function stopAll(pids) {
  const pending = pids.filter((pid) => sendSignal(pid, isWindows ? "SIGKILL" : "SIGTERM"));
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && pending.some(alive)) sleepSync(100);
  for (const pid of pending.filter(alive)) sendSignal(pid, "SIGKILL");
}

const table = processTable();
const targets = new Set(staleDevServers(table));
// Whoever holds the port counts too, but only when it is our own dev server —
// never kill an unrelated process that happens to sit on 3000.
for (const pid of new Set(listenersOnPort(desiredPort()))) {
  if (pid !== process.pid && isNextDev(table.get(pid) ?? "")) targets.add(pid);
}

for (const pid of targets) console.log(`[dev] stopping previous website dev server (pid ${pid})`);
stopAll([...targets]);

// Invoke Next's bin through node rather than relying on PATH/.bin shims, the
// same way website/vercel.json runs the build.
const nextBin = resolve(WEBSITE_DIR, "node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", "--webpack", ...argv], {
  cwd: WEBSITE_DIR,
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
