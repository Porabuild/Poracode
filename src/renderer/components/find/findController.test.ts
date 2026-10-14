import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useFindFocusStore } from "@/renderer/state/findFocusStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { openFindForActiveSurface, resolveFindTarget } from "./findController";
import { useBrowserFindStore } from "@/renderer/state/browserFindStore";

const client = vi.hoisted(() => ({ nativeBrowser: true }));
vi.mock("@/renderer/clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/clientRuntime")>()),
  hasClientCapability: () => client.nativeBrowser,
}));

function resetFindRoutingState(): void {
  client.nativeBrowser = true;
  document.body.innerHTML = "";
  useCommandPaletteStore.setState({ isOpen: false });
  usePanelStore.setState({
    settingsOpen: false,
    projectSettingsId: null,
    gitOverlayOpen: false,
    prReviewContext: null,
    createProjectModalOpen: false,
    cloneProjectModalOpen: false,
  });
  useAppStore.setState({ view: { kind: "home" } });
  useFindFocusStore.setState({ settingsFocusToken: 0, treeFocusToken: 0 });
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

  it.each([true, false])("requires a native browser for the Find command: %s", (nativeBrowser) => {
    client.nativeBrowser = nativeBrowser;
    document.body.innerHTML = `<div data-poracode-browser=""><input id="address" /></div>`;
    document.getElementById("address")?.focus();
    useBrowserPanelStore.setState({
      activeTabId: "tab-1",
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com",
          title: "Example",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
    });
    openFindForActiveSurface();
    expect(useBrowserFindStore.getState().tabId).toBe(nativeBrowser ? "tab-1" : null);
  });

  it("lets the command palette keep Ctrl+F", () => {
    useAppStore.setState({ view: { kind: "thread", panes: ["thread-1"] } });
    useCommandPaletteStore.setState({ isOpen: true });

    expect(resolveFindTarget()).toBeNull();
  });

  it("routes from a provided originating target after focus moves", () => {
    document.body.innerHTML = `
      <div data-poracode-find-scope="settings"><button id="origin">Setting</button></div>
      <input id="palette" />
    `;
    const origin = document.getElementById("origin");
    document.getElementById("palette")?.focus();
    useCommandPaletteStore.setState({ isOpen: true });

    expect(resolveFindTarget()).toBeNull();
    expect(resolveFindTarget(origin)).toBe("settings");

    openFindForActiveSurface(origin);
    expect(useFindFocusStore.getState().settingsFocusToken).toBe(1);
  });
});
