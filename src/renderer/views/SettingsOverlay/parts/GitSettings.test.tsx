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
    expect(screen.getByText("Default PR automation")).toBeInTheDocument();
    expect(screen.getByText("Merge method")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Default PR automation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Merge method/ })).toBeInTheDocument();
    expect(screen.getByText("Auto Fix")).toBeInTheDocument();
    expect(screen.getByText("Auto Merge")).toBeInTheDocument();
  });

  it("hides desktop git review navigation controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);

    render(<GitSettings />);

    expect(screen.queryByText("Git review mode")).not.toBeInTheDocument();
    expect(screen.getByText("Default Create PR action")).toBeInTheDocument();
  });
});
