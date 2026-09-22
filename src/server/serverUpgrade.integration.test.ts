import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { canonicalHostPath, resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { installServerPrefix } from "../../scripts/install-server-prefix.mjs";
import { resolveBetterSqliteNativeBindingOptions } from "@/host/db/connection";
import { readReleaseBuildIdentity } from "./serverUpgradeIdentity";
import { upgradeServerPrefix } from "./serverUpgrade";
import {
  parseCandidateMigrationPolicy,
  type CandidateMigrationPolicy,
} from "./serverUpgradeMigrationPolicy";

/**
 * V6 D.4 round-1 follow-up plus D4: REAL upgrade integration tests against a
 * genuinely assembled tarball. They install the artifact, start the real
 * server so it HOLDS THE OWNER LEASE, upgrade with the default (real) IO, and
 * assert the authenticated build identity of the restarted daemon. Skipped
 * unless a D4-capable tarball is present in `dist/` — CI runs this in
 * `server_install_qualification` right after assembling the tarball.
 *
 * The N-1 → N test uses distinct bytes (the current tarball as the running
 * release, and a repacked, differently-versioned, differently-hashed copy as
 * N) and a profile database genuinely reverted to the pre-47 shape by applying
 * the exact inverse of migration 47 (drop index and added columns), so the
 * forward-only schema 47 path (backup, staged admission, column/index creation,
 * interrupted-receipt rewrite) is exercised end to end on real pre-47 data.
 * This is not a released N-1 artifact: a real published previous release
 * remains a release gate (recorded in tmp/v2-production/d4-review-corrections.md).
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Test hook so the required-mode failure is verifiable without touching dist/.
const distDir = process.env.PORACODE_SERVER_DIST_DIR?.trim() || join(repoRoot, "dist");

/**
 * The current assembly recipe ships `scripts/server-release-install.mjs`, and
 * the install path refuses archives carrying symlink entries. A stale tarball
 * from an older recipe cannot be installed by design, so skip instead of
 * failing on unrelated dist/ leftovers.
 */
function findTarball(): string | null {
  if (!existsSync(distDir)) return null;
  const tarballs = readdirSync(distDir)
    .filter((name) => name.startsWith("poracode-server-") && name.endsWith(".tar.gz"))
    .sort()
    .reverse();
  for (const name of tarballs) {
    const path = join(distDir, name);
    try {
      const listing = execFileSync("tar", ["-tzf", path], { encoding: "utf8" });
      if (listing.includes("scripts/server-release-install.mjs")) return path;
    } catch {
      // Unreadable candidate; try the next one.
    }
  }
  return null;
}

/** A pre-D4 bundle cannot answer the authenticated status/admit operations. */
function tarballSupportsD4(path: string): boolean {
  try {
    const members = execFileSync("tar", ["-tzf", path], { encoding: "utf8" }).split(/\r?\n/u);
    const entrypointMember = members.find(
      (member) => member.replace(/^\.\//u, "") === "lib/server.cjs",
    );
    if (!entrypointMember) return false;
    const entrypoint = execFileSync("tar", ["-xzf", path, "-O", entrypointMember], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    return entrypoint.includes("not-staging") && entrypoint.includes("identity-mismatch");
  } catch {
    return false;
  }
}

const tarball = findTarball();
const runnable = tarball !== null && process.platform !== "win32" && tarballSupportsD4(tarball);
const required = process.env.PORACODE_REQUIRE_SERVER_IT === "1";
if (required && !runnable) {
  // Required mode must fail, never pass by skipping: a missing artifact means
  // the only real-artifact upgrade gate disappeared.
  throw new Error(
    "PORACODE_REQUIRE_SERVER_IT=1 but no D4-capable dist/poracode-server-*.tar.gz exists " +
      "(one carrying scripts/server-release-install.mjs and the authenticated status/admit " +
      "operations). Assemble the artifact first: `pnpm run build:web && " +
      "pnpm run prepare:server-native && pnpm run prepare:agent-plugins && " +
      "pnpm run prepare:computer-use-helper && pnpm run assemble:server-tarball`.",
  );
}
if (!runnable) {
  console.warn(
    "[serverUpgrade.integration] SKIPPED: no D4-capable current-recipe " +
      "dist/poracode-server-*.tar.gz (one carrying scripts/server-release-install.mjs and " +
      "the authenticated status/admit operations). Run `pnpm run build:web && " +
      "pnpm run prepare:server-native && pnpm run prepare:agent-plugins && " +
      "pnpm run prepare:computer-use-helper && pnpm run assemble:server-tarball` first. " +
      "This is a pending real-artifact gate, not passing evidence. Set " +
      "PORACODE_REQUIRE_SERVER_IT=1 (the artifact workflow must do this) to fail instead of skip.",
  );
}

const dirs: string[] = [];
const envBackup = new Map<string, string | undefined>();

afterEach(
  () => {
    // Best-effort daemon reaping so a failed assertion cannot leak a lease
    // holder (and its ports) into the next run.
    for (const workRoot of dirs.splice(0)) {
      const pidFile = join(workRoot, "prefix", "poracode-server.pid");
      try {
        if (existsSync(pidFile)) {
          const pid = Number(readFileSync(pidFile, "utf8").trim());
          if (Number.isSafeInteger(pid) && pid > 0) process.kill(pid, "SIGTERM");
        }
      } catch {
        // already gone
      }
      rmSync(workRoot, { recursive: true, force: true });
    }
    for (const [key, value] of envBackup) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    envBackup.clear();
  },
  // The teardown kills a real daemon and removes a staged prefix (a full
  // node_modules rmSync can alone exceed 15s on a loaded full-suite run).
  180_000,
);

function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("failed to allocate port"));
        return;
      }
      const port = address.port;
      probe.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

function sandboxEnv(profile: string, port: number): void {
  for (const key of [
    "PORACODE_BASE_DIR",
    "PORACODE_REMOTE_ACCESS_HOST",
    "PORACODE_REMOTE_ACCESS_PORT",
    "PORACODE_HEADLESS_SERVER",
    "PORACODE_SECRET_STORAGE_KEY",
  ]) {
    envBackup.set(key, process.env[key]);
  }
  process.env.PORACODE_BASE_DIR = profile;
  process.env.PORACODE_REMOTE_ACCESS_HOST = "127.0.0.1";
  process.env.PORACODE_REMOTE_ACCESS_PORT = String(port);
  process.env.PORACODE_HEADLESS_SERVER = "1";
  // Explicit file/environment credential custody: keeps the daemon off the
  // interactive OS keychain, which has no user session on a test runner.
  process.env.PORACODE_SECRET_STORAGE_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
}

function serverEnv(profile: string, port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PORACODE_BASE_DIR: profile,
    PORACODE_REMOTE_ACCESS_HOST: "127.0.0.1",
    PORACODE_REMOTE_ACCESS_PORT: String(port),
    PORACODE_HEADLESS_SERVER: "1",
  };
}

