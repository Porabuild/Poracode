import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "./remote/protocol";
import { SSH_FIXTURE_SERVER_SOURCE } from "@/host/ssh/sshBootstrapFixtureServer";
import { INSTALL_REMOTE_RUNTIME_SCRIPT, LAUNCH_REMOTE_SERVER_SCRIPT } from "./sshRemoteScripts";
import { REMOTE_OWNER_SHELL_LIBRARY } from "./sshRemoteShell";
import {
  parseRemoteLaunchOutcome,
  SshBootstrapRefusedError,
  waitForRemoteEndpoint,
  type RemoteBootstrapResult,
} from "./sshBootstrap";

const CONNECTION_ID = "1a2f655a-e274-4213-9a2b-029f29062fd7";
const OLD_HASH = "b".repeat(64);
const NEW_HASH = "a".repeat(64);
const GENERATION = "3f6a1f0e-6f4e-4a3e-8b2f-4d1e0b7a9c11";

const fixtureServerSource = SSH_FIXTURE_SERVER_SOURCE;

const tempDirs: string[] = [];
const fixtureChildren: ChildProcess[] = [];
const activePorts = new Set<number>();

afterEach(async () => {
  for (const child of fixtureChildren.splice(0)) {
    if (child.exitCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
  for (const directory of tempDirs.splice(0)) {
    // Owners started by the launch script are detached; the guard ends them
    // and the identity PID is a second, immediate kill for the common case.
    rmSync(join(directory, "fixture-alive"), { force: true });
    let identityPid = 0;
    try {
      identityPid = Number(readIdentity(directory).pid);
    } catch {
      identityPid = 0;
    }
    if (Number.isSafeInteger(identityPid) && identityPid > 0) {
      try {
        process.kill(identityPid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
    rmSync(directory, { recursive: true, force: true });
  }
  activePorts.clear();
});

function createHome(): string {
  const home = mkdtempSync(join(tmpdir(), "poracode-ssh-owner-test-"));
  tempDirs.push(home);
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  symlinkSync(process.execPath, join(home, ".local", "bin", "node"));
  writeFileSync(join(home, "fixture-alive"), "alive\n");
  return home;
}

function homeEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    PATH: `${join(home, ".local", "bin")}:${process.env.PATH ?? ""}`,
    ...extra,
  };
}

function stateDir(home: string): string {
  return join(home, ".poracode", "ssh", "hosts", CONNECTION_ID);
}

function writeRuntime(home: string, hash: string, version = "1.2.3"): string {
  const dir = join(home, ".poracode", "ssh", "runtime", hash);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "server.cjs"), fixtureServerSource);
  writeFileSync(join(dir, "supervisor.cjs"), "// fixture supervisor\n");
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "fixture", version })}\n`);
  writeFileSync(join(dir, ".ready"), hash);
  return dir;
}

interface FixturePaths {
  readonly statusFile: string;
  readonly logFile: string;
  readonly leasePath: string;
}

function fixturePaths(home: string): FixturePaths {
  return {
    statusFile: join(home, "fixture-status.json"),
    logFile: join(home, "fixture.log"),
    leasePath: join(home, "fixture-lease"),
  };
}

function fixtureEnv(home: string, paths: FixturePaths, extra: Record<string, string> = {}) {
  return homeEnv(home, {
    PORACODE_FIXTURE_STATUS_FILE: paths.statusFile,
    PORACODE_FIXTURE_LOG: paths.logFile,
    PORACODE_FIXTURE_LEASE_PATH: paths.leasePath,
    PORACODE_FIXTURE_GENERATION: GENERATION,
    PORACODE_FIXTURE_LIFETIME_GUARD: join(home, "fixture-alive"),
    ...extra,
  });
}

// Fixture ports stay below 49152 so the script's own 49152+ scan can never
// race a reserved-but-not-yet-bound fixture port in a parallel test file.
let nextPort = 47_000;
function reserveFixturePort(): number {
  while (activePorts.has(nextPort)) nextPort += 1;
  activePorts.add(nextPort);
  return nextPort;
}

async function waitForPort(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (connected) return;
    if (Date.now() > deadline) throw new Error(`Fixture port ${port} never opened.`);
    await delay(100);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runShell(
  script: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-s", "--", ...args], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", () => resolve({ stdout, stderr, code: -1 }));
    child.once("exit", (code) => resolve({ stdout, stderr, code }));
    child.stdin.end(script);
  });
}

async function processToken(pid: number): Promise<string> {
  const result = await runShell(
    `${REMOTE_OWNER_SHELL_LIBRARY}\nporacode_process_token "$1"\n`,
    [String(pid)],
    homeEnv(osHome()),
  );
  return result.stdout.trim();
}

function osHome(): string {
  return process.env.HOME ?? tmpdir();
}

function spawnFixtureOwner(
  home: string,
  runtimeDir: string,
  port: number,
  env: Record<string, string> = {},
): ChildProcess {
  const paths = fixturePaths(home);
  const child = spawn(process.execPath, [join(runtimeDir, "server.cjs")], {
    env: fixtureEnv(home, paths, {
      PORACODE_REMOTE_ACCESS_PORT: String(port),
      PORACODE_BASE_DIR: join(stateDir(home), "data"),
      ...env,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  fixtureChildren.push(child);
  return child;
}

function spawnUnrelatedChild(): ChildProcess {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  fixtureChildren.push(child);
  return child;
}

async function waitForExit(child: ChildProcess, timeoutMs = 5_000): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function writeIdentity(home: string, fields: Partial<Record<string, string>>): void {
  const target = join(stateDir(home), "owner-identity");
  mkdirSync(dirname(target), { recursive: true });
  const values: Record<string, string> = {
    version: "1",
    pid: "",
    token: "",
    generation: "",
    profile: join(stateDir(home), "data"),
    root: `${join(stateDir(home), "data")}.host-v1`,
    runtime: OLD_HASH,
    port: "",
    ...fields,
  };
  writeFileSync(
    target,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
  );
}

function readIdentity(home: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of readFileSync(join(stateDir(home), "owner-identity"), "utf8").split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) map[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return map;
}

function writeRawIdentity(home: string, content: string): string {
  const target = join(stateDir(home), "owner-identity");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

async function runLibrary(
  snippet: string,
  args: readonly string[] = [],
  env: NodeJS.ProcessEnv = homeEnv(osHome()),
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return runShell(`${REMOTE_OWNER_SHELL_LIBRARY}\n${snippet}\n`, args, env);
}

function readHolder(lock: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of readFileSync(join(lock, "holder"), "utf8").split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) map[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return map;
}

function writeLockHolder(home: string, name: string, pid: number | string, token: string): string {
  const lock = lockPath(home, name);
  mkdirSync(lock, { recursive: true });
  writeFileSync(join(lock, "holder"), `pid=${pid}\ntoken=${token}\n`);
  return lock;
}

async function spawnDeadProcess(): Promise<{ pid: number; token: string }> {
  const child = spawnUnrelatedChild();
  const token = await processToken(child.pid!);
  child.kill("SIGKILL");
  await waitForExit(child);
  return { pid: child.pid!, token };
}

/** A live shell that holds `lock` (published with its own pid/token). */
function startLockHolder(home: string, name: string): { child: ChildProcess; lock: string } {
  const lock = lockPath(home, name);
  mkdirSync(dirname(lock), { recursive: true });
  const child = spawn("sh", ["-s", "--", lock, "10000"], {
    env: homeEnv(home),
    stdio: ["pipe", "pipe", "pipe"],
  });
  fixtureChildren.push(child);
  child.stdin!.end(
    `${REMOTE_OWNER_SHELL_LIBRARY}
