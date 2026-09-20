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
import { afterEach, describe, expect, it } from "vitest";
import { installServerPrefix } from "../../scripts/install-server-prefix.mjs";
import { upgradeServerPrefix } from "./serverUpgrade";

/**
 * V6 D.4 round-1 follow-up: a REAL upgrade integration test. It installs a
 * genuinely assembled tarball into a tmp prefix, starts the real server so it
 * HOLDS THE OWNER LEASE, upgrades with the default (real) IO, and asserts the
 * restarted daemon serves; then a broken tarball must roll the symlink and
 * the daemon back. Skipped unless a tarball is present in `dist/` — CI runs
 * it in `server_install_qualification` right after assembling the tarball.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const distDir = join(repoRoot, "dist");

function findTarball(): string | null {
  if (!existsSync(distDir)) return null;
  const tarballs = readdirSync(distDir).filter(
    (name) => name.startsWith("poracode-server-") && name.endsWith(".tar.gz"),
  );
  if (tarballs.length === 0) return null;
  return join(distDir, tarballs[0]!);
}

const tarball = findTarball();
const runnable = tarball !== null && process.platform !== "win32";
if (!runnable) {
  console.warn(
    "[serverUpgrade.integration] SKIPPED: no dist/poracode-server-*.tar.gz. " +
      "Run `pnpm run build && pnpm run prepare:server-native && pnpm run prepare:package-assets && " +
      "pnpm run prepare:agent-plugins && pnpm run prepare:computer-use-helper && " +
      "pnpm run assemble:server-tarball` first.",
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

/** doctor-passing but health-dead: runs forever, binds nothing. */
const BROKEN_SERVER_STUB = [
  "const argv = process.argv.slice(2);",
  'if (argv[0] === "doctor") {',
  '  process.stdout.write(JSON.stringify({ checks: [{ name: "stub", status: "ok" }] }) + "\\n");',
  "  process.exit(0);",
  "}",
  "process.title = 'poracode-broken-upgrade';",
  "setInterval(() => {}, 60_000);",
  "",
].join("\n");

function buildBrokenTarball(sourceTarball: string): string {
  const stage = mkdtempSync(join(tmpdir(), "poracode-broken-stage-"));
  dirs.push(stage);
  execFileSync("tar", ["-xzf", sourceTarball, "-C", stage], { stdio: "pipe" });
  writeFileSync(join(stage, "lib", "server.cjs"), BROKEN_SERVER_STUB);
  const brokenTarball = join(stage, "poracode-server-broken.tar.gz");
  execFileSync("tar", ["-czf", brokenTarball, "-C", stage, "."], { stdio: "pipe" });
  return brokenTarball;
}

describe.runIf(runnable)("serverUpgrade real-install integration (V6 D.4)", () => {
  it(
    "upgrades a running, lease-holding install from a real tarball and serves from the new release",
    { timeout: 600_000 },
    async () => {
      const workRoot = mkdtempSync(join(tmpdir(), "poracode-upgrade-it-"));
      dirs.push(workRoot);
      const prefix = join(workRoot, "prefix");
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
      const prefix = join(workRoot, "prefix");
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
});
