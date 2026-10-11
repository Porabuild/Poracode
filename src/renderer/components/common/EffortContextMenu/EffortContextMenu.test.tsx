import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { shouldConfirmContextSizeReload } from "@/renderer/state/contextSizeReloadPreference";
import { EffortContextMenu } from "./EffortContextMenu";

const CONTEXT_SIZES = [
  { id: "400k", label: "400k" },
  { id: "1m", label: "1M" },
];

const EFFORTS = [
  { id: "low", label: "Low" },
  { id: "high", label: "High" },
];

function renderMenu(confirmContextChange: boolean) {
  const onContextChange = vi.fn<(value: string) => void>();
  render(
    <EffortContextMenu
      efforts={[]}
      contextSizes={CONTEXT_SIZES}
      contextValue="400k"
      onContextChange={onContextChange}
      confirmContextChange={confirmContextChange}
    />,
  );
  return onContextChange;
}

function pickContext(label: string) {
  fireEvent.click(screen.getByRole("button", { name: /effort and context/i }));
  fireEvent.click(screen.getByText(label));
}

/** Full pointer gesture in the browser's event order, so both the library press
 * machinery and the row activation handlers see the same interaction. */
function pointerClick(element: Element) {
  fireEvent.pointerDown(element, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.pointerUp(element, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}

describe("EffortContextMenu context-size reload confirmation", () => {
  beforeEach(() => {
    // The mobile surface renders plain buttons, which keeps the flow clickable in jsdom.
    (window as unknown as { poracode?: unknown }).poracode = { appVersion: "remote" };
    localStorage.clear();
  });
  afterEach(() => {
    delete (window as unknown as { poracode?: unknown }).poracode;
    localStorage.clear();
  });

  it("applies the change only after the user confirms", async () => {
    const onContextChange = renderMenu(true);

    pickContext("1M");

    expect(await screen.findByText("Change context size to 1M?")).toBeInTheDocument();
    expect(onContextChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onContextChange).toHaveBeenCalledWith("1m");
    expect(shouldConfirmContextSizeReload()).toBe(true);
  });

  it("keeps the current size when the user cancels", async () => {
    const onContextChange = renderMenu(true);

    pickContext("1M");
    await screen.findByText("Change context size to 1M?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onContextChange).not.toHaveBeenCalled();
  });

  it("stops asking after Don't show again", async () => {
    const onContextChange = renderMenu(true);

    pickContext("1M");
    await screen.findByText("Change context size to 1M?");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    expect(onContextChange).toHaveBeenCalledWith("1m");
    expect(shouldConfirmContextSizeReload()).toBe(false);
  });

  it("applies silently when no confirmation is requested", () => {
    const onContextChange = renderMenu(false);

    pickContext("1M");

    expect(onContextChange).toHaveBeenCalledWith("1m");
    expect(screen.queryByText("Change context size to 1M?")).not.toBeInTheDocument();
  });
});

describe("EffortContextMenu deliberate same-value activation", () => {
  it("forwards an equal effort reselect from the desktop listbox", async () => {
    const onEffortChange = vi.fn<(value: string) => void>();
    render(
      <EffortContextMenu
        efforts={EFFORTS}
        effortValue="high"
        onEffortChange={onEffortChange}
        contextSizes={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /effort and context/i }));
    pointerClick(await screen.findByRole("option", { name: "High" }));

    expect(onEffortChange).toHaveBeenCalledTimes(1);
    expect(onEffortChange).toHaveBeenCalledWith("high");
  });

  it("forwards a changed effort selection exactly once alongside the activation channel", async () => {
    const onEffortChange = vi.fn<(value: string) => void>();
    render(
      <EffortContextMenu
        efforts={EFFORTS}
        effortValue="high"
        onEffortChange={onEffortChange}
        contextSizes={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /effort and context/i }));
    pointerClick(await screen.findByRole("option", { name: "Low" }));

    expect(onEffortChange).toHaveBeenCalledTimes(1);
    expect(onEffortChange).toHaveBeenCalledWith("low");
  });

  it("forwards an equal effort reselect from the desktop listbox keyboard", async () => {
    const onEffortChange = vi.fn<(value: string) => void>();
    render(
      <EffortContextMenu
        efforts={EFFORTS}
        effortValue="high"
        onEffortChange={onEffortChange}
        contextSizes={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /effort and context/i }));
    const listbox = await screen.findByRole("listbox", { name: "Reasoning" });
    listbox.focus();
    // Walk the active row onto the already-selected High tier, then re-activate
    // it: the library suppresses the equal selection, the item activation
    // channel must still deliver it.
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    const activeRow = document.activeElement;
    expect(activeRow?.getAttribute("role")).toBe("option");
    fireEvent.keyDown(activeRow as Element, { key: "Enter" });
    fireEvent.keyUp(activeRow as Element, { key: "Enter" });

    expect(onEffortChange).toHaveBeenCalledWith("high");
  });

  it("forwards an equal context reselect without the reload confirmation", async () => {
    localStorage.clear();
    const onContextChange = vi.fn<(value: string) => void>();
    render(
      <EffortContextMenu
        efforts={[]}
        contextSizes={CONTEXT_SIZES}
        contextValue="400k"
        onContextChange={onContextChange}
        confirmContextChange
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /effort and context/i }));
    pointerClick(await screen.findByRole("option", { name: "400k" }));

    expect(onContextChange).toHaveBeenCalledTimes(1);
    expect(onContextChange).toHaveBeenCalledWith("400k");
    expect(screen.queryByText(/Change context size/i)).not.toBeInTheDocument();
  });

  it("forwards an equal effort reselect from the mobile section buttons", () => {
    (window as unknown as { poracode?: unknown }).poracode = { appVersion: "remote" };
    const onEffortChange = vi.fn<(value: string) => void>();
    render(
      <EffortContextMenu
        efforts={EFFORTS}
        effortValue="high"
        onEffortChange={onEffortChange}
        contextSizes={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /effort and context/i }));
    fireEvent.click(screen.getByRole("button", { name: "High" }));

    expect(onEffortChange).toHaveBeenCalledTimes(1);
    expect(onEffortChange).toHaveBeenCalledWith("high");
  });
});
