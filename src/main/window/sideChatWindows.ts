import { BrowserWindow, ipcMain } from "electron";
import { IPC_EVENT_CHANNELS, IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import {
  sideChatBootstrapSchema,
  sideChatThreadBindingSchema,
  type SideChatBootstrap,
  type SideChatThreadBinding,
} from "@/shared/ipc/sideChat";

type Entry = { bootstrap: SideChatBootstrap; threadId?: string; attaching?: boolean };
const sideWindows = new Map<BrowserWindow, Entry>();
let panel: Entry | undefined;
export function isSideChatWindow(window: BrowserWindow): boolean {
  return sideWindows.has(window);
}
export function getSideChatWindows(): BrowserWindow[] {
  return [...sideWindows.keys()].filter((window) => !window.isDestroyed());
}

export function registerSideChatWindowIpc(deps: {
  getMainWindow: () => BrowserWindow | null;
  createWindow: (bootstrap: SideChatBootstrap) => BrowserWindow;
}): void {
  const info = (entry: Entry | undefined) =>
    entry
      ? { ...entry.bootstrap, ...(entry.threadId ? { existingThreadId: entry.threadId } : {}) }
      : null;
  const ids = () => [
    ...new Set(
      [...sideWindows.values(), ...(panel ? [panel] : [])].flatMap((entry) =>
        entry.threadId ? [entry.threadId] : [],
      ),
    ),
  ];
  const publish = (closedThreadId?: string) => {
    const main = deps.getMainWindow();
    if (main && !main.isDestroyed())
      main.webContents.send(IPC_EVENT_CHANNELS.sideChatWindowsChanged, {
        threadIds: ids(),
        panel: info(panel),
        ...(closedThreadId ? { closedThreadId } : {}),
      });
  };
  const sender = (event: { sender: Electron.WebContents }) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (
      !owner ||
      owner.isDestroyed() ||
      (owner !== deps.getMainWindow() && !sideWindows.has(owner))
    )
      throw new Error("Side chat sender is not an app window");
    return owner;
  };
  const bootstrap = (input: unknown) => {
    const parsed = sideChatBootstrapSchema.parse(input);
    if (parsed.source.presentationMode !== "gui")
      throw new Error("Side chats require GUI presentation");
    if (parsed.existingThreadId === parsed.source.id)
      throw new Error("Side chat cannot own its parent thread");
    return { ...parsed, id: parsed.id ?? crypto.randomUUID() };
  };
  const bind = (entry: Entry, binding: SideChatThreadBinding) => {
    if (binding.id && binding.id !== entry.bootstrap.id) return false;
    if (binding.threadId) {
      if (entry.threadId && entry.threadId !== binding.threadId)
        throw new Error("Side chat already owns a thread");
      if (binding.threadId === entry.bootstrap.source.id)
        throw new Error("Side chat cannot own its parent thread");
      entry.threadId = binding.threadId;
    }
    entry.bootstrap = {
      ...entry.bootstrap,
      prompt: binding.prompt,
      ...(!entry.threadId ? { autoStart: false } : {}),
      ...(binding.segments ? { segments: binding.segments } : {}),
    };
    return true;
  };
  ipcMain.handle(IPC_WINDOW_CHANNELS.sideChatPanelOpen, (event, input: unknown) => {
    sender(event);
    const previous = panel?.threadId;
    panel = { bootstrap: bootstrap(input) };
    publish(previous);
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.sideChatOpen, (event, input: unknown) => {
    sender(event);
    const next = bootstrap(input);
    const existing = [...sideWindows.entries()].find(
      ([window, entry]) => !window.isDestroyed() && entry.bootstrap.id === next.id,
    )?.[0];
    if (existing) {
      existing.show();
      existing.focus();
      return;
    }
    const moving = panel?.bootstrap.id === next.id;
    const window = deps.createWindow(next);
    sideWindows.set(window, {
      bootstrap: next,
      ...(next.existingThreadId ? { threadId: next.existingThreadId } : {}),
    });
    if (moving) panel = undefined;
    window.once("closed", () => {
      const entry = sideWindows.get(window);
      sideWindows.delete(window);
      publish(entry?.attaching ? undefined : entry?.threadId);
    });
    publish();
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.sideChatAttach, (event, input: unknown) => {
    const owner = sender(event);
    const entry = sideWindows.get(owner);
    if (!entry) throw new Error("Side chat window is closed");
    bind(entry, sideChatThreadBindingSchema.parse(input));
    const previous = panel?.threadId;
    entry.attaching = true;
    panel = {
      bootstrap: { ...entry.bootstrap, autoStart: false },
      ...(entry.threadId ? { threadId: entry.threadId } : {}),
    };
    publish(previous === entry.threadId ? undefined : previous);
    owner.close();
    const main = deps.getMainWindow();
    if (main && !main.isDestroyed()) {
      main.show();
      main.focus();
    }
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.sideChatPanelClose, (event) => {
    if (sender(event) !== deps.getMainWindow())
      throw new Error("Only the main window owns the panel");
    const previous = panel?.threadId;
    panel = undefined;
    publish(previous);
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.sideChatInfo, (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    return info(
      owner === deps.getMainWindow() ? panel : owner ? sideWindows.get(owner) : undefined,
    );
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.sideChatThreadIds, (event) => {
    sender(event);
    return ids();
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.sideChatBindThread, (event, input: unknown) => {
    const owner = sender(event);
    const entry = owner === deps.getMainWindow() ? panel : sideWindows.get(owner);
    if (!entry) throw new Error("Side chat surface is closed");
    if (bind(entry, sideChatThreadBindingSchema.parse(input))) publish();
  });
}
