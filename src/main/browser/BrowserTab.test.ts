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

function createWebContents() {
  return {
    session: {},
    setUserAgent: vi.fn<(userAgent: string) => void>(),
    getURL: vi.fn<() => string>(() => "https://example.com/"),
    getTitle: vi.fn<() => string>(() => "Example"),
    isDestroyed: vi.fn<() => boolean>(() => false),
    isLoadingMainFrame: vi.fn<() => boolean>(() => false),
    on: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    navigationHistory: {
      canGoBack: vi.fn<() => boolean>(() => false),
      canGoForward: vi.fn<() => boolean>(() => false),
      clear: vi.fn<() => void>(),
    },
  };
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
});
