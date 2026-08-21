import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderIcon } from "./ProviderIcon";
import "./claude";
import "./cursor";

describe("ProviderIcon", () => {
  it("uses the ACP instance id for generic fallback initials", () => {
    render(<ProviderIcon kind="acp-generic:example-agent" />);

    expect(screen.getByText("E")).toBeInTheDocument();
  });

  it("uses the Claude profile label for the profile badge initial", () => {
    render(<ProviderIcon kind="claude:home" fallbackLabel="Claude Home" />);

    expect(screen.getByText("H")).toBeInTheDocument();
    expect(screen.queryByText("C")).not.toBeInTheDocument();
  });

  it("uses the Claude profile id for the badge when no display label is provided", () => {
    render(<ProviderIcon kind="claude:personal" fallbackLabel="claude:personal" />);

    expect(screen.getByText("P")).toBeInTheDocument();
    expect(screen.queryByText("C")).not.toBeInTheDocument();
  });

  it("badges a Cursor profile with its own initial", () => {
    render(<ProviderIcon kind="cursor:work" fallbackLabel="Cursor Work" />);

    expect(screen.getByText("W")).toBeInTheDocument();
  });

  it("falls back to the first character of a non-latin profile name", () => {
    render(<ProviderIcon kind="cursor:rabota" fallbackLabel="Cursor Работа" />);

    // A latin-only match would leave every non-latin profile sharing "?".
    expect(screen.getByText("Р")).toBeInTheDocument();
    expect(screen.queryByText("?")).not.toBeInTheDocument();
  });
});
