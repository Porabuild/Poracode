import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { BackendHostClient } from "./BackendHostClient";

// Plan D5: the desktop main process is the external watchdog for its backend
// child. This suite uses a real fork (no mocked processTree) with a child that
// registers a SIGTERM handler and then blocks its event loop synchronously on
// `dispose`: only a bounded SIGKILL escalation can release the child's
// resources, and the test verifies the actual process death and port release.
const FIXTURE_SOURCE = `
const net = require("node:net");
const fs = require("node:fs");
const portFile = process.env.PORACODE_TEST_WEDGE_PORT_FILE;
const server = net.createServer();
server.listen(0, "127.0.0.1", () => {
  if (portFile) fs.writeFileSync(portFile, String(server.address().port));
});
process.on("SIGTERM", () => {
  // Registered exactly like the real backend host; a synchronously blocked
  // loop can never run this handler, so SIGTERM alone cannot stop the child.
});
process.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.operation === "dispose") {
    const until = Date.now() + 60_000;
    while (Date.now() < until) {}
    return;
  }
  process.send?.({ version: message.version, kind: "reply", replyTo: message.id, ok: true, data: null });
});
`;

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function waitForPortFile(path: string): Promise<number> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      const raw = await readFile(path, "utf8");
      const port = Number(raw);
      if (Number.isSafeInteger(port) && port > 0) return port;
    } catch {
      // not written yet
    }
    if (Date.now() > deadline) throw new Error("Fixture did not report its listening port.");
    await delay(20);
  }
}

async function waitForDeath(pid: number): Promise<void> {
  const deadline = Date.now() + 6_000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    if (Date.now() > deadline) throw new Error(`Child ${pid} is still alive after disposal.`);
    await delay(20);
  }
}

async function bindPort(port: number): Promise<void> {
  const probe = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolve);
    });
  } finally {
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  }
}

describe.skipIf(process.platform === "win32")("BackendHostClient external watchdog", () => {
  it("force-kills a child that ignores dispose with a blocked event loop and frees its port", async () => {
    const directory = await mkdtemp(join(tmpdir(), "poracode-backend-watchdog-"));
    directories.push(directory);
    const script = join(directory, "backend-host-wedge.cjs");
    const portFile = join(directory, "port");
    await writeFile(script, FIXTURE_SOURCE);
    process.env.PORACODE_TEST_WEDGE_PORT_FILE = portFile;
    let childPid = 0;
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
        childPid = pid;
      },
      onReset() {},
    });
    try {
      await client.startSupervisor();
      const port = await waitForPortFile(portFile);
      const started = Date.now();
      await client.disposeAsync({ timeoutMs: 150 });
      await waitForDeath(childPid);
      // Bounded escalation, not the 60s wedge and not an orphaned child.
      expect(Date.now() - started).toBeLessThan(6_000);
      await expect(bindPort(port)).resolves.toBeUndefined();
    } finally {
      delete process.env.PORACODE_TEST_WEDGE_PORT_FILE;
      await client.disposeAsync({ timeoutMs: 0 }).catch(() => undefined);
      if (childPid > 0) {
        try {
          process.kill(childPid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }
  }, 15_000);
});
