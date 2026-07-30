import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { msg } from "@lingui/core/macro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

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
const statusState = {
  removeAgentStatus: vi.fn<(kind: string) => void>(),
};

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
}));

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: typeof statusState) => unknown) =>
    selector(statusState),
}));

import {
  HomeProfileProviderSettings,
  HomeProfileSettings,
  type HomeProfileProviderConfig,
} from "./HomeProfileSettings";

const CODEX_CONFIG: HomeProfileProviderConfig = {
  driver: "codex",
  providerName: msg`Codex`,
};

function codexProfile(overrides: Partial<AgentInstanceConfig> = {}): AgentInstanceConfig {
  return {
    id: "work",
    driver: "codex",
    displayName: "Work",
    config: { homeDir: "~/.poracode/codex-profiles/work" },
    ...overrides,
  };
}

describe("HomeProfileSettings", () => {
  beforeEach(() => {
    settingsState.agentInstances = {};
    settingsState.setAgentInstance.mockReset();
    settingsState.removeAgentInstance.mockReset();
    statusState.removeAgentStatus.mockReset();
    refreshAgentStatusesMock.mockReset().mockResolvedValue(undefined);
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
  });

  it("adds a profile with a derived provider home directory and opens it", () => {
    const onOpenProfile = vi.fn<(kind: string) => void>();
    render(<HomeProfileSettings config={CODEX_CONFIG} onOpenProfile={onOpenProfile} />);

    fireEvent.click(screen.getByRole("button", { name: "Add profile" }));
    fireEvent.change(screen.getByLabelText("New Codex profile name"), {
      target: { value: "Work Account" },
    });
    expect(screen.getByLabelText("New Codex profile home directory")).toHaveAttribute(
      "placeholder",
      "~/.poracode/codex-profiles/work-account",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Codex profile" }));

    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      id: "work-account",
      driver: "codex",
      displayName: "Work Account",
      config: { homeDir: "~/.poracode/codex-profiles/work-account" },
    });
    expect(onOpenProfile).toHaveBeenCalledWith("codex:work-account");
  });

  it("lists only the configured provider and removes its scoped status", () => {
    settingsState.agentInstances = {
      work: codexProfile(),
      personal: {
        id: "personal",
        driver: "gemini",
        displayName: "Personal Gemini",
        config: { homeDir: "~/.poracode/gemini-profiles/personal" },
      },
    };
    render(<HomeProfileSettings config={CODEX_CONFIG} />);

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.queryByText("Personal Gemini")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Codex profile" }));

    expect(settingsState.removeAgentInstance).toHaveBeenCalledWith("work");
    expect(statusState.removeAgentStatus).toHaveBeenCalledWith("codex:work");
  });

  it("updates a profile name and home directory", () => {
    settingsState.agentInstances = { work: codexProfile() };
    render(<HomeProfileProviderSettings config={CODEX_CONFIG} instanceId="work" />);

    fireEvent.change(screen.getByLabelText("Codex profile name"), {
      target: { value: "Company" },
    });
    fireEvent.change(screen.getByLabelText("Codex profile home directory"), {
      target: { value: "~/profiles/company" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Codex profile" }));

    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      id: "work",
      driver: "codex",
      displayName: "Company",
      config: { homeDir: "~/profiles/company" },
    });
  });
});
