import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";

const entry = createRequire(import.meta.url).resolve("node-pty");
const probe = String.raw`
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { spawn } = require(process.argv[1]);
const mode = process.argv[2];
const windows = process.platform === "win32";
const options = { name: "xterm-256color", cols: 80, rows: 24, cwd: process.cwd(), env: process.env };

function masters() {
  if (process.platform !== "darwin") return null;
  const descriptors = execFileSync("/usr/sbin/lsof", ["-nP", "-a", "-p", String(process.pid), "-Fn"], { encoding: "utf8" });
  return descriptors.split("\n").filter((line) => line === "n/dev/ptmx").length;
}

async function cycle(kill = false) {
  const command = windows ? process.env.ComSpec : "/bin/sh";
  const args = windows
    ? ["/d", "/q", kill ? "/k" : "/c", "echo pty-lifecycle-ok"]
    : ["-c", "printf pty-lifecycle-ok" + (kill ? "; exec sleep 30" : "")];
  const terminal = spawn(command, args, options);
  try {
    // The supervisor's Windows broker publishes this PID immediately after spawn.
    assert.ok(terminal.pid > 0, "PTY must expose its child PID before returning");
    let output = "";
    const exited = new Promise((resolve) => terminal.onExit(resolve));
    terminal.onData((data) => {
      output += data;
      if (kill && output.includes("pty-lifecycle-ok")) terminal.kill();
    });
    terminal.resize(100, 32);
    const event = await exited;
    if (!kill) assert.equal(event.exitCode, 0);
    assert.ok(output.includes("pty-lifecycle-ok"), "PTY must deliver final output before exit");
  } catch (error) {
    terminal.kill();
    throw error;
  }
}

(async () => {
  await cycle();
  await delay(100);
  const before = masters();
  const cycles = windows ? 4 : 24;
  if (mode === "failed") {
    const oversized = "x".repeat(3 * 1024 * 1024);
    for (let index = 0; index < cycles; index++) {
      assert.throws(() => spawn("/bin/echo", [oversized], options), /posix_spawn.*Argument list too long/);
    }
  } else {
    for (let index = 0; index < cycles; index++) await cycle();
    await cycle(true);
  }
  await delay(100);
  const after = masters();
  assert.equal(after, before, "PTY masters must return to baseline after every launch");
  console.log(JSON.stringify({ mode, cycles, before, after }));
})().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
`;

function runProbe(mode) {
  const result = spawnSync(process.execPath, ["-e", probe, entry, mode], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

void test("native PTYs retain PID, output, resize and cancellation behavior across repeated launches", () => {
  assert.equal(runProbe("completed").mode, "completed");
});

if (process.platform === "darwin") {
  void test("failed macOS PTY launches release their allocated masters", () => {
    assert.equal(runProbe("failed").mode, "failed");
  });
}
