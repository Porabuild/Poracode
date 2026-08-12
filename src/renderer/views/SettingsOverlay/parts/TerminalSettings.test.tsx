import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
}));

import { TerminalSettings } from "./TerminalSettings";

describe("TerminalSettings", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
  });

  it("shows desktop panel controls in local sessions", () => {
    render(<TerminalSettings />);

    expect(screen.getByText("Terminal position")).toBeInTheDocument();
    expect(screen.getByText("Auto-show terminal panel")).toBeInTheDocument();
    expect(screen.getByText("Browser pick target (CLI threads)")).toBeInTheDocument();
  });

  it("hides desktop panel controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);

    render(<TerminalSettings />);

    expect(screen.queryByText("Terminal position")).not.toBeInTheDocument();
    expect(screen.queryByText("Auto-show terminal panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Browser pick target (CLI threads)")).not.toBeInTheDocument();
    expect(screen.queryByText("Collapse terminal composer")).not.toBeInTheDocument();
    expect(screen.getByText("Agent terminal font size")).toBeInTheDocument();
    expect(screen.getByText("Terminal panel font size")).toBeInTheDocument();
    expect(screen.getByText("Terminal scroll speed")).toBeInTheDocument();
  });
});
