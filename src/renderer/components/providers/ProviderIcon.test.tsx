import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderIcon } from "./ProviderIcon";
import "./claude";

describe("ProviderIcon", () => {
  it("uses the Claude profile label for the profile badge initial", () => {
    render(<ProviderIcon kind="claude:home" fallbackLabel="Claude Home" />);

    expect(screen.getByText("H")).toBeInTheDocument();
    expect(screen.queryByText("C")).not.toBeInTheDocument();
  });
});
