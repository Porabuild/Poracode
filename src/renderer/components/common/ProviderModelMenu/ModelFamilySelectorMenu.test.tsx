import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ModelFamilySelectorMenu } from "./ModelFamilySelectorMenu";

const options = [
  { id: "a", label: "Alpha", hint: "Low" },
  { id: "b", label: "Beta", hint: "High" },
  { id: "c", label: "Gamma" },
];

function renderMenu(
  props: {
    value?: string;
    isDisabled?: boolean;
    onChange?: (value: string) => void;
    onOpenChange?: (open: boolean) => void;
  } = {},
) {
  const {
    value = "a",
    isDisabled,
    onChange = vi.fn<(value: string) => void>(),
    onOpenChange,
  } = props;
  render(
    <ModelFamilySelectorMenu
      label="Main"
      icon={<span data-testid="selector-icon" />}
      options={options}
      value={value}
      onChange={onChange}
      {...(isDisabled !== undefined ? { isDisabled } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    />,
  );
  return { onChange, onOpenChange };
}

function mouseClick(element: Element) {
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}
/** Full pointer gesture on the document in the browser's event order, so the
 * overlay's interact-outside machinery sees a real outside press. */
function pressOutside() {
  fireEvent.pointerDown(document.body, { button: 0, pointerId: 1, pointerType: "mouse" });
  fireEvent.mouseDown(document.body, { button: 0 });
  fireEvent.pointerUp(document.body, { button: 0, pointerId: 1, pointerType: "mouse" });
  fireEvent.mouseUp(document.body, { button: 0 });
  fireEvent.click(document.body, { button: 0 });
}

async function openDesktopMenu() {
  mouseClick(screen.getByRole("button", { name: "Main" }));
  const search = await screen.findByPlaceholderText("Search models...");
  // The popover focuses its search field asynchronously after opening.
  await waitFor(() => expect(search).toHaveFocus());
  return search;
}

beforeEach(() => {
  delete (window as unknown as { poracode?: unknown }).poracode;
});
afterEach(() => {
  delete (window as unknown as { poracode?: unknown }).poracode;
});

describe("ModelFamilySelectorMenu", () => {
  it("shows the selected option display above the selector label", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Main" });
    expect(trigger).toHaveTextContent("Alpha · Low");
    expect(trigger).toHaveTextContent("Main");
    expect(screen.getByTestId("selector-icon")).toBeInTheDocument();
  });

  it("falls back to the raw value when it is not among the options", () => {
    renderMenu({ value: "unknown-member" });
    expect(screen.getByRole("button", { name: "Main" })).toHaveTextContent("unknown-member");
  });

  it("opens with the search focused, names the selector, and filters by label and hint", async () => {
    renderMenu();
    const search = await openDesktopMenu();
    expect(document.querySelector(".poracode-model-menu-header")).toHaveTextContent("Main");
    expect(document.querySelector(".m-sheet-head")).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.change(search, { target: { value: "gam" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Gamma"]);
    fireEvent.change(search, { target: { value: "high" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Beta· High",
    ]);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("No models found")).toBeInTheDocument();
  });

  it("selects with ArrowDown then Enter and closes", async () => {
    const { onChange } = renderMenu();
    const search = await openDesktopMenu();
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(search).not.toBeInTheDocument());
    expect(onChange).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("selects on click and closes", async () => {
    const { onChange } = renderMenu();
    const search = await openDesktopMenu();
    mouseClick(screen.getByRole("option", { name: /Gamma/ }));
    await waitFor(() => expect(search).not.toBeInTheDocument());
    expect(onChange).toHaveBeenCalledExactlyOnceWith("c");
  });

  it("forwards a deliberate re-pick of the current value to the owner", async () => {
    const { onChange } = renderMenu();
    const search = await openDesktopMenu();
    const current = screen.getByRole("option", { name: /Alpha/ });
    expect(current).toHaveAttribute("aria-selected", "true");
    mouseClick(current);
    await waitFor(() => expect(search).not.toBeInTheDocument());
    expect(onChange).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("closes on Escape without selecting", async () => {
    const { onChange } = renderMenu();
    const search = await openDesktopMenu();
    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(search).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("notifies open changes", async () => {
    const { onOpenChange } = renderMenu({
      onOpenChange: vi.fn<(open: boolean) => void>(),
    });
    const search = await openDesktopMenu();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(false));
  });

  it("closes on an outside press after the search field took focus", async () => {
    renderMenu();
    const search = await openDesktopMenu();
    pressOutside();
    await waitFor(() => expect(search).not.toBeInTheDocument());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("stays disabled while configuration is disabled", () => {
    const { onChange } = renderMenu({ isDisabled: true });
    const trigger = screen.getByRole("button", { name: "Main" });
    expect(trigger).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens the labeled sheet on mobile without autofocusing search", async () => {
    (window as unknown as { poracode?: unknown }).poracode = { appVersion: "remote" };
    const { onChange } = renderMenu();
    mouseClick(screen.getByRole("button", { name: "Main" }));
    expect(document.querySelector(".m-sheet-head")).toHaveTextContent("Main");
    // No `m-sheet--model-picker`: that variant drops the safe-area bottom
    // padding because the picker's virtual list owns the clearance; this
    // plain list keeps the base sheet's padding instead.
    expect(document.querySelector(".m-sheet")).not.toHaveClass("m-sheet--model-picker");
    const search = await screen.findByPlaceholderText("Search models...");
    expect(search).not.toHaveFocus();
    act(() => search.focus());
    fireEvent.change(search, { target: { value: "bet" } });
    mouseClick(await screen.findByRole("option", { name: /Beta/ }));
    await waitFor(() => expect(search).not.toBeInTheDocument());
    expect(onChange).toHaveBeenCalledExactlyOnceWith("b");
  });
});
