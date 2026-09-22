#!/usr/bin/env node
/**
 * Repeatable V2 performance qualification entrypoint (plan §4.2, cells A0-10/A0-11).
 *
 * Drives the existing native-e2e qualification cell
 * (tests/native-e2e/v2ArchitectureQualification.test.ts) through its V2Q_*
 * environment contract without duplicating any harness logic:
 *
 * 1. Validates the frozen arm (V2Q_ARM_ROOT): a git checkout/worktree whose
 *    `src/` is exactly clean at an exact HEAD, whose six renderer observer
 *    files are hashed, and whose session runtime prerequisites exist.
 * 2. Generates (or validates a provided) exact-head observer acknowledgment —
 *    the same freeze gate the cell re-runs itself via
 *    tests/native-e2e/helpers/armFreeze.ts; this CLI only refuses earlier and
 *    with a clearer error.
 * 3. Chooses a plan-aligned cell spec for the requested mode:
 *      - sustained: 30-minute sustained mixed-load cell
 *      - soak:      >=24h steady-state overnight soak cell
 * 4. Creates a unique evidence directory, writes a provenance manifest, then
 *    invokes the pinned vitest cell once, forwarding SIGINT/SIGTERM/SIGHUP and
 *    propagating the child's exit status.
 *
 * Usage:
 *   node scripts/v2-perf-qualify.mjs <sustained|soak> [options]
 *
 * Options:
 *   --arm <dir>               Frozen arm root (defaults to $V2Q_ARM_ROOT). In
 *                             CI the clean checkout itself is the arm.
 *   --duration <n><ms|s|m|h>  Cell duration override within the mode bounds.
 *   --out <dir>               Evidence parent directory (default:
 *                             <repo>/tmp/v2-production/perf-runs).
 *   --ack <file>              Validate this existing observer acknowledgment
 *                             instead of generating one.
 *   --acknowledged-by <text>  Acknowledgment attribution (default:
 *                             "v2-perf-qualify@<hostname>").
 *   --repo <dir>              Checkout that runs vitest (default: the repo
 *                             containing this script). Point it at a frozen
 *                             full copy to run helpers from frozen bytes.
 *   --dry-run                 Validate everything and print the resolved plan
 *                             as JSON; do not create the run or launch vitest.
 *   -h, --help
 *
 * Exit codes: 0 pass; 1+ the vitest cell's own exit code (an interrupted run
 * exits 128+signal); 2 a precondition or validation error before launch.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os, { arch, cpus, hostname, platform, release, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The renderer observer behavior, frozen byte-for-byte in every acknowledgment
 * (the six files the coordinator's observer-ready acknowledgment covers).
 */
export const OBSERVER_FILES = Object.freeze([
  "src/renderer/diagnostics/rendererPerfDiagnostics.ts",
  "src/renderer/diagnostics/rendererPerfDiagnostics.test.ts",
  "src/renderer/diagnostics/performanceEntryAdapters.ts",
  "src/renderer/diagnostics/performanceEntryAdapters.test.ts",
  "src/renderer/diagnostics/performanceObserverInstall.ts",
  "src/renderer/diagnostics/performanceObserverInstall.test.ts",
]);

/** The managed-session launcher the cell invokes inside the arm. */
export const MANAGED_LAUNCHER_RELATIVE_PATH =
  ".agents/skills/interactive-testing/scripts/poracode-cdp.mjs";

export const QUALIFICATION_TEST_RELATIVE_PATH =
  "tests/native-e2e/v2ArchitectureQualification.test.ts";

export const VITEST_CONFIG_RELATIVE_PATH = "tests/native-e2e/vitest.config.ts";

/** Mode duration bounds, in milliseconds. */
export const MODES = Object.freeze({
  sustained: Object.freeze({
    defaultMs: 30 * 60_000,
    minMs: 30 * 60_000,
    maxMs: 5 * 60 * 60_000,
  }),
  soak: Object.freeze({
    defaultMs: 24 * 60 * 60_000,
    minMs: 24 * 60 * 60_000,
    maxMs: 30 * 24 * 60 * 60_000,
  }),
});

