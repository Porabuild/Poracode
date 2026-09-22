import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { shouldConfirmContextSizeReload } from "@/renderer/state/contextSizeReloadPreference";
import { EffortContextMenu } from "./EffortContextMenu";

const CONTEXT_SIZES = [
  { id: "400k", label: "400k" },
  { id: "1m", label: "1M" },
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
