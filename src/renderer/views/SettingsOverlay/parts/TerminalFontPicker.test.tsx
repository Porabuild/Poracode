import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { OverlayShell } from "@/renderer/components/layout/OverlayShell";
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

  it("cancels a partial query on blur without changing the live family", () => {
    const { input, onChange } = setup();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "Custom Mono" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("Menlo");
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
  it("owns Escape inside the real Settings overlay and restores focus without saving", async () => {
    const onChange = vi.fn<(value: string) => void>();
    const onExited = vi.fn<() => void>();
    const { container } = render(
      <OverlayShell open instantEnter onExited={onExited}>
        <TerminalFontPicker value="Menlo" options={options} onChange={onChange} />
        <button type="button">Outside field</button>
      </OverlayShell>,
    );
    const input = screen.getByRole("combobox", { name: "Terminal font face" });
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "Cour" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    expect(input).toHaveValue("Menlo");
    expect(input).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    const overlay = container.querySelector("[data-overlay-surface]")!;
    expect(overlay).toHaveAttribute("data-overlay-visible");
    expect(onChange).not.toHaveBeenCalled();
    expect(onExited).not.toHaveBeenCalled();
    // Ownership is limited to the picker; Escape elsewhere still closes Settings.
    const outside = screen.getByRole("button", { name: "Outside field" });
    act(() => outside.focus());
    fireEvent.keyDown(outside, { key: "Escape", code: "Escape" });
    expect(overlay).not.toHaveAttribute("data-overlay-visible");
    fireEvent.transitionEnd(overlay, { propertyName: "opacity" });
    expect(onExited).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "preserves native IME Escape in the overlay: %j",
    (composition) => {
      const onChange = vi.fn<(value: string) => void>();
      const onExited = vi.fn<() => void>();
      const { container } = render(
        <OverlayShell open instantEnter onExited={onExited}>
          <TerminalFontPicker value="Menlo" options={options} onChange={onChange} />
        </OverlayShell>,
      );
      const input = screen.getByRole("combobox", { name: "Terminal font face" });
      act(() => input.focus());
      fireEvent.change(input, { target: { value: "日本語" } });
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
        ...composition,
      });
      fireEvent(input, event);
      expect(event.defaultPrevented).toBe(false);
      expect(input).toHaveValue("日本語");
      expect(input).toHaveFocus();
      expect(container.querySelector("[data-overlay-surface]")).toHaveAttribute(
        "data-overlay-visible",
      );
      expect(onExited).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it.each(["Standard", "По умолчанию"])(
    "reselects Default without treating its translated label as a family: %s",
    async (label) => {
      const onChange = vi.fn<(value: string) => void>();
      render(
        <>
          <TerminalFontPicker
            value=""
            options={[{ id: "default", label }, options[1]!]}
            onChange={onChange}
          />
          <button type="button">Outside field</button>
        </>,
      );
      const input = screen.getByRole("combobox", { name: "Terminal font face" });
      fireEvent.click(screen.getByRole("button", { name: "Show font suggestions" }));
      fireEvent.click(await screen.findByRole("option", { name: label }));
      expect(input).toHaveValue("");
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      act(() => screen.getByRole("button", { name: "Outside field" }).focus());
      expect(onChange).not.toHaveBeenCalled();
      // The same spelling entered deliberately remains a real custom family.
      act(() => input.focus());
      fireEvent.change(input, { target: { value: label } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith(label);
    },
  );
  it("keeps long suggestion text bounded while committing the full family name", async () => {
    const family = "Bricolage Grotesque 72pt SemiCondensed";
    const onChange = vi.fn<(value: string) => void>();
    render(
      <TerminalFontPicker
        value=""
        options={[options[0]!, { id: `font:${family}`, label: family }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show font suggestions" }));
    const row = await screen.findByRole("option", { name: family });
    expect(screen.getByText(family)).toHaveClass("max-w-full", "truncate");
    fireEvent.click(row);
    expect(onChange).toHaveBeenLastCalledWith(family);
  });
});
