import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { HostUsageInfo } from "./HostUsageInfo";

afterEach(cleanup);

function pointerPress(element: HTMLElement) {
  fireEvent.pointerDown(element, { pointerType: "mouse", button: 0 });
  fireEvent.click(element);
}

function keyboardPress(element: HTMLElement, key: string) {
  fireEvent.keyDown(element, { key });
  fireEvent.keyUp(element, { key });
}

describe("host usage guidance", () => {
  it("keeps the explanation out of the card flow and opens it by press", async () => {
    render(<HostUsageInfo />);
    const info = screen.getByRole("button", { name: "About usage" });
    expect(screen.queryByText(/Credentials stay on the host/)).toBeNull();
    pointerPress(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Credentials stay on the host");
    expect(info).toHaveAttribute("aria-expanded", "true");
    pointerPress(info);
    await waitFor(() => expect(info).toHaveAttribute("aria-expanded", "false"));
  });

  it.each(["Enter", " "])("closes after a second keyboard press (%j)", async (key) => {
    render(<HostUsageInfo />);
    const info = screen.getByRole("button", { name: "About usage" });
    keyboardPress(info, key);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Credentials stay on the host");
    expect(info).toHaveAttribute("aria-expanded", "true");
    keyboardPress(info, key);
    await waitFor(() => expect(info).toHaveAttribute("aria-expanded", "false"));
  });

  it("opens by keyboard focus and dismisses with Escape", async () => {
    render(<HostUsageInfo />);
    const info = screen.getByRole("button", { name: "About usage" });
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => info.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Sign in and configure");
    fireEvent.keyDown(info, { key: "Escape" });
    await waitFor(() => expect(info).toHaveAttribute("aria-expanded", "false"));
  });
});
