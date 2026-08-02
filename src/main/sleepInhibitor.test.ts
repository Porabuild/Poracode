import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  powerSaveBlocker: {
    start: vi.fn<(type: string) => number>(() => -1),
    stop: vi.fn<(id: number) => void>(),
    isStarted: vi.fn<(id: number) => boolean>(() => false),
  },
}));

import { createSleepInhibitor } from "./sleepInhibitor";

interface FakeChildProcess extends EventEmitter {
  stdin: { end: ReturnType<typeof vi.fn<() => void>> } | null;
  kill: ReturnType<typeof vi.fn<(signal?: string) => boolean>>;
}

function createFakeChild(): FakeChildProcess {
  const emitter = new EventEmitter() as FakeChildProcess;
  emitter.stdin = { end: vi.fn<() => void>() };
  emitter.kill = vi.fn<(signal?: string) => boolean>(() => true);
  return emitter;
}

function createBlocker() {
  let nextId = 1;
  const started = new Set<number>();
  return {
    start: vi.fn<(type: string) => number>(() => {
      const id = nextId++;
      started.add(id);
      return id;
    }),
    stop: vi.fn<(id: number) => void>((id: number) => {
      started.delete(id);
    }),
    isStarted: vi.fn<(id: number) => boolean>((id: number) => started.has(id)),
    _started: started,
  };
}

let logs: string[] = [];
const logger = (message: string) => {
  logs.push(message);
};

beforeEach(() => {
  logs = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSleepInhibitor", () => {
  it("starts and stops the electron blocker on non-linux platforms", () => {
    const blocker = createBlocker();
    const spawnFn = vi.fn<() => ChildProcess>();
    const inhibitor = createSleepInhibitor({
      platform: "darwin",
      electronBlocker: blocker,
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);
    expect(blocker.start).toHaveBeenCalledWith("prevent-app-suspension");
    expect(blocker._started.size).toBe(1);
    expect(spawnFn).not.toHaveBeenCalled();

    inhibitor.setActive(false);
    expect(blocker.stop).toHaveBeenCalledTimes(1);
    expect(blocker._started.size).toBe(0);
  });

  it("is idempotent on repeated setActive(true)", () => {
    const blocker = createBlocker();
    const inhibitor = createSleepInhibitor({
      platform: "win32",
      electronBlocker: blocker,
      spawnFn: vi.fn<() => ChildProcess>() as never,
      logger,
    });

    inhibitor.setActive(true);
    inhibitor.setActive(true);
    inhibitor.setActive(true);

    expect(blocker.start).toHaveBeenCalledTimes(1);
  });

  it("logs when powerSaveBlocker.start fails to activate", () => {
    const blocker = createBlocker();
    blocker.isStarted = vi.fn<(id: number) => boolean>(() => false);
    const inhibitor = createSleepInhibitor({
      platform: "darwin",
      electronBlocker: blocker,
      spawnFn: vi.fn<() => ChildProcess>() as never,
      logger,
    });

    inhibitor.setActive(true);

    expect(logs.some((l) => l.includes("powerSaveBlocker.start did not activate"))).toBe(true);

    inhibitor.setActive(false);
    expect(blocker.stop).not.toHaveBeenCalled();
  });

  it("spawns systemd-inhibit on linux alongside the electron blocker", () => {
    const blocker = createBlocker();
    const child = createFakeChild();
    const spawnFn = vi.fn<() => ChildProcess>(() => child as unknown as ChildProcess);
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      electronBlocker: blocker,
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);

    expect(blocker.start).toHaveBeenCalled();
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).toHaveBeenCalledWith(
      "systemd-inhibit",
      ["--what=sleep:idle", "--who=Poracode", "--why=Poracode is active", "--mode=block", "cat"],
      expect.objectContaining({ detached: false }),
    );
  });

  it("releases the systemd-inhibit child on setActive(false)", () => {
    const blocker = createBlocker();
    const child = createFakeChild();
    const spawnFn = vi.fn<() => ChildProcess>(() => child as unknown as ChildProcess);
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      electronBlocker: blocker,
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);
    inhibitor.setActive(false);

    expect(child.stdin!.end).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("disables systemd-inhibit after a spawn throw and does not retry", () => {
    const blocker = createBlocker();
    const spawnFn = vi.fn<() => ChildProcess>(() => {
      throw new Error("ENOENT systemd-inhibit");
    });
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      electronBlocker: blocker,
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);
    inhibitor.setActive(false);
    inhibitor.setActive(true);

    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.includes("systemd-inhibit unavailable"))).toBe(true);
    expect(blocker.start).toHaveBeenCalledTimes(2);
  });

  it("disables systemd-inhibit after a runtime error event", () => {
    const blocker = createBlocker();
    const child = createFakeChild();
    const spawnFn = vi.fn<() => ChildProcess>(() => child as unknown as ChildProcess);
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      electronBlocker: blocker,
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);
    child.emit("error", new Error("spawn failed"));

    inhibitor.setActive(false);
    inhibitor.setActive(true);

    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.includes("systemd-inhibit failed"))).toBe(true);
  });

  it("dispose() releases all inhibitors", () => {
    const blocker = createBlocker();
    const child = createFakeChild();
    const spawnFn = vi.fn<() => ChildProcess>(() => child as unknown as ChildProcess);
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      electronBlocker: blocker,
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);
    inhibitor.dispose();

    expect(blocker.stop).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
