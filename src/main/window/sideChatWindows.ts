import type { Thread } from "@/shared/contracts";
import { createSideChatOwnershipStorage } from "./sideChatOwnershipStorage";
import { BrowserWindow, ipcMain } from "electron";
import { IPC_EVENT_CHANNELS, IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import {
  sideChatBootstrapSchema,
  sideChatThreadBindingSchema,
  type SideChatBootstrap,
  type SideChatThreadBinding,
} from "@/shared/ipc/sideChat";

type Entry = {
  bootstrap: SideChatBootstrap;
  threadId?: string;
  thread?: Thread;
  attaching?: boolean;
};
const sideWindows = new Map<BrowserWindow, Entry>();
export function isSideChatWindow(window: BrowserWindow): boolean {
  return sideWindows.has(window);
}
export function getSideChatWindows(): BrowserWindow[] {
  return [...sideWindows.keys()].filter((window) => !window.isDestroyed());
}

export function registerSideChatWindowIpc(deps: {
  getMainWindow: () => BrowserWindow | null;
  createWindow: (bootstrap: SideChatBootstrap) => BrowserWindow;
  statePath?: string;
}): void {
  let panel: Entry | undefined;
  const panels = new Map<string, Entry>();
  const disposing = new Map<string, Thread>();
  const storage = deps.statePath ? createSideChatOwnershipStorage(deps.statePath) : undefined;
  const ready = storage?.load().then((state) => {
    for (const entry of state.entries) {
      const restored: Entry = {
        bootstrap: { ...entry.bootstrap, autoStart: false },
        ...(entry.thread
          ? { thread: entry.thread, threadId: entry.thread.id }
          : entry.bootstrap.existingThreadId
            ? { threadId: entry.bootstrap.existingThreadId }
            : {}),
      };
      panels.set(restored.bootstrap.source.id, restored);
      panel = restored;
    }
    for (const thread of state.disposing) disposing.set(thread.id, thread);
  });
  // A failed load must refuse mutations instead of overwriting an unknown format.
  void ready?.catch(() => {});
  const checkpoint = () =>
    storage?.save({
      version: 1,
      entries: [...panels.values(), ...sideWindows.values()].map((entry) => ({
        bootstrap: { ...info(entry)!, context: null },
        ...(entry.thread ? { thread: entry.thread } : {}),
      })),
      disposing: [...disposing.values()],
    });
  const handle = (
    channel: string,
    handler: (event: Electron.IpcMainInvokeEvent, input?: unknown) => unknown,
    mutates = false,
  ) => {
    ipcMain.handle(channel, (event, input: unknown) => {
      if (!storage) return handler(event, input);
      return ready!
        .then(() => handler(event, input))
        .then(async (result) => {
          if (mutates) await checkpoint();
          return result;
        });
    });
  };
  const retire = (entry: Entry | undefined) => {
    if (entry?.thread) disposing.set(entry.thread.id, entry.thread);
  };
  const info = (entry: Entry | undefined) =>
    entry
      ? { ...entry.bootstrap, ...(entry.threadId ? { existingThreadId: entry.threadId } : {}) }
      : null;
  const ids = (includeDisposing = false) => [
    ...new Set([
      ...(includeDisposing ? disposing.keys() : []),
      ...[...sideWindows.values(), ...panels.values()].flatMap((entry) =>
        entry.threadId ? [entry.threadId] : [],
      ),
    ]),
  ];
  const publish = (closedThreadId?: string) => {
    const main = deps.getMainWindow();
    if (main && !main.isDestroyed())
      main.webContents.send(IPC_EVENT_CHANNELS.sideChatWindowsChanged, {
        threadIds: ids(),
        hiddenThreadIds: ids(true),
        panel: info(panel),
        panels: [...panels.values(), ...sideWindows.values()].map((entry) => info(entry)!),
        detachedIds: [...sideWindows.values()].flatMap((entry) =>
          entry.bootstrap.id ? [entry.bootstrap.id] : [],
        ),
        disposing: [...disposing.values()],
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
      if (binding.thread) {
        if (binding.thread.id !== binding.threadId)
          throw new Error("Side chat binding does not match its thread");
        entry.thread = binding.thread;
      }
    }
    entry.bootstrap = {
      ...entry.bootstrap,
      prompt: binding.prompt,
      ...(!entry.threadId ? { autoStart: false } : {}),
      ...(binding.segments ? { segments: binding.segments } : {}),
      ...(binding.selection ? { selection: binding.selection } : {}),
    };
    return true;
  };
  handle(
    IPC_WINDOW_CHANNELS.sideChatPanelOpen,
    (event, input: unknown) => {
      sender(event);
      const next = bootstrap(input);
      const previous = panels.get(next.source.id);
      if (previous?.bootstrap.id === next.id) {
        panel = previous;
        publish();
        return;
      }
      for (const [window, detached] of sideWindows) {
        if (detached.bootstrap.source.id === next.source.id) window.close();
      }
      retire(previous);
      panel = {
        bootstrap: next,
        ...(next.existingThreadId ? { threadId: next.existingThreadId } : {}),
      };
      panels.set(next.source.id, panel);
      publish(previous?.threadId);
    },
    true,
  );
  handle(
    IPC_WINDOW_CHANNELS.sideChatOpen,
    (event, input: unknown) => {
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
      const moving = panels.get(next.source.id)?.bootstrap.id === next.id;
      const window = deps.createWindow(next);
      sideWindows.set(window, {
        bootstrap: next,
        ...(next.existingThreadId ? { threadId: next.existingThreadId } : {}),
        ...(moving && panels.get(next.source.id)?.thread
          ? { thread: panels.get(next.source.id)!.thread! }
          : {}),
      });
      if (moving) {
        panels.delete(next.source.id);
        if (panel?.bootstrap.id === next.id) panel = undefined;
      }
      window.once("closed", () => {
        const entry = sideWindows.get(window);
        sideWindows.delete(window);
        if (!entry?.attaching) retire(entry);
        publish(entry?.attaching ? undefined : entry?.threadId);
        void checkpoint()?.catch((error: unknown) =>
          console.error("Failed to checkpoint side chat ownership", error),
        );
      });
      publish();
    },
    true,
  );
  handle(
    IPC_WINDOW_CHANNELS.sideChatAttach,
    (event, input: unknown) => {
      const owner = sender(event);
      const entry = sideWindows.get(owner);
      if (!entry) throw new Error("Side chat window is closed");
      bind(entry, sideChatThreadBindingSchema.parse(input));
      const previousEntry = panels.get(entry.bootstrap.source.id);
      const previous = previousEntry?.threadId;
      if (previous !== entry.threadId) retire(previousEntry);
      entry.attaching = true;
      panel = {
        bootstrap: { ...entry.bootstrap, autoStart: false },
        ...(entry.threadId ? { threadId: entry.threadId } : {}),
        ...(entry.thread ? { thread: entry.thread } : {}),
      };
      panels.set(entry.bootstrap.source.id, panel);
      publish(previous === entry.threadId ? undefined : previous);
      owner.close();
      const main = deps.getMainWindow();
      if (main && !main.isDestroyed()) {
        main.show();
        main.focus();
      }
    },
    true,
  );
  handle(
    IPC_WINDOW_CHANNELS.sideChatPanelClose,
    (event, input) => {
      if (sender(event) !== deps.getMainWindow())
        throw new Error("Only the main window owns the panel");
      if (input !== undefined && (typeof input !== "string" || !input))
        throw new Error("Invalid parent thread id");
      const entry = input === undefined ? panel : panels.get(input as string);
      if (entry) {
        retire(entry);
        panels.delete(entry.bootstrap.source.id);
        if (panel === entry) panel = undefined;
      }
      if (typeof input === "string") {
        for (const [window, detached] of sideWindows)
          if (detached.bootstrap.source.id === input) window.close();
      }
      publish(entry?.threadId);
    },
    true,
  );
  handle(
    IPC_WINDOW_CHANNELS.sideChatReleased,
    (event, input) => {
      if (sender(event) !== deps.getMainWindow() || typeof input !== "string")
        throw new Error("Invalid side chat release");
      if (disposing.delete(input)) publish();
    },
    true,
  );
  handle(IPC_WINDOW_CHANNELS.sideChatInfo, (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (owner === deps.getMainWindow()) publish();
    return info(
      owner === deps.getMainWindow() ? panel : owner ? sideWindows.get(owner) : undefined,
    );
  });
  handle(IPC_WINDOW_CHANNELS.sideChatThreadIds, (event) => {
    sender(event);
    return ids();
  });
  handle(
    IPC_WINDOW_CHANNELS.sideChatBindThread,
    (event, input: unknown) => {
      const owner = sender(event);
      const binding = sideChatThreadBindingSchema.parse(input);
      const entry =
        owner === deps.getMainWindow()
          ? binding.id
            ? [...panels.values()].find((candidate) => candidate.bootstrap.id === binding.id)
            : panel
          : sideWindows.get(owner);
      if (!entry) {
        if (binding.threadId) throw new Error("Side chat surface is closed");
        return; // A retired draft may finish checkpointing after disposal.
      }
      if (bind(entry, binding)) publish();
    },
    true,
  );
}
