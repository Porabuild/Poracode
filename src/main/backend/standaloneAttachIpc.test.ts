// Focused regression for the attach-mode device-only IPC: the allowlist serves
// real device implementations (keybindings file, window focus, update status,
// event-interest no-op), server-owned procedures loud-reject with no local
// backend side effects, unknown senders are refused, and the
// quick-composer/renderer-reload window channels resolve instead of crashing.
import { mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const senderToWindow = new Map<unknown, unknown>();
  return {
    handlers,
    senderToWindow,
    ipcMain: {
      handle: vi.fn<
        (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void
      >((channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, listener);
      }),
    },
    BrowserWindow: {
      fromWebContents: vi.fn<(sender: unknown) => unknown>(
        (sender: unknown) => senderToWindow.get(sender) ?? null,
      ),
    },
  };
});
vi.mock("electron", () => ({
  ipcMain: electron.ipcMain,
  BrowserWindow: electron.BrowserWindow,
}));

const updater = vi.hoisted(() => ({
  checkForUpdates: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  downloadUpdate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  quitAndInstall: vi.fn<() => void>(),
  setFeedURL: vi.fn<() => void>(),
  on: vi.fn<() => void>(),
  autoDownload: false,
  autoInstallOnAppQuit: true,
}));
vi.mock("electron-updater", () => ({ autoUpdater: updater }));

