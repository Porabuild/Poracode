import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MobilePageHeader } from "./MobilePageHeader";

describe("MobilePageHeader", () => {
  it("uses the shared home geometry for the centered title and trailing actions", () => {
    render(
      <MobilePageHeader
        variant="home"
        title="Poracode"
        onTitleClick={vi.fn<() => void>()}
        trailing={<button type="button">Filter</button>}
      />,
    );

    const title = screen.getByRole("button", { name: "Poracode" });
    const header = title.closest(".poracode-mobile-header");
    expect(header).toHaveAttribute("data-variant", "home");
    expect(title).not.toHaveClass("poracode-overlay-header__controls");
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
  });

  it("includes a standard page title in the back button hit target", () => {
    const onBack = vi.fn<() => void>();
    render(<MobilePageHeader variant="page" title="Settings" onBack={onBack} />);

    const title = screen.getByText("Settings");
    const header = title.closest(".poracode-mobile-header");
    const back = screen.getByRole("button", { name: "Return to app" });
    expect(header).toHaveAttribute("data-variant", "page");
    expect(title.closest("button")).toBe(back);
    fireEvent.click(title);
    expect(onBack).toHaveBeenCalledOnce();
    expect(document.getElementById("poracode-mobile-page-header-actions")).not.toBeNull();
  });
});
