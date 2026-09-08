import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComputerUseWakeLock, type ComputerUseWakeLockBlocker } from "./ComputerUseWakeLock";

vi.mock("electron", () => ({
  powerSaveBlocker: { start: () => 0, stop: () => {}, isStarted: () => false },
}));

function createBlocker(): ComputerUseWakeLockBlocker & {
  readonly running: Set<number>;
  start: ReturnType<typeof vi.fn<(type: "prevent-display-sleep") => number>>;
  stop: ReturnType<typeof vi.fn<(id: number) => void>>;
} {
  const running = new Set<number>();
  let nextId = 1;
  return {
    running,
    start: vi.fn<(type: "prevent-display-sleep") => number>(() => {
      const id = nextId++;
      running.add(id);
      return id;
    }),
    stop: vi.fn<(id: number) => void>((id) => {
      running.delete(id);
    }),
    isStarted: (id: number) => running.has(id),
  };
}

describe("ComputerUseWakeLock", () => {
  let blocker: ReturnType<typeof createBlocker>;

  beforeEach(() => {
    blocker = createBlocker();
  });

  it("acquires a display-sleep blocker when a session becomes active", () => {
    const lock = new ComputerUseWakeLock({ blocker });

    expect(lock.isHeld()).toBe(false);

    lock.setSessionActive(true);

    expect(blocker.start).toHaveBeenCalledExactlyOnceWith("prevent-display-sleep");
    expect(lock.isHeld()).toBe(true);
  });

  it("releases the blocker when the session ends", () => {
    const lock = new ComputerUseWakeLock({ blocker });

    lock.setSessionActive(true);
    lock.setSessionActive(false);

    expect(blocker.stop).toHaveBeenCalledOnce();
    expect(blocker.running.size).toBe(0);
    expect(lock.isHeld()).toBe(false);
  });

  it("holds exactly one blocker across repeated activations", () => {
    const lock = new ComputerUseWakeLock({ blocker });

    lock.setSessionActive(true);
    lock.setSessionActive(true);
    lock.setSessionActive(true);

    expect(blocker.start).toHaveBeenCalledOnce();

    lock.setSessionActive(false);
    lock.setSessionActive(false);

    expect(blocker.stop).toHaveBeenCalledOnce();
    expect(blocker.running.size).toBe(0);
  });

  it("re-acquires after a release", () => {
    const lock = new ComputerUseWakeLock({ blocker });

    lock.setSessionActive(true);
    lock.setSessionActive(false);
    lock.setSessionActive(true);

    expect(blocker.start).toHaveBeenCalledTimes(2);
    expect(lock.isHeld()).toBe(true);
  });

  it("never acquires while the setting is off", () => {
    const lock = new ComputerUseWakeLock({ blocker, enabled: false });

    lock.setSessionActive(true);

    expect(blocker.start).not.toHaveBeenCalled();
    expect(lock.isHeld()).toBe(false);
  });

  it("releases immediately when the setting is turned off mid-session", () => {
    const lock = new ComputerUseWakeLock({ blocker });

    lock.setSessionActive(true);
    lock.setEnabled(false);

    expect(blocker.stop).toHaveBeenCalledOnce();
    expect(lock.isHeld()).toBe(false);

    // Re-enabling while the session is still active takes the blocker back.
    lock.setEnabled(true);

    expect(blocker.start).toHaveBeenCalledTimes(2);
    expect(lock.isHeld()).toBe(true);
  });

  it("ignores a repeated setting value", () => {
    const lock = new ComputerUseWakeLock({ blocker });

    lock.setSessionActive(true);
    lock.setEnabled(true);
    lock.setEnabled(true);

    expect(blocker.start).toHaveBeenCalledOnce();
    expect(blocker.stop).not.toHaveBeenCalled();
  });

  it("releases on dispose and stays released afterwards", () => {
    const lock = new ComputerUseWakeLock({ blocker });

    lock.setSessionActive(true);
    lock.dispose();

    expect(lock.isHeld()).toBe(false);
    expect(blocker.running.size).toBe(0);

    lock.dispose();
    lock.setSessionActive(true);

    expect(blocker.start).toHaveBeenCalledOnce();
    expect(lock.isHeld()).toBe(false);
  });

  it("logs and stays unheld when the blocker cannot start", () => {
    const logs: string[] = [];
    const failing: ComputerUseWakeLockBlocker = {
      start: () => {
        throw new Error("no power service");
      },
      stop: vi.fn<(id: number) => void>(),
      isStarted: () => false,
    };
    const lock = new ComputerUseWakeLock({
      blocker: failing,
      logger: (message) => logs.push(message),
    });

    lock.setSessionActive(true);

    expect(lock.isHeld()).toBe(false);
    expect(logs.some((line) => line.includes("no power service"))).toBe(true);
  });

  it("logs when the blocker reports it did not activate", () => {
    const logs: string[] = [];
    const inert: ComputerUseWakeLockBlocker = {
      start: () => 7,
      stop: vi.fn<(id: number) => void>(),
      isStarted: () => false,
    };
    const lock = new ComputerUseWakeLock({
      blocker: inert,
      logger: (message) => logs.push(message),
    });

    lock.setSessionActive(true);

    expect(logs.some((line) => line.includes("did not activate (id=7)"))).toBe(true);
    // The id is still tracked so a later release is not skipped.
    expect(lock.isHeld()).toBe(true);
  });
});
