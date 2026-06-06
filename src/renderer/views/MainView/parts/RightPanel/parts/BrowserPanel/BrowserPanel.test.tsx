import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { BrowserPanel } from "./BrowserPanel";

const bridge = vi.hoisted(() => ({
  browserCreateTab: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserAttachWebContents: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserReload: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserHardReload: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
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

vi.mock("@/renderer/bridge", () => ({
  isMac: () => false,
  readBridge: () => ({
    browserCreateTab: bridge.browserCreateTab,
    browserAttachWebContents: bridge.browserAttachWebContents,
    browserReload: bridge.browserReload,
    browserHardReload: bridge.browserHardReload,
  }),
}));

describe("BrowserPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrowserPanelStore.setState({
      tabs: [],
      activeTabId: null,
      pickerActive: false,
      attentionTabId: null,
    });
    usePanelStore.setState({
      browserOverlayOpen: false,
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
    expect((webviews[0] as HTMLElement).style.display).toBe("flex");
    expect((webviews[1] as HTMLElement).style.display).toBe("none");
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
});
