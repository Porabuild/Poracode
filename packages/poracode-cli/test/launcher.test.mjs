import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import fs, {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateRuntimeArchive } from "../lib/archive.mjs";
import { downloadArtifact } from "../lib/artifact.mjs";
import { acquireInstallLock, readReadyMarker } from "../lib/cache.mjs";
import { execServer, launcherVersion, resolveRuntimeDir, runCli } from "../lib/launcher.mjs";
import { parseRuntimeManifest } from "../lib/manifest.mjs";
import { ensureRuntime } from "../lib/install.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readLockOwner(lockDir) {
  return JSON.parse(readFileSync(join(lockDir, "owner"), "utf8"));
}

function lockScratch(root) {
  return readdirSync(root).filter((name) => name.includes(".stale-") || name.includes(".new-"));
}

const STUB_SERVER =
  "process.stdout.write(JSON.stringify({ stub: true, argv: process.argv.slice(2), " +
  "appVersion: process.env.PORACODE_APP_VERSION }) + '\\n');\n";

/** A real tarball with the shipped install/overlay scripts and no dependencies. */
function buildRuntimeTarball(root, options = {}) {
  const version = options.version ?? "9.9.9";
  const stage = join(root, "stage");
  mkdirSync(join(stage, "lib"), { recursive: true });
  mkdirSync(join(stage, "resources", "wsl-helpers"), { recursive: true });
  mkdirSync(join(stage, "scripts"), { recursive: true });
  writeFileSync(
    join(stage, "package.json"),
    `${JSON.stringify(
      {
        name: "poracode-server",
        version,
        private: true,
        engines: { node: ">=24.10.0" },
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(stage, "lib", "server.cjs"), options.serverSource ?? STUB_SERVER);
  writeFileSync(join(stage, "resources", "wsl-helpers", "README.md"), "helpers\n");
  for (const script of ["server-release-install.mjs", "server-native-overlay.mjs"]) {
    cpSync(join(repoRoot, "scripts", script), join(stage, "scripts", script));
  }
  const tarball = join(root, "runtime.tar.gz");
  execFileSync("tar", ["-czf", tarball, "-C", stage, "."], { stdio: "pipe" });
  return { tarball, sha256: sha256(tarball) };
}

const hermeticRun = (command, args, options = {}) => {
  if (command === "npm") return Buffer.from("");
  return execFileSync(command, args, options);
};

void test("ensureRuntime installs once, reuses the cache, and refuses tampering", async () => {
  const root = tempDir("poracode-cli-install-");
  const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
  const cacheRoot = join(root, "cache");
  const entry = { url: "https://example.invalid/runtime.tar.gz", sha256: artifactSha };
  const first = await ensureRuntime({
    version: "9.9.9",
    target: "test-x64",
    entry,
    cacheRoot,
    resolveArtifact: async () => tarball,
    run: hermeticRun,
  });
  assert.ok(first.endsWith(join("9.9.9", "test-x64")));
  assert.ok(readFileSync(join(first, "lib", "server.cjs"), "utf8").includes("stub"));

  const second = await ensureRuntime({
    version: "9.9.9",
    target: "test-x64",
    entry,
    cacheRoot,
    resolveArtifact: async () => {
      throw new Error("cache reuse must not resolve or download again");
    },
    run: hermeticRun,
  });
  assert.equal(second, first);

  appendFileSync(join(first, "lib", "server.cjs"), "\n// tampered\n");
  await assert.rejects(
    ensureRuntime({ version: "9.9.9", target: "test-x64", entry, cacheRoot, run: hermeticRun }),
    (error) => error.code === "PORACODE_RUNTIME_CACHE_TAMPERED",
  );
});

void test("ensureRuntime recovers a lock abandoned by a cancelled install", async () => {
  const root = tempDir("poracode-cli-lock-");
  const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
  const cacheRoot = join(root, "cache");
  const lockDir = join(cacheRoot, "9.9.9-test-x64.lock");
  mkdirSync(lockDir, { recursive: true });
  // A pid that cannot be alive; the launcher must not block for the stale window.
  writeFileSync(join(lockDir, "owner"), "2147483647\n");
  const installed = await ensureRuntime({
    version: "9.9.9",
    target: "test-x64",
    entry: { url: "https://example.invalid/runtime.tar.gz", sha256: artifactSha },
    cacheRoot,
    resolveArtifact: async () => tarball,
    run: hermeticRun,
  });
  assert.ok(existsSync(join(installed, "lib", "server.cjs")));
});

void test("a live owner keeps the install lock regardless of its age", async () => {
  const root = tempDir("poracode-cli-live-lock-");
  const lockDir = join(root, "lock");
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(
    join(lockDir, "owner"),
    `${JSON.stringify({ formatVersion: 1, pid: process.pid, token: "live-owner" })}\n`,
  );
  const old = new Date(Date.now() - 60 * 60 * 1000);
  utimesSync(lockDir, old, old);
  await assert.rejects(
    acquireInstallLock(lockDir, { timeoutMs: 30, pollMs: 5 }),
    (error) =>
      error.code === "PORACODE_RUNTIME_INSTALL_LOCK_TIMEOUT" &&
      /Timed out waiting/u.test(error.message),
  );
  assert.ok(existsSync(join(lockDir, "owner")), "the live owner's lock must survive");
});

void test("a stale release never removes a newer owner's lock", async () => {
  const root = tempDir("poracode-cli-owner-token-");
  const lockDir = join(root, "lock");
  const releaseFirst = await acquireInstallLock(lockDir);
  rmSync(lockDir, { recursive: true, force: true });
  const releaseSecond = await acquireInstallLock(lockDir);
  releaseFirst();
  assert.ok(existsSync(join(lockDir, "owner")), "the newer owner's lock must survive");
  releaseSecond();
  assert.equal(existsSync(lockDir), false);
});

void test("a releasing owner never removes or strands a newer owner's lock", async () => {
  const root = tempDir("poracode-cli-release-yield-");
  const lockDir = join(root, "lock");
  const releaseFirst = await acquireInstallLock(lockDir, { timeoutMs: 500, pollMs: 5 });
  const replacement = { formatVersion: 1, pid: process.pid, token: "replacement-owner" };
  const originalRename = fs.renameSync;
  let swapped = false;
  fs.renameSync = (from, to) => {
    if (String(from) === lockDir && String(to).includes(".stale-") && !swapped) {
      swapped = true;
      // A newer owner takes the vacancy after this process verified its own
      // released generation but before the yield rename lands.
      fs.rmSync(lockDir, { recursive: true, force: true });
      fs.mkdirSync(lockDir);
      fs.writeFileSync(join(lockDir, "owner"), `${JSON.stringify(replacement)}\n`);
    }
    return originalRename(from, to);
  };
  syncBuiltinESMExports();
  try {
    releaseFirst();
  } finally {
    fs.renameSync = originalRename;
    syncBuiltinESMExports();
  }
  assert.equal(swapped, true, "the displacement interleaving must have run");
  assert.equal(readLockOwner(lockDir).token, replacement.token);
  assert.deepEqual(lockScratch(root), [], "the restored newer lock leaves no residue");
  rmSync(lockDir, { recursive: true, force: true });
});

void test("release never path-removes the shared lock directory", async () => {
  const root = tempDir("poracode-cli-release-shape-");
  const lockDir = join(root, "lock");
  const release = await acquireInstallLock(lockDir, { timeoutMs: 500, pollMs: 5 });
  const originalRm = fs.rmSync;
  const removed = [];
  fs.rmSync = (path, options) => {
    removed.push(String(path));
    return originalRm(path, options);
  };
  syncBuiltinESMExports();
  try {
    release();
  } finally {
    fs.rmSync = originalRm;
    syncBuiltinESMExports();
  }
  assert.equal(removed.includes(lockDir), false, `release must not rm the shared path: ${removed}`);
  assert.ok(
    removed.every((path) => path.startsWith(`${lockDir}.stale-`)),
    `release may only remove a verified private yield: ${removed}`,
  );
  assert.equal(existsSync(lockDir), false, "the released lock must be gone");
});

void test("a stale reclaimer never deletes a replacement live owner's lock", async () => {
  const root = tempDir("poracode-cli-aba-");
  const lockDir = join(root, "lock");
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(
    join(lockDir, "owner"),
    `${JSON.stringify({ formatVersion: 1, pid: 2147483647, token: "dead-owner" })}\n`,
  );
  const originalRename = fs.renameSync;
  let replaced = false;
  fs.renameSync = (from, to) => {
    if (String(from) === lockDir && !replaced) {
      replaced = true;
      // Another reclaimer finishes first and a new live owner publishes the
      // same pathname between this process's observation and its rename.
      fs.rmSync(lockDir, { recursive: true, force: true });
      fs.mkdirSync(lockDir);
      fs.writeFileSync(
        join(lockDir, "owner"),
        `${JSON.stringify({ formatVersion: 1, pid: process.pid, token: "replacement-live-owner" })}\n`,
      );
    }
    return originalRename(from, to);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(
      acquireInstallLock(lockDir, { timeoutMs: 40, pollMs: 2 }),
      /Timed out waiting/u,
      "acquisition must never succeed by stealing a live owner",
    );
    assert.equal(replaced, true, "the replacement interleaving must have run");
    const owner = JSON.parse(readFileSync(join(lockDir, "owner"), "utf8"));
    assert.equal(owner.token, "replacement-live-owner", "the replacement owner must survive");
    assert.deepEqual(
      readdirSync(root).filter((name) => name.includes(".stale-")),
      [],
      "the restored lock must not leave a quarantine behind",
    );
  } finally {
    fs.renameSync = originalRename;
    syncBuiltinESMExports();
  }
});

void test("ownerless locks are age-gated and never silently replaced", async () => {
  const root = tempDir("poracode-cli-ownerless-");
  const old = new Date(Date.now() - 60 * 60 * 1000);

  const emptyFresh = join(root, "empty-fresh.lock");
  mkdirSync(emptyFresh, { recursive: true });
  await assert.rejects(
    acquireInstallLock(emptyFresh, { timeoutMs: 60, pollMs: 5 }),
    (error) => error.code === "PORACODE_RUNTIME_INSTALL_LOCK_TIMEOUT",
    "a fresh ownerless lock is not taken over",
  );
  assert.deepEqual(readdirSync(emptyFresh), [], "a fresh ownerless lock is untouched");

  const emptyOld = join(root, "empty-old.lock");
  mkdirSync(emptyOld, { recursive: true });
  utimesSync(emptyOld, old, old);
  const releaseEmpty = await acquireInstallLock(emptyOld, { timeoutMs: 300, pollMs: 5 });
  releaseEmpty();

  const junkFresh = join(root, "junk-fresh.lock");
  mkdirSync(junkFresh, { recursive: true });
  writeFileSync(join(junkFresh, "junk"), "no owner record here\n");
  await assert.rejects(
    acquireInstallLock(junkFresh, { timeoutMs: 60, pollMs: 5 }),
    (error) => error.code === "PORACODE_RUNTIME_INSTALL_LOCK_TIMEOUT",
  );
  assert.equal(readFileSync(join(junkFresh, "junk"), "utf8"), "no owner record here\n");

  const junkOld = join(root, "junk-old.lock");
  mkdirSync(junkOld, { recursive: true });
  writeFileSync(join(junkOld, "junk"), "no owner record here\n");
  utimesSync(junkOld, old, old);
  const releaseJunk = await acquireInstallLock(junkOld, { timeoutMs: 300, pollMs: 5 });
  releaseJunk();
  assert.equal(existsSync(join(junkOld, "junk")), false, "the reclaimed generation is gone");
});

void test("lock records of an unknown generation are refused, preserved, and never reclaimed", async () => {
  const root = tempDir("poracode-cli-foreign-lock-");
  const cases = [
    ["future", `${JSON.stringify({ formatVersion: 2, pid: 2147483647, token: "future" })}\n`],
    ["interim", `${JSON.stringify({ pid: 2147483647, token: "interim" })}\n`],
    ["corrupt", "{ this is not a lock record"],
  ];
  for (const [name, bytes] of cases) {
    const lockDir = join(root, `${name}.lock`);
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner"), bytes);
    await assert.rejects(
      acquireInstallLock(lockDir, { timeoutMs: 30, pollMs: 2 }),
      (error) => error.code === "PORACODE_RUNTIME_INSTALL_LOCK_FOREIGN",
      `${name} must fail closed immediately`,
    );
    assert.equal(readFileSync(join(lockDir, "owner"), "utf8"), bytes, `${name} bytes preserved`);
    assert.deepEqual(readdirSync(lockDir), ["owner"], `${name} must not leave residue`);
  }
});

void test("a generation-1 dead owner is reclaimed and new records carry the format gate", async () => {
  const root = tempDir("poracode-cli-dead-generation-");
  const lockDir = join(root, "lock");
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(
    join(lockDir, "owner"),
    `${JSON.stringify({ formatVersion: 1, pid: 2147483647, token: "dead" })}\n`,
  );
  const release = await acquireInstallLock(lockDir, { timeoutMs: 500, pollMs: 5 });
  const owner = readLockOwner(lockDir);
  assert.equal(owner.formatVersion, 1);
  assert.equal(owner.pid, process.pid);
  assert.equal(typeof owner.token, "string");
  release();
  assert.equal(existsSync(lockDir), false);
});

void test("an owner recognizes its own restored lock after a failed publish read", async () => {
  const root = tempDir("poracode-cli-self-recognition-");
  const lockDir = join(root, "lock");
  const originalRename = fs.renameSync;
  const originalStat = fs.statSync;
  let published = false;
  let capturedToken = null;
  let failedOnce = false;
  fs.renameSync = (from, to) => {
    const isPublish = String(from).startsWith(`${lockDir}.new-`) && String(to) === lockDir;
    const result = originalRename(from, to);
    if (isPublish) {
      capturedToken = readLockOwner(lockDir).token;
      published = true;
    }
    return result;
  };
  fs.statSync = (path, ...rest) => {
    if (published && !failedOnce && String(path) === lockDir) {
      failedOnce = true;
      const error = new Error("ENOENT: simulated reclaimer window");
      error.code = "ENOENT";
      throw error;
    }
    return originalStat(path, ...rest);
  };
  syncBuiltinESMExports();
  try {
    const release = await acquireInstallLock(lockDir, { timeoutMs: 1000, pollMs: 5 });
    assert.equal(failedOnce, true, "the post-publish identity read must have failed once");
    assert.equal(readLockOwner(lockDir).token, capturedToken);
    release();
  } finally {
    fs.renameSync = originalRename;
    fs.statSync = originalStat;
    syncBuiltinESMExports();
  }
  assert.equal(existsSync(lockDir), false, "the adopted lock must release cleanly");
});

void test("a displaced generation is never deleted and a lost restore leaves inert residue", async () => {
  const root = tempDir("poracode-cli-third-owner-");
  const lockDir = join(root, "lock");
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(
    join(lockDir, "owner"),
    `${JSON.stringify({ formatVersion: 1, pid: 2147483647, token: "observed-dead" })}\n`,
  );
  const originalRename = fs.renameSync;
  const originalRead = fs.readFileSync;
  let quarantine = null;
  fs.renameSync = (from, to) => {
    if (String(from) === lockDir && String(to).includes(".stale-")) {
      quarantine = String(to);
      const result = originalRename(from, to);
      // A third acquirer takes the vacancy before the identity check.
      fs.mkdirSync(lockDir);
      fs.writeFileSync(
        join(lockDir, "owner"),
        `${JSON.stringify({ formatVersion: 1, pid: process.pid, token: "third-owner" })}\n`,
      );
      return result;
    }
    return originalRename(from, to);
  };
  fs.readFileSync = (path, ...rest) => {
    if (quarantine && String(path) === join(quarantine, "owner")) {
      // Force a record mismatch so the reclaimer attempts the restore into an
      // occupied pathname.
      return `${JSON.stringify({ formatVersion: 1, pid: 2147483647, token: "not-the-observed" })}\n`;
    }
    return originalRead(path, ...rest);
  };
  syncBuiltinESMExports();
  let error = null;
  try {
    await acquireInstallLock(lockDir, { timeoutMs: 80, pollMs: 5 });
  } catch (caught) {
    error = caught;
  } finally {
    fs.renameSync = originalRename;
    fs.readFileSync = originalRead;
    syncBuiltinESMExports();
  }
  assert.equal(error?.code, "PORACODE_RUNTIME_INSTALL_LOCK_TIMEOUT");
  assert.equal(readLockOwner(lockDir).token, "third-owner", "the third owner's lock must survive");
  assert.ok(quarantine !== null && existsSync(quarantine), "the lost restore leaves inert residue");
  assert.deepEqual(lockScratch(root), [quarantine.split("/").pop()]);
});

void test("cancellation aborts the lock wait without deleting the holder's lock", async () => {
  const root = tempDir("poracode-cli-cancel-");
  const lockDir = join(root, "lock");
  const release = await acquireInstallLock(lockDir);
  const controller = new AbortController();
  const pending = acquireInstallLock(lockDir, {
    timeoutMs: 60_000,
    pollMs: 5,
    signal: controller.signal,
  });
  await new Promise((done) => setTimeout(done, 10));
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "PORACODE_RUNTIME_INSTALL_CANCELLED");
  assert.ok(existsSync(join(lockDir, "owner")), "the holder's lock must survive a cancelled wait");
  release();
  assert.equal(existsSync(lockDir), false);
});

function runChild(script, args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => done({ code, stdout, stderr }));
  });
}

const CHILD_INSTALLER_SOURCE = `
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { acquireInstallLock } from __CACHE_MODULE__;
import { ensureRuntime } from __INSTALL_MODULE__;

const [lockDir, cacheRoot, version, target, tarball, sha256, journal, holdMs] =
  process.argv.slice(2);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const journalLine = (line) => appendFileSync(journal, line + "\\n");

const release = await acquireInstallLock(lockDir, { timeoutMs: 60_000, pollMs: 2 });
journalLine("hold " + process.pid + " " + Date.now());
await sleep(Number(holdMs));
journalLine("end " + process.pid + " " + Date.now());
release();

const runtimeDir = await ensureRuntime({
  version,
  target,
  entry: { url: "https://example.invalid/runtime.tar.gz", sha256 },
  cacheRoot,
  resolveArtifact: async () => {
    journalLine("resolve " + process.pid + " " + Date.now());
    await sleep(80);
    return tarball;
  },
  run: (command, args, options) =>
    command === "npm" ? Buffer.from("") : execFileSync(command, args, options),
});
journalLine("installed " + process.pid + " " + runtimeDir);
`;

void test(
  "real concurrent child installers never overlap ownership and install once",
  { timeout: 120_000 },
  async () => {
    const root = tempDir("poracode-cli-concurrent-");
    const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
    const cacheRoot = join(root, "cache");
    const journal = join(root, "journal.log");
    writeFileSync(journal, "");
    const childScript = join(root, "child-installer.mjs");
    writeFileSync(
      childScript,
      CHILD_INSTALLER_SOURCE.replace(
        "__CACHE_MODULE__",
        JSON.stringify(pathToFileURL(join(repoRoot, "packages/poracode-cli/lib/cache.mjs")).href),
      ).replace(
        "__INSTALL_MODULE__",
        JSON.stringify(pathToFileURL(join(repoRoot, "packages/poracode-cli/lib/install.mjs")).href),
      ),
    );
    const lockDir = join(cacheRoot, "9.9.9-test-x64.lock");
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        runChild(childScript, [
          lockDir,
          cacheRoot,
          "9.9.9",
          "test-x64",
          tarball,
          artifactSha,
          journal,
          "80",
        ]),
      ),
    );
    for (const result of results) {
      assert.equal(result.code, 0, `child installer failed: ${result.stderr}`);
    }

    const lines = readFileSync(journal, "utf8").trim().split("\n").filter(Boolean);
    const intervals = [];
    for (const line of lines) {
      const [kind, pid, timestamp] = line.split(" ");
      if (kind === "hold") intervals.push({ pid, start: Number(timestamp), end: null });
      else if (kind === "end") {
        const interval = intervals.find((entry) => entry.pid === pid && entry.end === null);
        assert.ok(interval, `end without hold for pid ${pid}`);
        interval.end = Number(timestamp);
      }
    }
    assert.equal(intervals.length, 4, "every child must have held the install lock");
    assert.ok(
      intervals.every((entry) => entry.end !== null),
      "every child must have released the install lock",
    );
    intervals.sort((left, right) => left.start - right.start);
    for (let index = 1; index < intervals.length; index += 1) {
      assert.ok(
        intervals[index - 1].end <= intervals[index].start,
        `overlapping install lock ownership: ${JSON.stringify(intervals)}`,
      );
    }

    const resolves = lines.filter((line) => line.startsWith("resolve "));
    assert.equal(resolves.length, 1, `exactly one installer may resolve the artifact: ${resolves}`);
    const installedDirs = new Set(
      lines
        .filter((line) => line.startsWith("installed "))
        .map((line) => line.split(" ").slice(2).join(" ")),
    );
    assert.equal(
      installedDirs.size,
      1,
      `children must agree on one runtime dir: ${[...installedDirs]}`,
    );
    const ready = readReadyMarker([...installedDirs][0]);
    assert.equal(ready?.tarballSha256, artifactSha);
    assert.deepEqual(
      readdirSync(cacheRoot).filter((name) => name.includes(".stale-") || name.includes(".new-")),
      [],
      "no reclaimer or staging leftovers may remain",
    );
  },
);

const PRODUCTION_INSTALLER_SOURCE = `
import { execFileSync } from "node:child_process";
import { ensureRuntime } from __INSTALL_MODULE__;

const [cacheRoot, version, target, tarball, sha256, resolveDelay] = process.argv.slice(2);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const emit = (event) => process.stdout.write(JSON.stringify(event) + "\\n");

const runtimeDir = await ensureRuntime({
  version,
  target,
  entry: { url: "https://example.invalid/runtime.tar.gz", sha256 },
  cacheRoot,
  resolveArtifact: async () => {
    emit({ event: "resolve", pid: process.pid });
    const delay = Number(resolveDelay);
    if (delay > 0) await sleep(delay);
    return tarball;
  },
  run: (command, args, options) =>
    command === "npm" ? Buffer.from("") : execFileSync(command, args, options),
});
emit({ event: "done", pid: process.pid, runtimeDir });
`;

void test(
  "real installer children at the production poll interval converge on one verified entry",
  { timeout: 180_000 },
  async () => {
    const root = tempDir("poracode-cli-production-poll-");
    const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
    const cacheRoot = join(root, "cache");
    const lockDir = join(cacheRoot, "9.9.9-test-x64.lock");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(
      join(lockDir, "owner"),
      `${JSON.stringify({ formatVersion: 1, pid: 2147483647, token: "dead-generation" })}\n`,
    );
    const childScript = join(root, "production-installer.mjs");
    writeFileSync(
      childScript,
      PRODUCTION_INSTALLER_SOURCE.replace(
        "__INSTALL_MODULE__",
        JSON.stringify(pathToFileURL(join(repoRoot, "packages/poracode-cli/lib/install.mjs")).href),
      ),
    );
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        runChild(childScript, [cacheRoot, "9.9.9", "test-x64", tarball, artifactSha, "60"]),
      ),
    );
    for (const result of results) {
      assert.equal(result.code, 0, `child installer failed: ${result.stderr}`);
    }
    const events = results.flatMap((result) =>
      result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    );
    const resolves = events.filter((event) => event.event === "resolve");
    assert.equal(
      resolves.length,
      1,
      `exactly one installer may resolve: ${JSON.stringify(resolves)}`,
    );
    const runtimeDirs = new Set(
      events.filter((event) => event.event === "done").map((event) => event.runtimeDir),
    );
    assert.equal(
      runtimeDirs.size,
      1,
      `children must agree on one runtime dir: ${[...runtimeDirs]}`,
    );
    const ready = readReadyMarker([...runtimeDirs][0]);
    assert.equal(ready?.tarballSha256, artifactSha);
    assert.deepEqual(
      readdirSync(cacheRoot).filter(
        (name) =>
          name.includes(".stale-") || name.includes(".new-") || name.startsWith(".staging-"),
      ),
      [],
      "no lock or install scratch may remain",
    );
    assert.equal(existsSync(lockDir), false, "the dead lock must be reclaimed and released");
  },
);

void test("the ready marker refuses an unknown generation and accepts generation 1", () => {
  const root = tempDir("poracode-cli-marker-");
  writeFileSync(
    join(root, ".poracode-runtime.json"),
    `${JSON.stringify({ formatVersion: 2, tarballSha256: "a".repeat(64) })}\n`,
  );
  assert.equal(readReadyMarker(root), null);
  writeFileSync(
    join(root, ".poracode-runtime.json"),
    `${JSON.stringify({ formatVersion: 1, tarballSha256: "a".repeat(64) })}\n`,
  );
  assert.equal(readReadyMarker(root)?.tarballSha256, "a".repeat(64));
});

void test("ensureRuntime sweeps dead install and lock scratch but never live scratch", async () => {
  const root = tempDir("poracode-cli-sweep-");
  const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
  const cacheRoot = join(root, "cache");
  const deadPid = 2147483647;
  const deadEntries = [
    join(cacheRoot, `.staging-9.9.9-test-x64-${deadPid}-crashed`),
    join(cacheRoot, `9.9.9-test-x64.lock.new-${deadPid}-crashed`),
    join(cacheRoot, `9.9.9-test-x64.lock.stale-${deadPid}-crashed`),
  ];
  const liveEntries = [
    join(cacheRoot, `.staging-9.9.9-test-x64-${process.pid}-live`),
    join(cacheRoot, `9.9.9-test-x64.lock.new-${process.pid}-live`),
    join(cacheRoot, `9.9.9-test-x64.lock.stale-${process.pid}-live`),
  ];
  for (const dir of [...deadEntries, ...liveEntries]) mkdirSync(dir, { recursive: true });
  await ensureRuntime({
    version: "9.9.9",
    target: "test-x64",
    entry: { url: "https://example.invalid/runtime.tar.gz", sha256: artifactSha },
    cacheRoot,
    resolveArtifact: async () => tarball,
    run: hermeticRun,
  });
  for (const dir of deadEntries) assert.equal(existsSync(dir), false, `${dir} must be swept`);
  for (const dir of liveEntries) assert.equal(existsSync(dir), true, `${dir} must be kept`);
  assert.equal(existsSync(join(cacheRoot, "9.9.9-test-x64.lock")), false);
});

void test("an existing entry with no readable generation-1 record fails closed and is preserved", async () => {
  const root = tempDir("poracode-cli-unreadable-cache-");
  const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
  const cacheRoot = join(root, "cache");
  const entry = { url: "https://example.invalid/runtime.tar.gz", sha256: artifactSha };
  const install = (target) =>
    ensureRuntime({
      version: "9.9.9",
      target,
      entry,
      cacheRoot,
      resolveArtifact: async () => tarball,
      run: hermeticRun,
    });

  const futureDir = join(cacheRoot, "9.9.9", "future-target");
  mkdirSync(futureDir, { recursive: true });
  const futureMarker = `${JSON.stringify({ formatVersion: 2, tarballSha256: "a".repeat(64) })}\n`;
  writeFileSync(join(futureDir, ".poracode-runtime.json"), futureMarker);
  await assert.rejects(install("future-target"), (error) => {
    assert.equal(error.code, "PORACODE_RUNTIME_CACHE_UNREADABLE");
    return true;
  });
  assert.equal(readFileSync(join(futureDir, ".poracode-runtime.json"), "utf8"), futureMarker);

  const markerlessDir = join(cacheRoot, "9.9.9", "markerless-target");
  mkdirSync(markerlessDir, { recursive: true });
  writeFileSync(join(markerlessDir, "junk.txt"), "partial content\n");
  await assert.rejects(
    install("markerless-target"),
    (error) => error.code === "PORACODE_RUNTIME_CACHE_UNREADABLE",
  );
  assert.equal(readFileSync(join(markerlessDir, "junk.txt"), "utf8"), "partial content\n");

  const emptyDir = join(cacheRoot, "9.9.9", "empty-target");
  mkdirSync(emptyDir, { recursive: true });
  const installed = await install("empty-target");
  assert.ok(readReadyMarker(installed), "an empty leftover directory is safely replaced");
});

void test("an unavailable lock never fails or corrupts an install", async () => {
  const root = tempDir("poracode-cli-lock-degrade-");
  const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
  const cacheRoot = join(root, "cache");
  const entry = { url: "https://example.invalid/runtime.tar.gz", sha256: artifactSha };
  const lockDir = join(cacheRoot, "9.9.9-test-x64.lock");
  const foreignRecord = `${JSON.stringify({ formatVersion: 2, pid: process.pid, token: "future" })}\n`;
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, "owner"), foreignRecord);
  const installed = await ensureRuntime({
    version: "9.9.9",
    target: "test-x64",
    entry,
    cacheRoot,
    resolveArtifact: async () => tarball,
    run: hermeticRun,
    lock: { timeoutMs: 30, pollMs: 5 },
  });
  assert.ok(readReadyMarker(installed));
  assert.equal(
    readFileSync(join(lockDir, "owner"), "utf8"),
    foreignRecord,
    "the foreign lock is preserved byte-for-byte",
  );
});

void test("a live lock makes ensureRuntime wait, then degrades without failing", async () => {
  const root = tempDir("poracode-cli-lock-live-degrade-");
  const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
  const cacheRoot = join(root, "cache");
  const lockDir = join(cacheRoot, "9.9.9-test-x64.lock");
  const liveRecord = `${JSON.stringify({ formatVersion: 1, pid: process.pid, token: "other-owner" })}\n`;
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, "owner"), liveRecord);
  const installed = await ensureRuntime({
    version: "9.9.9",
    target: "test-x64",
    entry: { url: "https://example.invalid/runtime.tar.gz", sha256: artifactSha },
    cacheRoot,
    resolveArtifact: async () => tarball,
    run: hermeticRun,
    lock: { timeoutMs: 30, pollMs: 5 },
  });
  assert.ok(readReadyMarker(installed));
  assert.equal(readFileSync(join(lockDir, "owner"), "utf8"), liveRecord);
});

void test("cancellation aborts ensureRuntime without publishing or deleting the holder's lock", async () => {
  const root = tempDir("poracode-cli-install-cancel-");
  const cacheRoot = join(root, "cache");
  const lockDir = join(cacheRoot, "9.9.9-test-x64.lock");
  const holder = `${JSON.stringify({ formatVersion: 1, pid: process.pid, token: "holder" })}\n`;
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, "owner"), holder);
  const controller = new AbortController();
  const pending = ensureRuntime({
    version: "9.9.9",
    target: "test-x64",
    entry: { url: "https://example.invalid/runtime.tar.gz", sha256: "a".repeat(64) },
    cacheRoot,
    signal: controller.signal,
    lock: { timeoutMs: 60_000, pollMs: 5 },
  });
  await new Promise((done) => setTimeout(done, 10));
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "PORACODE_RUNTIME_INSTALL_CANCELLED");
  assert.equal(readFileSync(join(lockDir, "owner"), "utf8"), holder);
  assert.equal(existsSync(join(cacheRoot, "9.9.9", "test-x64")), false);
});

void test("downloadArtifact is byte-capped, checksum-verified, and signal-aware", async () => {
  const root = tempDir("poracode-cli-download-");
  const destination = join(root, "runtime.tar.gz");
  const entry = { url: "https://example.invalid/runtime.tar.gz", sha256: "a".repeat(64) };

  const declared = {
    ok: true,
    status: 200,
    headers: { get: (name) => (name === "content-length" ? String(64 * 1024 * 1024) : null) },
    body: null,
    arrayBuffer: async () => Buffer.alloc(0),
  };
  await assert.rejects(
    downloadArtifact(entry, destination, { fetchImpl: async () => declared, maxBytes: 32 }),
    /above the 32-byte limit/u,
  );
  assert.equal(existsSync(destination), false);

  const streamed = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.alloc(16));
        controller.enqueue(Buffer.alloc(16));
        controller.close();
      },
    }),
  );
  await assert.rejects(
    downloadArtifact(entry, destination, { fetchImpl: async () => streamed, maxBytes: 8 }),
    /above the 8-byte limit/u,
  );
  assert.equal(existsSync(destination), false);

  await assert.rejects(
    downloadArtifact(entry, destination, {
      fetchImpl: async () => new Response(Buffer.from("wrong bytes")),
    }),
    (error) => error.code === "PORACODE_ARTIFACT_CHECKSUM_MISMATCH",
  );
  assert.equal(existsSync(destination), false, "a mismatched download must not be left behind");

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    downloadArtifact(entry, destination, {
      signal: controller.signal,
      fetchImpl: async (_url, options) => {
        if (options?.signal?.aborted) throw new Error("aborted by signal");
        return new Response(Buffer.from("unreachable"));
      },
    }),
    (error) => error.code === "PORACODE_RUNTIME_DOWNLOAD_FAILED",
  );
});

void test("ensureRuntime refuses an artifact whose sha256 does not match the manifest", async () => {
  const root = tempDir("poracode-cli-checksum-");
  const { tarball } = buildRuntimeTarball(root);
  await assert.rejects(
    ensureRuntime({
      version: "9.9.9",
      target: "test-x64",
      entry: { url: "https://example.invalid/runtime.tar.gz", sha256: "0".repeat(64) },
      cacheRoot: join(root, "cache"),
      resolveArtifact: async () => tarball,
      run: hermeticRun,
    }),
    (error) => error.code === "PORACODE_ARTIFACT_CHECKSUM_MISMATCH",
  );
});

void test("validateRuntimeArchive refuses traversal and link entries", () => {
  const traversalRun = (command, args) => {
    if (args[0] === "-tzf") return "../escape\nlib/server.cjs\n";
    return "-rw-r--r--  0 0 0 1 Jan  1 00:00 ../escape\n-rw-r--r--  0 0 0 1 Jan  1 00:00 lib/server.cjs\n";
  };
  assert.throws(
    () => validateRuntimeArchive({ tarball: "unused.tar.gz", run: traversalRun }),
    /entry escapes the install directory/u,
  );

  const root = tempDir("poracode-cli-link-");
  mkdirSync(join(root, "stage"), { recursive: true });
  symlinkSync("/etc/hostname", join(root, "stage", "link"));
  const tarball = join(root, "link.tar.gz");
  execFileSync("tar", ["-czf", tarball, "-C", join(root, "stage"), "link"], { stdio: "pipe" });
  assert.throws(
    () => validateRuntimeArchive({ tarball, run: hermeticRun }),
    /link entry is not allowed/u,
  );
});

void test("runCli answers --version and --help without touching the cache", async () => {
  const output = [];
  const stdout = { write: (chunk) => output.push(chunk) };
  assert.equal(await runCli(["--version"], { stdout }), 0);
  assert.equal(output.join(""), `${launcherVersion()}\n`);

  output.length = 0;
  assert.equal(await runCli(["--help"], { stdout }), 0);
  const help = output.join("");
  assert.match(help, /poracode pair --json/u);
  assert.match(help, /PORACODE_SERVER_TARBALL/u);
});

void test("resolveRuntimeDir selects the manifest entry and reports offline installs", async () => {
  const root = tempDir("poracode-cli-offline-");
  const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
  const manifestPath = join(root, "runtime-manifest.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      formatVersion: 1,
      version: launcherVersion(),
      targets: {
        "test-x64": { url: "https://example.invalid/runtime.tar.gz", sha256: artifactSha },
      },
    })}\n`,
  );
  const env = {
    PORACODE_RUNTIME_TARGET: "test-x64",
    PORACODE_RUNTIME_CACHE_DIR: join(root, "cache"),
  };

  await assert.rejects(
    resolveRuntimeDir({
      env,
      manifestPath,
      installOptions: {
        fetchImpl: async () => {
          throw new Error("network is down");
        },
      },
    }),
    (error) =>
      error.code === "PORACODE_RUNTIME_UNAVAILABLE" &&
      /PORACODE_SERVER_TARBALL/u.test(error.hint ?? ""),
  );

  const installed = await resolveRuntimeDir({
    env,
    manifestPath,
    installOptions: {
      fetchImpl: async () => new Response(readFileSync(tarball)),
      run: hermeticRun,
    },
  });
  assert.ok(readFileSync(join(installed, "lib", "server.cjs"), "utf8").includes("stub"));

  await assert.rejects(
    resolveRuntimeDir({
      env: { ...env, PORACODE_RUNTIME_TARGET: "win32-x64" },
      manifestPath,
    }),
    (error) => error.code === "PORACODE_TARGET_UNSUPPORTED" && /test-x64/u.test(error.hint ?? ""),
  );
});