TOKEN="$(poracode_process_token $$ 2>/dev/null || true)"
poracode_lock_acquire "$1" "$2" "$TOKEN"
printf 'acquired\n'
sleep 60
`,
  );
  return { child, lock };
}

async function waitForHolder(lock: string, timeoutMs = 10_000): Promise<Record<string, string>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const holder = readHolder(lock);
      if (holder.pid && holder.token) return holder;
    } catch {
      // Not published yet.
    }
    if (Date.now() > deadline) throw new Error(`Lock ${lock} never published a holder.`);
    await delay(50);
  }
}

function readLog(home: string): string[] {
  const path = fixturePaths(home).logFile;
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function launchArgs(hash: string, mode = "connect", lockWaitMs = 5_000): string[] {
  return [mode, CONNECTION_ID, hash, String(lockWaitMs)];
}

async function runLaunch(
  home: string,
  args: readonly string[],
  env: Record<string, string> = {},
): Promise<{ result?: RemoteBootstrapResult; error?: unknown; stdout: string; stderr: string }> {
  const paths = fixturePaths(home);
  const shell = await runShell(LAUNCH_REMOTE_SERVER_SCRIPT, args, fixtureEnv(home, paths, env));
  try {
    return {
      result: parseRemoteLaunchOutcome(shell.stdout),
      stdout: shell.stdout,
      stderr: shell.stderr,
    };
  } catch (error) {
    return { error, stdout: shell.stdout, stderr: shell.stderr };
  }
}

function writeFixtureArchive(home: string, name: string): void {
  const stage = join(home, `archive-${name}`);
  mkdirSync(stage, { recursive: true });
  writeFileSync(join(stage, "server.cjs"), "fixture runtime server\n");
  writeFileSync(join(stage, "supervisor.cjs"), "fixture supervisor\n");
  writeFileSync(join(stage, "package.json"), '{"name":"fixture","version":"1.0.0"}\n');
  const uploads = join(home, ".poracode", "ssh", "uploads");
  mkdirSync(uploads, { recursive: true });
  execFileSync("tar", ["-czf", join(uploads, name), "-C", stage, "."]);
}

function writeFakeNpm(home: string, options: { sleepMs?: number; exitCode?: number } = {}): void {
  const target = join(home, ".local", "bin", "npm");
  writeFileSync(
    target,
    `#!/bin/sh\nprintf '%s\\n' npm >>"$HOME/npm-calls.log"\nsleep ${((options.sleepMs ?? 0) / 1000).toFixed(3)}\nexit ${options.exitCode ?? 0}\n`,
  );
  chmodSync(target, 0o755);
}

function installArgs(hash: string, archiveName: string, lockWaitMs = 5_000): string[] {
  return [hash, archiveName, String(lockWaitMs)];
}

function runtimeReadyPath(home: string, hash: string): string {
  return join(home, ".poracode", "ssh", "runtime", hash, ".ready");
}

function lockPath(home: string, name: string): string {
  return join(home, ".poracode", "ssh", "locks", name);
}

describe("SSH launch outcome protocol", () => {
  it("rejects an unknown launch protocol version instead of guessing", () => {
    expect(() =>
      parseRemoteLaunchOutcome(
        '{"poracodeLaunchProtocol":99,"outcome":"ready","remotePort":1,"ownerRuntimeHash":"a"}\n',
      ),
    ).toThrow("Poracode Helper returned an invalid response");
  });

  it("parses a refusal into a typed error", () => {
    expect(() =>
      parseRemoteLaunchOutcome(
        `{"poracodeLaunchProtocol":1,"outcome":"refused","code":"owner-incompatible","ownerAppVersion":"0.0.1","ownerProtocolVersion":99}\n`,
      ),
    ).toThrow(SshBootstrapRefusedError);
  });
});

