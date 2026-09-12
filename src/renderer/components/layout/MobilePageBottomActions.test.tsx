import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MobilePageActionScope } from "./MobilePageActionScope";
import { MobilePageBottomAction, MobilePageBottomBar } from "./MobilePageBottomActions";

describe("MobilePageBottomActions", () => {
  it("keeps actions with their own page's bottom bar", () => {
    render(
      <>
        <MobilePageActionScope>
          <div data-page="underlay">
            <MobilePageBottomBar>
              <div>Underlay tabs</div>
            </MobilePageBottomBar>
            <MobilePageBottomAction side="left">
              <button type="button">Search</button>
            </MobilePageBottomAction>
          </div>
        </MobilePageActionScope>
        <MobilePageActionScope>
          <div data-page="topmost">
            <MobilePageBottomBar>
              <div>Topmost tabs</div>
            </MobilePageBottomBar>
            <MobilePageBottomAction side="right">
              <button type="button">Collapse</button>
            </MobilePageBottomAction>
          </div>
        </MobilePageActionScope>
      </>,
    );

    const search = screen.getByRole("button", { name: "Search" });
    const collapse = screen.getByRole("button", { name: "Collapse" });
    expect(search.parentElement?.getAttribute("data-poracode-mobile-page-bottom-action")).toMatch(
      /:left$/,
    );
    expect(collapse.parentElement?.getAttribute("data-poracode-mobile-page-bottom-action")).toMatch(
      /:right$/,
    );
    expect(search.closest("[data-page]")).toHaveAttribute("data-page", "underlay");
    expect(collapse.closest("[data-page]")).toHaveAttribute("data-page", "topmost");
  });
});
