// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { PrReactionAdd } from "./PrReactions";

const layout = vi.hoisted(() => ({ compact: false }));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => layout.compact }));

const ALL = ["+1", "-1", "laugh", "hooray", "confused", "heart", "rocket", "eyes"];

function open() {
  const onToggle = vi.fn<(content: string, reacted: boolean) => void>();
  render(
    <PrReactionAdd
      reactions={[]}
      supported={ALL}
      disabled={false}
      pending={new Set()}
      onToggle={onToggle}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add reaction" }));
  return onToggle;
}

describe("PrReactions picker", () => {
  it("lays the eight reactions out as a wrapping grid that stays inside the viewport", async () => {
    open();

    const grid = await screen.findByTestId("reaction-picker-grid");
    expect(grid).toHaveClass("grid", "grid-cols-4");
    expect(grid.querySelectorAll("button")).toHaveLength(8);
    expect(document.querySelector("[data-placement]")?.className).toContain(
      "max-w-[calc(100vw-2rem)]",
    );
  });

  it("uses touch-sized cells in the compact layout", async () => {
    layout.compact = true;
    open();

    const grid = await screen.findByTestId("reaction-picker-grid");
    for (const cell of grid.querySelectorAll("button")) {
      expect(cell).toHaveClass("size-12");
    }
    // The compact picker is the app's bottom sheet, not a popover.
    expect(document.querySelector(".m-sheet")).not.toBeNull();
    layout.compact = false;
  });

  it("toggles the picked reaction and closes the picker", async () => {
    const onToggle = open();

    fireEvent.click(await screen.findByRole("button", { name: "Rocket" }));

    expect(onToggle).toHaveBeenCalledWith("rocket", true);
  });
});
