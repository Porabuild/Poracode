import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createSideChatOwnershipStorage } from "./sideChatOwnershipStorage";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { IPC_EVENT_CHANNELS, IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";

const harness = vi.hoisted(() => ({
  handlers: new Map<string, (event: { sender: object }, input?: unknown) => unknown>(),
  windows: new Map<object, unknown>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: object }, input?: unknown) => unknown) =>
      harness.handlers.set(channel, handler),
  },
  BrowserWindow: { fromWebContents: (sender: object) => harness.windows.get(sender) ?? null },
}));
import { getSideChatWindows, registerSideChatWindowIpc } from "./sideChatWindows";

function fakeWindow() {
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    show: () => {},
    focus: () => {},
    close: () => window.emit("closed"),
    webContents: { send: vi.fn<(channel: string, payload: unknown) => void>() },
  });
  const sender = {};
  harness.windows.set(sender, window);
  return { window, sender };
}
const bootstrap: SideChatBootstrap = {
  source: {
    id: "parent",
    projectId: "project",
    title: "Parent task",
    agentKind: "neutral-gui",
    config: { model: "default" },
    status: "working",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-10-09T10:00:00Z",
    updatedAt: "2026-10-09T10:00:00Z",
  },
  context: {
    summary: "User: Original task",
    sourceProvider: "neutral-gui",
    sourceSessionId: "parent-session",
    extractedAt: "2026-10-09T10:00:00Z",
    contentKind: "transcript",
  },
  prompt: "why?",
  title: "Side chat",
};

let main: ReturnType<typeof fakeWindow>;
let child: ReturnType<typeof fakeWindow>;
let createWindow: ReturnType<typeof vi.fn<(input: SideChatBootstrap) => BrowserWindow>>;
function invoke(channel: string, sender: object, input?: unknown) {
  return harness.handlers.get(channel)!({ sender }, input);
}
beforeEach(() => {
  main = fakeWindow();
  child = fakeWindow();
  createWindow = vi.fn<(input: SideChatBootstrap) => BrowserWindow>(
    () => child.window as unknown as BrowserWindow,
  );
  registerSideChatWindowIpc({
    getMainWindow: () => main.window as unknown as BrowserWindow,
    createWindow,
  });
});
afterEach(() => {
  child.window.emit("closed");
  invoke(IPC_WINDOW_CHANNELS.sideChatPanelClose, main.sender);
  harness.windows.clear();
});

