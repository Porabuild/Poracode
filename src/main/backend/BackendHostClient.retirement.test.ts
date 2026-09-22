import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { BackendHostClient } from "./BackendHostClient";

// D5 residual regression: the initialization-failure path used to SIGTERM the
// failed generation and then respawn, dropping the only reference to it. A
// child that ignores SIGTERM survived as an unreachable orphan still holding
// its custody (here: a bound port; in production: the backend data fence).
// The client must retire every failed generation with the bounded SIGTERM ->
// SIGKILL -> actual-exit join and admit a successor only after that exit is
// confirmed, and the successor's own disposal must still join on the exit.
//
// The fixture ignores SIGTERM (its handler never exits), so only the bounded
// SIGKILL can end it. The first generation fails `initialize`; the next one
// succeeds and is later disposed. Real forks only, temporary ports/PIDs that
// belong to this test.
const FIXTURE_SOURCE = `
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const dir = process.env.PORACODE_TEST_RETIRE_DIR;
let firstGeneration = false;
try {
  fs.closeSync(fs.openSync(path.join(dir, "first-generation"), "wx"));
  firstGeneration = true;
} catch {
  firstGeneration = false;
}
process.on("SIGTERM", () => {
  // Deliberately ignored: only the parent's bounded SIGKILL may retire this
  // child, which is exactly what the retirement join must confirm.
});
const server = net.createServer();
server.listen(0, "127.0.0.1", () => {
  fs.writeFileSync(path.join(dir, "port." + process.pid), String(server.address().port));
});
process.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.operation === "initialize" && firstGeneration) {
    process.send({
      version: message.version,
      kind: "reply",
      replyTo: message.id,
      ok: false,
      error: "synthetic initialization failure",
    });
    return;
  }
  process.send({ version: message.version, kind: "reply", replyTo: message.id, ok: true, data: null });
});
`;

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function waitForPidCount(pids: number[], count: number, budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (pids.length < count) {
    if (Date.now() > deadline) throw new Error(`Only ${pids.length} backend generations started.`);
    await delay(20);
  }
}

async function waitForPortFile(path: string): Promise<number> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      const port = Number(await readFile(path, "utf8"));
      if (Number.isSafeInteger(port) && port > 0) return port;
    } catch {
      // not written yet
    }
    if (Date.now() > deadline) throw new Error("Fixture did not report its listening port.");
    await delay(20);
  }
}

async function waitForDeath(pid: number, budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    if (Date.now() > deadline) throw new Error(`Child ${pid} is still alive.`);
    await delay(20);
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function portIsBound(port: number): Promise<boolean> {
  const probe = createServer();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      probe.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") resolve(true);
        else reject(error);
      });
      probe.listen(port, "127.0.0.1", () => resolve(false));
    });
  } finally {
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  }
}

describe.skipIf(process.platform === "win32")(
  "BackendHostClient failed-generation retirement",
  () => {
    it("admits a successor only after the SIGTERM-ignoring generation is confirmed dead", async () => {
      const directory = await mkdtemp(join(tmpdir(), "poracode-backend-retirement-"));
      directories.push(directory);
      const script = join(directory, "backend-host-retirement.cjs");
      await writeFile(script, FIXTURE_SOURCE);
      process.env.PORACODE_TEST_RETIRE_DIR = directory;
      const pids: number[] = [];
      const client = new BackendHostClient({
        backendHostPath: script,
        initialize: {
          baseDir: directory,
          dbPath: join(directory, "state.sqlite"),
          supervisor: {
            appVersion: "test",
            isDev: true,
            supervisorPath: join(directory, "supervisor.cjs"),
            wslHelpersDir: join(directory, "wsl"),
            secretStorageKey: "secret",
            preferUiResponsiveness: false,
          },
        },
        resolveExtraEnv: () => ({}),
        assignPid: async (pid) => {
          pids.push(pid);
        },
        onReset() {},
      });
      try {
        const start = client.startSupervisor();
        await waitForPidCount(pids, 1, 10_000);
        const failedPid = pids[0]!;
        const failedPort = await waitForPortFile(join(directory, `port.${failedPid}`));

        // The fixture fails its initialize immediately. During the SIGTERM
        // window (bounded grace before SIGKILL) the failed generation is still
        // alive and no successor may be admitted — the old code respawned here
        // while the ignored SIGTERM left the first child holding its port.
        await delay(1_500);
        expect(isAlive(failedPid)).toBe(true);
        expect(pids).toHaveLength(1);
        expect(await portIsBound(failedPort)).toBe(true);

        // The bounded SIGKILL confirms the exit and frees the custody; only now
        // does the respawn become eligible.
        await waitForDeath(failedPid, 12_000);
        expect(await portIsBound(failedPort)).toBe(false);
        await waitForPidCount(pids, 2, 12_000);
        const successorPid = pids[1]!;
        expect(successorPid).not.toBe(failedPid);
        expect(isAlive(failedPid)).toBe(false);

        await start;
        const successorPort = await waitForPortFile(join(directory, `port.${successorPid}`));

        // The successor ignores SIGTERM as well: disposal must still escalate
        // and join it, and its port must be released.
        await client.disposeAsync({ timeoutMs: 150 });
        await waitForDeath(successorPid, 12_000);
        expect(await portIsBound(successorPort)).toBe(false);
      } finally {
        delete process.env.PORACODE_TEST_RETIRE_DIR;
        await client.disposeAsync({ timeoutMs: 0 }).catch(() => undefined);
        for (const pid of pids) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // already gone
          }
        }
      }
    }, 45_000);
  },
);
