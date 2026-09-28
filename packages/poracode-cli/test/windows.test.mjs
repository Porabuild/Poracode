import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { extractArchiveMembers, validateRuntimeArchive } from "../lib/archive.mjs";
import { publishRuntime, stagingDirectoryName, sweepOrphanStaging } from "../lib/install.mjs";
import { execServer } from "../lib/launcher.mjs";
import { PoracodeLauncherError } from "../lib/errors.mjs";
import {
  forwardedSignals,
  runServerStop,
  signalExitCode,
  windowsHardKillDeadlineMs,
} from "../lib/signals.mjs";
import { parseRuntimeManifest, selectRuntimeEntry } from "../lib/manifest.mjs";
import {
  PUBLISHED_TARGET_DESCRIPTION,
  requireRuntimeTargetKey,
  runtimeTargetKey,
} from "../lib/target.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const fsError = (code) => Object.assign(new Error(code), { code });

void test("target selection maps Windows to win32-<arch> and advertises win32-x64", () => {
  assert.equal(runtimeTargetKey({ platform: "win32", arch: "x64" }), "win32-x64");
  assert.equal(requireRuntimeTargetKey({ platform: "win32", arch: "x64" }), "win32-x64");
  assert.equal(runtimeTargetKey({ platform: "freebsd", arch: "x64" }), null);
  assert.match(PUBLISHED_TARGET_DESCRIPTION, /win32-x64/u);
});

void test("an unpublished Windows arch is reported as unsupported with the published list", () => {
  const manifest = parseRuntimeManifest({
    formatVersion: 1,
    version: "1.2.3",
    targets: { "win32-x64": { url: "https://example.invalid/w.tar.gz", sha256: "a".repeat(64) } },
  });
  assert.equal(selectRuntimeEntry(manifest, "win32-x64").sha256, "a".repeat(64));
  assert.throws(
    () =>
      selectRuntimeEntry(manifest, requireRuntimeTargetKey({ platform: "win32", arch: "arm64" })),
    (error) =>
      error instanceof PoracodeLauncherError &&
      error.code === "PORACODE_TARGET_UNSUPPORTED" &&
      /win32-arm64/u.test(error.message) &&
      /win32-x64/u.test(error.hint) &&
      !/Windows standalone is not supported/u.test(error.hint),
  );
});

void test("Windows staging names are short; POSIX keeps the legacy name", () => {
  const win = stagingDirectoryName({
    version: "1.2.3",
    target: "win32-x64",
    pid: 4321,
    platform: "win32",
  });
  assert.match(win, /^\.s-4321-[0-9a-f]{8}$/u);
  const posix = stagingDirectoryName({
    version: "1.2.3",
    target: "linux-x64",
    pid: 4321,
    platform: "linux",
  });
  assert.match(posix, /^\.staging-1\.2\.3-linux-x64-4321-[0-9a-f-]{36}$/u);
  assert.ok(win.length < 20);
});

void test("the orphan sweep removes dead short and legacy staging but never a live one", () => {
  const cacheRoot = tempDir("poracode-cli-win-sweep-");
  const deadPid = 2_147_483_000;
  const dead = [`.s-${deadPid}-abcd1234`, `.staging-9.9.9-test-x64-${deadPid}-legacy`];
  const live = [`.s-${process.pid}-abcd1234`, `.staging-9.9.9-test-x64-${process.pid}-live`];
  const unrelated = ["9.9.9", ".staging-8.8.8-test-x64-" + deadPid + "-otherversion"];
  for (const name of [...dead, ...live, ...unrelated]) mkdirSync(join(cacheRoot, name));
  sweepOrphanStaging(cacheRoot, "9.9.9", "test-x64");
  for (const name of dead) assert.equal(existsSync(join(cacheRoot, name)), false, name);
  for (const name of [...live, ...unrelated])
    assert.equal(existsSync(join(cacheRoot, name)), true, name);
});

function stagedRuntime(root) {
  const installed = join(root, "staging", "runtime");
  mkdirSync(installed, { recursive: true });
  writeFileSync(join(installed, "marker"), "x");
  return installed;
}

void test("publishRuntime rides out transient EBUSY/EPERM/EACCES while the destination is absent", () => {
  for (const code of ["EBUSY", "EPERM", "EACCES"]) {
    const root = tempDir("poracode-cli-publish-");
    const installed = stagedRuntime(root);
    const runtimeDir = join(root, "cache", "1.0.0", "win32-x64");
    let attempts = 0;
    const result = publishRuntime(runtimeDir, installed, { sha256: "s" }, "1.0.0", "win32-x64", {
      sleep: () => {},
      rename: (from, to) => {
        attempts += 1;
        if (attempts < 4) throw fsError(code);
        renameSync(from, to);
      },
    });
    assert.equal(result, runtimeDir);
    assert.equal(attempts, 4);
    assert.ok(existsSync(join(runtimeDir, "marker")));
  }
});

