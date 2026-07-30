import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { BrowserToolbar } from "./BrowserToolbar";

vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({}) }));
vi.mock("./BrowserMenu", () => ({ BrowserMenu: () => null }));
vi.mock("./BrowserOmnibox", () => ({
  BrowserOmnibox: (props: { disabled: boolean }) => (
    <input aria-label="Test address bar" disabled={props.disabled} />
  ),
}));

describe("BrowserToolbar", () => {
  beforeEach(() => {
    useBrowserPanelStore.setState({
      activeTabId: "tab-1",
      bookmarks: [],
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
  });

  it("keeps the address bar usable while disabling page-only controls on internal pages", () => {
    render(
      <BrowserToolbar
        onPick={vi.fn<() => void>()}
        pickerActive={false}
        pickerTargets={[]}
        hasPendingPick={false}
        pendingPickAnchor={null}
        onChoosePickTarget={vi.fn<() => void>()}
        onCancelPendingPick={vi.fn<() => void>()}
        onMenuPreviewChange={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Test address bar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Bookmark this page" })).toBeDisabled();
    expect(screen.getByTitle("Reload")).toBeDisabled();
  });
});
