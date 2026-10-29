import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import type { UserInputOption } from "@/shared/contracts";
import { QuestionRows } from "./QuestionRows";

const options = [
  { optionId: "first", label: "First" },
  { optionId: "second", label: "Second" },
];

function renderChoices(
  multiSelect = false,
  isDisabled = false,
  rowOptions: readonly UserInputOption[] = options,
) {
  const onSubmit = vi.fn<(ids: readonly string[]) => void>();
  return {
    ...render(
      <AppProvider>
        <QuestionRows
          options={rowOptions}
          multiSelect={multiSelect}
          isDisabled={isDisabled}
          onSubmit={onSubmit}
        />
      </AppProvider>,
    ),
    onSubmit,
  };
}

describe("QuestionRows keyboard choices", () => {
  it("navigates in both directions and activates the numbered answer", () => {
    const { getByRole, onSubmit } = renderChoices();
    const first = getByRole("option", { name: /First/ });
    const second = getByRole("option", { name: /Second/ });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: "ArrowDown" });
    expect(document.activeElement).toBe(first);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(first, { key: "2" });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(["second"]);
  });

  it("toggles numbered choices in multi-select without submitting", () => {
    const { getByRole, onSubmit } = renderChoices(true);
    const first = getByRole("option", { name: /First/ });
    const second = getByRole("option", { name: /Second/ });
    fireEvent.keyDown(first, { key: "1" });
    fireEvent.keyDown(first, { key: "2" });
    fireEvent.keyDown(second, { key: "2", repeat: true });
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(["first", "second"]);
  });

  it("does not activate disabled options", () => {
    const { getByRole, onSubmit } = renderChoices(false, true);
    fireEvent.keyDown(getByRole("option", { name: /First/ }), { key: "2" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps option keyboard shortcuts available from the shared footer", () => {
    const { getByRole, onSubmit } = renderChoices(true);
    const first = getByRole("option", { name: /First/ });
    const second = getByRole("option", { name: /Second/ });
    fireEvent.click(first);
    const submit = getByRole("button", { name: "Submit" });
    submit.focus();
    fireEvent.keyDown(submit, { key: "ArrowUp" });
    expect(document.activeElement).toBe(second);
    submit.focus();
    fireEvent.keyDown(submit, { key: "2" });
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(["first", "second"]);
  });
});

describe("QuestionRows option tooltips", () => {
  it("shows the full clipped label on hover", async () => {
    const label =
      "Rust, Apache-2.0. Measured 51 MB private memory and 0 ms idle CPU when connected to a separate server. Fullscreen by default, with inline mode available.";
    renderChoices(false, false, [{ optionId: "rust", label }]);
    const labelSpan = screen.getByText(label);
    vi.spyOn(labelSpan, "scrollWidth", "get").mockReturnValue(400);
    vi.spyOn(labelSpan, "clientWidth", "get").mockReturnValue(100);

    fireEvent.pointerMove(document.body, { pointerType: "mouse" });
    fireEvent.pointerEnter(screen.getByRole("option", { name: label }), {
      pointerType: "mouse",
    });

    expect(await screen.findByRole("tooltip")).toHaveTextContent(label);
  });

  it("does not show a tooltip for a label that fits", async () => {
    vi.useFakeTimers();
    try {
      const label = "Short answer";
      renderChoices(false, false, [{ optionId: "short", label }]);
      const labelSpan = screen.getByText(label);
      const scrollWidth = vi.spyOn(labelSpan, "scrollWidth", "get").mockReturnValue(100);
      vi.spyOn(labelSpan, "clientWidth", "get").mockReturnValue(100);

      fireEvent.pointerMove(document.body, { pointerType: "mouse" });
      fireEvent.pointerEnter(screen.getByRole("option", { name: label }), {
        pointerType: "mouse",
      });
      await act(() => vi.advanceTimersByTime(1000));

      expect(scrollWidth).toHaveBeenCalled();
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a described option's label and description even when the label fits", async () => {
    const label = "Rust";
    const description = "A fast, memory-efficient systems language.";
    renderChoices(false, false, [{ optionId: "rust", label, description }]);
    const labelSpan = screen.getByText(label);
    vi.spyOn(labelSpan, "scrollWidth", "get").mockReturnValue(100);
    vi.spyOn(labelSpan, "clientWidth", "get").mockReturnValue(100);

    fireEvent.pointerMove(document.body, { pointerType: "mouse" });
    fireEvent.pointerEnter(screen.getByRole("option", { name: /Rust/ }), {
      pointerType: "mouse",
    });

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(label);
    expect(tooltip).toHaveTextContent(description);
  });
});
