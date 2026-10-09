import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { TerminalFontPicker } from "./TerminalFontPicker";

const options = [
  { id: "default", label: "Default" },
  { id: "font:Menlo", label: "Menlo" },
  { id: "font:Courier New", label: "Courier New" },
];

function setup(value = "Menlo") {
  const onChange = vi.fn<(value: string) => void>();
  render(<TerminalFontPicker value={value} options={options} onChange={onChange} />);
  return { input: screen.getByRole("combobox", { name: "Terminal font face" }), onChange };
}

describe("TerminalFontPicker", () => {
  it("filters suggestions while preserving the live family until selection", async () => {
    const { input, onChange } = setup();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "Cour" } });
    expect(onChange).not.toHaveBeenCalled();
    const suggestion = await screen.findByRole("option", { name: "Courier New" });
    expect(screen.queryByRole("option", { name: "Menlo" })).toBeNull();
    fireEvent.click(suggestion);
    expect(onChange).toHaveBeenLastCalledWith("Courier New");
  });

  it("applies a typed single family on Enter, without turning CSS syntax into a stack", () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: '  Saved "Mono", Other  ' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith('Saved "Mono", Other');
  });

  it("applies a valid custom family on blur", () => {
    const { input, onChange } = setup();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "Custom Mono" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith("Custom Mono");
  });

  it("restores the committed value on Escape and keeps focus", () => {
    const { input, onChange } = setup();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "Uncommitted" } });
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    expect(input).toHaveValue("Menlo");
    expect(input).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])("does not commit IME Enter: %j", (event) => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: "日本語" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", ...event });
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["x".repeat(257), "bad\tname"])('rejects invalid typed family "%s"', (value) => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears whitespace to Default and provides explicit Default recovery", () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("");
    fireEvent.click(screen.getByRole("button", { name: "Use default font" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("opens a field-width, bounded popup and commits keyboard-selected suggestions", async () => {
    const { input, onChange } = setup("");
    fireEvent.click(screen.getByRole("button", { name: "Show font suggestions" }));
    const list = await screen.findByRole("listbox");
    const popup = list.closest('[data-slot="combo-box-popover"]');
    expect(popup).toHaveStyle({ width: "var(--trigger-width)" });
    expect(popup).toHaveClass("max-w-[calc(100vw-16px)]");
    expect(list).toHaveClass("max-h-60", "overflow-y-auto");
    fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
