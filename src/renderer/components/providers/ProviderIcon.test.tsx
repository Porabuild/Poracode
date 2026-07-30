import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderIcon } from "./ProviderIcon";
import "./claude";
import "./codex";
import "./copilot";
import "./gemini";
import "./grok";

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

  it("uses a home profile label for the base provider icon badge", () => {
    render(<ProviderIcon kind="codex:work" fallbackLabel="Codex Work" />);

    expect(screen.getByText("W")).toBeInTheDocument();
    expect(screen.queryByText("C")).not.toBeInTheDocument();
  });

  it("uses a home profile id when no display label is provided", () => {
    render(<ProviderIcon kind="gemini:enterprise" fallbackLabel="gemini:enterprise" />);

    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.queryByText("G")).not.toBeInTheDocument();
  });

  it("strips the multiword GitHub Copilot label from a profile badge", () => {
    render(<ProviderIcon kind="copilot:work" fallbackLabel="GitHub Copilot Work" />);

    expect(screen.getByText("W")).toBeInTheDocument();
    expect(screen.queryByText("G")).not.toBeInTheDocument();
  });

  it("strips the multiword Grok Build label from a profile badge", () => {
    render(<ProviderIcon kind="grok:work" fallbackLabel="Grok Build Work" />);

    expect(screen.getByText("W")).toBeInTheDocument();
    expect(screen.queryByText("G")).not.toBeInTheDocument();
  });
});
