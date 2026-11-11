import { BrowserWindow, ipcMain } from "electron";
import { IPC_EVENT_CHANNELS, IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import {
  threadWindowBootstrapSchema,
  threadWindowCloseOptionsSchema,
  type ThreadWindowBootstrap,
  type ThreadWindowsChanged,
} from "@/shared/ipc/threadWindow";
import { showAndFocusWindow } from "./showAndFocusWindow";

// One live window per thread. The main window shows a placeholder for every
// thread listed here, so a thread never renders live in two windows at once.
const threadWindows = new Map<BrowserWindow, ThreadWindowBootstrap>();
// Windows closed by Archive, Done or Delete: their thread does not come back.
const dismissedWindows = new WeakSet<BrowserWindow>();
export function isThreadWindow(window: BrowserWindow): boolean {
  return threadWindows.has(window);
}
export function getThreadWindows(): BrowserWindow[] {
  return [...threadWindows.keys()].filter((window) => !window.isDestroyed());
}
/** The live window a thread has of its own, if any. */
export function findThreadWindow(threadId: string): BrowserWindow | undefined {
  return [...threadWindows.entries()].find(
    ([window, entry]) => !window.isDestroyed() && entry.threadId === threadId,
  )?.[0];
}

export function registerThreadWindowIpc(deps: {
  getMainWindow: () => BrowserWindow | null;
  createWindow: (bootstrap: ThreadWindowBootstrap) => BrowserWindow;
  /**
   * Shows a thread whose window closed in the main window. Queues until the
   * main renderer is ready and recreates the main window when there is none.
   */
  showThreadInMain: (threadId: string) => void;
  /** Windows closing because the app quits keep their thread where it is. */
  isQuitting: () => boolean;
}): void {
  const ids = () => [...threadWindows.values()].map((entry) => entry.threadId);
  const liveMain = () => {
    const main = deps.getMainWindow();
    return main && !main.isDestroyed() ? main : null;
  };
  const publish = () => {
    const event: ThreadWindowsChanged = { threadIds: ids() };
    liveMain()?.webContents.send(IPC_EVENT_CHANNELS.threadWindowsChanged, event);
  };
  const sender = (event: { sender: Electron.WebContents }) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (
      !owner ||
      owner.isDestroyed() ||
      (owner !== deps.getMainWindow() && !threadWindows.has(owner))
    )
      throw new Error("Thread window sender is not an app window");
    return owner;
  };
  const parseThreadId = (input: unknown) => {
    if (typeof input !== "string" || !input) throw new Error("Invalid thread id");
    return input;
  };

  ipcMain.handle(IPC_WINDOW_CHANNELS.threadWindowOpen, (event, input: unknown) => {
    if (sender(event) !== deps.getMainWindow())
      throw new Error("Only the main window opens thread windows");
    const bootstrap = threadWindowBootstrapSchema.parse(input);
    const existing = findThreadWindow(bootstrap.threadId);
    if (existing) {
      showAndFocusWindow(existing);
      return;
    }
    const window = deps.createWindow(bootstrap);
    threadWindows.set(window, bootstrap);
    // However the window closes (its own controls, Bring back, a shortcut),
    // the thread returns to the main window once it is really gone: its
    // renderer has flushed the draft on unload and main has been told first
    // that the thread no longer has a window.
    window.once("closed", () => {
      threadWindows.delete(window);
      publish();
      if (!dismissedWindows.has(window) && !deps.isQuitting())
        deps.showThreadInMain(bootstrap.threadId);
    });
    publish();
  });
  ipcMain.handle(
    IPC_WINDOW_CHANNELS.threadWindowClose,
    (event, input: unknown, rawOptions: unknown) => {
      const owner = sender(event);
      const threadId = parseThreadId(input);
      const options = threadWindowCloseOptionsSchema.parse(rawOptions);
      if (owner !== deps.getMainWindow() && threadWindows.get(owner)?.threadId !== threadId)
        throw new Error("A thread window can only close itself");
      const window = findThreadWindow(threadId);
      if (!window) return;
      if (options?.returnToMain === false) dismissedWindows.add(window);
      window.close();
    },
  );
  ipcMain.handle(IPC_WINDOW_CHANNELS.threadWindowInfo, (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    return (owner && threadWindows.get(owner)) ?? null;
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.threadWindowIds, (event) => {
    sender(event);
    return ids();
  });
}