describe("SSH ownership-safe launch", () => {
  it.each(["0.1.0", "99.0.0"])(
    "reuses an authenticated owner running runtime hash %s without signalling it",
    async (appVersion) => {
      const home = createHome();
      const oldRuntime = writeRuntime(home, OLD_HASH, appVersion);
      writeRuntime(home, NEW_HASH, "1.0.0");
      const port = reserveFixturePort();
      const owner = spawnFixtureOwner(home, oldRuntime, port, {
        PORACODE_FIXTURE_APP_VERSION: appVersion,
        PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
      });
      await waitForPort(port);
      const token = await processToken(owner.pid!);
      expect(token).not.toBe("");
      writeIdentity(home, {
        pid: String(owner.pid),
        token,
        generation: GENERATION,
        runtime: OLD_HASH,
        port: String(port),
      });

      const { result } = await runLaunch(home, launchArgs(NEW_HASH), {
        PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
      });

      expect(result).toMatchObject({
        remotePort: port,
        reusedOwner: true,
        ownerRuntimeHash: OLD_HASH,
        ownerAppVersion: appVersion,
      });
      expect(owner.exitCode).toBeNull();
      const identity = readIdentity(home);
      expect(identity).toMatchObject({
        pid: String(owner.pid),
        runtime: OLD_HASH,
        generation: GENERATION,
      });
      expect(readLog(home).filter((line) => line.startsWith("stopping"))).toEqual([]);
    },
    30_000,
  );

  it("refuses a newer incompatible owner without signalling it", async () => {
    const home = createHome();
    const oldRuntime = writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    const port = reserveFixturePort();
    const owner = spawnFixtureOwner(home, oldRuntime, port, {
      PORACODE_FIXTURE_PROTOCOL: "999",
    });
    await waitForPort(port);
    const token = await processToken(owner.pid!);
    writeIdentity(home, {
      pid: String(owner.pid),
      token,
      generation: GENERATION,
      runtime: OLD_HASH,
      port: String(port),
    });

    const { error } = await runLaunch(home, launchArgs(NEW_HASH), {
      PORACODE_FIXTURE_PROTOCOL: "999",
    });

    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("owner-incompatible");
    expect(owner.exitCode).toBeNull();
    expect(readLog(home).filter((line) => line.startsWith("starting"))).toEqual([]);
  }, 30_000);

  it("refuses when a live process cannot be authenticated as the owner", async () => {
    const home = createHome();
    writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    const unrelated = spawnUnrelatedChild();
    const token = await processToken(unrelated.pid!);
    writeIdentity(home, {
      pid: String(unrelated.pid),
      token,
      generation: GENERATION,
      runtime: OLD_HASH,
    });

    const { error } = await runLaunch(home, launchArgs(NEW_HASH), {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
    });

    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("owner-unverified");
    expect(unrelated.exitCode).toBeNull();
    expect(readLog(home)).toEqual([]);
  }, 30_000);

  it("does not signal a stale PID pointing at an owned unrelated child", async () => {
    const home = createHome();
    writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    const unrelated = spawnUnrelatedChild();
    writeIdentity(home, {
      pid: String(unrelated.pid),
      token: "boot:stale-start-token",
      generation: GENERATION,
      runtime: OLD_HASH,
    });

    const { result } = await runLaunch(home, launchArgs(NEW_HASH), {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
      PORACODE_FIXTURE_STATUS_SCOPE_HASH: OLD_HASH,
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });

    expect(result).toMatchObject({ reusedOwner: false, ownerRuntimeHash: NEW_HASH });
    // The unrelated child was never signalled, and a fresh owner now runs.
    expect(unrelated.exitCode).toBeNull();
    expect(readLog(home).filter((line) => line.startsWith("started"))).toHaveLength(1);
  }, 30_000);

  it("preserves a future identity version and refuses instead of adopting or overwriting it", async () => {
    const home = createHome();
    writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    const unrelated = spawnUnrelatedChild();
    const token = await processToken(unrelated.pid!);
    const content = `version=99\npid=${unrelated.pid}\ntoken=${token}\ngeneration=${GENERATION}\nruntime=${OLD_HASH}\nport=47001\nfutureField=keep-me\n`;
    const identityPath = writeRawIdentity(home, content);

    const { error } = await runLaunch(home, [...launchArgs(NEW_HASH, "upgrade", 2_000), "1000"], {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
    });

    // A record from a version this client cannot parse is never adopted,
    // signalled, replaced, or overwritten; the owner state is preserved.
    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("owner-unverified");
    expect(unrelated.exitCode).toBeNull();
    expect(readFileSync(identityPath, "utf8")).toBe(content);
    expect(readLog(home)).toEqual([]);
  }, 30_000);

  it("preserves a corrupt identity record and refuses instead of overwriting it", async () => {
    const home = createHome();
    writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    const unrelated = spawnUnrelatedChild();
    const token = await processToken(unrelated.pid!);
    const content = `pid=${unrelated.pid}\ntoken=${token}\ngeneration=${GENERATION}\n`;
    const identityPath = writeRawIdentity(home, content);

    const { error } = await runLaunch(home, launchArgs(NEW_HASH), {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
    });

    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("owner-unverified");
    expect(unrelated.exitCode).toBeNull();
    expect(readFileSync(identityPath, "utf8")).toBe(content);
    expect(readLog(home)).toEqual([]);
  }, 30_000);

  it("reuses an authenticated owner while preserving an unknown identity record", async () => {
    const home = createHome();
    const oldRuntime = writeRuntime(home, OLD_HASH, "1.0.0");
    writeRuntime(home, NEW_HASH, "2.0.0");
    const port = reserveFixturePort();
    const owner = spawnFixtureOwner(home, oldRuntime, port, {
      PORACODE_FIXTURE_APP_VERSION: "1.0.0",
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });
    await waitForPort(port);
    const token = await processToken(owner.pid!);
    const content = `version=7\npid=${owner.pid}\ntoken=${token}\ngeneration=${GENERATION}\nruntime=${OLD_HASH}\nport=${port}\nfutureField=keep-me\n`;
    const identityPath = writeRawIdentity(home, content);

    const { result } = await runLaunch(home, launchArgs(NEW_HASH), {
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });

    // Reuse needs no identity record: the authenticated describe is the
    // authority, so an unknown record neither blocks reuse nor gets rewritten.
    expect(result).toMatchObject({ remotePort: port, reusedOwner: true });
    expect(owner.exitCode).toBeNull();
    expect(readFileSync(identityPath, "utf8")).toBe(content);
    expect(readLog(home).filter((line) => line.startsWith("stopping"))).toEqual([]);
  }, 30_000);

  it("never overwrites an unknown identity record from the writer itself", async () => {
    const home = createHome();
    const content = `version=4\npid=1\ntoken=t\ngeneration=${GENERATION}\n`;
    const identityPath = writeRawIdentity(home, content);

    const result = await runLibrary(
      `PC_ID_PID=12345
PC_ID_TOKEN=tok
PC_ID_GENERATION=g
PC_ID_PROFILE=p
PC_ID_ROOT=r
PC_ID_RUNTIME=${OLD_HASH}
PC_ID_PORT=1
poracode_identity_write "$1"`,
      [identityPath],
    );

    expect(result.code).not.toBe(0);
    expect(readFileSync(identityPath, "utf8")).toBe(content);
  }, 15_000);

  it("repairs a partial current-version identity when a new owner starts", async () => {
    const home = createHome();
    writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    writeIdentity(home, { pid: "", token: "", generation: "", runtime: "" });

    // No status file exists yet, so the first authenticated query fails; the
    // fresh owner publishes one and the identity record is repaired.
    const { result } = await runLaunch(home, launchArgs(NEW_HASH), {
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });

    expect(result).toMatchObject({ reusedOwner: false, ownerRuntimeHash: NEW_HASH });
    const identity = readIdentity(home);
    expect(identity.version).toBe("1");
    expect(identity.pid).not.toBe("");
    expect(identity.generation).toBe(GENERATION);
  }, 30_000);

  it("refuses a recorded live holder whose start token is unknown", async () => {
    const home = createHome();
    writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    const unrelated = spawnUnrelatedChild();
    writeIdentity(home, {
      pid: String(unrelated.pid),
      token: "",
      generation: GENERATION,
      runtime: OLD_HASH,
    });

    const { error } = await runLaunch(home, launchArgs(NEW_HASH), {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
    });

    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("owner-unverified");
    expect(unrelated.exitCode).toBeNull();
    expect(readLog(home)).toEqual([]);
  }, 30_000);

  it("removes legacy pid/port/runtime files instead of using them as kill authority", async () => {
    const home = createHome();
    writeRuntime(home, NEW_HASH);
    const unrelated = spawnUnrelatedChild();
    const state = stateDir(home);
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, "pid"), `${unrelated.pid}\n`);
    writeFileSync(join(state, "port"), "49152\n");
    writeFileSync(join(state, "runtime"), `${OLD_HASH}\n`);

    const { result } = await runLaunch(home, launchArgs(NEW_HASH), {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
      PORACODE_FIXTURE_STATUS_SCOPE_HASH: OLD_HASH,
    });

    expect(result).toMatchObject({ reusedOwner: false, ownerRuntimeHash: NEW_HASH });
    expect(unrelated.exitCode).toBeNull();
    expect(existsSync(join(state, "pid"))).toBe(false);
    expect(existsSync(join(state, "port"))).toBe(false);
    expect(existsSync(join(state, "runtime"))).toBe(false);
  }, 30_000);

  it("refuses with owner-busy while a live lock holder keeps the lock", async () => {
    const home = createHome();
    writeRuntime(home, NEW_HASH);
    const holder = spawnUnrelatedChild();
    const token = await processToken(holder.pid!);
    const lock = lockPath(home, `owner-${CONNECTION_ID}`);
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "holder"), `pid=${holder.pid}\ntoken=${token}\n`);

    const { error } = await runLaunch(home, launchArgs(NEW_HASH, "connect", 1_000), {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
    });

    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("owner-busy");
    expect(holder.exitCode).toBeNull();
    expect(existsSync(lock)).toBe(true);
    expect(readLog(home)).toEqual([]);
  }, 30_000);

  it("serializes concurrent connects so only one owner starts", async () => {
    const home = createHome();
    writeRuntime(home, NEW_HASH);
    const env = {
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
      PORACODE_FIXTURE_START_DELAY_MS: "700",
    };

    const [first, second] = await Promise.all([
      runLaunch(home, launchArgs(NEW_HASH, "connect", 20_000), env),
      runLaunch(home, launchArgs(NEW_HASH, "connect", 20_000), env),
    ]);

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(first.result?.remotePort).toBe(second.result?.remotePort);
    const started = readLog(home).filter((line) => line.startsWith("started"));
    expect(started).toHaveLength(1);
    expect(existsSync(lockPath(home, `owner-${CONNECTION_ID}`))).toBe(false);
    const identity = readIdentity(home);
    expect(identity.generation).toBe(GENERATION);
    expect(identity.port).toBe(String(first.result?.remotePort));
  }, 60_000);
});