const DURATION_UNITS = Object.freeze({ ms: 1, s: 1_000, m: 60_000, h: 3_600_000 });

const SIGNAL_NUMBERS = Object.freeze(os.constants.signals);
const FORWARDED_SIGNALS = Object.freeze(["SIGINT", "SIGTERM", "SIGHUP"]);

/** Parses `"<n><ms|s|m|h>"` into milliseconds; rejects anything ambiguous. */
export function parseDurationMs(text) {
  if (typeof text !== "string") {
    throw new Error(`invalid duration ${JSON.stringify(text)}: expected <n><ms|s|m|h>`);
  }
  const match = /^(\d+)(ms|s|m|h)$/u.exec(text.trim());
  if (match === null || match[1] === "0") {
    throw new Error(`invalid duration ${JSON.stringify(text)}: expected a positive <n><ms|s|m|h>`);
  }
  const value = Number(match[1]) * DURATION_UNITS[match[2]];
  if (!Number.isSafeInteger(value)) {
    throw new Error(`invalid duration ${JSON.stringify(text)}: value is not a safe integer`);
  }
  return value;
}

export function formatDuration(ms) {
  if (ms % 3_600_000 === 0) return `${String(ms / 3_600_000)}h`;
  if (ms % 60_000 === 0) return `${String(ms / 60_000)}m`;
  if (ms % 1_000 === 0) return `${String(ms / 1_000)}s`;
  return `${String(ms)}ms`;
}

/** Applies the mode bounds to a parsed duration (undefined -> mode default). */
export function resolveModeDuration(mode, durationMs) {
  const bounds = MODES[mode];
  if (durationMs === undefined) return bounds.defaultMs;
  if (typeof durationMs !== "number" || !Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new Error(`invalid ${mode} duration: ${JSON.stringify(durationMs)}`);
  }
  if (durationMs < bounds.minMs || durationMs > bounds.maxMs) {
    throw new Error(
      `${mode} duration must be between ${formatDuration(bounds.minMs)} and ` +
        `${formatDuration(bounds.maxMs)}, got ${formatDuration(durationMs)}`,
    );
  }
  return durationMs;
}

/**
 * Plan-aligned cell specs. Both cells hold the section 4.2 representative
 * envelope: four clients, a legacy/no-interests peer, a slow peer, reconnect,
 * two chat panes, one hot terminal, and a 10k-row inactive catalog. The
 * trusted long-task protocol supplies both the real input population used by
 * the latency budgets and the required positive control. PTY-only streams run
 * in the managed mock profile, so no provider credentials are involved. The
 * overnight workflow is a steady-state soak; restart-cycle evidence remains a
 * separate qualification gate and is not implied by this spec.
 */
export function buildCellSpec(mode, durationMs) {
  const shared = Object.freeze({
    producers: 8,
    clients: 4,
    legacyClient: true,
    slowClient: true,
    reconnectClient: true,
    visibleChatPanes: 2,
    terminalSurface: "panel",
    catalogThreads: 10_000,
    protocol: "longtask",
    assertBudgets: true,
    trustedInput: {},
    structuredWorkload: null,
  });
  if (mode === "sustained") {
    return Object.freeze({
      ...shared,
      id: "v2q-sustained",
      label:
        "plan §4.2 sustained mixed load: 8 PTY producers, 4 clients, 10k catalog, " +
        "2 chat panes + terminal panel, slow/legacy/reconnect pressure and trusted input",
      durationMs,
    });
  }
  return Object.freeze({
    ...shared,
    id: "v2q-soak",
    label:
      "plan §4.2 steady-state overnight soak: sustained representative envelope held for >=24h",
    durationMs,
  });
}

