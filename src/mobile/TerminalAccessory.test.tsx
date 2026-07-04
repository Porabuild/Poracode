import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { TerminalAccessory } from "./TerminalAccessory";

const { toastDanger, writeTerminal } = vi.hoisted(() => ({
  toastDanger: vi.fn<(message: string) => void>(),
  writeTerminal: vi
    .fn<(payload: { readonly threadId: string; readonly data: string }) => Promise<void>>()
    .mockResolvedValue(undefined),
}));

vi.mock("@heroui/react", () => ({
  toast: {
    danger: toastDanger,
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ writeTerminal }),
}));

describe("TerminalAccessory", () => {
  beforeEach(() => {
    toastDanger.mockReset();
    writeTerminal.mockReset();
    writeTerminal.mockResolvedValue(undefined);
  });

  it("forwards typed text to the terminal PTY", () => {
    render(<TerminalAccessory terminalId="term-1" />);

    const input = screen.getByLabelText("Terminal input");
    fireEvent.input(input, { target: { value: "hello" } });

    expect(writeTerminal).toHaveBeenCalledWith({ threadId: "term-1", data: "hello" });
  });

  it("forwards Ctrl+T and Ctrl+Tab sequences", () => {
    render(<TerminalAccessory terminalId="term-1" />);

    const input = screen.getByLabelText("Terminal input");
    fireEvent.keyDown(input, { key: "t", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "^" }));
    fireEvent.click(screen.getByRole("button", { name: "Tab" }));

    expect(writeTerminal).toHaveBeenCalledWith({ threadId: "term-1", data: "\x14" });
    expect(writeTerminal).toHaveBeenCalledWith({ threadId: "term-1", data: "\x1b[9;5u" });
  });

  it("keeps Ctrl+C behind an explicit modifier chord", () => {
    render(<TerminalAccessory terminalId="term-1" />);

    fireEvent.click(screen.getByRole("button", { name: "C" }));
    fireEvent.click(screen.getByRole("button", { name: "^" }));
    fireEvent.click(screen.getByRole("button", { name: "C" }));

    expect(writeTerminal).toHaveBeenNthCalledWith(1, { threadId: "term-1", data: "c" });
    expect(writeTerminal).toHaveBeenNthCalledWith(2, { threadId: "term-1", data: "\x03" });
  });

  it("runs reload without writing terminal input", () => {
    const onReload = vi.fn<() => void>();
    render(<TerminalAccessory terminalId="term-1" onReload={onReload} />);

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(onReload).toHaveBeenCalledOnce();
    expect(writeTerminal).not.toHaveBeenCalled();
  });

  it("reports terminal input failures instead of swallowing them", async () => {
    writeTerminal.mockRejectedValueOnce(new Error("terminal detached"));
    render(<TerminalAccessory terminalId="term-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Tab" }));

    await waitFor(() => {
      expect(toastDanger).toHaveBeenCalledWith("terminal detached");
    });
  });
});
