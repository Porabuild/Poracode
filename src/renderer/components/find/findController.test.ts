import { afterEach, describe, expect, it } from "vitest";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { openFindForActiveSurface, resolveFindTarget } from "./findController";
import { useBrowserFindStore } from "@/renderer/state/browserFindStore";

function resetFindRoutingState(): void {
  document.body.innerHTML = "";
  useCommandPaletteStore.setState({ isOpen: false });
  usePanelStore.setState({
    settingsOpen: false,
    projectSettingsId: null,
    gitOverlayOpen: false,
    prReviewContext: null,
    threadSearchOpen: false,
    createProjectModalOpen: false,
    cloneProjectModalOpen: false,
  });
  useAppStore.setState({ view: { kind: "home" } });
  useBrowserPanelStore.setState({ tabs: [], activeTabId: null });
  useBrowserFindStore.setState({ tabId: null });
}

describe("resolveFindTarget", () => {
  afterEach(() => {
    resetFindRoutingState();
  });

  it("falls back to chat in a thread view", () => {
    useAppStore.setState({ view: { kind: "thread", panes: ["thread-1"] } });

    expect(resolveFindTarget()).toBe("chat");
  });

  it("routes browser chrome focus to browser find", () => {
    useAppStore.setState({ view: { kind: "thread", panes: ["thread-1"] } });
    document.body.innerHTML = `<div data-poracode-browser=""><input id="address" /></div>`;
    document.getElementById("address")?.focus();

    expect(resolveFindTarget()).toBe("browser");
  });

  it("does not open browser find on an app-owned internal page", () => {
    document.body.innerHTML = `<div data-poracode-browser=""><input id="address" /></div>`;
    document.getElementById("address")?.focus();
    useBrowserPanelStore.setState({
      activeTabId: "tab-1",
      tabs: [
        {
          tabId: "tab-1",
          url: "chrome://downloads/",
          title: "Download history",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          internalPage: "downloads",
        },
      ],
    });

    openFindForActiveSurface();

    expect(useBrowserFindStore.getState().tabId).toBeNull();
  });

  it("lets the command palette keep Ctrl+F", () => {
    useAppStore.setState({ view: { kind: "thread", panes: ["thread-1"] } });
    useCommandPaletteStore.setState({ isOpen: true });

    expect(resolveFindTarget()).toBeNull();
  });
});
