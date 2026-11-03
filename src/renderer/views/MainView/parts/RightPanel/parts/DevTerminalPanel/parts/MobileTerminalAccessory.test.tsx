import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MobileTerminalAccessory } from "./MobileTerminalAccessory";

const { sendTerminalInput, toastDanger } = vi.hoisted(() => ({
  sendTerminalInput: vi.fn<(id: string, data: string) => boolean>(),
  toastDanger: vi.fn<(message: string) => void>(),
}));
vi.mock("@/renderer/components/terminal/terminalInputQueue", () => ({ sendTerminalInput }));
vi.mock("@heroui/react", () => ({ toast: { danger: toastDanger } }));

describe("MobileTerminalAccessory", () => {
  beforeEach(() => {
    sendTerminalInput.mockReset().mockReturnValue(true);
    toastDanger.mockReset();
  });

  it("does not render a software-keyboard launcher", () => {
    render(<MobileTerminalAccessory terminalId="term-1" />);

    expect(screen.queryByLabelText("Terminal input")).not.toBeInTheDocument();
  });

  it("reports a missing terminal queue", () => {
    sendTerminalInput.mockReturnValue(false);
    render(<MobileTerminalAccessory terminalId="term-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tab" }));
    expect(toastDanger).toHaveBeenCalledWith(
      "Terminal input failed. Some input may not have reached the shell. Reopen the terminal before typing again.",
    );
  });

  it("forwards Ctrl+T and Ctrl+Tab sequences", () => {
    render(<MobileTerminalAccessory terminalId="term-1" />);

    fireEvent.click(screen.getByRole("button", { name: "^" }));
    fireEvent.click(screen.getByRole("button", { name: "T" }));
    fireEvent.click(screen.getByRole("button", { name: "^" }));
    fireEvent.click(screen.getByRole("button", { name: "Tab" }));

    expect(sendTerminalInput).toHaveBeenCalledWith("term-1", "\x14");
    expect(sendTerminalInput).toHaveBeenCalledWith("term-1", "\x1b[9;5u");
  });
});
