import { beforeEach, describe, expect, it, vi } from "vitest";

const installSessionPermissions = vi.hoisted(() => vi.fn<() => void>());
const installNavigationGuards = vi.hoisted(() =>
  vi.fn<() => () => void>(() => vi.fn<() => void>()),
);
const dialogEnable = vi.hoisted(() => vi.fn<() => Promise<void>>().mockResolvedValue(undefined));
const cdpSend = vi.hoisted(() =>
  vi.fn<(method: string, params?: Record<string, unknown>) => Promise<unknown>>(() =>
    Promise.resolve(),
  ),
);

vi.mock("electron", () => ({
  webContents: { fromId: vi.fn<() => null>(() => null) },
}));

vi.mock("./cdp/cdpClient", () => ({
  CdpClient: class CdpClient {
    attach = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    detach = vi.fn<() => void>();
    send = cdpSend;
  },
}));

vi.mock("./cdp/dialogController", () => ({
  DialogController: class DialogController {
    enable = dialogEnable;
    dispose = vi.fn<() => void>();
  },
}));

vi.mock("./cdp/networkCapture", () => ({
  NetworkCapture: class NetworkCapture {
    dispose = vi.fn<() => void>();
  },
}));

vi.mock("./permissions", () => ({
  installSessionPermissions,
  installNavigationGuards,
  isNavigationUrlAllowed: () => true,
}));

function createWebContents(initialUrl = "https://example.com/") {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  let currentUrl = initialUrl;
  return {
    session: {},
    setUserAgent: vi.fn<(userAgent: string) => void>(),
    setZoomFactor: vi.fn<(zoomFactor: number) => void>(),
    enableDeviceEmulation: vi.fn<(parameters: Electron.Parameters) => void>(),
    disableDeviceEmulation: vi.fn<() => void>(),
    findInPage: vi.fn<(text: string, options: Electron.FindInPageOptions) => number>(() => 17),
    stopFindInPage:
      vi.fn<(action: "clearSelection" | "keepSelection" | "activateSelection") => void>(),
    print: vi.fn<
      (
        options: Electron.WebContentsPrintOptions,
        callback: (success: boolean, failureReason: string) => void,
      ) => void
    >((_options, callback) => callback(true, "")),
    getURL: vi.fn<() => string>(() => currentUrl),
    getTitle: vi.fn<() => string>(() => "Example"),
    isDestroyed: vi.fn<() => boolean>(() => false),
    isLoadingMainFrame: vi.fn<() => boolean>(() => false),
    on: vi.fn<(event: string, handler: (...args: unknown[]) => void) => void>((event, handler) => {
      handlers.set(event, handler);
    }),
    removeListener: vi.fn<(event: string) => void>((event) => {
      handlers.delete(event);
    }),
    navigationHistory: {
      canGoBack: vi.fn<() => boolean>(() => true),
      canGoForward: vi.fn<() => boolean>(() => true),
      goBack: vi.fn<() => void>(),
      goForward: vi.fn<() => void>(),
      clear: vi.fn<() => void>(),
    },
    reload: vi.fn<() => void>(),
    reloadIgnoringCache: vi.fn<() => void>(),
    loadURL: vi.fn<(url: string) => Promise<void>>((url) => {
      currentUrl = url;
      return Promise.resolve();
    }),
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.(...args);
    },
  };
}

type SimulatedInput = {
  type: string;
  key: string;
  code?: string;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
};
type BeforeInputHandler = (event: { preventDefault: () => void }, input: SimulatedInput) => void;

function captureBeforeInput(webContents: ReturnType<typeof createWebContents>): BeforeInputHandler {
  const calls = webContents.on.mock.calls as unknown as Array<[string, BeforeInputHandler]>;
  const handler = calls.find(([event]) => event === "before-input-event")?.[1];
  if (!handler) throw new Error("before-input-event handler not registered");
  return handler;
}

