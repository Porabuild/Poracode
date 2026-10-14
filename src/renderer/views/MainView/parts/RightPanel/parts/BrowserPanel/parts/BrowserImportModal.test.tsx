import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserImportStore } from "@/renderer/state/browserImportStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { BrowserImportResult, BrowserImportSourceInfo } from "@/shared/ipc";
import { BrowserImportModal } from "./BrowserImportModal";

type ImportDataPayload = {
  sourceId: string;
  passwords: boolean;
  cookies: boolean;
  acknowledgeProtectedData: boolean;
};

const bridge = vi.hoisted(() => ({
  browserListImportSources: vi.fn<() => Promise<BrowserImportSourceInfo[]>>(),
  browserImportData: vi.fn<(payload: ImportDataPayload) => Promise<BrowserImportResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
}));

const source: BrowserImportSourceInfo = {
  id: "chrome:default",
  browser: "chrome",
  browserLabel: "Google Chrome",
  profileLabel: "Default",
  supportsPasswords: true,
  supportsCookies: true,
  hasAppBoundData: true,
};

describe("BrowserImportModal", () => {
  beforeEach(() => {
    bridge.browserListImportSources.mockReset().mockResolvedValue([source]);
    bridge.browserImportData.mockReset().mockResolvedValue({
      passwordsImported: 1,
      cookiesImported: 2,
      passwordsSkipped: 0,
      cookiesSkipped: 0,
      protectedItemsSkipped: 0,
      errors: [],
    });
    useBrowserImportStore.setState({ open: true });
  });

  it("requires acknowledgement before importing App-Bound protected data", async () => {
    render(<BrowserImportModal />);

    expect(await screen.findByText("Protected browser data")).toBeInTheDocument();
    expect(screen.getByText(/Poracode does not bypass that protection/)).toBeInTheDocument();

    const importButton = screen.getByRole("button", { name: "Import" });
    expect(importButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I understand that protected browser data may be skipped.",
      }),
    );
    expect(importButton).toBeEnabled();

    fireEvent.click(importButton);

    await waitFor(() =>
      expect(bridge.browserImportData).toHaveBeenCalledWith({
        sourceId: "chrome:default",
        passwords: true,
        cookies: true,
        acknowledgeProtectedData: true,
      }),
    );
    expect(useBrowserImportStore.getState().open).toBe(false);
  });

  it("keeps the dialog open when no browser data could be imported", async () => {
    bridge.browserImportData.mockResolvedValue({
      passwordsImported: 0,
      cookiesImported: 0,
      passwordsSkipped: 1,
      cookiesSkipped: 1,
      protectedItemsSkipped: 2,
      errors: ["app-bound-data-skipped"],
    });
    render(<BrowserImportModal />);

    await screen.findByText("Protected browser data");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I understand that protected browser data may be skipped.",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(bridge.browserImportData).toHaveBeenCalledOnce());
    expect(useBrowserImportStore.getState().open).toBe(true);
  });
});
