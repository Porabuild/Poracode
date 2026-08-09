import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { LARGE_DROPDOWN_VIRTUALIZATION_THRESHOLD } from "./dropdownVirtualization";
import { Select, type SelectOption } from "./Select";

const responsiveMenuState = vi.hoisted(() => ({ mobile: false }));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => responsiveMenuState.mobile,
}));

vi.mock("./ResponsiveMenuSurface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ResponsiveMenuSurface")>()),
  useResponsiveMenu: () => ({ mobile: responsiveMenuState.mobile }),
}));

const options: SelectOption[] = [
  {
    id: "alpha",
    label: "Alpha",
    icon: <span data-testid="alpha-icon" />,
    detail: "C:\\Alpha",
  },
  {
    id: "beta",
    label: "Beta",
    icon: <span data-testid="beta-icon" />,
    detail: "C:\\Beta",
  },
];

describe("Select rich options", () => {
  beforeEach(() => {
    responsiveMenuState.mobile = false;
  });

  it("renders icon and detail in the desktop trigger and selects a rich option", async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<Select aria-label="Project" options={options} value="alpha" onChange={onChange} />);

    const trigger = screen.getByLabelText("Project");
    expect(trigger).toHaveTextContent("AlphaC:\\Alpha");
    expect(trigger.querySelector('[data-testid="alpha-icon"]')).not.toBeNull();

    fireEvent.click(trigger);
    const beta = await screen.findByRole("option", { name: /Beta/u });
    expect(beta).toHaveTextContent("C:\\Beta");
    expect(beta.querySelector('[data-testid="beta-icon"]')).not.toBeNull();
    fireEvent.click(beta);

    expect(onChange).toHaveBeenCalledWith("beta");
  });

  it("renders and selects rich options in the mobile drawer", async () => {
    responsiveMenuState.mobile = true;
    const onChange = vi.fn<(value: string) => void>();
    render(<Select aria-label="Project" options={options} value="alpha" onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Project" });
    expect(trigger).toHaveTextContent("AlphaC:\\Alpha");
    fireEvent.click(trigger);

    const beta = await screen.findByRole("button", { name: /Beta/u });
    expect(beta).toHaveTextContent("C:\\Beta");
    fireEvent.click(beta);

    expect(onChange).toHaveBeenCalledWith("beta");
  });

  it("renders rich rows when the desktop list is virtualized", async () => {
    const virtualizedOptions = Array.from(
      { length: LARGE_DROPDOWN_VIRTUALIZATION_THRESHOLD + 1 },
      (_, index): SelectOption => ({
        id: `project-${index}`,
        label: `Project ${index}`,
        icon: <span data-testid={`project-${index}-icon`} />,
        detail: `C:\\Project ${index}`,
      }),
    );
    render(
      <Select
        aria-label="Project"
        options={virtualizedOptions}
        value="project-0"
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Project"));

    const first = await screen.findByRole("option", { name: /Project 0/u });
    expect(first).toHaveTextContent("C:\\Project 0");
    expect(first.querySelector('[data-testid="project-0-icon"]')).not.toBeNull();
  });
});
