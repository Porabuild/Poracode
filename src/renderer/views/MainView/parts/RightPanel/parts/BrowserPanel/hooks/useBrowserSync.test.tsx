import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { BrowserEvent, BrowserState } from "@/shared/ipc";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { useBrowserSync } from "./useBrowserSync";

const bridge = vi.hoisted(() => ({
  browserGetState: vi.fn<() => Promise<BrowserState>>(),
  onBrowserEvent: vi.fn<(listener: (event: BrowserEvent) => void) => () => void>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ ...bridge, windowKind: "main" }) }));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  selectBrowserPanelAvailable: () => true,
  useRemoteServersStore: () => true,
}));
vi.mock("@/renderer/state/panelStore", () => ({
  selectAnyObstructingOverlayOpen: () => false,
  usePanelStore: { getState: () => ({}) },
}));

it("does not let a delayed startup read replace a newer browser event", async () => {
  let accept!: (state: BrowserState) => void;
  let receive!: (event: BrowserEvent) => void;
  bridge.browserGetState.mockImplementation(
    () =>
      new Promise((resolve) => {
        accept = resolve;
      }),
  );
  bridge.onBrowserEvent.mockImplementation((listener) => {
    receive = listener;
    return () => {};
  });
  useBrowserPanelStore.setState({
    tabs: [],
    activeTabId: null,
    initialized: false,
    activationIntent: null,
  });
  const { unmount } = renderHook(useBrowserSync);
  const tab = {
    tabId: "new",
    title: "new",
    url: "about:blank",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    devToolsOpen: false,
  };
  act(() => receive({ type: "state", state: { tabs: [tab], activeTabId: "new" } }));
  await act(async () => accept({ tabs: [], activeTabId: null }));
  expect(useBrowserPanelStore.getState().activeTabId).toBe("new");
  expect(useBrowserPanelStore.getState().initialized).toBe(true);
  unmount();
});
