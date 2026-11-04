import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MultiSelect } from "./MultiSelect";

const responsiveMenuState = vi.hoisted(() => ({ mobile: false }));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => responsiveMenuState.mobile,
}));

vi.mock("./ResponsiveMenuSurface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ResponsiveMenuSurface")>()),
  useResponsiveMenu: () => ({ mobile: responsiveMenuState.mobile }),
}));

const options = [
  { id: "alpha", label: "Alpha" },
  { id: "beta", label: "Beta" },
];

describe("MultiSelect", () => {
  beforeEach(() => {
    responsiveMenuState.mobile = false;
  });

  it.each([false, true])("toggles options without closing (mobile=%s)", async (mobile) => {
    responsiveMenuState.mobile = mobile;
    const onChange = vi.fn<(value: string[]) => void>();
    render(
      <MultiSelect
        aria-label="Letters"
        options={options}
        value={["alpha", "stale"]}
        summary="Alpha"
        onChange={onChange}
      />,
    );

    const trigger = screen.getByLabelText("Letters");
    expect(trigger).toHaveTextContent("Alpha");
    fireEvent.click(trigger);

    const role = mobile ? "button" : "option";
    fireEvent.click(await screen.findByRole(role, { name: "Beta" }));
    expect(onChange).toHaveBeenLastCalledWith(["alpha", "beta"]);

    fireEvent.click(await screen.findByRole(role, { name: "Alpha" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
