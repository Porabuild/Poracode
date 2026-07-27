import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
}));

import { GitSettings } from "./GitSettings";

describe("GitSettings", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
  });

  it("shows desktop git review navigation controls in local sessions", () => {
    render(<GitSettings />);

    expect(screen.getByText("Git review mode")).toBeInTheDocument();
    expect(screen.getByText("Watch new pull requests")).toBeInTheDocument();
    expect(screen.getByText("Auto-merge new pull requests")).toBeInTheDocument();
  });

  it("hides desktop git review navigation controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);

    render(<GitSettings />);

    expect(screen.queryByText("Git review mode")).not.toBeInTheDocument();
    expect(screen.getByText("Default Create PR action")).toBeInTheDocument();
  });
});
