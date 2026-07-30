import { act, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useBrowserFindStore } from "@/renderer/state/browserFindStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { BrowserPanel } from "./BrowserPanel";

const bridge = vi.hoisted(() => ({
  browserCreateTab: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserAttachWebContents: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserSetDeviceEmulation: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserReload: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserHardReload: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserFindInPage: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserStopFindInPage: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserPrint: vi.fn<() => Promise<{ ok: true }>>().mockResolvedValue({ ok: true }),
  browserExtractToWindow: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserInjectToMain: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("./hooks/useElementPicker", () => ({
  useElementPicker: () => ({
    pickerActive: false,
    startPicker: vi.fn<() => Promise<{ ok: boolean; cancelled: boolean }>>(),
    threadTargets: [],
    pendingPickerAttachment: null,
    chooseTargetForPendingPick: vi.fn<(threadId: string) => void>(),
    cancelPendingPick: vi.fn<() => void>(),
  }),
}));

vi.mock("./parts/BrowserToolbar", () => ({
  BrowserToolbar: () => <div data-testid="browser-toolbar" />,
}));

vi.mock("./parts/BrowserTabStrip", () => ({
  BrowserTabStrip: () => <div data-testid="browser-tab-strip" />,
}));

vi.mock("./parts/BrowserDownloadsPage", () => ({
  BrowserDownloadsPage: () => <div data-testid="browser-downloads-page" />,
}));

vi.mock("./parts/BrowserPasswordsPage", () => ({
  BrowserPasswordsPage: () => <div data-testid="browser-passwords-page" />,
}));

vi.mock("./parts/BrowserImportModal", () => ({
  BrowserImportModal: () => null,
}));

vi.mock("@/renderer/bridge", () => ({
  isMac: () => false,
  isWindows: () => false,
  isRemoteSession: () => false,
  readBridge: () => ({
    browserCreateTab: bridge.browserCreateTab,
    browserAttachWebContents: bridge.browserAttachWebContents,
    browserSetDeviceEmulation: bridge.browserSetDeviceEmulation,
    browserReload: bridge.browserReload,
    browserHardReload: bridge.browserHardReload,
    browserFindInPage: bridge.browserFindInPage,
    browserStopFindInPage: bridge.browserStopFindInPage,
    browserPrint: bridge.browserPrint,
    browserExtractToWindow: bridge.browserExtractToWindow,
    browserInjectToMain: bridge.browserInjectToMain,
  }),
}));

describe("BrowserPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrowserPanelStore.setState({
      tabs: [],
      groups: [],
      activeTabId: null,
      extracted: false,
      bookmarks: [],
      bookmarkBarVisible: false,
      pickerActive: false,
      attentionTabId: null,
      automationActive: false,
    });
    useBrowserFindStore.setState({
      tabId: null,
      query: "",
      matchCase: false,
      matches: 0,
      currentIndex: -1,
      openToken: 0,
    });
    usePanelStore.setState({
      browserPanelOpen: false,
      browserOverlayOpen: false,
      browserOverlayMaximized: false,
    });
  });

  it("renders the empty state when there are no tabs", () => {
    const { getByText } = render(<BrowserPanel visible />);
    expect(getByText("No browser tab open")).toBeTruthy();
  });

  it("renders a <webview> per tab and hides inactive ones", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
        {
          tabId: "tab-2",
          url: "https://example.org/",
          title: "Other",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "tab-1",
    });
    const { container } = render(<BrowserPanel visible />);
    const webviews = container.querySelectorAll("webview");
    expect(webviews).toHaveLength(2);
    expect(webviews[0]?.getAttribute("partition")).toBe("persist:lightcode-browser");
    expect(webviews[0]?.getAttribute("allowpopups")).toBe("true");
    expect((webviews[0]!.parentElement!.parentElement as HTMLElement).style.display).toBe("block");
    expect((webviews[1]!.parentElement!.parentElement as HTMLElement).style.display).toBe("none");
  });

  it("does not mount webviews for internal browser pages", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
        {
          tabId: "downloads",
          url: "poracode://downloads",
          title: "Downloads",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          internalPage: "downloads",
        },
      ],
      activeTabId: "downloads",
    });

    const { container } = render(<BrowserPanel visible />);
    const webviews = container.querySelectorAll("webview");
    expect(webviews).toHaveLength(1);
    expect(webviews[0]?.getAttribute("data-tab-id")).toBe("tab-1");
  });

  it("updates tab group membership from browser state", () => {
    const tab = {
      tabId: "tab-1",
      url: "https://example.com/",
      title: "Example",
      loading: false,
      canGoBack: false,
      canGoForward: false,
    };

    act(() => {
      useBrowserPanelStore.getState().setState({
        tabs: [tab],
        activeTabId: "tab-1",
      });
    });
    expect(useBrowserPanelStore.getState().tabs[0]?.groupId).toBeUndefined();

    act(() => {
      useBrowserPanelStore.getState().setState({
        tabs: [{ ...tab, groupId: "group-1" }],
        activeTabId: "tab-1",
        groups: [{ id: "group-1", title: "Group", color: "purple", collapsed: false }],
      });
    });

    expect(useBrowserPanelStore.getState().tabs[0]?.groupId).toBe("group-1");
  });

  it("clears optional tab state when a full tab update omits it", () => {
    const tab = {
      tabId: "tab-1",
      url: "https://example.com/",
      title: "Example",
      loading: false,
      canGoBack: false,
      canGoForward: false,
    };
    useBrowserPanelStore.setState({
      tabs: [
        {
          ...tab,
          internalPage: "downloads",
          deviceEmulation: {
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
            scale: 0.75,
            mobile: false,
            touch: false,
          },
        },
      ],
      activeTabId: "tab-1",
    });

    act(() => useBrowserPanelStore.getState().upsertTab(tab));

    expect(useBrowserPanelStore.getState().tabs[0]).toEqual(tab);
  });

  it("keeps the same webview mounted when browser panel goes fullscreen", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "tab-1",
    });
    usePanelStore.setState({
      browserPanelOpen: true,
      browserOverlayOpen: false,
      browserOverlayMaximized: false,
    });
    const { container } = render(<BrowserPanel visible />);
    const webview = container.querySelector("webview");

    act(() => {
      usePanelStore.setState({
        browserOverlayOpen: true,
        browserOverlayMaximized: true,
      });
    });

    expect(container.querySelector("webview")).toBe(webview);
  });

  it("focuses the browser when its overlay opens", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "tab-1",
    });
    const { container } = render(<BrowserPanel visible />);
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();

    act(() => usePanelStore.setState({ browserOverlayOpen: true }));

    expect(document.activeElement).toBe(container.querySelector("[data-poracode-browser]"));
    outside.remove();
  });

  it("focuses the standalone browser window on mount", () => {
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();

    const { container } = render(<BrowserPanel visible surface="window" />);

    expect(document.activeElement).toBe(container.querySelector("[data-poracode-browser]"));
    outside.remove();
  });

  it("keeps the same webview mounted when device emulation changes", () => {
    const tab = {
      tabId: "tab-1",
      url: "https://example.com/",
      title: "Example",
      loading: false,
      canGoBack: false,
      canGoForward: false,
    };
    useBrowserPanelStore.setState({ tabs: [tab], activeTabId: "tab-1" });
    const { container } = render(<BrowserPanel visible />);
    const webview = container.querySelector("webview");

    act(() => {
      useBrowserPanelStore.getState().setState({
        tabs: [
          {
            ...tab,
            deviceEmulation: {
              width: 833,
              height: 970,
              deviceScaleFactor: 1,
              scale: 1,
              mobile: false,
              touch: false,
              preset: "Responsive",
            },
          },
        ],
        activeTabId: "tab-1",
      });
    });

    expect(container.querySelector("webview")).toBe(webview);
    expect((webview!.parentElement as HTMLElement).style.width).toBe("833px");
    expect((webview!.parentElement as HTMLElement).style.height).toBe("970px");
  });

  it("resizes an emulated viewport without remounting its webview", async () => {
    const emulation = {
      width: 833,
      height: 970,
      deviceScaleFactor: 1,
      scale: 0.5,
      mobile: false,
      touch: false,
      preset: "Responsive",
    };
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          deviceEmulation: emulation,
        },
      ],
      activeTabId: "tab-1",
    });
    const { container, getByRole } = render(<BrowserPanel visible />);
    const webview = container.querySelector("webview");
    const viewport = webview?.parentElement as HTMLElement;

    fireEvent.pointerDown(getByRole("button", { name: "Resize viewport" }), {
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 125 });

    await waitFor(() => {
      expect(viewport.style.width).toBe("466.5px");
      expect(viewport.style.height).toBe("510px");
    });
    expect(container.querySelector("webview")).toBe(webview);

    fireEvent.pointerUp(window);
    expect(bridge.browserSetDeviceEmulation).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      emulation: { ...emulation, width: 933, height: 1020 },
    });
  });

  it("stops an emulated viewport drag when the webview unmounts", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          deviceEmulation: {
            width: 833,
            height: 970,
            deviceScaleFactor: 1,
            scale: 1,
            mobile: false,
            touch: false,
          },
        },
      ],
      activeTabId: "tab-1",
    });
    const { getByRole, unmount } = render(<BrowserPanel visible />);

    fireEvent.pointerDown(getByRole("button", { name: "Resize viewport" }), {
      clientX: 100,
      clientY: 100,
    });
    unmount();
    bridge.browserSetDeviceEmulation.mockClear();
    fireEvent.pointerMove(window, { clientX: 150, clientY: 150 });
    fireEvent.pointerUp(window);

    expect(bridge.browserSetDeviceEmulation).not.toHaveBeenCalled();
  });

  it("attaches the right-panel webview contents to the browser tab", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "tab-1",
    });
    const { container } = render(<BrowserPanel visible />);
    const webview = container.querySelector("webview") as HTMLElement & {
      getWebContentsId(): number;
    };
    webview.getWebContentsId = vi.fn<() => number>().mockReturnValue(42);

    fireEvent(webview, new Event("dom-ready"));

    expect(bridge.browserAttachWebContents).toHaveBeenCalledWith({
      tabId: "tab-1",
      webContentsId: 42,
    });
  });

  it("reattaches a mounted webview when it becomes visible again", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "tab-1",
    });
    const { container, rerender } = render(<BrowserPanel visible={false} />);
    const webview = container.querySelector("webview") as HTMLElement & {
      getWebContentsId(): number;
    };
    webview.getWebContentsId = vi.fn<() => number>().mockReturnValue(42);
    bridge.browserAttachWebContents.mockClear();

    rerender(<BrowserPanel visible />);

    expect(bridge.browserAttachWebContents).toHaveBeenCalledWith({
      tabId: "tab-1",
      webContentsId: 42,
    });
  });

  it("routes browser panel reload shortcuts to the active tab", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "tab-1",
    });
    const { container } = render(<BrowserPanel visible />);
    const panel = container.firstElementChild as HTMLElement;

    fireEvent.keyDown(panel, { key: "r", ctrlKey: true });
    expect(bridge.browserReload).toHaveBeenCalledWith({ tabId: "tab-1" });

    fireEvent.keyDown(panel, { key: "R", ctrlKey: true, shiftKey: true });
    expect(bridge.browserHardReload).toHaveBeenCalledWith({ tabId: "tab-1" });

    fireEvent.keyDown(panel, { key: "F5" });
    expect(bridge.browserReload).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(panel, { key: "F5", shiftKey: true });
    expect(bridge.browserHardReload).toHaveBeenCalledTimes(2);
  });

  it("opens Find in page from the panel shortcut", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "tab-1",
    });
    const { container, getByRole } = render(<BrowserPanel visible />);

    fireEvent.keyDown(container.querySelector("[data-poracode-browser]")!, {
      key: "f",
      ctrlKey: true,
    });

    expect(getByRole("textbox", { name: "Find in page" })).toBeTruthy();
  });

  it("does not treat Ctrl+Alt chords as Find or Print shortcuts", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com/",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "tab-1",
    });
    const { container, queryByRole } = render(<BrowserPanel visible />);
    const panel = container.querySelector("[data-poracode-browser]")!;

    fireEvent.keyDown(panel, { key: "f", ctrlKey: true, altKey: true });
    fireEvent.keyDown(panel, { key: "p", ctrlKey: true, altKey: true });

    expect(queryByRole("textbox", { name: "Find in page" })).toBeNull();
    expect(bridge.browserPrint).not.toHaveBeenCalled();
  });

  it("moves the overlay browser to a separate window", () => {
    usePanelStore.setState({
      browserOverlayOpen: true,
      browserOverlayMaximized: true,
    });
    const { getByTitle } = render(<BrowserPanel visible />);

    fireEvent.click(getByTitle("Move browser to window"));

    expect(bridge.browserExtractToWindow).toHaveBeenCalledOnce();
  });

  it("moves the separate browser window back into the main window", () => {
    const { getByTitle } = render(<BrowserPanel visible surface="window" />);

    fireEvent.click(getByTitle("Move browser back to main window"));

    expect(bridge.browserInjectToMain).toHaveBeenCalledOnce();
  });
});