describe("SSH explicit upgrade", () => {
  it("joins the old owner's shutdown before the new owner enters the data root", async () => {
    const home = createHome();
    const oldRuntime = writeRuntime(home, OLD_HASH, "1.0.0");
    writeRuntime(home, NEW_HASH, "2.0.0");
    const oldPort = reserveFixturePort();
    const owner = spawnFixtureOwner(home, oldRuntime, oldPort, {
      PORACODE_FIXTURE_DRAIN_MS: "800",
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });
    await waitForPort(oldPort);
    const token = await processToken(owner.pid!);
    writeIdentity(home, {
      pid: String(owner.pid),
      token,
      generation: GENERATION,
      runtime: OLD_HASH,
      port: String(oldPort),
    });

    const { result, stderr } = await runLaunch(home, launchArgs(NEW_HASH, "upgrade", 20_000), {
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
      PORACODE_FIXTURE_LOG: fixturePaths(home).logFile,
    });
    expect(stderr).toBe("");

    expect(result).toMatchObject({ reusedOwner: false, ownerRuntimeHash: NEW_HASH });
    const lines = readLog(home);
    const stopping = lines.findIndex((line) => line.startsWith("stopping"));
    const stopped = lines.findIndex((line) => line.startsWith("stopped"));
    const restarted = lines
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line }) => line.startsWith("started") && !line.startsWith(`started pid=${owner.pid} `),
      );
    expect(stopping).toBeGreaterThanOrEqual(0);
    expect(stopped).toBeGreaterThan(stopping);
    expect(restarted).toHaveLength(1);
    expect(restarted[0]!.index).toBeGreaterThan(stopped);
    await waitForExit(owner);
    expect(owner.exitCode).not.toBeNull();
    const identity = readIdentity(home);
    expect(identity.runtime).toBe(NEW_HASH);
    expect(identity.pid).not.toBe(String(owner.pid));
    expect(existsSync(fixturePaths(home).leasePath)).toBe(true);
  }, 60_000);

  it("refuses an explicit upgrade that cannot join a slow old owner in budget", async () => {
    const home = createHome();
    const oldRuntime = writeRuntime(home, OLD_HASH, "1.0.0");
    writeRuntime(home, NEW_HASH, "2.0.0");
    const oldPort = reserveFixturePort();
    const owner = spawnFixtureOwner(home, oldRuntime, oldPort, {
      PORACODE_FIXTURE_DRAIN_MS: "5000",
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });
    await waitForPort(oldPort);
    const token = await processToken(owner.pid!);
    writeIdentity(home, {
      pid: String(owner.pid),
      token,
      generation: GENERATION,
      runtime: OLD_HASH,
      port: String(oldPort),
    });

    const { error } = await runLaunch(home, ["upgrade", CONNECTION_ID, NEW_HASH, "5000", "500"]);

    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("drain-timeout");
    expect(owner.exitCode).toBeNull();
    expect(readLog(home).filter((line) => line.startsWith("started"))).toHaveLength(1);
    expect(existsSync(fixturePaths(home).leasePath)).toBe(true);
  }, 30_000);

  it("refuses an explicit upgrade whose owner token is unknown and never signals it", async () => {
    const home = createHome();
    const oldRuntime = writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    const oldPort = reserveFixturePort();
    const owner = spawnFixtureOwner(home, oldRuntime, oldPort, {
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });
    await waitForPort(oldPort);
    // The authenticated describe matches the record, but the recorded token
    // is empty: unknown identity is not authority to signal.
    writeIdentity(home, {
      pid: String(owner.pid),
      token: "",
      generation: GENERATION,
      runtime: OLD_HASH,
      port: String(oldPort),
    });

    const { error } = await runLaunch(home, launchArgs(NEW_HASH, "upgrade", 5_000), {
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });

    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("owner-unverified");
    expect(owner.exitCode).toBeNull();
    expect(readLog(home).filter((line) => line.startsWith("stopping"))).toEqual([]);
  }, 30_000);

  it("refuses an explicit upgrade whose owner cannot be verified", async () => {
    const home = createHome();
    const oldRuntime = writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    const oldPort = reserveFixturePort();
    // No status file: the running process cannot authenticate as the owner.
    const owner = spawnFixtureOwner(home, oldRuntime, oldPort, {
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });
    await waitForPort(oldPort);
    const token = await processToken(owner.pid!);
    writeIdentity(home, {
      pid: String(owner.pid),
      token,
      generation: GENERATION,
      runtime: OLD_HASH,
      port: String(oldPort),
    });

    const { error } = await runLaunch(home, launchArgs(NEW_HASH, "upgrade", 5_000), {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });

    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("owner-unverified");
    expect(owner.exitCode).toBeNull();
    expect(readLog(home).filter((line) => line.startsWith("stopping"))).toEqual([]);
  }, 30_000);
});

