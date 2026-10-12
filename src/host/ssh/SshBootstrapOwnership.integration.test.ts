import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SSH_FIXTURE_SERVER_SOURCE } from "./sshBootstrapFixtureServer";
import { LAUNCH_REMOTE_SERVER_SCRIPT } from "@/shared/sshRemoteScripts";
import { REMOTE_OWNER_SHELL_LIBRARY } from "@/shared/sshRemoteShell";
import {
  parseRemoteLaunchOutcome,
  SshBootstrapRefusedError,
  type RemoteBootstrapResult,
} from "@/shared/sshBootstrap";

/**
 * C2 hazard matrix over a real sshd (G-SSH-2).
 *
 * The target is this machine with an isolated sshd started by the caller
 * (`PORACODE_SSH_E2E_LOCAL_FIXTURES=1`): temporary host/client keys, config and
 * authorized_keys under tmp, a high loopback port, and an isolated remote HOME.
 * The fixture runtime is driven through the real `ssh` binary, so the generated
 * scripts and the transport run for real while "remote" processes stay
 * inspectable from the test. Without the flag the suite is skipped because
 * process liveness assertions would not apply to a real remote host.
 */
const target = process.env.PORACODE_SSH_E2E_TARGET;
const identityFile = process.env.PORACODE_SSH_E2E_IDENTITY;
const sshPort = process.env.PORACODE_SSH_E2E_PORT ?? "22";
const localFixtures = process.env.PORACODE_SSH_E2E_LOCAL_FIXTURES === "1";
const runLive = Boolean(target && identityFile && localFixtures);

const CONNECTION_ID = "7c2e9f6a-1111-4222-8333-444455556666";
const OLD_HASH = "b".repeat(64);
const NEW_HASH = "a".repeat(64);
const GENERATION = "6a2c0d5b-77aa-4a19-9f2e-1b3c4d5e6f70";

const tempDirs: string[] = [];
const fixtureChildren: ChildProcess[] = [];
// Below 49152 so the script's own port scan cannot collide with these.
let nextPort = 47_200;

afterAll(async () => {
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
});

function createRemoteHome(): string {
  const home = mkdtempSync(join(tmpdir(), "poracode-ssh-live-home-"));
  tempDirs.push(home);
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  symlinkSync(process.execPath, join(home, ".local", "bin", "node"));
  writeFileSync(join(home, "fixture-alive"), "alive\n");
  return home;
}