/** Parses CLI arguments; `arm` falls back to the V2Q_ARM_ROOT environment. */
export function parseArgs(argv, env = process.env) {
  const parsed = {
    mode: undefined,
    arm: undefined,
    durationText: undefined,
    out: undefined,
    ack: undefined,
    acknowledgedBy: undefined,
    repo: undefined,
    dryRun: false,
    help: false,
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = () => {
      index += 1;
      const next = argv[index];
      if (next === undefined) {
        throw new Error(`${token} requires a value`);
      }
      return next;
    };
    if (token === "-h" || token === "--help") {
      parsed.help = true;
    } else if (token === "--arm") {
      parsed.arm = value();
    } else if (token === "--duration") {
      parsed.durationText = value();
    } else if (token === "--out") {
      parsed.out = value();
    } else if (token === "--ack") {
      parsed.ack = value();
    } else if (token === "--acknowledged-by") {
      parsed.acknowledgedBy = value();
    } else if (token === "--repo") {
      parsed.repo = value();
    } else if (token === "--dry-run") {
      parsed.dryRun = true;
    } else if (token.startsWith("-")) {
      throw new Error(`unknown option ${token}`);
    } else {
      positional.push(token);
    }
  }
  if (parsed.help) return parsed;
  if (positional.length !== 1) {
    throw new Error("exactly one mode argument is required: sustained|soak");
  }
  const [mode] = positional;
  if (!(mode in MODES)) {
    throw new Error(`unknown mode ${JSON.stringify(mode)}: expected sustained or soak`);
  }
  parsed.mode = mode;
  parsed.arm ??= env.V2Q_ARM_ROOT ?? null;
  if (!parsed.arm) {
    throw new Error("no arm root: pass --arm <dir> or set V2Q_ARM_ROOT");
  }
  return parsed;
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout ?? "";
}

function hashFile(root, relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  return {
    path: relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
}

function parseStatusRecords(zOutput) {
  const dirty = [];
  for (const record of zOutput.split("\0")) {
    if (!record) continue;
    const path = record.slice(3);
    if (path) dirty.push(path);
  }
  return dirty.sort();
}

/**
 * Inspects the frozen arm without mutating it: exact HEAD, clean `src/`,
 * hashed observer files, and the session-runtime prerequisites the cell's
 * managed launcher needs (node_modules + the interactive-testing launcher).
 */
export function inspectArm(armRoot) {
  if (!existsSync(armRoot)) {
    throw new Error(`arm root does not exist: ${armRoot}`);
  }
  if (!existsSync(join(armRoot, ".git"))) {
    throw new Error(`arm root is not a git checkout or worktree (no .git): ${armRoot}`);
  }
  const gitHead = git(armRoot, ["rev-parse", "HEAD"])?.trim() ?? null;
  if (gitHead === null || !/^[0-9a-f]{40}$/u.test(gitHead)) {
    throw new Error(`cannot resolve an exact HEAD in the arm: ${armRoot}`);
  }
  const statusOutput = git(armRoot, ["status", "--porcelain=v1", "-z", "--", "src"]);
  if (statusOutput === null) {
    throw new Error(`cannot read git status in the arm: ${armRoot}`);
  }
  const srcDirty = parseStatusRecords(statusOutput);
  const observerFiles = [];
  for (const relativePath of OBSERVER_FILES) {
    const hashed = hashFile(armRoot, relativePath);
    if (hashed === null) {
      throw new Error(`arm is missing the observer file ${relativePath}`);
    }
    observerFiles.push(hashed);
  }
  const nodeModules = existsSync(join(armRoot, "node_modules"));
  const launcherScript = existsSync(join(armRoot, MANAGED_LAUNCHER_RELATIVE_PATH));
  if (!nodeModules || !launcherScript) {
    throw new Error(
      `arm is not prepared for a managed session: ` +
        `${MANAGED_LAUNCHER_RELATIVE_PATH}${launcherScript ? " present" : " missing"}, ` +
        `node_modules ${nodeModules ? "present" : " missing"}; ` +
        `run 'pnpm install --frozen-lockfile' in ${armRoot} first`,
    );
  }
  return {
    armRoot,
    gitHead,
    srcDirty,
    srcClean: srcDirty.length === 0,
    observerFiles,
    nodeModules,
    launcherScript,
  };
}

/** Builds an exact-head acknowledgment record from a validated arm inspection. */
export function buildObserverAck({ arm, acknowledgedBy, acknowledgedAtIso }) {
  const primary = arm.observerFiles.find((file) => file.path === OBSERVER_FILES[0]);
  if (primary === undefined) {
    throw new Error(`arm inspection did not hash the primary observer ${OBSERVER_FILES[0]}`);
  }
  return Object.freeze({
    observerSha256: primary.sha256,
    acknowledgedBy,
    acknowledgedAt: acknowledgedAtIso,
    armHead: arm.gitHead,
    allowedSrcDirty: [],
    observerFiles: arm.observerFiles,
  });
}

export function readAckFile(ackPath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(ackPath, "utf8"));
  } catch (error) {
    throw new Error(`observer acknowledgment ${ackPath} is not readable JSON: ${error.message}`, {
      cause: error,
    });
  }
  return parsed;
}