describe("BrowserTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies the configured browser user agent to attached webContents", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const userAgent =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent,
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested: vi.fn<() => void>(),
      onFindResult: vi.fn<() => void>(),
    });
    const webContents = createWebContents();

    tab.attach(webContents as never);

    expect(webContents.setUserAgent).toHaveBeenCalledWith(userAgent);
    expect(installSessionPermissions).toHaveBeenCalledWith(webContents.session);
    expect(installNavigationGuards).toHaveBeenCalled();
  });

  it("requests find from the guest shortcut and forwards find results", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const onFindRequested = vi.fn<(tabId: string) => void>();
    const onFindResult = vi.fn<
      (
        tabId: string,
        result: {
          requestId: number;
          activeMatchOrdinal: number;
          matches: number;
          finalUpdate: boolean;
        },
      ) => void
    >();
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested,
      onFindResult,
    });
    const webContents = createWebContents();
    tab.attach(webContents as never);

    const handler = captureBeforeInput(webContents);
    const shortcut = { preventDefault: vi.fn<() => void>() };
    handler(shortcut, { type: "keyDown", control: true, key: "f" });

    expect(shortcut.preventDefault).toHaveBeenCalledOnce();
    expect(onFindRequested).toHaveBeenCalledWith("tab-1");

    expect(tab.findInPage("needle", { forward: true, findNext: true, matchCase: true })).toBe(17);
    expect(webContents.findInPage).toHaveBeenCalledWith("needle", {
      forward: true,
      findNext: true,
      matchCase: true,
    });

    webContents.emit(
      "found-in-page",
      {},
      {
        requestId: 16,
        activeMatchOrdinal: 1,
        matches: 1,
        finalUpdate: true,
      },
    );
    expect(onFindResult).not.toHaveBeenCalled();

    webContents.emit(
      "found-in-page",
      {},
      {
        requestId: 17,
        activeMatchOrdinal: 2,
        matches: 4,
        finalUpdate: true,
      },
    );
    expect(onFindResult).toHaveBeenCalledWith("tab-1", {
      requestId: 17,
      activeMatchOrdinal: 2,
      matches: 4,
      finalUpdate: true,
    });

    tab.stopFindInPage("clearSelection");
    expect(webContents.stopFindInPage).toHaveBeenCalledWith("clearSelection");
  });

  it("prints natively from the method and guest shortcut", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested: vi.fn<() => void>(),
      onFindResult: vi.fn<() => void>(),
    });
    const webContents = createWebContents();
    tab.attach(webContents as never);

    await expect(tab.print()).resolves.toEqual({ ok: true });
    expect(webContents.print).toHaveBeenCalledWith({ silent: false }, expect.any(Function));

    const handler = captureBeforeInput(webContents);
    const shortcut = { preventDefault: vi.fn<() => void>() };
    handler(shortcut, { type: "keyDown", meta: true, key: "p" });

    expect(shortcut.preventDefault).toHaveBeenCalledOnce();
    expect(webContents.print).toHaveBeenCalledTimes(2);

    webContents.print.mockImplementationOnce((_options, callback) => {
      callback(false, "Print job canceled");
    });
    await expect(tab.print()).resolves.toEqual({ ok: false, error: "Print job canceled" });
  });

  it("applies zoom and device emulation and exposes them in the snapshot", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const onUpdate = vi.fn<() => void>();
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate,
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested: vi.fn<() => void>(),
      onFindResult: vi.fn<() => void>(),
    });
    const webContents = createWebContents();
    tab.attach(webContents as never);
    onUpdate.mockClear();

    tab.setZoomFactor(1.25);
    expect(webContents.setZoomFactor).toHaveBeenLastCalledWith(1.25);
    expect(tab.snapshot().zoomFactor).toBe(1.25);

    const emulation = {
      width: 430,
      height: 932,
      deviceScaleFactor: 3,
      scale: 0.75,
      mobile: true,
      touch: true,
      preset: "iPhone 15 Pro Max",
    };
    tab.setDeviceEmulation(emulation);

    expect(webContents.enableDeviceEmulation).toHaveBeenCalledWith({
      screenPosition: "mobile",
      screenSize: { width: 430, height: 932 },
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: 3,
      viewSize: { width: 430, height: 932 },
      scale: 0.75,
    });
    expect(cdpSend).toHaveBeenCalledWith("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    expect(tab.snapshot()).toMatchObject({ zoomFactor: 1.25, deviceEmulation: emulation });

    webContents.enableDeviceEmulation.mockClear();
    cdpSend.mockClear();
    tab.setDeviceEmulation(emulation);
    expect(webContents.enableDeviceEmulation).not.toHaveBeenCalled();
    expect(cdpSend).not.toHaveBeenCalled();

    tab.setDeviceEmulation(null);
    expect(webContents.disableDeviceEmulation).toHaveBeenCalledOnce();
    expect(cdpSend).toHaveBeenLastCalledWith("Emulation.setTouchEmulationEnabled", {
      enabled: false,
    });
    expect(tab.snapshot().deviceEmulation).toBeUndefined();
    expect(onUpdate).toHaveBeenCalled();
  });

  it("reapplies zoom and device emulation when webContents reattaches", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested: vi.fn<() => void>(),
      onFindResult: vi.fn<() => void>(),
    });
    const emulation = {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      scale: 1,
      mobile: false,
      touch: false,
    };
    tab.setZoomFactor(1.5);
    tab.setDeviceEmulation(emulation);

    const first = createWebContents();
    tab.attach(first as never);
    expect(first.setZoomFactor).toHaveBeenCalledWith(1.5);
    expect(first.enableDeviceEmulation).toHaveBeenCalledOnce();

    first.emit("destroyed");
    const second = createWebContents();
    tab.attach(second as never);

    expect(second.setZoomFactor).toHaveBeenCalledWith(1.5);
    expect(second.enableDeviceEmulation).toHaveBeenCalledWith({
      screenPosition: "desktop",
      screenSize: { width: 1024, height: 768 },
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: 1,
      viewSize: { width: 1024, height: 768 },
      scale: 1,
    });
  });

  it("preserves reload and hard-reload guest shortcuts", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested: vi.fn<() => void>(),
      onFindResult: vi.fn<() => void>(),
    });
    const webContents = createWebContents();
    tab.attach(webContents as never);

    const handler = captureBeforeInput(webContents);
    const reload = { preventDefault: vi.fn<() => void>() };
    handler(reload, { type: "keyDown", control: true, key: "r" });
    expect(reload.preventDefault).toHaveBeenCalledOnce();
    expect(webContents.reload).toHaveBeenCalledOnce();

    const hardReload = { preventDefault: vi.fn<() => void>() };
    handler(hardReload, { type: "keyDown", meta: true, shift: true, key: "r" });
    expect(hardReload.preventDefault).toHaveBeenCalledOnce();
    expect(webContents.reloadIgnoringCache).toHaveBeenCalledOnce();
  });

  it("does not clear newly navigated history after initial page cleanup", async () => {
    vi.useFakeTimers();
    try {
      const { BrowserTab } = await import("./BrowserTab");
      const tab = new BrowserTab({
        tabId: "tab-1",
        initialUrl: "data:text/html,first",
        userAgent: "ua",
        onUpdate: vi.fn<() => void>(),
        onAttention: vi.fn<() => void>(),
        onPopup: vi.fn<() => void>(),
        onFindRequested: vi.fn<() => void>(),
        onFindResult: vi.fn<() => void>(),
      });
      const webContents = createWebContents("data:text/html,first");
      tab.attach(webContents as never);

      expect(webContents.navigationHistory.clear).toHaveBeenCalledTimes(1);

      await tab.loadURL("data:text/html,second");
      webContents.emit("did-navigate", {}, "data:text/html,second");
      webContents.emit("did-stop-loading");
      await webContents.loadURL("data:text/html,first");
      webContents.emit("did-navigate", {}, "data:text/html,first");
      await vi.advanceTimersByTimeAsync(500);

      expect(webContents.navigationHistory.clear).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears synthetic history when an unmounted tab receives its first navigation", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested: vi.fn<() => void>(),
      onFindResult: vi.fn<() => void>(),
    });

    await tab.loadURL("data:text/html,first");
    const webContents = createWebContents("data:text/html,first");
    tab.attach(webContents as never);

    expect(webContents.navigationHistory.clear).toHaveBeenCalledOnce();
  });

  it("navigates back/forward on Ctrl+[ and Ctrl+] keydown", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested: vi.fn<() => void>(),
      onFindResult: vi.fn<() => void>(),
    });
    const webContents = createWebContents();
    tab.attach(webContents as never);

    const handler = captureBeforeInput(webContents);
    const back = { preventDefault: vi.fn<() => void>() };
    handler(back, { type: "keyDown", control: true, key: "[" });
    expect(back.preventDefault).toHaveBeenCalled();
    expect(webContents.navigationHistory.goBack).toHaveBeenCalledTimes(1);
    expect(webContents.navigationHistory.goForward).not.toHaveBeenCalled();

    const forward = { preventDefault: vi.fn<() => void>() };
    handler(forward, { type: "keyDown", meta: true, key: "]" });
    expect(forward.preventDefault).toHaveBeenCalled();
    expect(webContents.navigationHistory.goForward).toHaveBeenCalledTimes(1);
  });

  it("does not navigate when the bracket key is pressed without a modifier", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested: vi.fn<() => void>(),
      onFindResult: vi.fn<() => void>(),
    });
    const webContents = createWebContents();
    tab.attach(webContents as never);

    const handler = captureBeforeInput(webContents);
    const event = { preventDefault: vi.fn<() => void>() };
    handler(event, { type: "keyDown", key: "[" });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(webContents.navigationHistory.goBack).not.toHaveBeenCalled();
  });

  it("does not navigate on shifted bracket chords", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
      onFindRequested: vi.fn<() => void>(),
      onFindResult: vi.fn<() => void>(),
    });
    const webContents = createWebContents();
    tab.attach(webContents as never);

    const handler = captureBeforeInput(webContents);
    const event = { preventDefault: vi.fn<() => void>() };
    handler(event, { type: "keyDown", control: true, shift: true, key: "[" });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(webContents.navigationHistory.goBack).not.toHaveBeenCalled();
  });
});
