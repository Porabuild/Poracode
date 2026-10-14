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
      emulation: { ...emulation, width: 970, height: 500 },
    });

    fireEvent.click(getByRole("button", { name: "Close device toolbar" }));
    expect(bridge.browserSetDeviceEmulation).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      emulation: null,
    });
  });

  it("keeps the latest dimensions while an earlier host update arrives", () => {
    const { getByRole } = render(<BrowserDeviceToolbar />);
    const width = getByRole("spinbutton", { name: "Viewport width" });
    fireEvent.change(width, { target: { value: "500" } });
    fireEvent.blur(width);
    fireEvent.click(getByRole("button", { name: "Rotate viewport" }));
    act(() => {
      useBrowserPanelStore.setState((state) => ({
        tabs: state.tabs.map((tab) => ({ ...tab, deviceEmulation: { ...emulation, width: 500 } })),
      }));
    });
    fireEvent.click(getByRole("button", { name: "Rotate viewport" }));
    expect(bridge.browserSetDeviceEmulation).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      emulation: { ...emulation, width: 500, height: 970 },
    });
  });

  it("does not treat an older matching shape as the latest acknowledgment", async () => {
    const latest = Promise.withResolvers<void>();
    bridge.browserSetDeviceEmulation
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(latest.promise);
    const { getByRole } = render(<BrowserDeviceToolbar />);
    const width = getByRole("spinbutton", { name: "Viewport width" });
    fireEvent.change(width, { target: { value: "500" } });
    fireEvent.blur(width);
    fireEvent.click(getByRole("button", { name: "Rotate viewport" }));
    fireEvent.click(getByRole("button", { name: "Rotate viewport" }));
    for (const next of [
      { ...emulation, width: 500 },
      { ...emulation, width: 970, height: 500 },
    ]) {
      act(() =>
        useBrowserPanelStore.setState((state) => ({
          tabs: state.tabs.map((tab) => ({ ...tab, deviceEmulation: next })),
        })),
      );
    }
    fireEvent.click(getByRole("button", { name: "Rotate viewport" }));
    expect(bridge.browserSetDeviceEmulation).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      emulation: { ...emulation, width: 970, height: 500 },
    });
    await act(async () => latest.resolve());
  });

  it("keeps the edited dimensions when switching to Responsive before the host echo", async () => {
    useBrowserPanelStore.setState((state) => ({
      tabs: state.tabs.map((tab) => ({
        ...tab,
        deviceEmulation: { ...emulation, width: 1024, height: 768, preset: "Laptop" },
      })),
    }));
    const { getByRole, findByRole } = render(<BrowserDeviceToolbar />);
    const width = getByRole("spinbutton", { name: "Viewport width" });
    fireEvent.change(width, { target: { value: "500" } });
    fireEvent.blur(width);
    fireEvent.click(getByRole("button", { name: /Device preset$/ }));
    fireEvent.click(await findByRole("option", { name: "Responsive" }));
    expect(bridge.browserSetDeviceEmulation).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      emulation: { ...emulation, width: 500, height: 768 },
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