/**
 * Validates an acknowledgment against the arm as it is NOW: structure, exact
 * HEAD, clean `src/`, coverage of all six observer files, and a re-hash of
 * every acknowledged file from disk. Throws with the first hard failure.
 */
export function validateObserverAck(arm, ack, ackLabel = "observer acknowledgment") {
  if (typeof ack.observerSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(ack.observerSha256)) {
    throw new Error(`${ackLabel} has no valid observerSha256`);
  }
  if (typeof ack.acknowledgedBy !== "string" || ack.acknowledgedBy.length === 0) {
    throw new Error(`${ackLabel} is missing acknowledgedBy`);
  }
  if (typeof ack.acknowledgedAt !== "string" || ack.acknowledgedAt.length === 0) {
    throw new Error(`${ackLabel} is missing acknowledgedAt`);
  }
  if (typeof ack.armHead !== "string" || !/^[0-9a-f]{40}$/u.test(ack.armHead)) {
    throw new Error(`${ackLabel} has no exact armHead commit`);
  }
  if (ack.armHead !== arm.gitHead) {
    throw new Error(
      `arm head ${arm.gitHead} does not match the acknowledged head ${ack.armHead}: ` +
        `the arm moved since the acknowledgment was written`,
    );
  }
  if (!Array.isArray(ack.observerFiles) || ack.observerFiles.length === 0) {
    throw new Error(`${ackLabel} has no observerFiles array`);
  }
  if (!arm.srcClean) {
    throw new Error(`arm src/ is not clean (clean source is required): ${arm.srcDirty.join(", ")}`);
  }
  const acknowledgedPaths = new Set();
  for (const entry of ack.observerFiles) {
    const record = entry ?? {};
    if (typeof record.path !== "string" || record.path.length === 0) {
      throw new Error(`${ackLabel} has an observerFiles entry without a path`);
    }
    if (typeof record.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(record.sha256)) {
      throw new Error(`${ackLabel} observerFiles entry ${record.path} has no valid sha256`);
    }
    if (
      typeof record.bytes !== "number" ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 0
    ) {
      throw new Error(`${ackLabel} observerFiles entry ${record.path} has no valid byte count`);
    }
    acknowledgedPaths.add(record.path);
  }
  const missing = OBSERVER_FILES.filter((path) => !acknowledgedPaths.has(path));
  if (missing.length > 0) {
    throw new Error(`${ackLabel} does not cover the observer files: ${missing.join(", ")}`);
  }
  const mismatches = [];
  for (const expected of ack.observerFiles) {
    const actual = hashFile(arm.armRoot, expected.path);
    if (actual === null) {
      mismatches.push(`${expected.path}: missing in arm`);
      continue;
    }
    if (actual.sha256 !== expected.sha256) {
      mismatches.push(
        `${expected.path}: arm=${actual.sha256.slice(0, 12)} ack=${expected.sha256.slice(0, 12)}`,
      );
    } else if (actual.bytes !== expected.bytes) {
      mismatches.push(
        `${expected.path}: bytes ${String(actual.bytes)} != ${String(expected.bytes)}`,
      );
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `acknowledged observer file hashes do not match the arm: ${mismatches.join(", ")}`,
    );
  }
  const primary = ack.observerFiles.find((file) => file.path === OBSERVER_FILES[0]);
  if (primary.sha256 !== ack.observerSha256) {
    throw new Error(`${ackLabel} observerSha256 does not match the primary observer file hash`);
  }
  return { checkedFiles: ack.observerFiles.length, canonicalCoverage: OBSERVER_FILES.length };
}

