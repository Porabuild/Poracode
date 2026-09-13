import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stopSupervisorChild } from "./stopSupervisorChild";

const children: ChildProcess[] = [];
const directories: string[] = [];

async function fixture(ignoreTermination: boolean): Promise<ChildProcess> {
  const directory = await mkdtemp(join(tmpdir(), "poracode-supervisor-join-"));
  directories.push(directory);
  const script = join(directory, "supervisor.cjs");
  await writeFile(
    script,
    `process.on("SIGTERM",()=>{${ignoreTermination ? "" : 'process.send({type:"final-event"},()=>setTimeout(()=>process.exit(0),80));'}});process.send({type:"ready"});setInterval(()=>{},1000);`,
  );
  const child = fork(script, [], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  children.push(child);
  await once(child, "message");
  return child;
}

afterEach(async () => {
  vi.useRealTimers();
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGKILL");
      await closed;
    }
  }
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe.skipIf(process.platform === "win32")("stopSupervisorChild real child join", () => {
  it("waits for a delayed graceful close and delivers its final IPC message first", async () => {
    const child = await fixture(false);
    const messages: unknown[] = [];
    child.on("message", (message) => messages.push(message));
    let closed = false;
    child.once("close", () => {
      closed = true;
    });
    const stopping = stopSupervisorChild(child, { graceMs: 2_000, forceMs: 1_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toBe(false);
    await stopping;
    expect(messages).toEqual([{ type: "final-event" }]);
    expect(closed).toBe(true);
    expect(child.exitCode).toBe(0);
  });

  it("escalates an unresponsive child and joins its forced close", async () => {
    const child = await fixture(true);
    let closed = false;
    child.once("close", () => {
      closed = true;
    });
    await stopSupervisorChild(child, { graceMs: 20, forceMs: 1_000 });
    expect(child.signalCode).toBe("SIGKILL");
    expect(closed).toBe(true);
  });

  it("does not signal a dead child PID on a repeated stop", async () => {
    const child = await fixture(false);
    await stopSupervisorChild(child, { graceMs: 2_000, forceMs: 1_000 });
    const kill = vi.spyOn(child, "kill");
    await stopSupervisorChild(child);
    expect(kill).not.toHaveBeenCalled();
  });
});

it("rejects if termination never produces the owned close event", async () => {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    exitCode: null,
    signalCode: null,
    kill: vi.fn<(signal?: NodeJS.Signals) => boolean>(() => true),
  });
  const stopped = stopSupervisorChild(child as unknown as ChildProcess, {
    graceMs: 10,
    forceMs: 10,
  }).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(20);
  expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
  expect(await stopped).toMatchObject({
    message: expect.stringContaining("database must remain open"),
  });
});
