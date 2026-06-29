import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
}));

import { ThreadSettings } from "./ThreadSettings";

describe("ThreadSettings", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
  });

  it("shows desktop thread lifecycle controls in local sessions", () => {
    render(<ThreadSettings />);

    expect(screen.getByText("Unload idle threads after")).toBeInTheDocument();
    expect(screen.getByText("Auto-archive done threads after")).toBeInTheDocument();
    expect(screen.getByText("Default thread removal")).toBeInTheDocument();
  });

  it("hides desktop thread lifecycle controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);

    render(<ThreadSettings />);

    expect(screen.queryByText("Unload idle threads after")).not.toBeInTheDocument();
    expect(screen.queryByText("Auto-archive done threads after")).not.toBeInTheDocument();
    expect(screen.queryByText("Default thread removal")).not.toBeInTheDocument();
  });
});
