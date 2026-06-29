import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

vi.mock("@/renderer/bridge", () => ({
  isMac: () => false,
  isRemoteSession: bridgeMock.isRemoteSession,
}));

import { AppearanceSettings } from "./AppearanceSettings";

describe("AppearanceSettings", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
  });

  it("shows desktop sidebar glass controls in local sessions", () => {
    render(<AppearanceSettings />);

    expect(screen.getByText("Translucent sidebar")).toBeInTheDocument();
  });

  it("hides desktop sidebar glass controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);

    render(<AppearanceSettings />);

    expect(screen.queryByText("Translucent sidebar")).not.toBeInTheDocument();
    expect(screen.getByText("GUI chat font size")).toBeInTheDocument();
  });
});
