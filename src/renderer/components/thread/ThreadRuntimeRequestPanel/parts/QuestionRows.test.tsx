import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { QuestionRows } from "./QuestionRows";

const options = [
  { optionId: "first", label: "First" },
  { optionId: "second", label: "Second" },
];

function renderChoices(multiSelect = false, isDisabled = false) {
  const onSubmit = vi.fn<(ids: readonly string[]) => void>();
  return {
    ...render(
      <AppProvider>
        <QuestionRows
          options={options}
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