function waitForText(stream: NodeJS.ReadableStream, needle: string, timeoutMs: number) {
  return new Promise<void>((resolveWait, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${needle}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes(needle)) {
        clearTimeout(timer);
        stream.off("data", onData);
        resolveWait();
      }
    };
    stream.on("data", onData);
  });
}

interface Daemon {
  readonly child: ReturnType<typeof spawn>;
  readonly port: number;
  readonly startSignal: "stdout" | "health";
  readonly outputTail: () => string;
}

/** Start the installed server on the SANDBOXED port (the one `sandboxEnv`
 * exported through `process.env`, so the upgrade's own respawn rebinds the
 * same listener) and wait for its real HTTP surface to answer. */
async function startDaemon(prefix: string, profile: string, port: number): Promise<Daemon> {
  const child = spawn(process.execPath, [join(prefix, "current", "lib", "server.cjs")], {
    env: serverEnv(profile, port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString("utf8")));
  // Dual start signal: the console line on stdout, or /healthz answering.
  // A build whose console mirroring swallows stdout still boots and serves.
  const startSignal = await Promise.race([
    waitForText(child.stdout, "listening at:", 120_000).then(() => "stdout" as const),
    (async () => {
      const deadline = Date.now() + 120_000;
      for (;;) {
        if (await healthOk(port)) return "health" as const;
        if (Date.now() >= deadline) throw new Error("daemon never started listening");
        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      }
    })(),
  ]);
  return {
    child,
    port,
    startSignal,
    outputTail: () => output.join("").slice(-2_000),
  };
}

const DEBUG = Boolean(process.env.PORACODE_UPGRADE_IT_DEBUG);

/**
 * Liveness of the daemon's real HTTP surface. 200 is the contract answer
 * (`/healthz` is `auth: "public"`); 401 also counts as ALIVE — it is the live
 * remote-access router answering, which only happens when the daemon's HTTP
 * stack is up (a failed upgrade leaves the port closed, i.e. ECONNREFUSED).
 * The 401 tolerance keeps the test meaningful against an older assembled
 * bundle whose build predates the public-healthz contract.
 */
async function healthOk(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (DEBUG) console.log(`[health] port ${port} status ${response.status}`);
    return response.ok || response.status === 401;
  } catch (error) {
    if (DEBUG) console.log(`[health] port ${port} error ${(error as Error).message}`);
    return false;
  }
}