describe("native side chat ownership", () => {
  it.each([undefined, "child"])(
    "delivers panel input to its current composer and preserves the old bootstrap (%s)",
    (existingThreadId) => {
      const previousShape = {
        ...bootstrap,
        id: "draft",
        prompt: "unsent",
        ...(existingThreadId ? { existingThreadId } : {}),
      };
      invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, previousShape);
      invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, {
        ...previousShape,
        prompt: "stale",
        appendText: "quote",
        autoStart: false,
      });
      expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).toMatchObject({
        prompt: "unsent",
      });
      expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).not.toHaveProperty(
        "appendText",
      );
      expect(main.window.webContents.send).toHaveBeenCalledWith(
        IPC_EVENT_CHANNELS.sideChatWindowsChanged,
        expect.objectContaining({
          composerInput: { composerId: existingThreadId ?? "side-chat:draft", text: "quote" },
        }),
      );
    },
  );
  it.each([undefined, "child"])(
    "forwards detached input without replacing its owner's draft (%s)",
    (existingThreadId) => {
      const previousShape = {
        ...bootstrap,
        id: "draft",
        prompt: "unsent",
        ...(existingThreadId ? { existingThreadId } : {}),
      };
      invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, previousShape);
      invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, {
        ...previousShape,
        prompt: "stale",
        appendText: "quote",
        autoStart: false,
      });
      expect(createWindow).toHaveBeenCalledTimes(1);
      expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, child.sender)).toMatchObject({
        prompt: "unsent",
      });
      expect(child.window.webContents.send).toHaveBeenCalledWith(
        IPC_EVENT_CHANNELS.sideChatWindowsChanged,
        expect.objectContaining({
          composerInput: { composerId: existingThreadId ?? "side-chat:draft", text: "quote" },
        }),
      );
    },
  );
  it("retains separate attached conversations per parent and disposes only the closed one", () => {
    const first = { ...bootstrap, id: "first" };
    const second = {
      ...bootstrap,
      id: "second",
      source: { ...bootstrap.source, id: "other-parent" },
    };
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, first);
    invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, main.sender, {
      id: "first",
      threadId: "first-child",
      prompt: "first question",
    });
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, second);
    invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, main.sender, {
      id: "second",
      threadId: "second-child",
      prompt: "second question",
    });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatThreadIds, main.sender)).toEqual([
      "first-child",
      "second-child",
    ]);
    // A hidden parent's checkpoint must update that parent's conversation.
    invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, main.sender, {
      id: "first",
      prompt: "retained draft",
    });
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, first);
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).toMatchObject({
      id: "first",
      existingThreadId: "first-child",
      prompt: "retained draft",
    });
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelClose, main.sender);
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatThreadIds, main.sender)).toEqual(["second-child"]);
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, second);
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelClose, main.sender);
  });

  it("preserves draft selection through native detach, reload info, and attach", () => {
    const selection = { agentKind: "neutral-gui", config: { model: "selected", effort: "high" } };
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, {
      ...bootstrap,
      id: "selected-draft",
    });
    invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, main.sender, {
      id: "selected-draft",
      prompt: "unsent",
      selection,
    });
    const panel = invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender);
    invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, panel);
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, child.sender)).toMatchObject({
      selection,
      prompt: "unsent",
      autoStart: false,
    });
    invoke(IPC_WINDOW_CHANNELS.sideChatAttach, child.sender, { prompt: "unsent", selection });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).toMatchObject({
      selection,
      prompt: "unsent",
    });
  });

  it("checkpoints an unsent draft without enabling submission on remount", () => {
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, {
      ...bootstrap,
      prompt: "",
      id: "draft",
    });
    invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, main.sender, {
      id: "draft",
      prompt: "typed question",
    });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).toMatchObject({
      prompt: "typed question",
      autoStart: false,
    });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatThreadIds, main.sender)).toEqual([]);
  });
  it("ignores a retired panel's draft checkpoint after a new side chat replaces it", () => {
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, { ...bootstrap, id: "old" });
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, {
      ...bootstrap,
      id: "new",
      prompt: "new question",
    });
    invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, main.sender, {
      id: "old",
      prompt: "stale draft",
    });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).toMatchObject({
      id: "new",
      prompt: "new question",
    });
  });
  it("focuses an already detached conversation without creating a second window", () => {
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, bootstrap);
    const entry = invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender);
    invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, entry);
    invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, entry);
    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(getSideChatWindows()).toHaveLength(1);
  });
  it("opens in the panel and transfers the same conversation to a window and back", () => {
    invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, bootstrap);
    expect(createWindow).not.toHaveBeenCalled();
    invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, main.sender, {
      threadId: "child",
      prompt: "question",
    });
    const panel = invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender);
    expect(panel).toMatchObject({ existingThreadId: "child" });
    invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, panel);
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).toBeNull();
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, child.sender)).toMatchObject({
      existingThreadId: "child",
    });
    invoke(IPC_WINDOW_CHANNELS.sideChatAttach, child.sender, { prompt: "question" });
    expect(getSideChatWindows()).toEqual([]);
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).toMatchObject({
      existingThreadId: "child",
      autoStart: false,
    });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatThreadIds, main.sender)).toEqual(["child"]);
    expect(
      main.window.webContents.send.mock.calls.some(
        (call) => (call[1] as { closedThreadId?: string }).closedThreadId === "child",
      ),
    ).toBe(false);
  });
  it("preserves an unsent draft on attach without requesting an auto-start", () => {
    invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, {
      ...bootstrap,
      prompt: "",
      autoStart: false,
    });
    invoke(IPC_WINDOW_CHANNELS.sideChatAttach, child.sender, { prompt: "typed but not sent" });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).toMatchObject({
      prompt: "typed but not sent",
      autoStart: false,
    });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatThreadIds, main.sender)).toEqual([]);
  });
  it("requires an app window and GUI source before creating anything", () => {
    expect(() => invoke(IPC_WINDOW_CHANNELS.sideChatOpen, {}, bootstrap)).toThrow("sender");
    expect(() =>
      invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, {
        ...bootstrap,
        source: { ...bootstrap.source, presentationMode: "terminal" },
      }),
    ).toThrow("GUI");
    expect(createWindow).not.toHaveBeenCalled();
  });
  it("returns the original context and bound child after a renderer reload", () => {
    invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, bootstrap);
    invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, child.sender, {
      threadId: "side-thread",
      prompt: "follow the context",
      segments: [{ kind: "text", content: "follow the context" }],
    });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatInfo, child.sender)).toMatchObject({
      existingThreadId: "side-thread",
      context: bootstrap.context,
      prompt: "follow the context",
    });
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatThreadIds, main.sender)).toEqual(["side-thread"]);
    expect(() =>
      invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, child.sender, {
        threadId: "another",
        prompt: "oops",
      }),
    ).toThrow("already owns");
    expect(createWindow).toHaveBeenCalledTimes(1);
  });
  it("never binds the parent and retires only the side session on close", () => {
    invoke(IPC_WINDOW_CHANNELS.sideChatOpen, main.sender, bootstrap);
    expect(() =>
      invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, child.sender, {
        threadId: "parent",
        prompt: "oops",
      }),
    ).toThrow("parent");
    invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, child.sender, {
      threadId: "child",
      prompt: "question",
    });
    expect(getSideChatWindows()).toHaveLength(1);
    child.window.emit("closed");
    expect(main.window.webContents.send).toHaveBeenLastCalledWith(
      IPC_EVENT_CHANNELS.sideChatWindowsChanged,
      {
        threadIds: [],
        hiddenThreadIds: [],
        panel: null,
        panels: [],
        detachedIds: [],
        disposing: [],
        closedThreadId: "child",
      },
    );
    expect(getSideChatWindows()).toEqual([]);
    expect(invoke(IPC_WINDOW_CHANNELS.sideChatThreadIds, main.sender)).toEqual([]);
  });
});

