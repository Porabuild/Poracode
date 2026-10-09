import { describe, expect, it } from "vitest";
import { ConfigWriteLock } from "./sessionConfigWriteLock";

describe("ACP config writer admission", () => {
  it("keeps a queued prompt config push behind an unresolved action write", async () => {
    const lock = new ConfigWriteLock();
    const action = lock.tryAcquire();
    expect(action).toBeDefined();
    const observed: string[] = [];
    const prompt = lock.runExclusive(() => {
      observed.push("prompt");
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(observed).toEqual([]);
    expect(lock.tryAcquire()).toBeUndefined();
    action!.release();
    await prompt;
    expect(observed).toEqual(["prompt"]);
    expect(lock.isBusy()).toBe(false);
  });

  it("preserves queue order and releases each action lease only once", async () => {
    const lock = new ConfigWriteLock();
    const action = lock.tryAcquire()!;
    const observed: number[] = [];
    const first = lock.runExclusive(() => {
      observed.push(1);
    });
    const second = lock.runExclusive(() => {
      observed.push(2);
    });
    action.release();
    action.release();
    await Promise.all([first, second]);
    expect(observed).toEqual([1, 2]);
    expect(lock.isBusy()).toBe(false);
    expect(lock.tryAcquire()).toBeDefined();
  });
});
