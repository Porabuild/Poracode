// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useBrowserMirrorStore } from "../browserMirror";
import { BrowserView } from "./BrowserView";

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());

const bridge = vi.hoisted(() => ({
  browserCreateTab: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@heroui/react")>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      danger: toastDanger,
    },
  };
});

describe("mobile BrowserView", () => {
  beforeEach(() => {
    bridge.browserCreateTab.mockReset();
    toastDanger.mockClear();
    useBrowserMirrorStore.getState().reset();
    useBrowserMirrorStore.getState().setState({
      activeTabId: "tab-1",
      tabs: [
        {
          tabId: "tab-1",
          title: "Example",
          url: "https://example.com/",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
    });
  });

  it("reports failed browser commands instead of silently doing nothing", async () => {
    bridge.browserCreateTab.mockRejectedValue(new Error("Desktop browser is unavailable"));

    render(<BrowserView />);

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));

    await waitFor(() => {
      expect(toastDanger).toHaveBeenCalledWith("Desktop browser is unavailable");
    });
  });

  it("shows browser unavailability instead of spinning when no state has loaded", () => {
    useBrowserMirrorStore.getState().reset();
    useBrowserMirrorStore.getState().setStatus({
      status: "unavailable",
      tabId: null,
      reason: "Browser mirroring is not available on this desktop.",
    });

    render(<BrowserView />);

    expect(screen.getByText("Browser mirroring is not available on this desktop.")).toBeTruthy();
    expect(screen.queryByText("Connecting to the desktop browser…")).toBeNull();
  });
});
