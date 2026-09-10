import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  setConfirmThreadDelete,
  shouldConfirmThreadDelete,
} from "@/renderer/state/threadDeletePreference";

const bridgeMock = vi.hoisted(() => ({
  isMac: vi.fn<() => boolean>(() => false),
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

vi.mock("@/renderer/bridge", () => ({
  isMac: bridgeMock.isMac,
  isRemoteSession: bridgeMock.isRemoteSession,
}));

import { ThreadSettings } from "./ThreadSettings";

describe("ThreadSettings", () => {
  beforeEach(() => {
    bridgeMock.isMac.mockReturnValue(false);
    bridgeMock.isRemoteSession.mockReturnValue(false);
    localStorage.clear();
    useSharedSettings.setState({ followUpBehavior: "steer" });
  });

  it("shows desktop thread lifecycle controls in local sessions", () => {
    render(<ThreadSettings />);

    expect(screen.getByText("Unload idle threads after")).toBeInTheDocument();
    expect(screen.getByText("Auto-archive done threads after")).toBeInTheDocument();
    expect(screen.getByText("Default thread removal")).toBeInTheDocument();
    expect(screen.getByText("Confirm before deleting threads")).toBeInTheDocument();
    expect(screen.getByText("Follow-up behavior")).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+Enter uses the opposite action/u)).toBeInTheDocument();
  });

  it("hides desktop thread lifecycle controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);

    render(<ThreadSettings />);

    expect(screen.queryByText("Unload idle threads after")).not.toBeInTheDocument();
    expect(screen.queryByText("Auto-archive done threads after")).not.toBeInTheDocument();
    expect(screen.queryByText("Default thread removal")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirm before deleting threads")).not.toBeInTheDocument();
    expect(screen.getByText("Follow-up behavior")).toBeInTheDocument();
  });

  it("lets users choose the queued follow-up action", async () => {
    render(<ThreadSettings />);

    fireEvent.click(screen.getByLabelText("Follow-up behavior"));
    fireEvent.click(await screen.findByRole("option", { name: "Queue" }));

    expect(useSharedSettings.getState().followUpBehavior).toBe("queue");
  });

  it("uses the Mac shortcut label on macOS", () => {
    bridgeMock.isMac.mockReturnValue(true);

    render(<ThreadSettings />);

    expect(screen.getByText(/Cmd\+Enter uses the opposite action/u)).toBeInTheDocument();
  });

  it("lets users restore the delete confirmation", () => {
    setConfirmThreadDelete(false);
    render(<ThreadSettings />);

    const confirmation = screen.getByRole("switch", {
      name: "Confirm before deleting threads",
    });
    expect(confirmation).not.toBeChecked();

    fireEvent.click(confirmation);

    expect(confirmation).toBeChecked();
    expect(shouldConfirmThreadDelete()).toBe(true);
  });
});