function writeRuntime(home: string, hash: string, version: string): string {
  const dir = join(home, ".poracode", "ssh", "runtime", hash);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "server.cjs"), SSH_FIXTURE_SERVER_SOURCE);
  writeFileSync(join(dir, "supervisor.cjs"), "// fixture supervisor\n");
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "fixture", version })}\n`);
  writeFileSync(join(dir, ".ready"), hash);
  return dir;
}

function stateDir(home: string): string {
  return join(home, ".poracode", "ssh", "hosts", CONNECTION_ID);
}

function fixtureEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    PORACODE_FIXTURE_STATUS_FILE: join(home, "fixture-status.json"),
    PORACODE_FIXTURE_LOG: join(home, "fixture.log"),
    PORACODE_FIXTURE_LEASE_PATH: join(home, "fixture-lease"),
    PORACODE_FIXTURE_GENERATION: GENERATION,
    PORACODE_FIXTURE_LIFETIME_GUARD: join(home, "fixture-alive"),
    ...extra,
  };
}

function reservePort(): number {
  nextPort += 1;
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function spawnFixtureOwner(
  home: string,
  runtimeDir: string,
  port: number,
  extra: Record<string, string> = {},
): ChildProcess {
  const child = spawn(process.execPath, [join(runtimeDir, "server.cjs")], {
    env: fixtureEnv(home, {
      PORACODE_REMOTE_ACCESS_PORT: String(port),
      PORACODE_BASE_DIR: join(stateDir(home), "data"),
      PORACODE_FIXTURE_PROTOCOL: "12",
      ...extra,
    }),
    stdio: ["ignore", "ignore", "pipe"],
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

function writeIdentity(home: string, fields: Partial<Record<string, string>>): void {
  const identityPath = join(stateDir(home), "owner-identity");
  mkdirSync(join(stateDir(home)), { recursive: true });
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
    identityPath,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
  );
}

function lockPath(home: string, name: string): string {
  return join(home, ".poracode", "ssh", "locks", name);
}

/** The recorded start token the launch script requires for owner authority. */
async function processToken(pid: number): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-s", "--", String(pid)], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.once("error", () => resolve(""));
    child.once("exit", () => resolve(stdout.trim()));
    child.stdin.end(`${REMOTE_OWNER_SHELL_LIBRARY}\nporacode_process_token "$1"\n`);
  });
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

function readIdentity(home: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of readFileSync(join(stateDir(home), "owner-identity"), "utf8").split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) fields[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return fields;
}

function readLog(home: string, fileName = "fixture.log"): string[] {
  const path = join(home, fileName);
  return existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function runLaunchOverSsh(
  home: string,
  args: readonly string[],
  extra: Record<string, string> = {},
): Promise<{ result?: RemoteBootstrapResult; error?: unknown; stdout: string; stderr: string }> {
  // ssh never forwards these variables, so the remote command carries the
  // fixture environment explicitly; only HOME/PATH isolate the remote side.
  const remoteEnvironment = {
    HOME: home,
    PATH: `${join(home, ".local", "bin")}:/usr/bin:/bin`,
    ...Object.fromEntries(
      Object.entries(fixtureEnv(home, extra)).filter(([key]) =>
        key.startsWith("PORACODE_FIXTURE_"),
      ) as Array<[string, string]>,
    ),
  };
  const remoteCommand = `${Object.entries(remoteEnvironment)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ")} sh -s -- ${args.join(" ")}`;
  const child = spawn(
    "ssh",
    [
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "LogLevel=ERROR",
      "-p",
      sshPort,
      "-i",
      identityFile!,
      "-o",
      "IdentitiesOnly=yes",
      target!,
      remoteCommand,
    ],
    {
      env: fixtureEnv(home, extra),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const exited = new Promise<void>((resolve) => {
    child.once("error", () => resolve());
    child.once("exit", () => resolve());
  });
  child.stdin.end(LAUNCH_REMOTE_SERVER_SCRIPT);
  await exited;
  try {
    return { result: parseRemoteLaunchOutcome(stdout), stdout, stderr };
  } catch (error) {
    return { error, stdout, stderr };
  }
}

describe.skipIf(!runLive)("SSH ownership-safe bootstrap over real sshd", () => {
  it("reuses an authenticated owner and keeps a stale unrelated PID alive", async () => {
    const home = createRemoteHome();
    const oldRuntime = writeRuntime(home, OLD_HASH, "1.0.0");
    writeRuntime(home, NEW_HASH, "2.0.0");
    const ownerPort = reservePort();
    const owner = spawnFixtureOwner(home, oldRuntime, ownerPort);
    await waitForPort(ownerPort);
    writeIdentity(home, {
      pid: String(owner.pid),
      token: await processToken(owner.pid!),
      generation: GENERATION,
      runtime: OLD_HASH,
      port: String(ownerPort),
    });

    const reused = await runLaunchOverSsh(home, ["connect", CONNECTION_ID, NEW_HASH, "10000"]);
    expect(reused.result).toMatchObject({
      remotePort: ownerPort,
      reusedOwner: true,
      ownerRuntimeHash: OLD_HASH,
    });
    expect(owner.exitCode).toBeNull();
    expect(readLog(home).filter((line) => line.startsWith("stopping"))).toEqual([]);
  }, 120_000);

  it("does not signal a stale PID that points at an unrelated live process", async () => {
    const home = createRemoteHome();
    writeRuntime(home, OLD_HASH, "1.0.0");
    writeRuntime(home, NEW_HASH, "2.0.0");
    const unrelated = spawnUnrelatedChild();
    writeIdentity(home, {
      pid: String(unrelated.pid),
      token: "boot:stale-token",
      generation: GENERATION,
      runtime: OLD_HASH,
    });

    const started = await runLaunchOverSsh(home, ["connect", CONNECTION_ID, NEW_HASH, "10000"]);
    expect(started.result).toMatchObject({ reusedOwner: false, ownerRuntimeHash: NEW_HASH });
    expect(unrelated.exitCode).toBeNull();
    const identity = readIdentity(home);
    expect(identity.runtime).toBe(NEW_HASH);
    expect(identity.pid).not.toBe(String(unrelated.pid));
  }, 120_000);

  it("serializes concurrent clients so only one owner starts", async () => {
    const home = createRemoteHome();
    writeRuntime(home, NEW_HASH, "2.0.0");

    const [first, second] = await Promise.all([
      runLaunchOverSsh(home, ["connect", CONNECTION_ID, NEW_HASH, "30000"], {
        PORACODE_FIXTURE_START_DELAY_MS: "600",
      }),
      runLaunchOverSsh(home, ["connect", CONNECTION_ID, NEW_HASH, "30000"], {
        PORACODE_FIXTURE_START_DELAY_MS: "600",
      }),
    ]);

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(first.result?.remotePort).toBe(second.result?.remotePort);
    expect(readLog(home).filter((line) => line.startsWith("started"))).toHaveLength(1);
  }, 120_000);

  it("reclaims a dead holder's owner lock and starts one owner", async () => {
    const home = createRemoteHome();
    writeRuntime(home, NEW_HASH, "2.0.0");
    const dead = spawnUnrelatedChild();
    dead.kill("SIGKILL");
    await waitForExit(dead);
    const lock = lockPath(home, `owner-${CONNECTION_ID}`);
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "holder"), `pid=${dead.pid}\ntoken=boot:dead-lifetime\n`);

    const started = await runLaunchOverSsh(home, ["connect", CONNECTION_ID, NEW_HASH, "10000"]);
    expect(started.result).toMatchObject({ reusedOwner: false, ownerRuntimeHash: NEW_HASH });
    expect(existsSync(lock)).toBe(false);
  }, 120_000);

  it("refuses a holderless lock without removing it", async () => {
    const home = createRemoteHome();
    writeRuntime(home, NEW_HASH, "2.0.0");
    const lock = lockPath(home, `owner-${CONNECTION_ID}`);
    mkdirSync(lock, { recursive: true });

    const refused = await runLaunchOverSsh(home, ["connect", CONNECTION_ID, NEW_HASH, "1000"], {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
    });
    expect(refused.error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((refused.error as SshBootstrapRefusedError).code).toBe("owner-busy");
    expect(existsSync(lock)).toBe(true);
    expect(existsSync(join(lock, "holder"))).toBe(false);
  }, 120_000);

  it("preserves a future identity record over ssh and never signals it", async () => {
    const home = createRemoteHome();
    writeRuntime(home, OLD_HASH, "1.0.0");
    writeRuntime(home, NEW_HASH, "2.0.0");
    const unrelated = spawnUnrelatedChild();
    const content = `version=9\npid=${unrelated.pid}\ntoken=boot:x\ngeneration=${GENERATION}\nruntime=${OLD_HASH}\n`;
    const identityPath = join(stateDir(home), "owner-identity");
    mkdirSync(stateDir(home), { recursive: true });
    writeFileSync(identityPath, content);

    const refused = await runLaunchOverSsh(home, ["connect", CONNECTION_ID, NEW_HASH, "10000"], {
      PORACODE_FIXTURE_STATUS_EXIT: "1",
    });
    expect(refused.error).toBeInstanceOf(SshBootstrapRefusedError);
    expect((refused.error as SshBootstrapRefusedError).code).toBe("owner-unverified");
    expect(unrelated.exitCode).toBeNull();
    expect(readFileSync(identityPath, "utf8")).toBe(content);
  }, 120_000);

  it("joins an old owner's shutdown before the replacement starts", async () => {
    const home = createRemoteHome();
    const oldRuntime = writeRuntime(home, OLD_HASH, "1.0.0");
    writeRuntime(home, NEW_HASH, "2.0.0");
    const oldPort = reservePort();
    const oldOwner = spawnFixtureOwner(home, oldRuntime, oldPort, {
      PORACODE_FIXTURE_DRAIN_MS: "800",
      PORACODE_FIXTURE_LOG: join(home, "upgrade.log"),
    });
    await waitForPort(oldPort);
    const token = await processToken(oldOwner.pid!);
    expect(token).not.toBe("");
    writeIdentity(home, {
      pid: String(oldOwner.pid),
      token,
      generation: GENERATION,
      runtime: OLD_HASH,
      port: String(oldPort),
    });

    const upgraded = await runLaunchOverSsh(
      home,
      ["upgrade", CONNECTION_ID, NEW_HASH, "20000", "20000"],
      { PORACODE_FIXTURE_LOG: join(home, "upgrade.log") },
    );

    expect(upgraded.result).toMatchObject({ reusedOwner: false, ownerRuntimeHash: NEW_HASH });
    const lines = readLog(home, "upgrade.log");
    const stopping = lines.findIndex((line) => line.startsWith("stopping"));
    const stopped = lines.findIndex((line) => line.startsWith("stopped"));
    const restarted = lines
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line }) =>
          line.startsWith("started") && !line.startsWith(`started pid=${oldOwner.pid} `),
      );
    expect(stopping).toBeGreaterThanOrEqual(0);
    expect(stopped).toBeGreaterThan(stopping);
    expect(restarted).toHaveLength(1);
    expect(restarted[0]!.index).toBeGreaterThan(stopped);
    expect(oldOwner.exitCode).not.toBeNull();
    expect(existsSync(join(home, "fixture-lease"))).toBe(true);
    expect(readIdentity(home).runtime).toBe(NEW_HASH);
  }, 120_000);
});
