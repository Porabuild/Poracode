import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import {
  AgentSettingsHostProvider,
  type AgentSettingsHost,
} from "../settings/AgentSettingsHostContext";
import { OLLAMA_DOWNLOAD_URL } from "./ollama";
import { OpenCodeLocalModelsSettings } from "./OpenCodeLocalModelsSettings";

const openExternalWithFeedbackMock = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock("@/renderer/utils/openExternal", () => ({
  openExternalWithFeedback: openExternalWithFeedbackMock,
}));

function makeHost(overrides: Partial<AgentSettingsHost> = {}): AgentSettingsHost {
  const rediscoverAgents = vi.fn<AgentSettingsHost["rediscoverAgents"]>(async () => ({
    windows: [],
    wsl: [],
  }));
  return {
    key: "local",
    connectionKey: undefined,
    isRemote: false,
    isOnline: true,
    canWrite: true,
    machineProject: undefined,
    canManageProfiles: true,
    canEditSecrets: true,
    callProcedure: vi.fn<AgentSettingsHost["callProcedure"]>(),
    rediscoverAgents,
    setAgentSetting: vi.fn<AgentSettingsHost["setAgentSetting"]>(),
    saveAgentSettings: vi.fn<AgentSettingsHost["saveAgentSettings"]>(async () => undefined),
    setAgentDisabled: vi.fn<AgentSettingsHost["setAgentDisabled"]>(),
    setHiddenModels: vi.fn<AgentSettingsHost["setHiddenModels"]>(),
    createProfile: vi.fn<AgentSettingsHost["createProfile"]>(),
    updateProfile: vi.fn<AgentSettingsHost["updateProfile"]>(),
    setProfileEnvironment: vi.fn<AgentSettingsHost["setProfileEnvironment"]>(),
    removeProfile: vi.fn<AgentSettingsHost["removeProfile"]>(),
    ...overrides,
  };
}

const nativeStatus = {
  kind: "opencode",
  label: "OpenCode",
  installed: true,
  envKind: "posix",
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "ollama/inkling-2-mini:latest", label: "inkling-2-mini:latest" },
      { id: "openrouter/cloud-model", label: "Cloud Model" },
    ],
  },
} as unknown as AgentStatus;

const wslStatus = {
  ...nativeStatus,
  envKind: "wsl",
  envDistro: "Ubuntu",
} as unknown as AgentStatus;

function renderPanel(
  input: {
    statuses?: readonly AgentStatus[];
    host?: AgentSettingsHost;
  } = {},
) {
  return render(
    <AgentSettingsHostProvider host={input.host ?? makeHost()}>
      <OpenCodeLocalModelsSettings
        agentKind="opencode"
        statuses={input.statuses ?? [nativeStatus, wslStatus]}
      />
    </AgentSettingsHostProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OpenCode local models settings", () => {
  it("shows discovered Ollama routes once across installed environments", () => {
    renderPanel();
    expect(screen.getByText("Ollama models")).toBeInTheDocument();
    expect(screen.getByText("ollama/inkling-2-mini:latest")).toBeInTheDocument();
    expect(screen.queryByText("openrouter/cloud-model")).not.toBeInTheDocument();
    expect(screen.getAllByText("ollama/inkling-2-mini:latest")).toHaveLength(1);
    expect(screen.queryByText(/Download/)).not.toBeInTheDocument();
  });

  it("excludes cloud-only Ollama tags from the route list", () => {
    renderPanel({
      statuses: [
        {
          ...nativeStatus,
          capabilities: {
            models: [
              { id: "ollama/inkling-2-mini:cloud", label: "cloud" },
              { id: "ollama/inkling-2-mini:latest", label: "local" },
            ],
          },
        } as unknown as AgentStatus,
      ],
    });
    expect(screen.queryByText("ollama/inkling-2-mini:cloud")).not.toBeInTheDocument();
    expect(screen.getByText("ollama/inkling-2-mini:latest")).toBeInTheDocument();
  });

  it("gives an empty state without promising the endpoint is local", () => {
    renderPanel({
      statuses: [{ ...wslStatus, capabilities: { models: [] } } as unknown as AgentStatus],
    });
    expect(screen.getByText(/No Ollama models detected/)).toBeInTheDocument();
    expect(screen.getByText(/Cloud-only tags are excluded/)).toBeVisible();
    expect(screen.getAllByText(/ollama serve/)).toHaveLength(1);
  });

  it("ignores models from an environment without OpenCode installed", () => {
    renderPanel({
      statuses: [{ ...nativeStatus, installed: false } as unknown as AgentStatus],
    });
    expect(screen.getByText(/Install OpenCode for this host/)).toBeInTheDocument();
    expect(screen.queryByText("ollama/inkling-2-mini:latest")).not.toBeInTheDocument();
  });

  it("refreshes through the selected host's scoped rediscovery", async () => {
    const host = makeHost();
    renderPanel({ host });
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await waitFor(() =>
      expect(host.rediscoverAgents).toHaveBeenCalledWith(undefined, {
        agentKinds: ["opencode"],
      }),
    );
  });

  it("disables refresh for read-only viewers and offline hosts", () => {
    renderPanel({ host: makeHost({ canWrite: false }) });
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeDisabled();

    renderPanel({ host: makeHost({ isOnline: false }) });
    expect(screen.getAllByRole("button", { name: /Refresh/ }).at(-1)).toBeDisabled();
  });

  it("opens the official Ollama download page through the app link helper", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("link", { name: "ollama.com/download" }));
    expect(openExternalWithFeedbackMock).toHaveBeenCalledWith(OLLAMA_DOWNLOAD_URL);
  });
});