async function waitForHealth(port: number, want: boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((await healthOk(port)) === want) return;
    if (Date.now() >= deadline) throw new Error(`health never became ${want}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
}

function ownerRecord(profile: string): { pid?: number; phase?: string } | null {
  const path = `${profile}.host-owner.json`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as { pid?: number; phase?: string };
}

async function waitForOwnerPhase(profile: string, phase: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const record = ownerRecord(profile);
    const pid = record?.pid;
    let holderGone = true;
    if (typeof pid === "number" && pid > 0) {
      try {
        process.kill(pid, 0);
        holderGone = false;
      } catch {
        holderGone = true;
      }
    }
    if (record?.phase === phase && holderGone) return;
    if (Date.now() >= deadline) {
      throw new Error(`owner record never reached phase=${phase}: ${JSON.stringify(record)}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
}

async function stopDaemonAt(pidPath: string, profile: string): Promise<void> {
  if (existsSync(pidPath)) {
    const pid = Number(readFileSync(pidPath, "utf8").trim());
    if (Number.isSafeInteger(pid) && pid > 0) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  }
  try {
    await waitForOwnerPhase(profile, "stopped", 20_000);
  } catch {
    // best-effort cleanup; assertions above own the strictness
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * doctor-passing but health-dead: runs forever, binds nothing. The synthetic
 * registry mirrors the current migration policy, so no migration is pending
 * and the failure takes the pre-admission rollback path this test asserts.
 */
function readReleaseMigrationPolicy(releaseDir: string): CandidateMigrationPolicy {
  const output = execFileSync(
    process.execPath,
    [join(releaseDir, "lib", "server.cjs"), "doctor", "--json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 },
  );
  const policy = parseCandidateMigrationPolicy(
    (JSON.parse(output) as { migrations?: unknown }).migrations,
  );
  if (!policy) throw new Error("release doctor did not report a valid migration policy");
  return policy;
}

function brokenServerStub(policy: CandidateMigrationPolicy): string {
  const doctorLine = JSON.stringify({
    checks: [{ name: "stub", status: "ok" }],
    migrations: policy,
  });
  return [
    "const argv = process.argv.slice(2);",
    'if (argv[0] === "doctor") {',
    `  process.stdout.write(${JSON.stringify(`${doctorLine}\n`)});`,
    "  process.exit(0);",
    "}",
    "process.title = 'poracode-broken-upgrade';",
    "setInterval(() => {}, 60_000);",
    "",
  ].join("\n");
}

function buildBrokenTarball(sourceTarball: string): string {
  const stage = mkdtempSync(join(tmpdir(), "poracode-broken-stage-"));
  dirs.push(stage);
  execFileSync("tar", ["-xzf", sourceTarball, "-C", stage], { stdio: "pipe" });
  writeFileSync(
    join(stage, "lib", "server.cjs"),
    brokenServerStub(readReleaseMigrationPolicy(stage)),
  );
  const brokenTarball = join(stage, "poracode-server-broken.tar.gz");
  execFileSync("tar", ["-czf", brokenTarball, "-C", stage, "."], { stdio: "pipe" });
  return brokenTarball;
}

/**
 * The "N" bytes: the current source tree repacked with another version and a
 * byte-different entrypoint, so identity qualification cannot pass by
 * accident and the upgrade cannot be a same-tarball reinstall. This is a
 * repack of the current build, not a released N-1 artifact.
 */
function buildDistinctTarball(sourceTarball: string, version: string): string {
  const stage = mkdtempSync(join(tmpdir(), "poracode-distinct-stage-"));
  dirs.push(stage);
  execFileSync("tar", ["-xzf", sourceTarball, "-C", stage], { stdio: "pipe" });
  const packagePath = join(stage, "package.json");
  const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as Record<string, unknown>;
  writeFileSync(packagePath, `${JSON.stringify({ ...parsed, version }, null, 2)}\n`);
  const entry = join(stage, "lib", "server.cjs");
  writeFileSync(entry, `${readFileSync(entry, "utf8")}\n// distinct D4 artifact ${version}\n`);
  const distinct = join(stage, `poracode-server-${version}.tar.gz`);
  execFileSync("tar", ["-czf", distinct, "-C", stage, "."], { stdio: "pipe" });
  return distinct;
}

const INTERRUPTED_RECEIPT_ID = "receipt-interrupted-before-upgrade";

/**
 * Genuine pre-47 shape: apply the exact inverse of migration 47 to the
 * database the current artifact created (drop the principal index and both
 * added columns), record schema 46, and seed an interrupted `in_progress`
 * receipt. Migration 47 then really runs during the upgrade: it must recreate
 * the columns/index and preserve the interrupted receipt as `uncertain`.
 */
function revertProfileToPre47Shape(profile: string): void {
  const paths = resolveHostRootPaths(profile);
  const database = new Database(join(paths.dataRoot, "state.sqlite"), {
    ...resolveBetterSqliteNativeBindingOptions(),
    timeout: 5_000,
  });
  try {
    database.exec("DROP INDEX IF EXISTS idx_remote_command_receipts_principal");
    const columns = database.prepare("PRAGMA table_info(remote_command_receipts)").all() as {
      name: string;
    }[];
    if (columns.some((column) => column.name === "principal_id"))
      database.exec("ALTER TABLE remote_command_receipts DROP COLUMN principal_id");
    if (columns.some((column) => column.name === "request_digest"))
      database.exec("ALTER TABLE remote_command_receipts DROP COLUMN request_digest");
    database
      .prepare(
        "INSERT INTO app_state (key, value) VALUES ('schema_version', '46') " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run();
    database
      .prepare(
        "INSERT OR REPLACE INTO remote_command_receipts " +
          "(command_id, route, state, response, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)",
      )
      .run(
        INTERRUPTED_RECEIPT_ID,
        "/api/threads/t1/checkpoint-revert",
        "in_progress",
        Date.now(),
        Date.now(),
      );
    const reverted = database.prepare("PRAGMA table_info(remote_command_receipts)").all() as {
      name: string;
    }[];
    if (
      reverted.some((column) => column.name === "principal_id" || column.name === "request_digest")
    )
      throw new Error("failed to revert the profile database to the pre-47 shape");
  } finally {
    database.close();
  }
}

describe.runIf(runnable)("serverUpgrade real-install integration (V6 D.4)", () => {
  it(
    "upgrades a running, lease-holding install from a real tarball and serves from the new release",
    { timeout: 600_000 },
    async () => {
      const workRoot = mkdtempSync(join(tmpdir(), "poracode-upgrade-it-"));
      dirs.push(workRoot);
      const prefix = canonicalHostPath(join(workRoot, "prefix"));
      const profile = join(workRoot, "profile");
      const port = await allocateLoopbackPort();
      sandboxEnv(profile, port);
      installServerPrefix({ tarball: tarball!, prefix });

      const daemon = await startDaemon(prefix, profile, port);
      const currentBefore = readlinkSync(join(prefix, "current"));
      const held = ownerRecord(profile);
      expect(held?.pid).toBe(daemon.child.pid);
      expect(held?.phase === "ready" || held?.phase === "preparing").toBe(true);
      // Polling, not a single shot: the lease phase can lead the listener.
      try {
        await waitForHealth(port, true, 30_000);
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)} ` +
            `(start signal: ${daemon.startSignal}) daemon tail: ${daemon.outputTail()}`,
          { cause: error },
        );
      }

      try {
        // Default IO end to end: real tar extract, real overlay, real
        // `npm install`, real doctor, and a restart that must find the
        // running daemon through its owner-lease record (no pid file exists).
        const result = await upgradeServerPrefix({ from: tarball!, prefix, json: true });
        if (!result.ok) console.error("[serverUpgrade.integration] upgrade failed:", result);
        expect(result.ok).toBe(true);
        expect(result.rolledBack).toBe(false);
        expect(readlinkSync(join(prefix, "current"))).not.toBe(currentBefore);

        const pidPath = join(prefix, "poracode-server.pid");
        expect(existsSync(pidPath)).toBe(true);
        const respawned = Number(readFileSync(pidPath, "utf8").trim());
        expect(respawned).toBeGreaterThan(0);
        expect(respawned).not.toBe(daemon.child.pid);
        expect(pidAlive(respawned)).toBe(true);
        // The old daemon was stopped by the restart, not left running.
        const exitDeadline = Date.now() + 10_000;
        while (daemon.child.exitCode === null && Date.now() < exitDeadline) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 250));
        }
        expect(daemon.child.exitCode).not.toBeNull();

        // The new release is the one serving.
        await waitForHealth(port, true, 30_000);
        const environment = await fetch(
          `http://127.0.0.1:${port}/.well-known/poracode/environment`,
        );
        // 401 = the new release's router answered (older bundle gating); 200 =
        // the contract answer. Either proves the NEW release owns the port.
        expect(environment.ok || environment.status === 401).toBe(true);
        const record = ownerRecord(profile);
        expect(record?.pid).toBe(respawned);

        // D4: the restarted daemon proves the exact staged build over the
        // authenticated control surface — not merely a healthy HTTP answer.
        const paths = resolveHostRootPaths(profile);
        const currentRelease = resolve(prefix, readlinkSync(join(prefix, "current")));
        const expectedIdentity = readReleaseBuildIdentity(currentRelease);
        const owner = readHostOwnerRecord(paths);
        expect(owner).not.toBeNull();
        const status = await callHostControl(paths, "status");
        expect(status.ownerGeneration).toBe(owner!.generation);
        expect(status.result).toMatchObject({
          mode: "headless",
          state: "ready",
          admission: "open",
          profileNamespace: paths.profileNamespace,
          dataRoot: paths.dataRoot,
          build: {
            version: expectedIdentity.version,
            entrypointSha256: expectedIdentity.entrypointSha256,
            root: currentRelease,
            layoutKind: "prefix",
          },
        });

        await stopDaemonAt(pidPath, profile);
      } finally {
        if (daemon.child.exitCode === null) daemon.child.kill("SIGTERM");
      }
    },
  );

  it(
    "rolls back a broken tarball, restores the previous install, and the daemon comes back",
    { timeout: 600_000 },
    async () => {
      const workRoot = mkdtempSync(join(tmpdir(), "poracode-upgrade-it-broken-"));
      dirs.push(workRoot);
      const prefix = canonicalHostPath(join(workRoot, "prefix"));
      const profile = join(workRoot, "profile");
      const port = await allocateLoopbackPort();
      sandboxEnv(profile, port);
      installServerPrefix({ tarball: tarball!, prefix });
      const brokenTarball = buildBrokenTarball(tarball!);

      const daemon = await startDaemon(prefix, profile, port);
      const currentBefore = readlinkSync(join(prefix, "current"));
      expect(ownerRecord(profile)?.pid).toBe(daemon.child.pid);

      try {
        const result = await upgradeServerPrefix({
          from: brokenTarball,
          prefix,
          json: true,
          healthTimeoutMs: 8_000,
        });
        if (!result.ok) console.error("[serverUpgrade.integration] broken upgrade:", result);
        expect(result.ok).toBe(false);
        expect(result.rolledBack).toBe(true);
        expect(readlinkSync(join(prefix, "current"))).toBe(currentBefore);

        // The previous release is serving again under a fresh daemon: the
        // restart path stopped the dead stub and respawned the real server.
        await waitForHealth(port, true, 30_000);
        const record = ownerRecord(profile);
        expect(record?.phase === "ready" || record?.phase === "preparing").toBe(true);
        expect(record?.pid).not.toBe(daemon.child.pid);
        expect(pidAlive(record?.pid ?? -1)).toBe(true);

        await stopDaemonAt(join(prefix, "poracode-server.pid"), profile);
      } finally {
        if (daemon.child.exitCode === null) daemon.child.kill("SIGTERM");
      }
    },
  );

  it(
    "upgrades a profile reverted to the genuine pre-47 schema with a repacked current artifact",
    { timeout: 900_000 },
    async () => {
      const workRoot = mkdtempSync(join(tmpdir(), "poracode-upgrade-it-forward-"));
      dirs.push(workRoot);
      const prefix = canonicalHostPath(join(workRoot, "prefix"));
      const profile = join(workRoot, "profile");
      const port = await allocateLoopbackPort();
      sandboxEnv(profile, port);
      // The current artifact is installed and started once so it owns the
      // profile and creates a real database; it is then stopped.
      installServerPrefix({ tarball: tarball!, prefix });
      const sourceRelease = resolve(prefix, readlinkSync(join(prefix, "current")));
      const candidatePolicy = readReleaseMigrationPolicy(sourceRelease);
      const forwardOnlyAfter46 = candidatePolicy.registry
        .filter((migration) => migration.version > 46 && migration.rollback === "forward-only")
        .map((migration) => migration.version);
      const daemon = await startDaemon(prefix, profile, port);
      try {
        await waitForHealth(port, true, 30_000);
        daemon.child.kill("SIGTERM");
        await waitForOwnerPhase(profile, "stopped", 20_000);
        // The database is genuinely reverted to the pre-47 shape, so migration
        // 47 is truly pending instead of being a relabeled no-op.
        revertProfileToPre47Shape(profile);

        // N: distinct bytes (another version, another entrypoint hash).
        const distinctTarball = buildDistinctTarball(tarball!, "9.9.9-d4");
        const currentBefore = readlinkSync(join(prefix, "current"));
        const result = await upgradeServerPrefix({
          from: distinctTarball,
          prefix,
          json: true,
        });
        if (!result.ok) console.error("[serverUpgrade.integration] upgrade failed:", result);
        expect(result.ok).toBe(true);
        expect(result.outcome).toBe("upgraded");
        expect(result.migration).toMatchObject({
          currentSchemaVersion: 46,
          latestSchemaVersion: candidatePolicy.latestSchemaVersion,
          forwardOnly: forwardOnlyAfter46,
        });
        // A consistent pre-migration backup was captured and retained.
        expect(result.backupPath).not.toBeNull();
        expect(existsSync(join(result.backupPath!, "poracode-backup.json"))).toBe(true);
        expect(readlinkSync(join(prefix, "current"))).not.toBe(currentBefore);

        // The candidate's own registry advanced the recorded schema.
        const paths = resolveHostRootPaths(profile);
        const database = new Database(join(paths.dataRoot, "state.sqlite"), {
          ...resolveBetterSqliteNativeBindingOptions(),
          readonly: true,
          fileMustExist: true,
        });
        let schemaVersion = 0;
        try {
          const row = database
            .prepare<[], { value: string }>(
              "SELECT value FROM app_state WHERE key = 'schema_version'",
            )
            .get();
          schemaVersion = Number(row?.value ?? 0);
          // Migration 47 really ran: the reverted pre-47 shape gained the
          // principal/digest columns and their index, and the interrupted
          // receipt was preserved as `uncertain`, never deleted.
          const columns = database.prepare("PRAGMA table_info(remote_command_receipts)").all() as {
            name: string;
          }[];
          expect(columns.map((column) => column.name)).toEqual(
            expect.arrayContaining(["principal_id", "request_digest"]),
          );
          const indexes = database.prepare("PRAGMA index_list(remote_command_receipts)").all() as {
            name: string;
          }[];
          expect(indexes.map((index) => index.name)).toContain(
            "idx_remote_command_receipts_principal",
          );
          const receipt = database
            .prepare("SELECT state FROM remote_command_receipts WHERE command_id = ?")
            .get(INTERRUPTED_RECEIPT_ID) as { state?: string } | undefined;
          expect(receipt?.state).toBe("uncertain");
        } finally {
          database.close();
        }
        expect(schemaVersion).toBe(candidatePolicy.latestSchemaVersion);

        const currentRelease = resolve(prefix, readlinkSync(join(prefix, "current")));
        const expectedIdentity = readReleaseBuildIdentity(currentRelease);
        expect(expectedIdentity.version).toBe("9.9.9-d4");
        const status = await callHostControl(paths, "status");
        expect(status.result).toMatchObject({
          state: "ready",
          admission: "open",
          build: {
            version: "9.9.9-d4",
            entrypointSha256: expectedIdentity.entrypointSha256,
          },
        });

        await stopDaemonAt(join(prefix, "poracode-server.pid"), profile);
      } finally {
        if (daemon.child.exitCode === null) daemon.child.kill("SIGTERM");
      }
    },
  );
});