export function runDirName(mode, now = new Date(), suffix = randomBytes(2).toString("hex")) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
  return `${mode}-${stamp}-${suffix}`;
}

/** Creates the unique evidence directory; never reuses an existing one. */
export function createRunDir(outRoot, mode, now = new Date()) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const name = runDirName(mode, now);
    const path = join(outRoot, name);
    if (existsSync(path)) continue;
    mkdirSync(path, { recursive: true });
    return path;
  }
  throw new Error(`could not allocate a unique run directory under ${outRoot}`);
}

export const VITEST_CELL_ARGS = Object.freeze([
  "run",
  "--config",
  VITEST_CONFIG_RELATIVE_PATH,
  QUALIFICATION_TEST_RELATIVE_PATH,
]);

/** Prefers the deterministic local vitest bin; falls back to `pnpm exec`. */
export function resolveVitestCommand(repoRootOverride = repoRoot) {
  const direct = join(repoRootOverride, "node_modules", ".bin", "vitest");
  if (existsSync(direct)) {
    return { command: direct, args: [...VITEST_CELL_ARGS] };
  }
  return { command: "pnpm", args: ["exec", "vitest", ...VITEST_CELL_ARGS] };
}

export function requireQualificationTest(repoRootOverride = repoRoot) {
  const testPath = join(repoRootOverride, QUALIFICATION_TEST_RELATIVE_PATH);
  if (!existsSync(testPath)) {
    throw new Error(`qualification cell not found in ${repoRootOverride}: ${testPath}`);
  }
}

export function buildVitestEnv(baseEnv, { armRoot, ackPath, outDir, specJson }) {
  return {
    ...baseEnv,
    V2Q_ARM_ROOT: armRoot,
    V2Q_OBSERVER_ACK: ackPath,
    V2Q_OUT_DIR: outDir,
    V2Q_CELL_SPEC: specJson,
  };
}

/**
 * Runs the vitest cell once. Forwards SIGINT/SIGTERM/SIGHUP to the child and
 * propagates its exit status; an interrupted parent never exits 0, and a
 * child killed by a signal maps to 128+signal like a shell would.
 */
export function runVitestCell(launch, deps = {}) {
  const spawnImpl = deps.spawnImpl ?? spawn;
  const signals = deps.signalTarget ?? process;
  return new Promise((resolvePromise) => {
    const child = spawnImpl(launch.command, launch.args, {
      cwd: launch.cwd,
      env: launch.env,
      stdio: "inherit",
    });
    const receivedSignals = [];
    const forwards = new Map();
    let settled = false;
    const finish = (exitCode, exitSignal = null) => {
      if (settled) return;
      settled = true;
      for (const [signal, forward] of forwards) signals.removeListener(signal, forward);
      resolvePromise({ exitCode, exitSignal, receivedSignals: [...receivedSignals] });
    };
    for (const signal of FORWARDED_SIGNALS) {
      const forward = () => {
        receivedSignals.push(signal);
        if (typeof child.pid === "number") child.kill(signal);
      };
      forwards.set(signal, forward);
      signals.on(signal, forward);
    }
    child.on("error", (error) => {
      console.error(`[v2-perf-qualify] failed to launch vitest: ${error.message}`);
      finish(127);
    });
    child.on("close", (code, signal) => {
      if (receivedSignals.length > 0) {
        const last = receivedSignals[receivedSignals.length - 1];
        finish(128 + (SIGNAL_NUMBERS[last] ?? 1), last);
        return;
      }
      if (signal !== null && signal !== undefined) {
        finish(128 + (SIGNAL_NUMBERS[signal] ?? 1), signal);
        return;
      }
      finish(code ?? 1);
    });
  });
}

function getRepoGitInfo(root) {
  if (!existsSync(join(root, ".git"))) return { head: null, dirty: [], dirtyCount: 0 };
  const head = git(root, ["rev-parse", "HEAD"])?.trim() ?? null;
  const statusOutput = git(root, ["status", "--porcelain=v1", "-z"]) ?? "";
  const dirty = parseStatusRecords(statusOutput);
  return { head, dirty: dirty.slice(0, 200), dirtyCount: dirty.length };
}

