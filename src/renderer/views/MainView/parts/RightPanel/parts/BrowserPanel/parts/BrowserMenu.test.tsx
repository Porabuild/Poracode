import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserFindStore } from "@/renderer/state/browserFindStore";
import { useBrowserImportStore } from "@/renderer/state/browserImportStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { BrowserHistoryEntryInfo, BrowserTabInfo } from "@/shared/ipc";
import { BrowserMenu } from "./BrowserMenu";

const bridge = vi.hoisted(() => ({
  platform: "win32" as NodeJS.Platform,
  browserRecentHistory: vi.fn<() => Promise<BrowserHistoryEntryInfo[]>>(),
  browserOpenInternalPage: vi.fn<(payload: { page: "downloads" | "passwords" }) => Promise<void>>(),
  browserPrint: vi.fn<(payload: { tabId: string }) => Promise<{ ok: boolean }>>(),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const tab: BrowserTabInfo = {
  tabId: "tab-1",
  url: "https://example.com/",
  title: "Example",
  loading: false,
  canGoBack: true,
  canGoForward: false,
};

function renderMenu(activeTab: BrowserTabInfo = tab) {
  return render(
    <BrowserMenu
      activeTab={activeTab}
      bookmarks={[]}
      onToggleBookmark={vi.fn<() => void>()}
      triggerClassName=""
    />,
  );
}

async function chooseMenuItem(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Browser menu" }));
  fireEvent.click(
    (await screen.findByText(name, { selector: "label" })).closest('[role="menuitem"]')!,
  );
}

describe("BrowserMenu", () => {
  beforeEach(() => {
    bridge.browserRecentHistory.mockReset().mockResolvedValue([]);
    bridge.browserOpenInternalPage.mockReset().mockResolvedValue(undefined);
    bridge.browserPrint.mockReset().mockResolvedValue({ ok: true });
    useBrowserPanelStore.setState({ bookmarkBarVisible: false });
    useBrowserImportStore.setState({ open: false });
    useBrowserFindStore.setState({
      tabId: null,
      query: "",
      matchCase: false,
      matches: 0,
      currentIndex: -1,
      openToken: 0,
    });
  });

  it("routes menu actions without exposing them to BrowserToolbar", async () => {
    renderMenu();

    await chooseMenuItem("Downloads");
    await waitFor(() =>
      expect(bridge.browserOpenInternalPage).toHaveBeenCalledWith({ page: "downloads" }),
    );

    await chooseMenuItem("Import cookies and passwords");
    expect(useBrowserImportStore.getState().open).toBe(true);

    await chooseMenuItem("Find in page");
    expect(useBrowserFindStore.getState().tabId).toBe("tab-1");

    await chooseMenuItem("Print");
    await waitFor(() => expect(bridge.browserPrint).toHaveBeenCalledWith({ tabId: "tab-1" }));
  });

  it("keeps page actions disabled on internal browser pages", async () => {
    renderMenu({ ...tab, url: "poracode://downloads", internalPage: "downloads" });

    fireEvent.click(screen.getByRole("button", { name: "Browser menu" }));

    expect(
      (await screen.findByText("Find in page", { selector: "label" })).closest('[role="menuitem"]'),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Print", { selector: "label" }).closest('[role="menuitem"]'),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Show device toolbar", { selector: "label" }).closest('[role="menuitem"]'),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
