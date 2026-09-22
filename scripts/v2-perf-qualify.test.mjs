import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  buildCellSpec,
  buildObserverAck,
  buildVitestEnv,
  createRunDir,
  inspectArm,
  MODES,
  OBSERVER_FILES,
  MANAGED_LAUNCHER_RELATIVE_PATH,
  parseArgs,
  parseDurationMs,
  readAckFile,
  resolveModeDuration,
  resolveVitestCommand,
  runDirName,
  runQualification,
  validateObserverAck,
} from "./v2-perf-qualify.mjs";

const scriptRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function makeTempRoot(label) {
  return mkdtempSync(join(tmpdir(), `v2-perf-qualify-${label}-`));
}

function runGit(cwd, args) {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

function armHead(root) {
  return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

/** Builds a minimal frozen-arm fixture: git checkout, six observer files, launcher, node_modules. */
async function makeArmFixture(label) {
  const root = makeTempRoot(label);
  for (const dir of [
    "src/renderer/diagnostics",
    dirname(MANAGED_LAUNCHER_RELATIVE_PATH),
    "node_modules",
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  OBSERVER_FILES.forEach((path, index) => {
    writeFileSync(join(root, path), `observer fixture ${String(index)}\n`);
  });
  writeFileSync(join(root, MANAGED_LAUNCHER_RELATIVE_PATH), "#!/usr/bin/env node\n");
  runGit(root, ["init"]);
  runGit(root, ["config", "user.email", "fixture@example.com"]);
  runGit(root, ["config", "user.name", "fixture"]);
  runGit(root, ["-c", "commit.gpgsign=false", "add", "-A"]);
  runGit(root, ["-c", "commit.gpgsign=false", "commit", "-m", "fixture arm"]);
  return root;
}

async function withArmFixture(label, run) {
  const root = await makeArmFixture(label);
  try {
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void test("parseDurationMs accepts explicit unit suffixes and rejects malformed durations", () => {
  assert.equal(parseDurationMs("30m"), 30 * 60_000);
  assert.equal(parseDurationMs("24h"), 24 * 60 * 60_000);
  assert.equal(parseDurationMs("90s"), 90_000);
  assert.equal(parseDurationMs("500ms"), 500);
  assert.equal(parseDurationMs(" 2h "), 2 * 3_600_000);
  for (const invalid of ["", "abc", "30", "-5m", "0m", "0", "1.5h", "30 M", "m", "+1h", "1e3s"]) {
    assert.throws(
      () => parseDurationMs(invalid),
      undefined,
      `expected ${JSON.stringify(invalid)} to be rejected`,
    );
  }
  assert.throws(() => parseDurationMs(undefined));
  assert.throws(() => parseDurationMs(1800));
});

void test("resolveModeDuration enforces the sustained and soak bounds", () => {
  assert.equal(resolveModeDuration("sustained", undefined), MODES.sustained.defaultMs);
  assert.equal(resolveModeDuration("soak", undefined), MODES.soak.defaultMs);
  assert.equal(resolveModeDuration("sustained", 45 * 60_000), 45 * 60_000);
  assert.equal(resolveModeDuration("soak", 30 * 60 * 60_000), 30 * 60 * 60_000);
  // Below the plan minimums.
  assert.throws(() => resolveModeDuration("sustained", 29 * 60_000));
  assert.throws(() => resolveModeDuration("soak", 23 * 60 * 60_000));
  // Above the sanity maximums.
  assert.throws(() => resolveModeDuration("sustained", 6 * 60 * 60_000));
  assert.throws(() => resolveModeDuration("soak", 31 * 24 * 60 * 60_000));
  assert.throws(() => resolveModeDuration("sustained", 0));
  assert.throws(() => resolveModeDuration("sustained", -60_000));
  assert.throws(() => resolveModeDuration("sustained", Number.NaN));
});

void test("parseArgs requires an explicit valid mode and resolves the arm from the environment", () => {
  assert.equal(parseArgs(["sustained"], { V2Q_ARM_ROOT: "/arms/r0" }).mode, "sustained");
  assert.equal(parseArgs(["soak", "--arm", "/arms/r0"]).arm, "/arms/r0");
  assert.equal(parseArgs(["soak"], { V2Q_ARM_ROOT: "/arms/r0" }).arm, "/arms/r0");
  // Even a dry run validates an arm: without --arm or the environment it is refused.
  assert.equal(parseArgs(["sustained", "--dry-run", "--arm", "/arms/r0"], {}).dryRun, true);
  assert.equal(parseArgs(["--help"], {}).help, true);
  // No implicit mode, no unknown modes, no unknown options, no missing values.
  assert.throws(() => parseArgs([], {}));
  assert.throws(() => parseArgs(["sustained", "soak"], {}));
  assert.throws(() => parseArgs(["quick"], {}));
  assert.throws(() => parseArgs(["sustained"], {}));
  assert.throws(() => parseArgs(["sustained", "--wat"], {}));
  assert.throws(() => parseArgs(["sustained", "--arm"], {}));
});

void test("buildCellSpec emits plan-aligned sustained and soak specs", () => {
  const sustained = buildCellSpec("sustained", 30 * 60_000);
  assert.equal(sustained.id, "v2q-sustained");
  assert.equal(sustained.producers, 8);
  assert.equal(sustained.clients, 4);
  assert.equal(sustained.legacyClient, true);
  assert.equal(sustained.slowClient, true);
  assert.equal(sustained.reconnectClient, true);
  assert.equal(sustained.visibleChatPanes, 2);
  assert.equal(sustained.terminalSurface, "panel");
  assert.equal(sustained.catalogThreads, 10_000);
  assert.equal(sustained.protocol, "longtask");
  assert.equal(sustained.assertBudgets, true);
  assert.deepEqual(sustained.trustedInput, {});
  assert.equal(sustained.structuredWorkload, null);
  assert.equal(sustained.durationMs, 30 * 60_000);
  assert.ok(sustained.label.length > 0);

  const soak = buildCellSpec("soak", 24 * 60 * 60_000);
  assert.equal(soak.id, "v2q-soak");
  assert.equal(soak.producers, 8);
  assert.equal(soak.clients, 4);
  assert.equal(soak.legacyClient, true);
  assert.equal(soak.slowClient, true);
  assert.equal(soak.reconnectClient, true);
  assert.equal(soak.catalogThreads, 10_000);
  assert.equal(soak.protocol, "longtask");
  assert.equal(soak.assertBudgets, true);
  assert.equal(soak.terminalSurface, "panel");
  assert.equal(soak.durationMs, 24 * 60 * 60_000);

  // The spec must survive the exact JSON round trip the cell consumes.
  for (const spec of [sustained, soak]) {
    const parsed = JSON.parse(JSON.stringify(spec));
    assert.deepEqual(parsed, { ...spec });
  }
});

void test("run directory names are unique and createRunDir never reuses one", () => {
  const now = new Date("2026-09-22T09:30:00Z");
  const first = runDirName("sustained", now, "ab12");
  assert.match(first, /^sustained-20260922T093000Z-[0-9a-f]{4}$/u);
  assert.notEqual(runDirName("soak", now, "ab12"), first);
  assert.notEqual(runDirName("sustained", now, "cd34"), first);

  const root = makeTempRoot("rundir");
  try {
    const created = createRunDir(root, "soak", now);
    assert.ok(existsSync(created));
    assert.ok(created.startsWith(join(root, "soak-")));
    // A second creation in the same second must not collide with the first.
    const second = createRunDir(root, "soak", now);
    assert.notEqual(second, created);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test("observer acknowledgment generation and validation round-trip on a clean frozen arm", async () => {
  await withArmFixture("roundtrip", async (armRoot) => {
    const arm = inspectArm(armRoot);
    assert.equal(arm.srcClean, true);
    assert.equal(arm.observerFiles.length, OBSERVER_FILES.length);
    const ack = buildObserverAck({
      arm,
      acknowledgedBy: "v2-perf-qualify test",
      acknowledgedAtIso: "2026-09-22T00:00:00.000Z",
    });
    const summary = validateObserverAck(arm, ack);
    assert.equal(summary.canonicalCoverage, 6);
    assert.equal(summary.checkedFiles, 6);
    // Regeneration is byte-stable for the same arm bytes.
    const again = buildObserverAck({
      arm,
      acknowledgedBy: "different",
      acknowledgedAtIso: "2026-09-22T01:00:00.000Z",
    });
    assert.deepEqual(again.observerFiles, ack.observerFiles);
    assert.equal(again.observerSha256, ack.observerSha256);
  });
});

void test("ack validation rejects tampering, dirty src, a moved HEAD, and incomplete coverage", async () => {
  await withArmFixture("tamper", async (armRoot) => {
    const arm = inspectArm(armRoot);
    const ack = buildObserverAck({
      arm,
      acknowledgedBy: "v2-perf-qualify test",
      acknowledgedAtIso: "2026-09-22T00:00:00.000Z",
    });
    // A mutated observer file breaks the freeze (the arm snapshot predates the tamper).
    const armBeforeTamper = inspectArm(armRoot);
    const tamperedPath = join(armRoot, OBSERVER_FILES[2]);
    writeFileSync(tamperedPath, `${readFileSync(tamperedPath, "utf8")}tamper\n`);
    assert.throws(() => validateObserverAck(armBeforeTamper, ack), /hashes do not match the arm/u);
    writeFileSync(tamperedPath, `observer fixture 2\n`);

    // A deleted observer file breaks the freeze (the arm snapshot predates the deletion).
    const armBeforeDeletion = inspectArm(armRoot);
    const deletedPath = join(armRoot, OBSERVER_FILES[5]);
    const deletedBytes = readFileSync(deletedPath);
    rmSync(deletedPath);
    assert.throws(() => validateObserverAck(armBeforeDeletion, ack), /missing in arm/u);
    writeFileSync(deletedPath, deletedBytes);

    // Any src/ dirt (even outside the observer files) is refused.
    const foreign = join(armRoot, "src/renderer/state/stray.ts");
    mkdirSync(dirname(foreign), { recursive: true });
    writeFileSync(foreign, "untracked\n");
    assert.throws(() => validateObserverAck(inspectArm(armRoot), ack), /not clean/u);
    rmSync(foreign);

    // A moved HEAD is refused even when src/ is clean again.
    writeFileSync(join(armRoot, "NOTES.md"), "moved\n");
    runGit(armRoot, ["add", "-A"]);
    runGit(armRoot, ["-c", "commit.gpgsign=false", "commit", "-m", "move head"]);
    assert.throws(
      () => validateObserverAck(inspectArm(armRoot), ack),
      /does not match the acknowledged head/u,
    );
    // A reduced acknowledgment that drops one observer file is refused.
    const reduced = inspectArm(armRoot);
    const incomplete = buildObserverAck({
      arm: reduced,
      acknowledgedBy: "x",
      acknowledgedAtIso: "2026-09-22T00:00:00.000Z",
    });
    validateObserverAck(reduced, incomplete);
    const dropped = {
      ...incomplete,
      observerFiles: incomplete.observerFiles.slice(1),
    };
    assert.throws(
      () => validateObserverAck(reduced, dropped),
      /does not cover the observer files/u,
    );
    // Structural garbage is refused.
    assert.throws(() => validateObserverAck(reduced, { ...incomplete, observerSha256: "nope" }));
    assert.throws(() => validateObserverAck(reduced, { ...incomplete, armHead: "deadbeef" }));
    const notAnAck = join(armRoot, "not-an-ack.json");
    writeFileSync(notAnAck, '{"foo": 1}\n');
    assert.throws(() => validateObserverAck(reduced, readAckFile(notAnAck)));
  });
});

void test("dry run validates the plan without creating a run directory or launching vitest", async () => {
  await withArmFixture("dryrun", async (armRoot) => {
    const outRoot = join(makeTempRoot("dryrun-out"), "runs");
    const result = await runQualification({
      mode: "sustained",
      armRoot,
      repoRoot: scriptRepoRoot,
      outRoot,
      dryRun: true,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.dryRun, true);
    assert.equal(result.plan.durationMs, MODES.sustained.defaultMs);
    assert.equal(result.plan.ack.generated, true);
    assert.equal(result.plan.ack.armHead, armHead(armRoot));
    assert.equal(existsSync(outRoot), false);
  });
});

void test("runQualification launches the cell once, forwards signals, propagates exits, and writes provenance", async () => {
  await withArmFixture("run", async (armRoot) => {
    const outRoot = makeTempRoot("run-out");
    const records = { launches: [], killed: [] };
    const signalTarget = new EventEmitter();
    const result = await runQualification(
      {
        mode: "soak",
        armRoot,
        repoRoot: scriptRepoRoot,
        outRoot,
        durationMs: 24 * 60 * 60_000,
        acknowledgedBy: "unit test",
      },
      {
        baseEnv: { PATH: "/usr/bin:/bin", PORACODE_MOCK_AGENTS: "1" },
        signalTarget,
        spawnImpl: (command, args, opts) => {
          records.launches.push({ command, args, opts });
          // Deferred close: the harness attaches its listeners after spawn returns.
          const child = new EventEmitter();
          child.pid = 4242;
          child.kill = (signal) => {
            records.killed.push(signal);
            return true;
          };
          setImmediate(() => {
            signalTarget.emit("SIGTERM");
            child.emit("close", null, "SIGTERM");
          });
          return child;
        },
      },
    );
    assert.equal(result.exitCode, 128 + 15);
    assert.equal(result.exitCode, 143);
    assert.deepEqual(records.killed, ["SIGTERM"]);
    assert.equal(records.launches.length, 1);
    const launch = records.launches[0];
    assert.match(launch.command, /vitest$/u);
    assert.deepEqual(launch.args, [
      "run",
      "--config",
      "tests/native-e2e/vitest.config.ts",
      "tests/native-e2e/v2ArchitectureQualification.test.ts",
    ]);
    assert.equal(launch.opts.cwd, scriptRepoRoot);
    assert.equal(launch.opts.env.V2Q_ARM_ROOT, armRoot);
    assert.equal(launch.opts.env.V2Q_OUT_DIR, result.runDir);
    assert.equal(launch.opts.env.V2Q_OBSERVER_ACK, join(result.runDir, "observer-ack.json"));
    const spec = JSON.parse(launch.opts.env.V2Q_CELL_SPEC);
    assert.equal(spec.id, "v2q-soak");
    assert.equal(launch.opts.env.PORACODE_MOCK_AGENTS, "1");

    // The acknowledgment on disk validates and the provenance records the failure.
    const ack = readAckFile(join(result.runDir, "observer-ack.json"));
    assert.equal(ack.acknowledgedBy, "unit test");
    assert.equal(validateObserverAck(inspectArm(armRoot), ack).canonicalCoverage, 6);
    const provenance = JSON.parse(readFileSync(result.provenancePath, "utf8"));
    assert.equal(provenance.schema, "poracode.v2-perf-qualify.provenance/1");
    assert.equal(provenance.status, "failed");
    assert.equal(provenance.mode, "soak");
    assert.equal(provenance.durationMs, 24 * 60 * 60_000);
    assert.equal(provenance.arm.head, armHead(armRoot));
    assert.equal(provenance.arm.srcClean, true);
    assert.equal(provenance.ack.generated, true);
    assert.equal(provenance.vitest.exitCode, 128 + 15);
    assert.deepEqual(provenance.vitest.receivedSignals, ["SIGTERM"]);
    assert.equal(provenance.spec.parsed.id, "v2q-soak");
    assert.equal(provenance.spec.json, launch.opts.env.V2Q_CELL_SPEC);
    assert.ok(existsSync(join(result.runDir, "provenance.json")));
    rmSync(outRoot, { recursive: true, force: true });
  });
});

void test("buildVitestEnv layers the V2Q contract over the inherited environment", () => {
  const env = buildVitestEnv(
    { PATH: "/usr/bin:/bin", EXISTING: "yes" },
    {
      armRoot: "/arms/r0",
      ackPath: "/evidence/observer-ack.json",
      outDir: "/evidence/run",
      specJson: '{"id":"x"}',
    },
  );
  assert.equal(env.V2Q_ARM_ROOT, "/arms/r0");
  assert.equal(env.V2Q_OBSERVER_ACK, "/evidence/observer-ack.json");
  assert.equal(env.V2Q_OUT_DIR, "/evidence/run");
  assert.equal(env.V2Q_CELL_SPEC, '{"id":"x"}');
  assert.equal(env.EXISTING, "yes");
});

void test("resolveVitestCommand prefers the local vitest bin and falls back to pnpm exec", () => {
  const local = resolveVitestCommand(scriptRepoRoot);
  assert.equal(local.command, join(scriptRepoRoot, "node_modules", ".bin", "vitest"));
  assert.equal(local.args[0], "run");
  assert.ok(local.args.includes("tests/native-e2e/v2ArchitectureQualification.test.ts"));
  const bare = makeTempRoot("no-bin");
  try {
    const fallback = resolveVitestCommand(bare);
    assert.equal(fallback.command, "pnpm");
    assert.deepEqual(fallback.args.slice(0, 2), ["exec", "vitest"]);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});
