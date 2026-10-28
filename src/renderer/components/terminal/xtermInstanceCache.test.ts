import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalWriteQueue } from "./terminalWriteQueue";
import {
  createXtermScreen,
  resetXtermInstanceCacheForTests,
  shouldPersistXtermInstance,
  stashXtermInstance,
  takeXtermInstance,
  type CachedXtermInstance,
} from "./xtermInstanceCache";

function fakeInstance(): CachedXtermInstance {
  const terminal = { dispose: vi.fn<() => void>(), write: vi.fn<() => void>() };
  return {
    terminal: terminal as unknown as CachedXtermInstance["terminal"],
    writeQueue: new TerminalWriteQueue(terminal),
    fit: {} as CachedXtermInstance["fit"],
    search: {} as CachedXtermInstance["search"],
    programStatus: {} as CachedXtermInstance["programStatus"],
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
    const dispose = vi.spyOn(first.writeQueue, "dispose");
    stashXtermInstance("thread-a", second);
    expect(first.terminal.dispose).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(takeXtermInstance("thread-a")).toBe(second);
  });

  it("disposes cached instances on teardown", () => {
    const instance = fakeInstance();
    stashXtermInstance("thread-a", instance);
    const dispose = vi.spyOn(instance.writeQueue, "dispose");
    resetXtermInstanceCacheForTests();
    expect(instance.terminal.dispose).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
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
