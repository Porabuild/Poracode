import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffStat } from "./DiffStat";

describe("DiffStat", () => {
  it("renders nothing when there are no changes", () => {
    const { container } = render(<DiffStat insertions={0} deletions={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides the zero side instead of rendering +42 -0", () => {
    render(<DiffStat insertions={42} deletions={0} />);
    expect(screen.getByText("+42")).toBeInTheDocument();
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
  });

  it("renders both sides", () => {
    render(<DiffStat insertions={7} deletions={3} />);
    expect(screen.getByText("+7")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });

  // The animated variant must expose the same accessible text so surfaces that
  // opt into it stay assertable and screen-reader equivalent.
  it("keeps the same text when animated", () => {
    const { container } = render(<DiffStat animated insertions={12} deletions={5} />);
    expect(container.textContent).toContain("+12");
    expect(container.textContent).toContain("-5");
  });
});
