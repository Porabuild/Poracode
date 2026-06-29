import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
}));

import { GeneralSettings } from "./GeneralSettings";

describe("GeneralSettings", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
  });

  it("shows desktop-only editor LSP controls in local sessions", () => {
    render(<GeneralSettings />);

    expect(screen.getByText("Default new thread")).toBeInTheDocument();
    expect(screen.getByText("Home scope")).toBeInTheDocument();
    expect(screen.getByText("Editor LSP")).toBeInTheDocument();
  });

  it("hides desktop-only editor LSP controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);

    render(<GeneralSettings />);

    expect(screen.queryByText("Default new thread")).not.toBeInTheDocument();
    expect(screen.queryByText("Home scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Editor LSP")).not.toBeInTheDocument();
  });
});
