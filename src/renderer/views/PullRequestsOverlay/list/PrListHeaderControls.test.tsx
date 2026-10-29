// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { PrListController } from "./usePrListController";
import { PrListHeaderControls } from "./PrListHeaderControls";

describe("PrListHeaderControls", () => {
  it("routes sort and refresh actions through the shared controller", async () => {
    const setSort = vi.fn<PrListController["setSort"]>();
    const refresh = vi.fn<() => void>();
    const controller = {
      sort: "updated",
      setSort,
      data: { loading: false, refresh },
    } as unknown as PrListController;
    render(<PrListHeaderControls controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Sort pull requests" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Largest" }));
    expect(setSort).toHaveBeenCalledWith("largest");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