void test("publishRuntime stops retrying at its bound and surfaces the lock error", () => {
  const root = tempDir("poracode-cli-publish-bound-");
  const installed = stagedRuntime(root);
  let attempts = 0;
  assert.throws(
    () =>
      publishRuntime(join(root, "cache", "1.0.0", "t"), installed, { sha256: "s" }, "1.0.0", "t", {
        sleep: () => {},
        retries: 3,
        rename: () => {
          attempts += 1;
          throw fsError("EBUSY");
        },
      }),
    (error) => error.code === "EBUSY" || error.code === "PORACODE_RUNTIME_CACHE_UNREADABLE",
  );
  assert.equal(attempts, 4, "one initial try plus the three bounded retries");
});

void test("a present destination is never waited out: no retry, straight to the busy path", () => {
  const root = tempDir("poracode-cli-publish-present-");
  const installed = stagedRuntime(root);
  const runtimeDir = join(root, "cache", "1.0.0", "t");
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(join(runtimeDir, "foreign"), "x");
  let attempts = 0;
  assert.throws(
    () =>
      publishRuntime(runtimeDir, installed, { sha256: "s" }, "1.0.0", "t", {
        sleep: () => assert.fail("must not sleep"),
        rename: () => {
          attempts += 1;
          throw fsError("EPERM");
        },
      }),
    { code: "PORACODE_RUNTIME_CACHE_UNREADABLE" },
  );
  assert.equal(attempts, 1);
  assert.equal(existsSync(join(runtimeDir, "foreign")), true, "foreign content is never replaced");
});

void test("archive helpers use the resolved Windows bsdtar and GNU --force-local", () => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (args.includes("-tzf")) return "scripts/a.mjs\n";
    if (args.includes("-tvzf")) return "-rw-r--r-- 0 0 0 1 Jan 1 00:00 scripts/a.mjs\n";
    return "";
  };
  const bsdtar = { platform: "win32", env: { SystemRoot: "C:\\Windows" }, exists: () => true };
  const names = validateRuntimeArchive({ tarball: "C:\\x.tgz", run, tarResolution: bsdtar });
  extractArchiveMembers({
    tarball: "C:\\x.tgz",
    destination: join(tempDir("poracode-cli-win-extract-"), "out"),
    members: ["scripts/a.mjs"],
    names,
    run,
    tarResolution: bsdtar,
  });
  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(call[0], "C:\\Windows\\System32\\tar.exe");

  calls.length = 0;
  validateRuntimeArchive({
    tarball: "C:\\x.tgz",
    run,
    tarResolution: {
      platform: "win32",
      env: {},
      exists: () => false,
      run: () => "tar (GNU tar) 1.35",
    },
  });
  for (const call of calls) assert.equal(call[1], "--force-local");
});

void test("lock and quarantine identity: a renamed directory keeps its ino/dev", () => {
  // cache.mjs proves a quarantined lock is the exact generation it classified
  // by comparing ino/dev across a rename; NTFS file IDs must behave the same.
  const root = tempDir("poracode-cli-identity-");
  const lockDir = join(root, "1.0.0-t.lock");
  mkdirSync(lockDir);
  const before = statSync(lockDir);
  const quarantine = `${lockDir}.stale-1-abcd1234`;
  renameSync(lockDir, quarantine);
  const renamed = statSync(quarantine);
  assert.equal(renamed.ino, before.ino);
  assert.equal(renamed.dev, before.dev);
});

class FakeChild extends EventEmitter {
  killed = [];
  kill(signal) {
    this.killed.push(signal ?? "hard");
  }
}

function fakeProcess() {
  const emitter = new EventEmitter();
  return emitter;
}

