// @vitest-environment jsdom
import { forwardRef } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { TerminalView } from "./TerminalView";

const bridge = vi.hoisted(() => ({
  startShell: vi.fn<(payload: unknown) => Promise<void>>(),
  writeTerminal: vi.fn<(payload: unknown) => Promise<void>>(),
  closeThread: vi.fn<(payload: unknown) => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("../MobileTerminal", () => ({
  MobileTerminal: forwardRef(function MobileTerminal() {
    return <div data-testid="mobile-terminal" />;
  }),
}));

vi.mock("../TerminalAccessory", () => ({
  TerminalAccessory: () => <div data-testid="terminal-accessory" />,
}));

describe("mobile TerminalView", () => {
  beforeEach(() => {
    bridge.startShell.mockReset();
    bridge.writeTerminal.mockReset();
    bridge.closeThread.mockReset();
    bridge.startShell.mockResolvedValue(undefined);
    bridge.writeTerminal.mockResolvedValue(undefined);
    bridge.closeThread.mockResolvedValue(undefined);
  });

  it("runs an initial project action command after starting the remote shell", async () => {
    render(
      <TerminalView
        title="Run Tests"
        projectLocation={{ kind: "posix", path: "/repo" }}
        worktreePath="/repo/wt"
        initialCommand={"# test\npnpm lint\npnpm test"}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(bridge.startShell).toHaveBeenCalledWith(
        expect.objectContaining({
          projectLocation: { kind: "posix", path: "/repo" },
          worktreePath: "/repo/wt",
          initialSize: { cols: 80, rows: 24 },
        }),
      );
    });
    await waitFor(() => {
      expect(bridge.writeTerminal).toHaveBeenCalledWith({
        threadId: expect.stringMatching(/^shell:/),
        data: "pnpm lint && pnpm test\r",
      });
    });
  });

  it("surfaces startup failures with an inline retry action", async () => {
    bridge.startShell
      .mockRejectedValueOnce(new Error("PTY allocation failed"))
      .mockResolvedValueOnce(undefined);

    render(
      <TerminalView
        title="Repo"
        projectLocation={{ kind: "posix", path: "/repo" }}
        onClose={() => undefined}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to start terminal");
    expect(screen.getByRole("alert")).toHaveTextContent("PTY allocation failed");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(bridge.startShell).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