export function buildProvenance(input) {
  const [cpuModel] = cpus();
  return {
    schema: "poracode.v2-perf-qualify.provenance/1",
    mode: input.mode,
    durationMs: input.durationMs,
    status: input.status,
    startedAtIso: input.startedAtIso,
    finishedAtIso: input.finishedAtIso ?? null,
    wallMs: input.wallMs ?? null,
    dryRun: input.dryRun === true,
    repo: input.repo,
    arm: {
      root: input.arm.armRoot,
      head: input.arm.gitHead,
      srcClean: input.arm.srcClean,
      srcDirtyFiles: input.arm.srcDirty,
      observerFiles: input.arm.observerFiles,
      nodeModules: input.arm.nodeModules,
      launcherScript: input.arm.launcherScript,
    },
    ack: input.ack,
    spec: {
      json: input.specJson,
      parsed: input.spec,
    },
    vitest: input.vitest,
    host: {
      platform: platform(),
      release: release(),
      arch: arch(),
      hostname: hostname(),
      cpuModel: cpuModel?.model ?? null,
      cpuCount: cpus().length,
      totalMemBytes: totalmem(),
      nodeVersion: process.version,
    },
  };
}

function writeJson600(path, payload) {
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Full qualification run for one mode. Returns { exitCode, runDir, ... } and
 * always leaves a provenance manifest behind once the run directory exists —
 * including when the cell fails or the parent is interrupted.
 */
export async function runQualification(options, deps = {}) {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const startedAtIso = nowIso();
  const startedAtMs = Date.now();
  const mode = options.mode;
  const arm = inspectArm(options.armRoot);
  const effectiveRepoRoot = resolve(options.repoRoot ?? repoRoot);
  requireQualificationTest(effectiveRepoRoot);

  const durationMs = resolveModeDuration(mode, options.durationMs);
  const spec = buildCellSpec(mode, durationMs);
  const specJson = JSON.stringify(spec);

  const repo = getRepoGitInfo(effectiveRepoRoot);
  const ackGenerated = options.ackPath === undefined;
  let ackRecord;
  let ackPath;
  if (ackGenerated) {
    ackRecord = buildObserverAck({
      arm,
      acknowledgedBy: options.acknowledgedBy ?? `v2-perf-qualify@${hostname()}`,
      acknowledgedAtIso: startedAtIso,
    });
  } else {
    ackPath = resolve(options.ackPath);
    ackRecord = readAckFile(ackPath);
  }
  const ackLabel = ackGenerated
    ? "generated observer acknowledgment"
    : `observer acknowledgment ${ackPath}`;
  const ackValidation = validateObserverAck(arm, ackRecord, ackLabel);

  if (options.dryRun === true) {
    const plan = {
      mode,
      durationMs,
      arm: { root: arm.armRoot, head: arm.gitHead, srcClean: arm.srcClean },
      ack: {
        generated: ackGenerated,
        ...(ackPath === undefined ? {} : { path: ackPath }),
        validation: ackValidation,
        acknowledgedBy: ackRecord.acknowledgedBy,
        armHead: ackRecord.armHead,
      },
      spec,
      repo,
      vitest: resolveVitestCommand(effectiveRepoRoot),
    };
    return { exitCode: 0, dryRun: true, plan };
  }

  const outRoot = resolve(options.outRoot ?? join(repoRoot, "tmp", "v2-production", "perf-runs"));
  const runDir = createRunDir(outRoot, mode);
  if (ackGenerated) {
    ackPath = join(runDir, "observer-ack.json");
    writeJson600(ackPath, ackRecord);
    // Prove the bytes on disk are exactly what was validated above.
    validateObserverAck(arm, readAckFile(ackPath), `observer acknowledgment ${ackPath}`);
  }
  const ackSha256 = createHash("sha256").update(readFileSync(ackPath)).digest("hex");

  const vitest = resolveVitestCommand(effectiveRepoRoot);
  const launch = {
    command: vitest.command,
    args: vitest.args,
    cwd: effectiveRepoRoot,
    env: buildVitestEnv(deps.baseEnv ?? process.env, {
      armRoot: arm.armRoot,
      ackPath,
      outDir: runDir,
      specJson,
    }),
  };
  const provenanceBase = {
    mode,
    durationMs,
    startedAtIso,
    dryRun: false,
    repo,
    arm,
    ack: {
      path: ackPath,
      sha256: ackSha256,
      generated: ackGenerated,
      acknowledgedBy: ackRecord.acknowledgedBy,
      acknowledgedAt: ackRecord.acknowledgedAt,
      armHead: ackRecord.armHead,
      validation: ackValidation,
    },
    specJson,
    spec,
    vitest: { ...vitest, cwd: effectiveRepoRoot },
  };
  const provenancePath = join(runDir, "provenance.json");
  writeJson600(provenancePath, buildProvenance({ ...provenanceBase, status: "running" }));

  console.error(
    `[v2-perf-qualify] mode=${mode} duration=${formatDuration(durationMs)} ` +
      `arm@${arm.gitHead.slice(0, 12)} out=${runDir}`,
  );
  console.error(`[v2-perf-qualify] ${launch.command} ${launch.args.join(" ")}`);

  const result = await runVitestCell(launch, deps);
  const finishedAtIso = nowIso();
  writeJson600(
    provenancePath,
    buildProvenance({
      ...provenanceBase,
      status: result.exitCode === 0 ? "passed" : "failed",
      finishedAtIso,
      wallMs: Date.now() - startedAtMs,
      vitest: {
        ...vitest,
        cwd: effectiveRepoRoot,
        exitCode: result.exitCode,
        exitSignal: result.exitSignal,
        receivedSignals: result.receivedSignals,
      },
    }),
  );
  console.error(`[v2-perf-qualify] cell exit=${String(result.exitCode)} evidence=${runDir}`);
  return { exitCode: result.exitCode, runDir, ackPath, provenancePath, spec };
}

function printUsage() {
  console.error(`Usage:
  node scripts/v2-perf-qualify.mjs <sustained|soak> [options]

Modes:
  sustained   ${formatDuration(MODES.sustained.minMs)} sustained mixed-load cell (plan A0-10 shape; bounds ${formatDuration(MODES.sustained.minMs)}-${formatDuration(MODES.sustained.maxMs)})
  soak        >=${formatDuration(MODES.soak.minMs)} overnight soak cell (plan A0-11 shape; bounds ${formatDuration(MODES.soak.minMs)}-${formatDuration(MODES.soak.maxMs)})

Options:
  --arm <dir>               Frozen arm root (defaults to $V2Q_ARM_ROOT)
  --duration <n><ms|s|m|h>  Cell duration override within the mode bounds
  --out <dir>               Evidence parent directory
  --ack <file>              Validate an existing observer acknowledgment
  --acknowledged-by <text>  Acknowledgment attribution
  --repo <dir>              Checkout that runs vitest (default: this repo)
  --dry-run                 Validate and print the resolved plan only
  -h, --help

Exit codes: 0 pass; 1+ vitest cell status (128+signal when interrupted); 2 precondition error.`);
}

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(`[v2-perf-qualify] error: ${error.message}`);
    printUsage();
    return 2;
  }
  if (parsed.help) {
    printUsage();
    return 0;
  }
  try {
    const durationMs =
      parsed.durationText === undefined ? undefined : parseDurationMs(parsed.durationText);
    const result = await runQualification({
      mode: parsed.mode,
      armRoot: resolve(parsed.arm),
      durationMs,
      outRoot: parsed.out === undefined ? undefined : resolve(parsed.out),
      ackPath: parsed.ack,
      acknowledgedBy: parsed.acknowledgedBy,
      repoRoot: parsed.repo,
      dryRun: parsed.dryRun,
    });
    if (result.dryRun === true) {
      // The resolved plan is the dry run's stdout payload; logs stay on stderr.
      console.log(JSON.stringify(result.plan, null, 2));
    }
    return result.exitCode;
  } catch (error) {
    console.error(
      `[v2-perf-qualify] error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(
        `[v2-perf-qualify] error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 2;
    },
  );
}
