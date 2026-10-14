import { describe, expect, it } from "vitest";
import type { BrowserState } from "@/shared/ipc";
import type { BrowserPanelManager } from "@/host/browser/types";
import { RemoteBrowserGateway } from "./RemoteBrowserGateway";

describe("remote browser management-page boundary", () => {
  const web = {
    tabId: "web",
    url: "https://example.test",
    title: "Example",
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
  const internal = {
    ...web,
    tabId: "passwords",
    url: "chrome://password-manager/passwords",
    internalPage: "passwords" as const,
  };

  function gateway(state: BrowserState) {
    return new RemoteBrowserGateway(
      () => ({ snapshot: () => state }) as unknown as BrowserPanelManager,
    );
  }

  it("preserves the previous web-only catalog unchanged", () => {
    const state = { tabs: [web], activeTabId: "web" };
    expect(gateway(state).state()).toEqual(state);
  });

  it("omits app-owned pages without claiming they can be mirrored", () => {
    expect(gateway({ tabs: [web, internal], activeTabId: "passwords" }).state()).toEqual({
      tabs: [web],
      activeTabId: null,
    });
    expect(gateway({ tabs: [web, internal], activeTabId: "web" }).state()).toEqual({
      tabs: [web],
      activeTabId: "web",
    });
  });

  it("keeps a valid empty state when only a management page is open", () => {
    expect(gateway({ tabs: [internal], activeTabId: "passwords" }).state()).toEqual({
      tabs: [],
      activeTabId: null,
    });
  });
});
