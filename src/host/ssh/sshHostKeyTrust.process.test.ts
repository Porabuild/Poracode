import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSshBaseArgs } from "./SshConnectionManager";
import { SshHostKeyTrust, type SshResolvedTarget } from "./sshHostKeyTrust";
import { joinChildProcess, SshTrackedCommandRunner } from "./sshTrackedCommands";

/**
 * Real isolated-sshd leg for the host-key trust helper.
 *
 * It starts a throwaway sshd from the C2 test fixture (its own host/client
 * keys and authorized_keys under `tmp/`; no system sshd, config, or user keys
 * are read or modified), probes it with the real `ssh-keyscan`/`ssh-keygen`
 * path, and proves the strict per-environment known-hosts policy accepts the
 * accepted key and refuses a changed one. The suite skips when the fixture or
 * `/usr/sbin/sshd` is unavailable, and always stops only the process it
 * started.
 */

const sshdBinary = "/usr/sbin/sshd";
const fixtureDir = resolve("tmp/c2-sshd");
const fixtureConfig = join(fixtureDir, "sshd_config");
const fixtureHostKey = join(fixtureDir, "host_ed25519");
const fixtureClientKey = join(fixtureDir, "client_ed25519");
const fixtureAuthorizedKeys = join(fixtureDir, "authorized_keys");

const canRun =
  process.platform !== "win32" &&
  existsSync(sshdBinary) &&
  existsSync(fixtureConfig) &&
  existsSync(fixtureHostKey) &&
  existsSync(fixtureClientKey) &&
  existsSync(fixtureAuthorizedKeys);

async function freePort(): Promise<number> {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

async function waitForPort(port: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`isolated sshd exited (${child.exitCode ?? child.signalCode})`);
    }
    const connected = await new Promise<boolean>((resolveProbe) => {
      // A successful bind means the port is FREE, not that sshd is ready.
      const socket = createConnection({ host: "127.0.0.1", port });
      const finish = (ready: boolean) => {
        socket.destroy();
        resolveProbe(ready);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(500, () => finish(false));
    });
    if (connected) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error("isolated sshd did not start listening");
}

describe.skipIf(!canRun)("SshHostKeyTrust against an isolated sshd", () => {
  let sshd: ChildProcess | undefined;
  let port = 0;
  let scratch = "";
  let trust: SshHostKeyTrust;
  let target: SshResolvedTarget;
  const runner = new SshTrackedCommandRunner({ defaultTimeoutMs: 15_000 });

  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), "poracode-trust-sshd-"));
    port = await freePort();
    sshd = spawn(
      sshdBinary,
      [
        "-f",
        fixtureConfig,
        "-o",
        `Port=${port}`,
        "-o",
        `PidFile=${join(scratch, "sshd.pid")}`,
        "-D",
        "-E",
        join(scratch, "sshd.log"),
      ],
      { stdio: "ignore" },
    );
    await waitForPort(port, sshd);
    trust = new SshHostKeyTrust({ executor: runner });
    target = await trust.resolveTarget({ target: "127.0.0.1", port });
  }, 20_000);

  afterAll(async () => {
    if (sshd) {
      await joinChildProcess(sshd, 500);
    }
    await runner.dispose();
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  it("probes the real host key and matches ssh-keygen's fingerprint", async () => {
    const probe = await trust.probe(target);
    const expectedBlob = readFileSync(join(fixtureDir, "host_ed25519.pub"), "utf8")
      .trim()
      .split(/\s+/u)[1];
    expect(probe.preferred.keyType).toBe("ssh-ed25519");
    expect(probe.preferred.keyBlob).toBe(expectedBlob);
  });

  it("accepts the trusted key through the strict policy and refuses a changed key", async () => {
    const probe = await trust.probe(target);
    const knownHostsPath = join(scratch, "env.known_hosts");
    await trust.writeKnownHostsFile(knownHostsPath, [
      trust.knownHostsLine(probe.preferred, target),
    ]);
    const user = userInfo().username;
    const baseArgs = [
      ...buildSshBaseArgs(
        {
          id: "11111111-1111-4111-8111-111111111111",
          label: "fixture",
          target: `${user}@127.0.0.1`,
          port,
          identityFile: fixtureClientKey,
        },
        undefined,
        { userKnownHostsFile: knownHostsPath, strict: true },
      ),
      `${user}@127.0.0.1`,
      "true",
    ];
    await expect(runner.run("ssh", baseArgs)).resolves.toBeDefined();

    // A changed accepted key must fail closed with strict checking.
    const foreign = Buffer.from("ssh-ed25519 a different fixture host key").toString("base64");
    await trust.writeKnownHostsFile(knownHostsPath, [
      `${target.lookupName} ssh-ed25519 ${foreign}`,
    ]);
    await expect(runner.run("ssh", baseArgs)).rejects.toThrow(
      /host key verification|identification/i,
    );
  }, 20_000);
});
