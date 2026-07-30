import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserCredentialsStore } from "@/renderer/state/browserCredentialsStore";
import { useBrowserImportStore } from "@/renderer/state/browserImportStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { BrowserCredentialInfo } from "@/shared/ipc";
import { BrowserPasswordsPage } from "./BrowserPasswordsPage";

const bridge = vi.hoisted(() => ({
  browserListCredentials: vi.fn<() => Promise<BrowserCredentialInfo[]>>(),
  browserGetCredentialPassword: vi.fn<(payload: { id: string }) => Promise<{ password: string }>>(),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const credential: BrowserCredentialInfo = {
  id: "credential-1",
  origin: "https://example.com",
  username: "alice@example.com",
  createdAt: 1,
  updatedAt: 2,
  source: "Chrome — Profile 1",
};

describe("BrowserPasswordsPage", () => {
  beforeEach(() => {
    bridge.browserListCredentials.mockReset().mockResolvedValue([credential]);
    bridge.browserGetCredentialPassword.mockReset().mockResolvedValue({
      password: "secret-value",
    });
    useBrowserCredentialsStore.setState({ credentials: [], revision: 0 });
    useBrowserImportStore.setState({ open: false });
  });

  it("lists password metadata and retrieves the password only when revealed", async () => {
    render(<BrowserPasswordsPage />);

    expect(await screen.findByText("https://example.com")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Imported from Chrome — Profile 1")).toBeInTheDocument();
    expect(screen.queryByText("secret-value")).toBeNull();
    expect(bridge.browserGetCredentialPassword).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reveal password" }));

    await waitFor(() =>
      expect(bridge.browserGetCredentialPassword).toHaveBeenCalledWith({ id: "credential-1" }),
    );
    expect(await screen.findByText("secret-value")).toBeInTheDocument();
  });

  it("hides a revealed password when credentials change", async () => {
    render(<BrowserPasswordsPage />);
    await screen.findByText("https://example.com");
    fireEvent.click(screen.getByRole("button", { name: "Reveal password" }));
    expect(await screen.findByText("secret-value")).toBeInTheDocument();

    act(() => useBrowserCredentialsStore.getState().invalidate());

    await waitFor(() => expect(screen.queryByText("secret-value")).toBeNull());
  });

  it("opens browser-data import from the Advanced tab", async () => {
    render(<BrowserPasswordsPage />);
    await waitFor(() => expect(bridge.browserListCredentials).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("tab", { name: "Advanced" }));
    fireEvent.click(screen.getByRole("button", { name: "Import cookies and passwords" }));

    expect(useBrowserImportStore.getState().open).toBe(true);
  });
});