void test("the local tarball override requires both variables and still verifies bytes", async () => {
  const root = tempDir("poracode-cli-override-");
  const { tarball, sha256: artifactSha } = buildRuntimeTarball(root);
  const output = [];
  await assert.rejects(
    runCli(["doctor"], {
      stdout: { write: (chunk) => output.push(chunk) },
      env: { PORACODE_SERVER_TARBALL: tarball },
    }),
    (error) => error.code === "PORACODE_ARTIFACT_OVERRIDE_INCOMPLETE",
  );
  await assert.rejects(
    runCli(["doctor"], {
      stdout: { write: (chunk) => output.push(chunk) },
      env: {
        PORACODE_SERVER_TARBALL: tarball,
        PORACODE_SERVER_TARBALL_SHA256: "0".repeat(64),
        PORACODE_RUNTIME_TARGET: "test-x64",
        PORACODE_RUNTIME_CACHE_DIR: join(root, "cache"),
      },
    }),
    (error) => error.code === "PORACODE_ARTIFACT_CHECKSUM_MISMATCH",
  );
  assert.equal(artifactSha.length, 64);
});

void test("execServer forwards argv and pins PORACODE_APP_VERSION", async () => {
  const root = tempDir("poracode-cli-exec-");
  const runtimeDir = join(root, "runtime");
  mkdirSync(join(runtimeDir, "lib"), { recursive: true });
  writeFileSync(join(runtimeDir, "lib", "server.cjs"), STUB_SERVER);
  let captured;
  const spawnImpl = (command, args, options) => {
    captured = { command, args, options };
    const child = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => child.emit("exit", 0, null));
    return child;
  };
  const code = await execServer({
    runtimeDir,
    args: ["doctor", "--json"],
    version: "9.9.9",
    env: { PATH: process.env.PATH ?? "" },
    spawnImpl,
  });
  assert.equal(code, 0);
  assert.equal(captured.command, process.execPath);
  assert.deepEqual(captured.args.slice(-2), ["doctor", "--json"]);
  assert.equal(captured.options.env.PORACODE_APP_VERSION, "9.9.9");
});

void test("parseRuntimeManifest rejects malformed manifests", () => {
  assert.throws(
    () => parseRuntimeManifest({ formatVersion: 2, version: "1.0.0", targets: {} }),
    /formatVersion/u,
  );
  assert.throws(
    () => parseRuntimeManifest({ formatVersion: 1, version: "1.0.0", targets: [] }),
    /targets table/u,
  );
  assert.throws(
    () =>
      parseRuntimeManifest({
        formatVersion: 1,
        version: "1.0.0",
        targets: { "linux-x64": { url: "https://example.invalid/a.tgz", sha256: "nope" } },
      }),
    /malformed sha256/u,
  );
});
