import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChildProcessLifetime } from "./childProcessLifetime";

const children: { child: ChildProcess; lifetime: ChildProcessLifetime }[] = [];

function fixture(script: string) {
  const child = spawn(process.execPath, ["-e", script]);
  const lifetime = new ChildProcessLifetime(child);
  children.push({ child, lifetime });
  return { child, lifetime, ready: once(child.stdout, "data") };
}

afterEach(async () => {
  for (const { child, lifetime } of children.splice(0)) {
    if (
      child.exitCode === null &&
      child.signalCode === null &&
      typeof child.pid === "number" &&
      Number.isSafeInteger(child.pid) &&
      child.pid > 0
    )
      child.kill("SIGKILL");
    await lifetime.closed;
  }
});

describe("ChildProcessLifetime", () => {
  it.skipIf(process.platform === "win32")("joins delayed SIGTERM exit and both pipes", async () => {
    const { child, lifetime, ready } = fixture(`
      process.on('SIGTERM', () => setTimeout(() => process.exit(0), 80));
      process.stdout.write('ready'); setInterval(() => {}, 1000);
    `);
    await ready;
    const closing = lifetime.stop();
    expect(lifetime.stop()).toBe(closing);
    expect(child.killed).toBe(true);
    expect(child.exitCode).toBeNull();
    await closing;
    expect(child.exitCode).toBe(0);
    expect(child.stdout?.destroyed).toBe(true);
    expect(child.stderr?.destroyed).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "escalates a child that ignores SIGTERM and joins SIGKILL",
    async () => {
      const { child, lifetime, ready } = fixture(`
      process.on('SIGTERM', () => {});
      process.stdout.write('ready'); setInterval(() => {}, 1000);
    `);
      await ready;
      await lifetime.stop({ graceMs: 20 });
      expect(child.signalCode).toBe("SIGKILL");
      expect(child.stdout?.destroyed).toBe(true);
    },
  );

  it("joins pipes held by a fixture descendant without signaling the exited leader", async () => {
    const { child, lifetime, ready } = fixture(`
      require('node:child_process').spawn(process.execPath,
        ['-e', 'setTimeout(() => {}, 200)'], { stdio: ['ignore', 1, 2] }).unref();
      process.stdout.write('ready', () => process.exit(0));
    `);
    await ready;
    if (child.exitCode === null) await once(child, "exit");
    const kill = vi.spyOn(child, "kill");
    let joined = false;
    const closing = lifetime.stop({ graceMs: 10, forceMs: 1_000 }).then(() => {
      joined = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(joined).toBe(false);
    expect(kill).not.toHaveBeenCalled();
    await closing;
    expect(child.stdout?.destroyed).toBe(true);
    expect(kill).not.toHaveBeenCalled();
  });

  it("joins a failed spawn through close", async () => {
    const child = spawn("poracode-synthetic-missing-native-lifetime-fixture");
    const kill = vi.spyOn(child, "kill").mockImplementation(() => false);
    const lifetime = new ChildProcessLifetime(child);
    children.push({ child, lifetime });
    await lifetime.stop();
    expect(child.pid).toBeUndefined();
    expect(kill).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "does not signal an invalid owned PID %s",
    async (pid) => {
      const child = Object.assign(new EventEmitter(), {
        pid,
        exitCode: null,
        signalCode: null,
        kill: vi.fn<(signal: NodeJS.Signals) => boolean>(() => false),
      });
      const lifetime = new ChildProcessLifetime(child as unknown as ChildProcess);
      const closing = lifetime.stop();
      try {
        expect(child.kill).not.toHaveBeenCalled();
      } finally {
        child.emit("close", -2, null);
        await closing;
      }
    },
  );

  it("reports unconfirmed closure and accepts only a later observed close", async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 1_234_567,
      exitCode: null,
      signalCode: null,
      kill: vi.fn<(signal: NodeJS.Signals) => boolean>(() => true),
    });
    const lifetime = new ChildProcessLifetime(child as unknown as ChildProcess);
    await expect(lifetime.stop({ graceMs: 1, forceMs: 1 })).rejects.toThrow("unconfirmed");
    expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
    child.emit("close", 0, null);
    await lifetime.stop();
  });
});