describe("SSH install lock", () => {
  it("serializes concurrent installs and removes the attempt archive", async () => {
    const home = createHome();
    writeFakeNpm(home, { sleepMs: 800 });
    writeFixtureArchive(home, "one.tar.gz");
    writeFixtureArchive(home, "two.tar.gz");

    const [first, second] = await Promise.all([
      runShell(
        INSTALL_REMOTE_RUNTIME_SCRIPT,
        installArgs(NEW_HASH, "one.tar.gz", 20_000),
        homeEnv(home),
      ),
      runShell(
        INSTALL_REMOTE_RUNTIME_SCRIPT,
        installArgs(NEW_HASH, "two.tar.gz", 20_000),
        homeEnv(home),
      ),
    ]);

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(first.stdout.trim()).toBe("ready");
    expect(second.stdout.trim()).toBe("ready");
    expect(readFileSync(join(home, "npm-calls.log"), "utf8").trim().split("\n")).toHaveLength(1);
    expect(existsSync(runtimeReadyPath(home, NEW_HASH))).toBe(true);
    expect(existsSync(lockPath(home, `install-${NEW_HASH}`))).toBe(false);
    const uploads = join(home, ".poracode", "ssh", "uploads");
    expect(existsSync(join(uploads, "one.tar.gz"))).toBe(false);
    expect(existsSync(join(uploads, "two.tar.gz"))).toBe(false);
  }, 60_000);

  it("cleans staging and the lock when npm fails", async () => {
    const home = createHome();
    writeFakeNpm(home, { exitCode: 1 });
    writeFixtureArchive(home, "fail.tar.gz");

    const failed = await runShell(
      INSTALL_REMOTE_RUNTIME_SCRIPT,
      installArgs(NEW_HASH, "fail.tar.gz"),
      homeEnv(home),
    );
    expect(failed.code).not.toBe(0);
    expect(existsSync(runtimeReadyPath(home, NEW_HASH))).toBe(false);
    expect(existsSync(lockPath(home, `install-${NEW_HASH}`))).toBe(false);
    expect(existsSync(join(home, ".poracode", "ssh", "uploads", "fail.tar.gz"))).toBe(false);

    writeFakeNpm(home, {});
    writeFixtureArchive(home, "retry.tar.gz");
    const retried = await runShell(
      INSTALL_REMOTE_RUNTIME_SCRIPT,
      installArgs(NEW_HASH, "retry.tar.gz"),
      homeEnv(home),
    );
    expect(retried.code).toBe(0);
    expect(retried.stdout.trim()).toBe("ready");
    expect(existsSync(runtimeReadyPath(home, NEW_HASH))).toBe(true);
  }, 60_000);

  it("reclaims an interrupted installer's stale lock and stale staging", async () => {
    const home = createHome();
    writeFakeNpm(home, { sleepMs: 5_000 });
    writeFixtureArchive(home, "interrupted.tar.gz");

    const interrupted = spawn(
      "sh",
      ["-s", "--", ...installArgs(NEW_HASH, "interrupted.tar.gz", 5_000)],
      { env: homeEnv(home), stdio: ["pipe", "pipe", "pipe"] },
    );
    interrupted.stdin.end(INSTALL_REMOTE_RUNTIME_SCRIPT);
    const deadline = Date.now() + 10_000;
    const callsPath = join(home, "npm-calls.log");
    while (!existsSync(callsPath) && Date.now() < deadline) await delay(50);
    expect(existsSync(lockPath(home, `install-${NEW_HASH}`))).toBe(true);
    interrupted.kill("SIGKILL");
    await waitForExit(interrupted);
    const stagingRoot = join(home, ".poracode", "ssh", "runtime");
    expect(
      readdirSync(stagingRoot).filter((name) => name.startsWith(`.staging-${NEW_HASH}-`)).length,
    ).toBeGreaterThanOrEqual(1);

    writeFakeNpm(home, {});
    writeFixtureArchive(home, "recovery.tar.gz");
    const recovered = await runShell(
      INSTALL_REMOTE_RUNTIME_SCRIPT,
      installArgs(NEW_HASH, "recovery.tar.gz"),
      homeEnv(home),
    );
    expect(recovered.code).toBe(0);
    expect(recovered.stdout.trim()).toBe("ready");
    expect(existsSync(lockPath(home, `install-${NEW_HASH}`))).toBe(false);
    expect(
      readdirSync(stagingRoot).filter((name) => name.startsWith(`.staging-${NEW_HASH}-`)),
    ).toEqual([]);
  }, 60_000);
});

