import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserCredentialsStore } from "@/renderer/state/browserCredentialsStore";
import { useBrowserImportStore } from "@/renderer/state/browserImportStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { BrowserCredentialInfo } from "@/shared/ipc";
import { BrowserPasswordsPage } from "./BrowserPasswordsPage";

const bridge = vi.hoisted(() => ({
  browserListCredentials: vi.fn<() => Promise<BrowserCredentialInfo[]>>(),
  browserGetCredentialPassword: vi.fn<(payload: { id: string }) => Promise<{ password: string }>>(),
  browserDeleteCredential: vi.fn<(payload: { id: string }) => Promise<void>>(),
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
    bridge.browserDeleteCredential.mockReset().mockResolvedValue(undefined);
    useBrowserCredentialsStore.setState({ credentials: [], revision: 0, deletingId: null });
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

  it("keeps editing in the actions menu and retrieves the secret only after selection", async () => {
    render(<BrowserPasswordsPage />);
    await screen.findByText("https://example.com");
    expect(screen.queryByRole("button", { name: "Edit saved password" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Saved password actions" }));
    const edit = await screen.findByRole("menuitem", { name: "Edit saved password" });
    expect(bridge.browserGetCredentialPassword).not.toHaveBeenCalled();
    fireEvent.click(edit);

    const dialog = await screen.findByRole("dialog", { name: "Edit password" });
    expect(within(dialog).getByLabelText("Website origin")).toHaveValue(credential.origin);
    expect(within(dialog).getByLabelText("Username")).toHaveValue(credential.username);
    expect(within(dialog).getByLabelText("Password")).toHaveValue("secret-value");
    expect(bridge.browserGetCredentialPassword).toHaveBeenCalledOnce();
  });

  it("requires confirmation before deleting from the actions menu", async () => {
    render(<BrowserPasswordsPage />);
    await screen.findByText("https://example.com");
    fireEvent.click(screen.getByRole("button", { name: "Saved password actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete saved password" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Delete saved password?" });
    expect(bridge.browserDeleteCredential).not.toHaveBeenCalled();
    expect(bridge.browserGetCredentialPassword).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(bridge.browserDeleteCredential).toHaveBeenCalledWith({ id: credential.id }),
    );
  });

  it("keeps a new draft when an earlier Edit request resolves", async () => {
    const password = Promise.withResolvers<{ password: string }>();
    bridge.browserGetCredentialPassword.mockReturnValueOnce(password.promise);
    render(<BrowserPasswordsPage />);
    await screen.findByText("https://example.com");
    fireEvent.click(screen.getByRole("button", { name: "Saved password actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit saved password" }));
    await waitFor(() => expect(bridge.browserGetCredentialPassword).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Add password" }));
    const dialog = await screen.findByRole("dialog", { name: "Add password" });
    fireEvent.change(within(dialog).getByLabelText("Username"), { target: { value: "new-draft" } });
    await act(async () => password.resolve({ password: "older-secret" }));
    expect(screen.getByRole("dialog", { name: "Add password" })).toBe(dialog);
    expect(within(dialog).getByLabelText("Username")).toHaveValue("new-draft");
    expect(within(dialog).getByLabelText("Password")).toHaveValue("");
  });
});