it("replaces detached ownership once and retains the current attachment on restart", async () => {
  await mkdir(join(process.cwd(), "tmp"), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), "tmp/side-chat-native-"));
  const statePath = join(dir, "ownership.json");
  const register = (persist: boolean) =>
    registerSideChatWindowIpc({
      getMainWindow: () => main.window as unknown as BrowserWindow,
      createWindow,
      ...(persist ? { statePath } : {}),
    });
  try {
    register(true);
    await invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, { ...bootstrap, id: "old" });
    const oldThread = { ...bootstrap.source, id: "old-child", parentThreadId: "parent" };
    await invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, main.sender, {
      id: "old",
      threadId: oldThread.id,
      thread: oldThread,
      prompt: "old",
    });
    await invoke(
      IPC_WINDOW_CHANNELS.sideChatOpen,
      main.sender,
      await invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender),
    );
    await invoke(IPC_WINDOW_CHANNELS.sideChatPanelOpen, main.sender, { ...bootstrap, id: "new" });
    const thread = { ...bootstrap.source, id: "new-child", parentThreadId: "parent" };
    await invoke(IPC_WINDOW_CHANNELS.sideChatBindThread, main.sender, {
      id: "new",
      threadId: thread.id,
      thread,
      prompt: "new",
    });
    expect(getSideChatWindows()).toHaveLength(0);
    const saved = await createSideChatOwnershipStorage(statePath).load();
    expect(saved.entries.map((entry) => entry.bootstrap.id)).toEqual(["new"]);
    expect(saved.disposing.map((entry) => entry.id)).toEqual(["old-child"]);
    register(true); // Simulate a new native owner, using only the durable ledger.
    expect(await invoke(IPC_WINDOW_CHANNELS.sideChatInfo, main.sender)).toMatchObject({
      id: "new",
      existingThreadId: "new-child",
      autoStart: false,
    });
    await invoke(IPC_WINDOW_CHANNELS.sideChatPanelClose, main.sender);
    expect(await invoke(IPC_WINDOW_CHANNELS.sideChatThreadIds, main.sender)).toEqual([]);
    expect(
      (await createSideChatOwnershipStorage(statePath).load()).disposing.map((entry) => entry.id),
    ).toEqual(["old-child", "new-child"]);
    await invoke(IPC_WINDOW_CHANNELS.sideChatReleased, main.sender, "old-child");
    await invoke(IPC_WINDOW_CHANNELS.sideChatReleased, main.sender, "new-child");
    expect((await createSideChatOwnershipStorage(statePath).load()).disposing).toEqual([]);
  } finally {
    register(false);
    await rm(dir, { recursive: true, force: true });
  }
});
