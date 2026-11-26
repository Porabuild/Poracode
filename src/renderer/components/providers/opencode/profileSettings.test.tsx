import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";

const state = vi.hoisted(() => ({
  instance: undefined as AgentInstanceConfig | undefined,
  host: {} as AgentSettingsHost,
  updateProfile: vi.fn<AgentSettingsHost["updateProfile"]>(),
}));
const prepareMock = vi.hoisted(() =>
  vi.fn<(input: unknown) => Promise<string>>(async () => "poracode-ctx-65536-prepared"),
);

vi.mock("@/renderer/components/providers/settings/AgentSettingsHostContext", () => ({
  useAgentSettingsHost: () => state.host,
  useHostAgentInstance: () => state.instance,
  rediscoverHostAgents: async () => ({ windows: [], wsl: [] }),
}));

vi.mock("@/renderer/components/providers/settings/OpenCodeProviderSettings", () => ({
  OpenCodeProviderSettings: () => <div data-testid="opencode-provider-settings" />,
}));

vi.mock("@/renderer/views/SettingsOverlay/parts/ollamaModelContext", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/renderer/views/SettingsOverlay/parts/ollamaModelContext")
  >()),
  prepareOllamaContextModel: prepareMock,
}));

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    "aria-invalid"?: boolean;
    type?: "number";
    inputMode?: "numeric";
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    onChange?: (event: {
      currentTarget: { value: string; validity: { badInput: boolean } };
    }) => void;
    onInput?: (event: {
      currentTarget: { value: string; validity: { badInput: boolean } };
    }) => void;
  }) => {
    const handle = (event: { currentTarget: HTMLInputElement }) => {
      const currentTarget = {
        value: event.currentTarget.value,
        validity: { badInput: event.currentTarget.validity.badInput },
      };
      props.onInput?.({ currentTarget });
      props.onChange?.({ currentTarget });
    };
    return (
      <input
        aria-label={props["aria-label"]}
        aria-invalid={props["aria-invalid"]}
        type={props.type}
        inputMode={props.inputMode}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={handle}
        onInput={handle}
      />
    );
  },
}));

import { OpenCodeAgentSettingsPanel } from "./profileSettings";

function machineProject(): Project {
  return {
    id: "__machine__:posix",
    name: "Mac mini",
    disabled: false,
    createdAt: new Date(0).toISOString(),
    location: { kind: "posix", path: "~" },
  };
}

function host(): AgentSettingsHost {
  return {
    key: "local",
    connectionKey: undefined,
    isRemote: false,
    isOnline: true,
    canWrite: true,
    canOperateTerminal: true,
    canReadTerminal: true,
    machineProject: machineProject(),
    canManageProfiles: true,
    canEditSecrets: true,
    callProcedure: vi.fn<AgentSettingsHost["callProcedure"]>(),
    rediscoverAgents: vi.fn<AgentSettingsHost["rediscoverAgents"]>(),
    setAgentSetting: vi.fn<AgentSettingsHost["setAgentSetting"]>(),
    saveAgentSettings: vi.fn<AgentSettingsHost["saveAgentSettings"]>(),
    setAgentDisabled: vi.fn<AgentSettingsHost["setAgentDisabled"]>(),
    setHiddenModels: vi.fn<AgentSettingsHost["setHiddenModels"]>(),
    createProfile: vi.fn<AgentSettingsHost["createProfile"]>(),
    updateProfile: state.updateProfile as AgentSettingsHost["updateProfile"],
    setProfileEnvironment: vi.fn<AgentSettingsHost["setProfileEnvironment"]>(),
    removeProfile: vi.fn<AgentSettingsHost["removeProfile"]>(),
  } as AgentSettingsHost;
}

function localProfile(): AgentInstanceConfig {
  return {
    id: "work",
    driver: "opencode",
    displayName: "Work",
    config: {
      connection: "local",
      endpoint: "http://127.0.0.1:11434/v1",
      model: "poracode-ctx-65536-0123456789ab-0123456789abcdef",
      baseModel: "inkling-2-mini:latest",
      contextLength: 65536,
    },
  };
}

function renderProfile(instance = localProfile()) {
  state.instance = instance;
  render(<OpenCodeAgentSettingsPanel agentKind="opencode:work" statuses={[]} wslDistros={[]} />);
}

beforeEach(() => {
  state.host = host();
  state.updateProfile.mockReset().mockResolvedValue(localProfile());
  prepareMock.mockReset().mockResolvedValue("poracode-ctx-65536-prepared");
});

describe("OpenCode local profile details", () => {
  it("shows the selected base model instead of the internal alias", () => {
    renderProfile();
    expect(screen.getByText("inkling-2-mini:latest")).toBeInTheDocument();
    expect(screen.queryByText(/poracode-ctx-65536/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Context length")).toHaveValue(65536);
  });

  it("persists a context change without dropping the pinned route", async () => {
    renderProfile({
      ...localProfile(),
      config: {
        connection: "local",
        endpoint: "http://127.0.0.1:11434/v1",
        model: "inkling-2-mini:latest",
        legacyMetadata: { keep: true },
      },
    });
    fireEvent.change(screen.getByLabelText("Context length"), { target: { value: "65536" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(state.updateProfile).toHaveBeenCalledWith("work", {
        config: {
          connection: "local",
          endpoint: "http://127.0.0.1:11434/v1",
          model: "poracode-ctx-65536-prepared",
          baseModel: "inkling-2-mini:latest",
          contextLength: 65536,
          legacyMetadata: { keep: true },
        },
      }),
    );
  });
});