import { IPC_EVENT_CHANNELS, IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import { ATTACH_DEVICE_PROCEDURES } from "@/shared/ipc/attachProcedureAllowlist";
import { QuickComposerLifecycle } from "../window/quickComposerLifecycle";
import { registerStandaloneAttachIpc } from "./standaloneAttachIpc";

interface FakeWindow {
  isDestroyed(): boolean;
  hide: () => void;
  show: () => void;
  focus: () => void;
  webContents: { send(...args: unknown[]): void; id: number };
}

function fakeWindow(id: number): { window: FakeWindow; sender: { id: number } } {
  const sender = { id };
  const window = {
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible: () => true,
    show: vi.fn<() => void>(),
    focus: vi.fn<() => void>(),
    hide: vi.fn<() => void>(),
    webContents: { send: vi.fn<(...args: unknown[]) => void>(), id },
  } as unknown as FakeWindow;
  electron.senderToWindow.set(sender, window);
  return { window, sender };
}

describe("standalone attach device IPC", () => {
  let profileNamespace = "";
  let main: { window: FakeWindow; sender: { id: number } };
  let composer: { window: FakeWindow; sender: { id: number } };
  const markQuitting = vi.fn<() => void>();

  function attachLifecycle(getMainWindow: () => FakeWindow | null) {
    return new QuickComposerLifecycle({
      getMainWindow: () => getMainWindow() as never,
      getOverlay: () => composer.window as never,
      setOverlay: () => {},
      createOverlay: () => composer.window as never,
      ensureMainWindow: () => getMainWindow() as never,
      showOverlay: (window) => {
        (window as unknown as FakeWindow).show();
      },
      revealMainWindow: (window) => {
        const peer = window as unknown as FakeWindow;
        peer.show();
        peer.focus();
      },
      deliverSubmission: (window, submission) => {
        (window as unknown as FakeWindow).webContents.send(
          IPC_EVENT_CHANNELS.quickComposerSubmit,
          submission,
        );
      },
      requestOverlayDismiss: (window) => {
        (window as unknown as FakeWindow).webContents.send(
          IPC_EVENT_CHANNELS.quickComposerDismissRequested,
        );
      },
      hideOverlay: (window) => {
        (window as unknown as FakeWindow).hide();
      },
      pickFiles: async () => ["picked.ts"],
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    electron.handlers.clear();
    electron.senderToWindow.clear();
    profileNamespace = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-attach-ipc-")));
    main = fakeWindow(11);
    composer = fakeWindow(12);
    registerStandaloneAttachIpc({
      getMainWindow: () => main.window as never,
      getQuickComposerWindow: () => composer.window as never,
      profileNamespace,
      channel: "stable",
      isDev: false,
      reportError: () => {},
      markQuitting,
      quickComposer: attachLifecycle(() => main.window),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(profileNamespace, { recursive: true, force: true });
  });

  function invoke(name: string, args: unknown[], sender: unknown): Promise<unknown> {
    const handler = electron.handlers.get(IPC_WINDOW_CHANNELS.clientProcedureInvoke);
    expect(handler).toBeTypeOf("function");
    return (async () => handler?.({ sender }, { name, args }))() as Promise<unknown>;
  }

  it("owns exactly the device allowlist (no server-authoritative settings)", () => {
    expect([...ATTACH_DEVICE_PROCEDURES].sort()).toEqual(
      [
        "checkForUpdate",
        "focusWindow",
        "getKeybindings",
        "getUpdateStatus",
        "installUpdate",
        "setGlobalShortcutsSuspended",
        "setKeybindings",
        "setRendererEventInterests",
        "startUpdateDownload",
      ].sort(),
    );
    expect(ATTACH_DEVICE_PROCEDURES.has("getSharedSettings" as never)).toBe(false);
  });

  it("serves device locals with real implementations", async () => {
    await expect(
      invoke(
        "setRendererEventInterests",
        [{ terminalThreadIds: [], runtimeThreadIds: [] }],
        main.sender,
      ),
    ).resolves.toBeUndefined();
    const bindings = (await invoke("getKeybindings", [], main.sender)) as { path: string };
    expect(bindings.path).toBe(join(profileNamespace, "keybindings.json"));
    await expect(invoke("focusWindow", [], main.sender)).resolves.toBeUndefined();
    await expect(invoke("getUpdateStatus", [], main.sender)).resolves.toBeNull();
  });

  it("round-trips keybindings through the device file", async () => {
    const first = (await invoke("getKeybindings", [], main.sender)) as {
      path: string;
      file: { version: 1; keybindings: unknown[] };
    };
    const next = { version: 1 as const, keybindings: first.file.keybindings };
    const written = (await invoke("setKeybindings", [next], main.sender)) as { path: string };
    expect(written.path).toBe(join(profileNamespace, "keybindings.json"));
  });

  it("loud-rejects server-owned procedures with no local side effects", async () => {
    await expect(invoke("getSharedSettings", [], main.sender)).rejects.toThrow(
      "not available in standalone attach",
    );
    await expect(
      invoke("dbGetThreadRuntimeItems", [{ threadId: "no-such-thread" }], main.sender),
    ).rejects.toThrow("not available in standalone attach");
    // Rejections created nothing: no SQLite, lease, settings, or keybindings.
    expect(readdirSync(profileNamespace)).toEqual([]);
  });

  it("refuses unknown senders and malformed requests", async () => {
    await expect(invoke("getUpdateStatus", [], { id: 999 })).rejects.toThrow("sender");
    const handler = electron.handlers.get(IPC_WINDOW_CHANNELS.clientProcedureInvoke);
    await expect(
      (async () => handler?.({ sender: main.sender }, { name: "getUpdateStatus" }))(),
    ).rejects.toThrow("Invalid client procedure request");
  });

  // F1: the attach device serves the real updater actions (not just status)
  // through its real auto-update controller, so the About/Sidebar/Recovery
  // check/install callers resolve instead of loud-rejecting into the crash
  // screen. No installer ever runs here: delegation is observed through the
  // mocked electron-updater and the quit marker.
  it("delegates real updater actions to the attach auto-update controller", async () => {
    await expect(invoke("checkForUpdate", [], main.sender)).resolves.toBeUndefined();
    expect(updater.checkForUpdates).toHaveBeenCalled();
    await expect(invoke("startUpdateDownload", [], main.sender)).resolves.toBeUndefined();
    expect(updater.downloadUpdate).toHaveBeenCalled();
    await expect(invoke("installUpdate", [], main.sender)).resolves.toBeUndefined();
    expect(updater.quitAndInstall).toHaveBeenCalled();
    expect(markQuitting).toHaveBeenCalled();
  });

  // F2: a quick-composer submission survives a missing/loading main window
  // (pending queue + flush on main ready), never lost or duplicated.
  describe("quick-composer pending delivery while main is unavailable", () => {
    function registerWithMutableMain(getMain: () => FakeWindow | null) {
      registerStandaloneAttachIpc({
        getMainWindow: () => getMain() as never,
        getQuickComposerWindow: () => composer.window as never,
        profileNamespace,
        channel: "stable",
        isDev: false,
        reportError: () => {},
        markQuitting,
        quickComposer: attachLifecycle(getMain),
      });
    }

    function submit(sender: unknown): Promise<unknown> {
      const handler = electron.handlers.get(IPC_WINDOW_CHANNELS.quickComposerSubmit);
      expect(handler).toBeTypeOf("function");
      return (async () =>
        handler?.(
          { sender },
          {
            projectId: "project-1",
            input: { agentKind: "codex", config: { model: "gpt-5" }, prompt: "hi" },
          },
        ))() as Promise<unknown>;
    }

    function ready(sender: unknown): Promise<unknown> {
      const handler = electron.handlers.get(IPC_WINDOW_CHANNELS.quickComposerMainReady);
      expect(handler).toBeTypeOf("function");
      return (async () => handler?.({ sender }))() as Promise<unknown>;
    }

    it("retains a submission while main is closed and delivers once on ready", async () => {
      let liveMain: FakeWindow | null = null;
      registerWithMutableMain(() => liveMain);
      await submit(composer.sender);
      // Main is closed: nothing may be delivered yet, and nothing is lost.
      expect(main.window.webContents.send).not.toHaveBeenCalled();
      expect(composer.window.webContents.send).not.toHaveBeenCalled();
      // Main recreates and its renderer becomes ready: exactly one delivery.
      const recreated = fakeWindow(21);
      liveMain = recreated.window;
      await ready(recreated.sender);
      expect(recreated.window.webContents.send).toHaveBeenCalledTimes(1);
      expect(recreated.window.webContents.send).toHaveBeenCalledWith(
        IPC_EVENT_CHANNELS.quickComposerSubmit,
        expect.objectContaining({ projectId: "project-1" }),
      );
    });

    it("does not deliver to a loading main window before its ready ping", async () => {
      let liveMain: FakeWindow | null = null;
      registerWithMutableMain(() => liveMain);
      const loading = fakeWindow(22);
      liveMain = loading.window;
      await submit(composer.sender);
      // Renderer still loading (no ready ping): must stay queued, not sent.
      expect(loading.window.webContents.send).not.toHaveBeenCalled();
      await ready(loading.sender);
      expect(loading.window.webContents.send).toHaveBeenCalledTimes(1);
      // A second ready ping must not duplicate the submission.
      await ready(loading.sender);
      expect(loading.window.webContents.send).toHaveBeenCalledTimes(1);
    });
  });

  it("registers the quick-composer and reload window channels", async () => {
    const ready = electron.handlers.get(IPC_WINDOW_CHANNELS.quickComposerMainReady);
    await ready?.({ sender: main.sender });
    const submit = electron.handlers.get(IPC_WINDOW_CHANNELS.quickComposerSubmit);
    await submit?.(
      { sender: composer.sender },
      {
        projectId: "project-1",
        input: { agentKind: "codex", config: { model: "gpt-5" }, prompt: "hi" },
      },
    );
    expect(main.window.webContents.send).toHaveBeenCalledWith(
      IPC_EVENT_CHANNELS.quickComposerSubmit,
      expect.objectContaining({ projectId: "project-1" }),
    );
    const dismiss = electron.handlers.get(IPC_WINDOW_CHANNELS.quickComposerDismiss);
    await dismiss?.({ sender: composer.sender });
    expect(composer.window.hide).toHaveBeenCalledOnce();
    const pick = electron.handlers.get(IPC_WINDOW_CHANNELS.quickComposerPickFiles);
    await expect(pick?.({ sender: composer.sender })).resolves.toEqual(["picked.ts"]);
    expect(electron.handlers.get(IPC_WINDOW_CHANNELS.rendererReload)).toBeTypeOf("function");
  });
});
