import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig } from "@/shared/contracts";

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => ({
  Button: (props: {
    children?: ReactNode;
    "aria-label"?: string;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      disabled={props.isDisabled}
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
  toast: toastMock,
}));

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    placeholder?: string;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
}));

const refreshAgentStatusesMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ refreshAgentStatuses: refreshAgentStatusesMock }),
}));

vi.mock("@/renderer/utils/acpRegistryAuth", () => ({
  currentWslDistros: () => [],
}));

const settingsState = {
  agentInstances: {} as Record<string, AgentInstanceConfig>,
  setAgentInstance: vi.fn<(instance: AgentInstanceConfig) => void>(),
  removeAgentInstance: vi.fn<(id: string) => void>(),
};

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
}));

import { ClaudeProfileSettings } from "./ClaudeProfileSettings";

describe("ClaudeProfileSettings", () => {
  beforeEach(() => {
    settingsState.agentInstances = {};
    settingsState.setAgentInstance.mockReset();
    settingsState.removeAgentInstance.mockReset();
    refreshAgentStatusesMock.mockReset().mockResolvedValue();
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
  });

  it("hides the add form until the add button is pressed", () => {
    render(<ClaudeProfileSettings />);
    expect(screen.queryByLabelText("New Claude profile name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));

    expect(screen.getByLabelText("New Claude profile name")).toHaveValue("");
    expect(screen.getByLabelText("New Claude profile name")).toHaveAttribute(
      "placeholder",
      "e.g. Work",
    );
    expect(screen.getByLabelText("New Claude profile config directory")).toHaveAttribute(
      "placeholder",
      "~/.lightcode/claude-profiles/profile",
    );
  });

  it("disables Add until a name is typed and derives the dir placeholder from it", () => {
    render(<ClaudeProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));

    const addButton = screen.getByRole("button", { name: "Add Claude profile" });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("New Claude profile name"), {
      target: { value: "Work" },
    });

    expect(addButton).toBeEnabled();
    expect(screen.getByLabelText("New Claude profile config directory")).toHaveAttribute(
      "placeholder",
      "~/.lightcode/claude-profiles/work",
    );
  });

  it("adds a profile with the derived config dir when the dir is left empty", () => {
    render(<ClaudeProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText("New Claude profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Claude profile" }));

    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      id: "work",
      driver: "claude",
      displayName: "Work",
      config: { configDir: "~/.lightcode/claude-profiles/work" },
    });
    // The form collapses back to the add button after a successful add.
    expect(screen.queryByLabelText("New Claude profile name")).not.toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith("Claude Work profile added.");
  });

  it("discards the draft on cancel", () => {
    render(<ClaudeProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText("New Claude profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel new Claude profile" }));

    expect(screen.queryByLabelText("New Claude profile name")).not.toBeInTheDocument();
    expect(settingsState.setAgentInstance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    expect(screen.getByLabelText("New Claude profile name")).toHaveValue("");
  });
});
