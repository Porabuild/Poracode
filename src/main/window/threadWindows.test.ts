import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { IPC_EVENT_CHANNELS, IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import type { ThreadWindowBootstrap } from "@/shared/ipc/threadWindow";

const harness = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (event: { sender: object }, input?: unknown, options?: unknown) => unknown
  >(),
  windows: new Map<object, unknown>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: { sender: object }, input?: unknown, options?: unknown) => unknown,
    ) => harness.handlers.set(channel, handler),
  },
  BrowserWindow: { fromWebContents: (sender: object) => harness.windows.get(sender) ?? null },
}));
import { getThreadWindows, isThreadWindow, registerThreadWindowIpc } from "./threadWindows";

function fakeWindow() {
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible: () => true,
    restore: () => {},
    show: () => {},
    focus: vi.fn<() => void>(),
    close: () => window.emit("closed"),
    webContents: { send: vi.fn<(channel: string, payload: unknown) => void>() },
  });
  const sender = {};
  harness.windows.set(sender, window);
  return { window, sender };
}

let main: ReturnType<typeof fakeWindow>;
let created: ReturnType<typeof fakeWindow>[];
let createWindow: ReturnType<typeof vi.fn<(input: ThreadWindowBootstrap) => BrowserWindow>>;
function invoke(channel: string, sender: object, input?: unknown, options?: unknown) {
  return harness.handlers.get(channel)!({ sender }, input, options);
}
function open(threadId: string, sender: object = main.sender) {
  return invoke(IPC_WINDOW_CHANNELS.threadWindowOpen, sender, { threadId, title: threadId });
}
beforeEach(() => {
  main = fakeWindow();
  created = [];
  createWindow = vi.fn<(input: ThreadWindowBootstrap) => BrowserWindow>(() => {
    const next = fakeWindow();
    created.push(next);
    return next.window as unknown as BrowserWindow;
  });
  registerThreadWindowIpc({
    getMainWindow: () => main.window as unknown as BrowserWindow,
    createWindow,
  });
});
afterEach(() => {
  for (const entry of created) entry.window.emit("closed");
  harness.windows.clear();
});

describe("thread windows", () => {
  it("opens one window per thread and focuses it when opened again", () => {
    open("thread-a");
    open("thread-a");
    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(created[0]!.window.focus).toHaveBeenCalledTimes(1);
    open("thread-b");
    expect(createWindow).toHaveBeenCalledTimes(2);
    expect(invoke(IPC_WINDOW_CHANNELS.threadWindowIds, main.sender)).toEqual([
      "thread-a",
      "thread-b",
    ]);
    expect(isThreadWindow(created[1]!.window as unknown as BrowserWindow)).toBe(true);
    expect(getThreadWindows()).toHaveLength(2);
  });

  it("tells the main window which threads moved out and back", () => {
    open("thread-a");
    expect(main.window.webContents.send).toHaveBeenLastCalledWith(
      IPC_EVENT_CHANNELS.threadWindowsChanged,
      { threadIds: ["thread-a"] },
    );
    created[0]!.window.emit("closed");
    expect(main.window.webContents.send).toHaveBeenLastCalledWith(
      IPC_EVENT_CHANNELS.threadWindowsChanged,
      { threadIds: [] },
    );
    expect(isThreadWindow(created[0]!.window as unknown as BrowserWindow)).toBe(false);
  });

  it("gives each window its own bootstrap and nothing to other windows", () => {
    invoke(IPC_WINDOW_CHANNELS.threadWindowOpen, main.sender, {
      threadId: "remote-thread",
      title: "Remote",
      remoteServerId: "server-1",
    });
    expect(invoke(IPC_WINDOW_CHANNELS.threadWindowInfo, created[0]!.sender)).toEqual({
      threadId: "remote-thread",
      title: "Remote",
      remoteServerId: "server-1",
    });
    expect(invoke(IPC_WINDOW_CHANNELS.threadWindowInfo, main.sender)).toBeNull();
  });

  it("lets a thread window close only itself and shows the thread in the main window", () => {
    open("thread-a");
    open("thread-b");
    const [first, second] = created;
    expect(() => invoke(IPC_WINDOW_CHANNELS.threadWindowClose, first!.sender, "thread-b")).toThrow(
      "only close itself",
    );
    invoke(IPC_WINDOW_CHANNELS.threadWindowClose, first!.sender, "thread-a");
    expect(invoke(IPC_WINDOW_CHANNELS.threadWindowIds, main.sender)).toEqual(["thread-b"]);
    expect(main.window.webContents.send).toHaveBeenCalledWith(
      IPC_EVENT_CHANNELS.threadOpenRequested,
      { threadId: "thread-a" },
    );
    expect(main.window.focus).toHaveBeenCalledTimes(1);
    invoke(IPC_WINDOW_CHANNELS.threadWindowClose, main.sender, "thread-b");
    expect(invoke(IPC_WINDOW_CHANNELS.threadWindowIds, main.sender)).toEqual([]);
    expect(isThreadWindow(second!.window as unknown as BrowserWindow)).toBe(false);
  });

  it("hands a returned thread to the main window's ready queue when one is provided", () => {
    const showThreadInMain = vi.fn<(threadId: string) => void>();
    registerThreadWindowIpc({
      getMainWindow: () => main.window as unknown as BrowserWindow,
      createWindow,
      showThreadInMain,
    });
    open("thread-a");
    invoke(IPC_WINDOW_CHANNELS.threadWindowClose, created[0]!.sender, "thread-a");
    expect(showThreadInMain).toHaveBeenCalledExactlyOnceWith("thread-a");
    expect(main.window.webContents.send).not.toHaveBeenCalledWith(
      IPC_EVENT_CHANNELS.threadOpenRequested,
      expect.anything(),
    );
  });

  it("closes a deleted thread's window without bringing the main window forward", () => {
    open("thread-a");
    invoke(IPC_WINDOW_CHANNELS.threadWindowClose, main.sender, "thread-a", {
      returnToMain: false,
    });
    expect(invoke(IPC_WINDOW_CHANNELS.threadWindowIds, main.sender)).toEqual([]);
    expect(main.window.webContents.send).not.toHaveBeenCalledWith(
      IPC_EVENT_CHANNELS.threadOpenRequested,
      expect.anything(),
    );
    expect(main.window.focus).not.toHaveBeenCalled();
    expect(() =>
      invoke(IPC_WINDOW_CHANNELS.threadWindowClose, main.sender, "thread-a", { returnToMain: 1 }),
    ).toThrow("expected boolean");
  });

  it("only lets the main window open threads and rejects unknown senders", () => {
    open("thread-a");
    expect(() => open("thread-b", created[0]!.sender)).toThrow("Only the main window");
    expect(() => open("thread-b", {})).toThrow("not an app window");
    expect(() => invoke(IPC_WINDOW_CHANNELS.threadWindowIds, {})).toThrow("not an app window");
    expect(() => invoke(IPC_WINDOW_CHANNELS.threadWindowOpen, main.sender, { title: "x" })).toThrow(
      "threadId",
    );
    expect(createWindow).toHaveBeenCalledTimes(1);
  });
});