function timers() {
  const scheduled = [];
  return {
    scheduled,
    setTimeoutImpl: (fn, ms) => {
      const timer = { fn, ms, cleared: false, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutImpl: (timer) => {
      timer.cleared = true;
    },
  };
}

function launch(platform, extra = {}) {
  const child = new FakeChild();
  const proc = fakeProcess();
  const clock = timers();
  const stops = [];
  const result = execServer({
    runtimeDir: "/rt",
    args: ["serve"],
    version: "1.0.0",
    env: { PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS: "2000" },
    platform,
    spawnImpl: () => child,
    processImpl: proc,
    stopServer: async (input) => {
      stops.push(input);
      return 0;
    },
    setTimeoutImpl: clock.setTimeoutImpl,
    clearTimeoutImpl: clock.clearTimeoutImpl,
    ...extra,
  });
  return { child, proc, clock, stops, result };
}

void test("win32: SIGINT is a no-op because the console already reached the child", async () => {
  const { child, proc, stops, result } = launch("win32");
  proc.emit("SIGINT");
  assert.deepEqual(child.killed, []);
  assert.deepEqual(stops, []);
  child.emit("exit", 0, null);
  assert.equal(await result, 0);
});

void test("win32: SIGTERM/SIGBREAK/SIGHUP request a graceful stop, then hard-kill after the deadline", async () => {
  for (const signal of ["SIGTERM", "SIGBREAK", "SIGHUP"]) {
    const { child, proc, clock, stops, result } = launch("win32");
    proc.emit(signal);
    proc.emit(signal); // repeated signals must not re-run stop
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stops.length, 1, signal);
    assert.match(stops[0].entry, /server\.cjs$/u);
    assert.deepEqual(child.killed, [], "no immediate TerminateProcess");
    assert.equal(clock.scheduled.length, 1);
    assert.equal(clock.scheduled[0].ms, 2000 + 5000, "drain deadline plus margin");
    clock.scheduled[0].fn();
    assert.deepEqual(child.killed, ["hard"]);
    child.emit("exit", null, "SIGTERM");
    assert.equal(await result, 128 + 15, "an exit code, never process.kill(self)");
    assert.equal(clock.scheduled[0].cleared, true);
  }
});

void test("win32: a graceful child exit cancels the hard-kill and keeps its exit code", async () => {
  const { child, proc, clock, result } = launch("win32");
  proc.emit("SIGTERM");
  child.emit("exit", 0, null);
  assert.equal(await result, 0);
  assert.equal(clock.scheduled[0].cleared, true);
  assert.equal(proc.listenerCount("SIGTERM"), 0, "handlers are removed on exit");
});

void test("win32: a failing stop command leaves the hard-kill deadline as the fallback", async () => {
  const { child, proc, clock, result } = launch("win32", {
    stopServer: async () => {
      throw new Error("stop unavailable");
    },
  });
  proc.emit("SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));
  clock.scheduled[0].fn();
  assert.deepEqual(child.killed, ["hard"]);
  child.emit("exit", 1, null);
  assert.equal(await result, 1);
});

void test("POSIX: signals are forwarded to the child and a signal exit re-raises on self", async () => {
  const raised = [];
  const { child, proc, stops, result } = launch("linux", {
    killSelf: (pid, signal) => raised.push(signal),
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) proc.emit(signal);
  assert.deepEqual(child.killed, ["SIGINT", "SIGTERM", "SIGHUP"]);
  assert.deepEqual(stops, []);
  assert.equal(proc.listenerCount("SIGBREAK"), 0);
  child.emit("exit", null, "SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(raised, ["SIGTERM"]);
  void result;
});

void test("forwarded signals include SIGBREAK only on Windows", () => {
  assert.deepEqual(forwardedSignals("linux"), ["SIGINT", "SIGTERM", "SIGHUP"]);
  assert.deepEqual(forwardedSignals("win32"), ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]);
});

void test("the win32 hard-kill deadline is the drain deadline plus a margin", () => {
  assert.equal(windowsHardKillDeadlineMs({}), 10_000 + 5_000);
  assert.equal(windowsHardKillDeadlineMs({ PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS: "30000" }), 35_000);
  assert.equal(windowsHardKillDeadlineMs({ PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS: "bogus" }), 15_000);
  assert.equal(signalExitCode("SIGTERM"), 143);
  assert.equal(signalExitCode("SIGNOPE"), 1);
});

void test("runServerStop runs `node <entry> stop` and reports the exit code", async () => {
  const calls = [];
  const child = new FakeChild();
  const promise = runServerStop({
    entry: "C:\\rt\\lib\\server.cjs",
    env: { A: "1" },
    timeoutMs: 1000,
    execPath: "C:\\node\\node.exe",
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return child;
    },
  });
  child.emit("exit", 0);
  assert.equal(await promise, 0);
  assert.equal(calls[0].command, "C:\\node\\node.exe");
  assert.deepEqual(calls[0].args, ["C:\\rt\\lib\\server.cjs", "stop"]);
  assert.equal(calls[0].options.windowsHide, true);
});

void test("runServerStop never rejects when the stop process cannot start", async () => {
  assert.equal(
    await runServerStop({
      entry: "x",
      env: {},
      timeoutMs: 10,
      spawnImpl: () => {
        throw new Error("spawn failed");
      },
    }),
    null,
  );
  const child = new FakeChild();
  const promise = runServerStop({ entry: "x", env: {}, timeoutMs: 10, spawnImpl: () => child });
  child.emit("error", new Error("ENOENT"));
  assert.equal(await promise, null);
});
