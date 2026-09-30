import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

// Render the menu inline so the list is in the DOM whenever it is "open".
vi.mock("@/renderer/components/common/ResponsiveMenuSurface", () => ({
  ResponsiveMenuSurface: (props: { isOpen: boolean; trigger: ReactNode; children: ReactNode }) => (
    <div>
      {props.trigger}
      {props.isOpen ? <div data-testid="menu">{props.children}</div> : null}
    </div>
  ),
}));

import { SearchableSelect } from "./SearchableSelect";

const OPTIONS = [
  { value: "all", label: "All folders" },
  { value: "F:\\repo", label: "repo", hint: "F:\\repo" },
  { value: "F:\\other", label: "other", hint: "F:\\other" },
];

describe("SearchableSelect", () => {
  it("shows the current label and opens a searchable list", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<SearchableSelect label="Folder" value="all" options={OPTIONS} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Folder" })).toHaveTextContent("All folders");
    expect(screen.queryByTestId("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Folder" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);

    fireEvent.change(screen.getByLabelText("Search Folder"), { target: { value: "oth" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("other");
  });

  it("selects an option on click and closes", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<SearchableSelect label="Folder" value="all" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Folder" }));
    fireEvent.click(screen.getByText("repo"));

    expect(onChange).toHaveBeenCalledWith("F:\\repo");
    expect(screen.queryByTestId("menu")).not.toBeInTheDocument();
  });

  it("selects the first match on Enter", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<SearchableSelect label="Folder" value="all" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Folder" }));
    fireEvent.change(screen.getByLabelText("Search Folder"), { target: { value: "rep" } });
    fireEvent.keyDown(screen.getByLabelText("Search Folder"), { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("F:\\repo");
  });
});
