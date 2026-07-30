import { act, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserFindStore } from "@/renderer/state/browserFindStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { BrowserFindBar } from "./BrowserFindBar";

const bridge = vi.hoisted(() => ({
  browserFindInPage: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  browserStopFindInPage: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

describe("BrowserFindBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrowserFindStore.setState({
      tabId: null,
      query: "",
      matchCase: false,
      matches: 0,
      currentIndex: -1,
      openToken: 0,
    });
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
  });

  it("starts a new search for edits and continues it for match navigation", () => {
    act(() => useBrowserFindStore.getState().open("tab-1"));
    const { getByRole } = render(<BrowserFindBar />);
    const input = getByRole("textbox", { name: "Find in page" });

    fireEvent.change(input, { target: { value: "needle" } });
    expect(bridge.browserFindInPage).toHaveBeenNthCalledWith(1, {
      tabId: "tab-1",
      text: "needle",
      forward: true,
      findNext: true,
      matchCase: false,
    });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(bridge.browserFindInPage).toHaveBeenNthCalledWith(2, {
      tabId: "tab-1",
      text: "needle",
      forward: true,
      findNext: false,
      matchCase: false,
    });

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(bridge.browserFindInPage).toHaveBeenNthCalledWith(3, {
      tabId: "tab-1",
      text: "needle",
      forward: false,
      findNext: false,
      matchCase: false,
    });

    fireEvent.click(getByRole("button", { name: "Match case" }));
    expect(bridge.browserFindInPage).toHaveBeenNthCalledWith(4, {
      tabId: "tab-1",
      text: "needle",
      forward: true,
      findNext: true,
      matchCase: true,
    });
  });

  it("clears the native selection when the query is cleared or the bar closes", () => {
    act(() => useBrowserFindStore.getState().open("tab-1"));
    const { getByRole, queryByRole } = render(<BrowserFindBar />);
    const input = getByRole("textbox", { name: "Find in page" });

    fireEvent.change(input, { target: { value: "needle" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(bridge.browserStopFindInPage).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      action: "clearSelection",
    });

    bridge.browserStopFindInPage.mockClear();
    fireEvent.click(getByRole("button", { name: "Close find" }));
    expect(bridge.browserStopFindInPage).toHaveBeenCalledWith({
      tabId: "tab-1",
      action: "clearSelection",
    });
    expect(useBrowserFindStore.getState().tabId).toBeNull();
    expect(queryByRole("textbox", { name: "Find in page" })).toBeNull();
  });

  it("focuses and selects the query again when find is reopened", () => {
    useBrowserFindStore.setState({ tabId: "tab-1", query: "needle", openToken: 1 });
    const { getByRole } = render(<BrowserFindBar />);
    const input = getByRole("textbox", { name: "Find in page" }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    input.setSelectionRange(0, 0);
    act(() => useBrowserFindStore.getState().open("tab-1"));

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(6);
  });

  it("hides a find session that does not belong to the active page", () => {
    useBrowserFindStore.setState({ tabId: "tab-1", query: "needle", openToken: 1 });
    useBrowserPanelStore.setState({ activeTabId: null });

    const { queryByRole } = render(<BrowserFindBar />);
    expect(queryByRole("textbox", { name: "Find in page" })).toBeNull();
  });

  it("stops and closes the find session when the active page changes", () => {
    useBrowserFindStore.setState({ tabId: "tab-1", query: "needle", openToken: 1 });
    render(<BrowserFindBar />);

    act(() => useBrowserPanelStore.setState({ activeTabId: null }));

    expect(bridge.browserStopFindInPage).toHaveBeenCalledWith({
      tabId: "tab-1",
      action: "clearSelection",
    });
    expect(useBrowserFindStore.getState().tabId).toBeNull();
  });

  it("does not restore stale find results after switching away and back", () => {
    useBrowserFindStore.setState({
      tabId: "tab-1",
      query: "needle",
      matches: 2,
      currentIndex: 0,
      openToken: 1,
    });
    const { queryByRole } = render(<BrowserFindBar />);

    act(() => useBrowserPanelStore.setState({ activeTabId: null }));
    act(() => useBrowserPanelStore.setState({ activeTabId: "tab-1" }));

    expect(queryByRole("textbox", { name: "Find in page" })).toBeNull();
    expect(useBrowserFindStore.getState()).toMatchObject({
      tabId: null,
      query: "",
      matches: 0,
      currentIndex: -1,
    });
  });
});
