import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MobilePageActionScope } from "./MobilePageActionScope";
import { MobilePageHeaderActions, MobilePageHeaderActionsSlot } from "./MobilePageHeaderActions";

describe("MobilePageHeaderActions", () => {
  it("keeps actions with their own page header", () => {
    render(
      <>
        <MobilePageActionScope>
          <div data-page="underlay">
            <MobilePageHeaderActionsSlot />
            <MobilePageHeaderActions>
              <button type="button">Refresh</button>
            </MobilePageHeaderActions>
          </div>
        </MobilePageActionScope>
        <MobilePageActionScope>
          <div data-page="topmost">
            <MobilePageHeaderActionsSlot />
            <MobilePageHeaderActions>
              <button type="button">Save</button>
            </MobilePageHeaderActions>
          </div>
        </MobilePageActionScope>
      </>,
    );

    expect(screen.getByRole("button", { name: "Refresh" }).closest("[data-page]")).toHaveAttribute(
      "data-page",
      "underlay",
    );
    expect(screen.getByRole("button", { name: "Save" }).closest("[data-page]")).toHaveAttribute(
      "data-page",
      "topmost",
    );
  });
});
