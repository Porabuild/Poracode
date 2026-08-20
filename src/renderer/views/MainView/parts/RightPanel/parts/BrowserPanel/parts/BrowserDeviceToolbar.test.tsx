import { act, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { BrowserDeviceToolbar } from "./BrowserDeviceToolbar";

const bridge = vi.hoisted(() => ({
  browserSetDeviceEmulation: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
}));

const emulation = {
  width: 833,
  height: 970,
  deviceScaleFactor: 1,
  scale: 1,
  mobile: false,
  touch: false,
  preset: "Responsive",
};

describe("BrowserDeviceToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it("updates dimensions, rotates the viewport, and closes emulation", () => {
    const { getByRole } = render(<BrowserDeviceToolbar />);
    const width = getByRole("spinbutton", { name: "Viewport width" });

    fireEvent.change(width, { target: { value: "500" } });
    fireEvent.blur(width);
    expect(bridge.browserSetDeviceEmulation).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      emulation: { ...emulation, width: 500, preset: "Responsive" },
    });

    fireEvent.click(getByRole("button", { name: "Rotate viewport" }));
    expect(bridge.browserSetDeviceEmulation).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      emulation: { ...emulation, width: 970, height: 833 },
    });

    fireEvent.click(getByRole("button", { name: "Close device toolbar" }));
    expect(bridge.browserSetDeviceEmulation).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      emulation: null,
    });
  });

  it("does not render for an internal browser page", () => {
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "poracode://downloads",
          title: "Downloads",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          internalPage: "downloads",
          deviceEmulation: emulation,
        },
      ],
    });

    const { queryByText } = render(<BrowserDeviceToolbar />);
    expect(queryByText("Dimensions:")).toBeNull();
  });

  it("discards an uncommitted dimension when the active tab changes", () => {
    const { getByRole } = render(<BrowserDeviceToolbar />);
    fireEvent.change(getByRole("spinbutton", { name: "Viewport width" }), {
      target: { value: "500" },
    });

    act(() => {
      useBrowserPanelStore.setState({
        tabs: [
          ...useBrowserPanelStore.getState().tabs,
          {
            tabId: "tab-2",
            url: "https://example.org/",
            title: "Example 2",
            loading: false,
            canGoBack: false,
            canGoForward: false,
            deviceEmulation: emulation,
          },
        ],
        activeTabId: "tab-2",
      });
    });

    expect(getByRole("spinbutton", { name: "Viewport width" })).toHaveValue(833);
  });
});
