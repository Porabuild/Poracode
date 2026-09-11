import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createXtermScreen,
  resetXtermInstanceCacheForTests,
  shouldPersistXtermInstance,
  stashXtermInstance,
  takeXtermInstance,
  type CachedXtermInstance,
} from "./xtermInstanceCache";

function fakeInstance(): CachedXtermInstance {
  return {
    terminal: { dispose: vi.fn<() => void>() } as unknown as CachedXtermInstance["terminal"],
    fit: {} as CachedXtermInstance["fit"],
    search: {} as CachedXtermInstance["search"],
    screen: createXtermScreen(),
    hydrated: true,
  };
}

describe("xtermInstanceCache", () => {
  afterEach(() => {
    resetXtermInstanceCacheForTests();
  });

  it("hands the same instance back on take after stash", () => {
    const instance = fakeInstance();
    stashXtermInstance("thread-a", instance);
    expect(takeXtermInstance("thread-a")).toBe(instance);
    expect(takeXtermInstance("thread-a")).toBeUndefined();
  });

  it("disposes a replaced instance when stashing a different one", () => {
    const first = fakeInstance();
    const second = fakeInstance();
    stashXtermInstance("thread-a", first);
    stashXtermInstance("thread-a", second);
    expect(first.terminal.dispose).toHaveBeenCalled();
    expect(takeXtermInstance("thread-a")).toBe(second);
  });

  it("disposes cached instances on teardown", () => {
    const instance = fakeInstance();
    stashXtermInstance("thread-a", instance);
    resetXtermInstanceCacheForTests();
    expect(instance.terminal.dispose).toHaveBeenCalled();
    expect(takeXtermInstance("thread-a")).toBeUndefined();
  });
});

describe("shouldPersistXtermInstance", () => {
  const liveThread = {
    id: "thread-a",
    archived: false,
    done: false,
    presentationMode: "terminal" as const,
  };

  it("stashes a live keep-alive terminal thread by default", () => {
    expect(
      shouldPersistXtermInstance("thread-a", {
        keepAlivePaneIds: ["thread-a"],
        threads: [liveThread],
      }),
    ).toBe(true);
  });

  it("disposes when the thread left the keep-alive list", () => {
    expect(
      shouldPersistXtermInstance("thread-a", {
        keepAlivePaneIds: [],
        threads: [liveThread],
      }),
    ).toBe(false);
  });

  it("disposes archived, done, and GUI threads", () => {
    expect(
      shouldPersistXtermInstance("thread-a", {
        keepAlivePaneIds: ["thread-a"],
        threads: [{ ...liveThread, archived: true }],
      }),
    ).toBe(false);
    expect(
      shouldPersistXtermInstance("thread-a", {
        keepAlivePaneIds: ["thread-a"],
        threads: [{ ...liveThread, done: true }],
      }),
    ).toBe(false);
    expect(
      shouldPersistXtermInstance("thread-a", {
        keepAlivePaneIds: ["thread-a"],
        threads: [{ ...liveThread, presentationMode: "gui" }],
      }),
    ).toBe(false);
  });
});
