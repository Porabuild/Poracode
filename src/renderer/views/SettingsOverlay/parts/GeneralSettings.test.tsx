import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
  isWindows: vi.fn<() => boolean>(() => true),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
  isWindows: bridgeMock.isWindows,
}));

import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { GeneralSettings } from "./GeneralSettings";

describe("GeneralSettings", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
    bridgeMock.isWindows.mockReturnValue(true);
    useSharedSettings.setState({ launchAtStartup: true, startMinimized: true });
  });

  it("shows desktop-only editor LSP controls in local sessions", () => {
    render(<GeneralSettings />);

    expect(screen.getByText("Default new thread")).toBeInTheDocument();
    expect(screen.getByText("Home scope")).toBeInTheDocument();
    expect(screen.getByText("Launch at startup")).toBeInTheDocument();
    expect(screen.getByText("Start minimized")).toBeInTheDocument();
    expect(screen.getByText("Editor LSP")).toBeInTheDocument();
  });

  it("persists the Windows startup preferences", () => {
    render(<GeneralSettings />);

    const launch = screen.getByRole("switch", { name: "Launch at startup" });
    const minimized = screen.getByRole("switch", { name: "Start minimized" });
    expect(launch).toBeChecked();
    expect(minimized).toBeChecked();

    fireEvent.click(launch);
    fireEvent.click(minimized);

    expect(useSharedSettings.getState().launchAtStartup).toBe(false);
    expect(useSharedSettings.getState().startMinimized).toBe(false);
  });

  it("hides Windows startup controls on other desktop platforms", () => {
    bridgeMock.isWindows.mockReturnValue(false);

    render(<GeneralSettings />);

    expect(screen.queryByText("Launch at startup")).not.toBeInTheDocument();
    expect(screen.queryByText("Start minimized")).not.toBeInTheDocument();
  });

  it("hides desktop-only editor LSP controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);

    render(<GeneralSettings />);

    expect(screen.queryByText("Default new thread")).not.toBeInTheDocument();
    expect(screen.queryByText("Home scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Launch at startup")).not.toBeInTheDocument();
    expect(screen.queryByText("Start minimized")).not.toBeInTheDocument();
    expect(screen.queryByText("Editor LSP")).not.toBeInTheDocument();
  });
});
