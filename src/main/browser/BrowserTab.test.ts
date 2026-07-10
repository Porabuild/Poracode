import { beforeEach, describe, expect, it, vi } from "vitest";

const installSessionPermissions = vi.hoisted(() => vi.fn<() => void>());
const installNavigationGuards = vi.hoisted(() =>
  vi.fn<() => () => void>(() => vi.fn<() => void>()),
);
const dialogEnable = vi.hoisted(() => vi.fn<() => Promise<void>>().mockResolvedValue(undefined));

vi.mock("electron", () => ({
  webContents: { fromId: vi.fn<() => null>(() => null) },
}));

vi.mock("./cdp/cdpClient", () => ({
  CdpClient: class CdpClient {
    attach = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    detach = vi.fn<() => void>();
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
    });
    const webContents = createWebContents();

    tab.attach(webContents as never);

    expect(webContents.setUserAgent).toHaveBeenCalledWith(userAgent);
    expect(installSessionPermissions).toHaveBeenCalledWith(webContents.session);
    expect(installNavigationGuards).toHaveBeenCalled();
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

  it("navigates back/forward on Ctrl+[ and Ctrl+] keydown", async () => {
    const { BrowserTab } = await import("./BrowserTab");
    const tab = new BrowserTab({
      tabId: "tab-1",
      userAgent: "ua",
      onUpdate: vi.fn<() => void>(),
      onAttention: vi.fn<() => void>(),
      onPopup: vi.fn<() => void>(),
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
