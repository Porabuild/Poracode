// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";

const layout = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    browserRecentHistory: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    browserBack: vi.fn<() => Promise<void>>(),
    browserForward: vi.fn<() => Promise<void>>(),
    browserReload: vi.fn<() => Promise<void>>(),
  }),
  isMac: () => false,
  isWindows: () => false,
}));

import { BrowserToolbar } from "./BrowserToolbar";

describe("BrowserToolbar", () => {
  beforeEach(() => {
    layout.compact = false;
    useBrowserPanelStore.setState({
      tabs: [
        {
          tabId: "tab-1",
          url: "https://example.com",
          title: "Example",
          canGoBack: false,
          canGoForward: false,
          isLoading: false,
        },
      ],
      activeTabId: "tab-1",
      bookmarks: [],
      bookmarkBarVisible: false,
    } as never);
  });

  it("keeps nav and address usable on compact without desktop-only chrome", () => {
    layout.compact = true;

    render(
      <BrowserToolbar
        onPick={() => {}}
        pickerActive={false}
        pickerTargets={[]}
        hasPendingPick={false}
        pendingPickAnchor={null}
        onChoosePickTarget={() => {}}
        onCancelPendingPick={() => {}}
        onMenuPreviewChange={() => {}}
      />,
    );

    const toolbar = document.querySelector("[data-browser-toolbar]");
    expect(toolbar).toHaveClass("flex-wrap");
    expect(screen.getByPlaceholderText("Search or enter address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browser menu" })).toBeInTheDocument();
    expect(screen.queryByTitle("Pick element")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Console")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search or enter address").closest("div")).toHaveClass(
      "min-w-full",
    );
  });
});