describe("SSH owner lock safety", () => {
  it("reclaims a lock whose recorded holder is provably dead", async () => {
    const home = createHome();
    const dead = await spawnDeadProcess();
    const lock = writeLockHolder(home, "reap-dead", dead.pid, dead.token);

    const reaped = await runLibrary(`poracode_lock_reap "$1" "$2" "$3"`, [
      lock,
      String(dead.pid),
      dead.token,
    ]);

    expect(reaped.code).toBe(0);
    expect(existsSync(lock)).toBe(false);
  }, 15_000);

  it("never removes a lock whose recorded holder is alive, even with a matching observation", async () => {
    const home = createHome();
    const holder = startLockHolder(home, "live-holder");
    const published = await waitForHolder(holder.lock);

    const reaped = await runLibrary(`poracode_lock_reap "$1" "$2" "$3"`, [
      holder.lock,
      published.pid!,
      published.token!,
    ]);

    expect(reaped.code).not.toBe(0);
    expect(readHolder(holder.lock)).toMatchObject(published);
    expect(holder.child.exitCode).toBeNull();
  }, 20_000);

  it("never removes a lock acquired by another contender after a stale observation", async () => {
    const home = createHome();
    const dead = await spawnDeadProcess();
    const lock = writeLockHolder(home, "stale-then-new", dead.pid, dead.token);

    const first = await runLibrary(`poracode_lock_reap "$1" "$2" "$3"`, [
      lock,
      String(dead.pid),
      dead.token,
    ]);
    expect(first.code).toBe(0);
    expect(existsSync(lock)).toBe(false);

    // A new contender acquires the same lock path while the reaper still holds
    // its stale observation; the stale reaper must not delete the new lock.
    const holder = startLockHolder(home, "stale-then-new");
    const published = await waitForHolder(holder.lock);

    const [reaperOne, reaperTwo] = await Promise.all([
      runLibrary(`poracode_lock_reap "$1" "$2" "$3"`, [lock, String(dead.pid), dead.token]),
      runLibrary(`poracode_lock_reap "$1" "$2" "$3"`, [lock, String(dead.pid), dead.token]),
    ]);

    expect(reaperOne.code).not.toBe(0);
    expect(reaperTwo.code).not.toBe(0);
    expect(readHolder(lock)).toMatchObject(published);
    expect(holder.child.exitCode).toBeNull();

    holder.child.kill("SIGKILL");
    await waitForExit(holder.child);
    const afterHolder = await runLibrary(`poracode_lock_reap "$1" "$2" "$3"`, [
      lock,
      published.pid!,
      published.token!,
    ]);
    expect(afterHolder.code).toBe(0);
    expect(existsSync(lock)).toBe(false);
  }, 30_000);

  it("serializes two reclaimers on one stale lock so only one removes it", async () => {
    const home = createHome();
    const dead = await spawnDeadProcess();
    const lock = writeLockHolder(home, "reap-race", dead.pid, dead.token);

    const [first, second] = await Promise.all([
      runLibrary(`poracode_lock_reap "$1" "$2" "$3"`, [lock, String(dead.pid), dead.token]),
      runLibrary(`poracode_lock_reap "$1" "$2" "$3"`, [lock, String(dead.pid), dead.token]),
    ]);

    expect([first.code, second.code].filter((code) => code === 0)).toHaveLength(1);
    expect(existsSync(lock)).toBe(false);

    const acquired = await runLibrary(
      `TOKEN="$(poracode_process_token $$ 2>/dev/null || true)"
poracode_lock_acquire "$1" 2000 "$TOKEN"`,
      [lock],
      homeEnv(home),
    );
    expect(acquired.code).toBe(0);
    expect(readHolder(lock).pid).not.toBe("");
  }, 20_000);

  it("does not reclaim a holderless lock while its creator is paused", async () => {
    const home = createHome();
    const lock = lockPath(home, "paused-creator");
    mkdirSync(lock, { recursive: true });

    const contender = await runLibrary(
      `poracode_lock_acquire "$1" 500 "$2"`,
      [lock, "contender"],
      homeEnv(home),
    );

    // No holder means unknown ownership: the contender waits its bounded turn
    // and refuses without removing the lock or speculating about the creator.
    expect(contender.code).not.toBe(0);
    expect(existsSync(lock)).toBe(true);
    expect(existsSync(join(lock, "holder"))).toBe(false);
    expect(existsSync(join(lock, ".reap"))).toBe(false);

    // The paused creator resumes: atomic publication still succeeds and its
    // own release removes the lock.
    const resumed = await runLibrary(
      `poracode_lock_write_holder "$1" "$2" && poracode_lock_release "$1" "$2"`,
      [lock, "creator-token"],
      homeEnv(home),
    );
    expect(resumed.code).toBe(0);
    expect(existsSync(lock)).toBe(false);
  }, 20_000);

  it("never reclaims an incomplete holder record, even with a dead PID", async () => {
    const home = createHome();
    const dead = await spawnDeadProcess();
    const lock = writeLockHolder(home, "partial-holder", dead.pid, "");

    const reaped = await runLibrary(`poracode_lock_reap "$1" "$2" "$3"`, [
      lock,
      String(dead.pid),
      "",
    ]);
    expect(reaped.code).not.toBe(0);
    expect(existsSync(lock)).toBe(true);
    expect(readHolder(lock).pid).toBe(String(dead.pid));
  }, 15_000);

  it("release only removes this shell's own lock, never a foreign holder's", async () => {
    const home = createHome();
    const holder = startLockHolder(home, "foreign-release");
    await waitForHolder(holder.lock);

    const foreignRelease = await runLibrary(`poracode_lock_release "$1" "$2"`, [
      holder.lock,
      "not-my-token",
    ]);
    expect(foreignRelease.code).toBe(0);
    expect(existsSync(holder.lock)).toBe(true);
    expect(holder.child.exitCode).toBeNull();
  }, 20_000);

  it("treats non-numeric wait inputs as an immediate bounded wait", async () => {
    const home = createHome();
    const lock = lockPath(home, "invalid-wait");
    mkdirSync(dirname(lock), { recursive: true });

    const started = Date.now();
    const acquired = await runLibrary(
      `TOKEN="$(poracode_process_token $$ 2>/dev/null || true)"
poracode_lock_acquire "$1" "not-a-number" "$TOKEN"`,
      [lock],
      homeEnv(home),
    );
    expect(acquired.code).toBe(0);
    expect(Date.now() - started).toBeLessThan(5_000);

    const contender = await runLibrary(
      `poracode_lock_acquire "$1" "also-bad" "$2"`,
      [lock, "x"],
      homeEnv(home),
    );
    expect(contender.code).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);
});

describe("SSH process token parsing", () => {
  function statLine(comm: string, starttime: string): string {
    return `1234 (${comm}) S ${Array.from({ length: 18 }, () => "0").join(" ")} ${starttime}`;
  }

  it.each([
    ["plain", "77"],
    ["node (fixture) with spaces", "987654"],
    ["a ) paren inside", "4242"],
  ])("parses the starttime after the final ')' for a %s title", async (comm, starttime) => {
    const parsed = await runLibrary(`printf '%s\\n' "$1" | poracode_parse_proc_stat_start`, [
      statLine(comm, starttime),
    ]);
    expect(parsed.code).toBe(0);
    expect(parsed.stdout.trim()).toBe(starttime);
  });

  it.each([
    ["no closing paren", "1234 node S 1 2 3 4"],
    ["too few fields", "1234 (node) S 1 2 3"],
    ["non-numeric starttime", statLine("node", "nope")],
    ["empty input", ""],
  ])("fails closed on %s", async (_label, line) => {
    const parsed = await runLibrary(`printf '%s\\n' "$1" | poracode_parse_proc_stat_start`, [line]);
    expect(parsed.code).not.toBe(0);
    expect(parsed.stdout.trim()).toBe("");
  });

  it("returns a stable token for a live process whose title has spaces and parens", async () => {
    const child = spawn(
      process.execPath,
      ["-e", 'process.title = "poracode (fixture) worker"; setInterval(() => {}, 1000);'],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    fixtureChildren.push(child);
    const first = await processToken(child.pid!);
    const second = await processToken(child.pid!);
    expect(first).not.toBe("");
    expect(first).toBe(second);
  }, 15_000);

  it("computes the same token under a minimal PATH as under the full shell PATH", async () => {
    const child = spawnUnrelatedChild();
    const full = await processToken(child.pid!);
    const minimal = await runShell(
      `${REMOTE_OWNER_SHELL_LIBRARY}\nporacode_process_token "$1"\n`,
      [String(child.pid)],
      { ...homeEnv(osHome()), PATH: "/bin:/usr/bin" },
    );
    expect(full).not.toBe("");
    expect(minimal.stdout.trim()).toBe(full);
  }, 15_000);

  it.skipIf(!existsSync("/proc/self/stat"))(
    "reads the same /proc starttime for a real process title with parens",
    async () => {
      const child = spawn(
        process.execPath,
        ["-e", 'process.title = "poracode ) real title (spaces"; setInterval(() => {}, 1000);'],
        { stdio: ["ignore", "ignore", "ignore"] },
      );
      fixtureChildren.push(child);
      const token = await processToken(child.pid!);
      expect(token).toMatch(/:\d+$/u);
      expect(token).not.toContain(" ");
    },
    15_000,
  );
});

describe("SSH bounded waits and launch failure cleanup", () => {
  it("bounds a hung owner status command instead of stalling the launch", async () => {
    const home = createHome();
    writeRuntime(home, OLD_HASH);
    writeRuntime(home, NEW_HASH);
    const unrelated = spawnUnrelatedChild();
    writeIdentity(home, {
      pid: String(unrelated.pid),
      token: "boot:stale-start-token",
      generation: GENERATION,
      runtime: OLD_HASH,
    });

    const started = Date.now();
    const { result, stderr } = await runLaunch(home, launchArgs(NEW_HASH, "connect", 5_000), {
      PORACODE_FIXTURE_STATUS_HANG_MS: "60000",
      PORACODE_FIXTURE_STATUS_SCOPE_HASH: OLD_HASH,
      PORACODE_OWNER_STATUS_TIMEOUT_MS: "800",
      PORACODE_FIXTURE_PROTOCOL: String(PORACODE_REMOTE_PROTOCOL_VERSION),
    });

    expect(stderr).toBe("");
    expect(result).toMatchObject({ reusedOwner: false, ownerRuntimeHash: NEW_HASH });
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(unrelated.exitCode).toBeNull();
    expect(readLog(home).filter((line) => line.startsWith("stopping"))).toEqual([]);
  }, 40_000);

  it("signals only its own failed child and leaves a recorded unrelated process alive", async () => {
    const home = createHome();
    writeRuntime(home, OLD_HASH);
    const failingRuntime = writeRuntime(home, NEW_HASH);
    writeFileSync(join(failingRuntime, "server.cjs"), "process.exit(1);\n");
    const unrelated = spawnUnrelatedChild();
    writeIdentity(home, {
      pid: String(unrelated.pid),
      token: "boot:different-lifetime",
      generation: GENERATION,
      runtime: OLD_HASH,
    });

    const { error } = await runLaunch(home, launchArgs(NEW_HASH), {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
    });

    expect(error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((error as SshBootstrapRefusedError).code).toBe("launch-failed");
    expect(unrelated.exitCode).toBeNull();
    expect(existsSync(join(stateDir(home), "owner-identity"))).toBe(true);
  }, 30_000);
});

describe("waitForRemoteEndpoint cancellation", () => {
  it("cancels and joins the in-flight request and the poll pause on abort", async () => {
    let calls = 0;
    let requestAborted = false;
    const fetchImpl = ((_input: unknown, init?: { signal?: AbortSignal }) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const onAbort = (): void => {
          requestAborted = true;
          reject(Object.assign(new Error("request aborted"), { name: "AbortError" }));
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }) as unknown as typeof fetch;
    const controller = new AbortController();
    const pending = waitForRemoteEndpoint(fetchImpl, "http://127.0.0.1:9/", 60_000, {
      signal: controller.signal,
      pollIntervalMs: 5,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort("tunnel gone");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(requestAborted).toBe(true);
    expect(calls).toBe(1);
    // No detached timer starts another attempt after the abort.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBe(1);
  });
});
