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
  it.each(["darwin", "win32"] as const)(
    "prevents system sleep on %s while allowing the display to turn off",
    (platform) => {
      const blocker = createBlocker();
      const child = createFakeChild();
      const spawnFn = vi.fn<() => ChildProcess>(() => child as unknown as ChildProcess);
      const inhibitor = createSleepInhibitor({
        platform,
        electronBlocker: blocker,
        spawnFn: spawnFn as never,
        logger,
      });

      inhibitor.setActive(true);
      expect(blocker.start).toHaveBeenCalledExactlyOnceWith("prevent-app-suspension");
      expect(blocker._started.size).toBe(1);
      expect(spawnFn).toHaveBeenCalledTimes(0);

      inhibitor.setActive(false);
      expect(blocker.stop).toHaveBeenCalledTimes(1);
      expect(blocker._started.size).toBe(0);
    },
  );

  it.each(["darwin", "win32"] as const)(
    "is idempotent on repeated activation on %s",
    (platform) => {
      const blocker = createBlocker();
      const child = createFakeChild();
      const spawnFn = vi.fn<() => ChildProcess>(() => child as unknown as ChildProcess);
      const inhibitor = createSleepInhibitor({
        platform,
        electronBlocker: blocker,
        spawnFn: spawnFn as never,
        logger,
      });

      inhibitor.setActive(true);
      inhibitor.setActive(true);
      inhibitor.setActive(true);

      expect(blocker.start).toHaveBeenCalledTimes(1);
      expect(spawnFn).toHaveBeenCalledTimes(0);
    },
  );

  it.each(["darwin", "win32"] as const)(
    "releases %s's system blocker on dispose and reacquires it after deactivation",
    (platform) => {
      const blocker = createBlocker();
      const spawnFn = vi.fn<() => ChildProcess>(() => createFakeChild() as unknown as ChildProcess);
      const inhibitor = createSleepInhibitor({
        platform,
        electronBlocker: blocker,
        spawnFn: spawnFn as never,
        logger,
      });

      inhibitor.setActive(true);
      inhibitor.setActive(false);
      inhibitor.setActive(false);
      inhibitor.setActive(true);

      expect(blocker.start.mock.calls).toEqual([
        ["prevent-app-suspension"],
        ["prevent-app-suspension"],
      ]);
      expect(blocker.stop).toHaveBeenCalledExactlyOnceWith(1);
      expect(blocker._started.size).toBe(1);

      inhibitor.dispose();
      inhibitor.dispose();

      expect(blocker.stop.mock.calls).toEqual([[1], [2]]);
      expect(blocker._started.size).toBe(0);
      expect(spawnFn).toHaveBeenCalledTimes(0);
    },
  );

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

  it("uses a Linux sleep inhibitor without Electron or display/idle inhibition", () => {
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
    inhibitor.setActive(true);

    expect(blocker.start).not.toHaveBeenCalled();
    expect(spawnFn).toHaveBeenCalledExactlyOnceWith(
      "systemd-inhibit",
      ["--what=sleep", "--who=Poracode", "--why=Poracode is active", "--mode=block", "cat"],
      { stdio: ["pipe", "ignore", "ignore"], detached: false },
    );

    inhibitor.setActive(false);
    expect(child.stdin!.end).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
    child.emit("exit", 0, null);
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("falls back to GNOME suspend-only inhibition when systemd cannot spawn", () => {
    const child = createFakeChild();
    const spawnFn = vi
      .fn<() => ChildProcess>()
      .mockImplementationOnce(() => {
        throw new Error("ENOENT");
      })
      .mockReturnValue(child as unknown as ChildProcess);
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);

    expect(spawnFn).toHaveBeenLastCalledWith(
      "gnome-session-inhibit",
      ["--inhibit", "suspend", "--reason", "Poracode is active", "cat"],
      { stdio: ["pipe", "ignore", "ignore"], detached: false },
    );
    expect(logs.some((line) => line.includes("systemd-inhibit unavailable"))).toBe(true);
    inhibitor.dispose();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it.each(["error", "exit"] as const)("falls back once after a systemd %s", (event) => {
    const first = createFakeChild();
    const fallback = createFakeChild();
    const spawnFn = vi
      .fn<() => ChildProcess>()
      .mockReturnValueOnce(first as unknown as ChildProcess)
      .mockReturnValueOnce(fallback as unknown as ChildProcess);
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      spawnFn: spawnFn as never,
      logger,
    });
    inhibitor.setActive(true);

    if (event === "error") first.emit("error", new Error("ENOENT"));
    else first.emit("exit", 1, null);
    first.emit("exit", -1, null);

    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(spawnFn.mock.calls[1]).toEqual([
      "gnome-session-inhibit",
      ["--inhibit", "suspend", "--reason", "Poracode is active", "cat"],
      { stdio: ["pipe", "ignore", "ignore"], detached: false },
    ]);
    inhibitor.dispose();
    expect(fallback.kill).toHaveBeenCalledOnce();
  });

  it("stops retrying when neither Linux backend is available", () => {
    const spawnFn = vi.fn<() => ChildProcess>(() => {
      throw new Error("ENOENT");
    });
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);
    inhibitor.setActive(false);
    inhibitor.setActive(true);

    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(logs).toHaveLength(2);
  });

  it("does not acquire a fallback after deactivation or disposal", () => {
    const child = createFakeChild();
    const spawnFn = vi.fn<() => ChildProcess>(() => child as unknown as ChildProcess);
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);
    inhibitor.dispose();
    child.emit("error", new Error("late ENOENT"));
    child.emit("exit", 1, null);
    inhibitor.setActive(true);

    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("ignores late exit events from a released Linux inhibitor after reacquiring", () => {
    const first = createFakeChild();
    const second = createFakeChild();
    const spawnFn = vi
      .fn<() => ChildProcess>()
      .mockReturnValueOnce(first as unknown as ChildProcess)
      .mockReturnValueOnce(second as unknown as ChildProcess);
    const inhibitor = createSleepInhibitor({
      platform: "linux",
      spawnFn: spawnFn as never,
      logger,
    });

    inhibitor.setActive(true);
    inhibitor.setActive(false);
    inhibitor.setActive(true);
    first.emit("exit", 0, null);
    inhibitor.dispose();

    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(second.kill).toHaveBeenCalledOnce();
  });
});
