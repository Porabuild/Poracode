import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MobileTerminalAccessory } from "./MobileTerminalAccessory";

const { toastDanger, writeTerminal } = vi.hoisted(() => ({
  toastDanger: vi.fn<(message: string) => void>(),
  writeTerminal: vi
    .fn<(payload: { readonly threadId: string; readonly data: string }) => Promise<void>>()
    .mockResolvedValue(undefined),
}));

vi.mock("@heroui/react", () => ({
  toast: { danger: toastDanger },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ writeTerminal }),
}));

describe("MobileTerminalAccessory", () => {
  beforeEach(() => {
    toastDanger.mockReset();
    writeTerminal.mockReset().mockResolvedValue(undefined);
  });

  it("forwards typed text to the active terminal", () => {
    render(<MobileTerminalAccessory terminalId="term-1" />);

    fireEvent.input(screen.getByLabelText("Terminal input"), { target: { value: "hello" } });

    expect(writeTerminal).toHaveBeenCalledWith({ threadId: "term-1", data: "hello" });
  });

  it("forwards Ctrl+T and Ctrl+Tab sequences", () => {
    render(<MobileTerminalAccessory terminalId="term-1" />);

    const input = screen.getByLabelText("Terminal input");
    fireEvent.keyDown(input, { key: "t", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "^" }));
    fireEvent.click(screen.getByRole("button", { name: "Tab" }));

    expect(writeTerminal).toHaveBeenCalledWith({ threadId: "term-1", data: "\x14" });
    expect(writeTerminal).toHaveBeenCalledWith({ threadId: "term-1", data: "\x1b[9;5u" });
  });

  it("reports input failures", async () => {
    writeTerminal.mockRejectedValueOnce(new Error("terminal detached"));
    render(<MobileTerminalAccessory terminalId="term-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Tab" }));

    await waitFor(() => expect(toastDanger).toHaveBeenCalledWith("terminal detached"));
  });
});
