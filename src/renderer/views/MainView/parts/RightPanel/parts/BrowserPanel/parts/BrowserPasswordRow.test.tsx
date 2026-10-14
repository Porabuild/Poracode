import { Profiler } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useBrowserCredentialsStore } from "@/renderer/state/browserCredentialsStore";
import { BrowserPasswordRow } from "./BrowserPasswordRow";

const bridge = vi.hoisted(() => ({
  browserGetCredentialPassword: vi.fn<(payload: { id: string }) => Promise<{ password: string }>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
const onEdit = async () => {};
const onDelete = () => {};

describe("BrowserPasswordRow", () => {
  beforeEach(() => {
    bridge.browserGetCredentialPassword
      .mockReset()
      .mockResolvedValue({ password: "fixture-secret" });
    useBrowserCredentialsStore.setState({
      revision: 0,
      deletingId: null,
      credentials: ["a", "b"].map((id) => ({
        id,
        origin: `https://${id}.test`,
        username: id,
        createdAt: 1,
        updatedAt: 1,
      })),
    });
  });

  it("isolates busy and reveal changes from a sibling row", async () => {
    const siblingCommits = vi.fn<() => void>();
    render(
      <>
        <BrowserPasswordRow credentialId="a" onEdit={onEdit} onDelete={onDelete} />
        <Profiler id="sibling" onRender={siblingCommits}>
          <BrowserPasswordRow credentialId="b" onEdit={onEdit} onDelete={onDelete} />
        </Profiler>
      </>,
    );
    const initialCommits = siblingCommits.mock.calls.length;
    fireEvent.click(screen.getAllByRole("button", { name: "Reveal password" })[0]!);
    expect(await screen.findByText("fixture-secret")).toBeInTheDocument();
    expect(siblingCommits).toHaveBeenCalledTimes(initialCommits);
    expect(screen.getByRole("button", { name: "Reveal password" })).toBeEnabled();
  });

  it("ignores a password reply from an older credential revision", async () => {
    const password = Promise.withResolvers<{ password: string }>();
    bridge.browserGetCredentialPassword.mockReturnValueOnce(password.promise);
    render(<BrowserPasswordRow credentialId="a" onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal password" }));
    act(() => useBrowserCredentialsStore.getState().invalidate());
    await act(async () => password.resolve({ password: "older-secret" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reveal password" })).toBeEnabled(),
    );
    expect(screen.queryByText("older-secret")).toBeNull();
  });
});
