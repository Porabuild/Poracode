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
  MobileTerminal: forwardRef(function MobileTerminal(props: { terminalId: string }, _ref: unknown) {
    return <div data-testid={`mobile-terminal-${props.terminalId}`} />;
  }),
}));

vi.mock("../TerminalAccessory", () => ({
  TerminalAccessory: (props: { terminalId: string; onReload?: () => void }) => (
    <div data-testid="terminal-accessory" data-terminal-id={props.terminalId}>
      <button type="button" onClick={props.onReload}>
        Reload
      </button>
    </div>
  ),
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

  it("opens and switches between multiple terminal tabs", async () => {
    render(
      <TerminalView
        title="Repo"
        projectLocation={{ kind: "posix", path: "/repo" }}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(bridge.startShell).toHaveBeenCalledTimes(1);
    });
    const firstShellId = (bridge.startShell.mock.calls[0]![0] as { shellId: string }).shellId;
    expect(screen.getByTestId("terminal-accessory")).toHaveAttribute(
      "data-terminal-id",
      firstShellId,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open terminal" }));

    await waitFor(() => {
      expect(bridge.startShell).toHaveBeenCalledTimes(2);
    });
    const secondShellId = (bridge.startShell.mock.calls[1]![0] as { shellId: string }).shellId;
    expect(secondShellId).not.toBe(firstShellId);
    expect(screen.getByTestId("terminal-accessory")).toHaveAttribute(
      "data-terminal-id",
      secondShellId,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Repo" }));

    expect(screen.getByTestId("terminal-accessory")).toHaveAttribute(
      "data-terminal-id",
      firstShellId,
    );
  });

  it("closes only the selected terminal tab when multiple tabs are open", async () => {
    render(
      <TerminalView
        title="Repo"
        projectLocation={{ kind: "posix", path: "/repo" }}
        onClose={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(bridge.startShell).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Open terminal" }));
    await waitFor(() => {
      expect(bridge.startShell).toHaveBeenCalledTimes(2);
    });
    const secondShellId = (bridge.startShell.mock.calls[1]![0] as { shellId: string }).shellId;

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[1]!);

    await waitFor(() => {
      expect(bridge.closeThread).toHaveBeenCalledWith({ threadId: secondShellId });
    });
    expect(screen.getByTestId("terminal-accessory")).not.toHaveAttribute(
      "data-terminal-id",
      secondShellId,
    );
  });
});
