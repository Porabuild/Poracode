import type { ReactNode } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentCapability, AgentStatus, Project } from "@/shared/contracts";

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => ({
  Button: (props: {
    children?: ReactNode | ((state: { isPending?: boolean | undefined }) => ReactNode);
    isDisabled?: boolean;
    isPending?: boolean;
    onPress?: () => void;
  }) => (
    <button type="button" disabled={props.isDisabled} onClick={props.onPress}>
      {typeof props.children === "function"
        ? props.children({ isPending: props.isPending })
        : props.children}
    </button>
  ),
  toast: toastMock,
}));

const bridgeMock = vi.hoisted(() => ({
  getLatestAgentVersion:
    vi.fn<(payload: unknown) => Promise<{ version?: string; source?: string }>>(),
  refreshAgentStatuses: vi.fn<(...args: unknown[]) => Promise<void>>(),
  updateAgentBinary: vi.fn<(payload: unknown) => Promise<{ ok: boolean }>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

const runAgentInstallCommandMock = vi.hoisted(() =>
  vi.fn<
    (input: {
      command: string;
      label: string;
      onCommandComplete?: (exitCode: number) => void;
      purpose?: string;
    }) => boolean
  >(),
);

vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentInstallCommand: runAgentInstallCommandMock,
}));

import "@/renderer/components/providers/cursor";
import { ThreadAgentUpdateDock } from "./ThreadAgentUpdateDock";

const project: Project = {
  id: "project",
  name: "Project",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-07-31T00:00:00.000Z",
};

const capabilities: AgentCapability = {
  models: [{ id: "auto", label: "Auto" }],
  efforts: [],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
};

const sdkStatus: AgentStatus = {
  kind: "cursor",
  label: "Cursor",
  installed: true,
  version: "2026.07.09-a3815c0",
  update: { builtIn: { binary: "cursor-agent", args: ["update"] } },
  authState: "authenticated",
  envKind: "windows",
  capabilities: { ...capabilities, runtimeLabel: "SDK" },
  runtimeVariants: {
    acp: {
      presentationMode: "gui",
      installed: true,
      version: "2026.07.09-a3815c0",
      authState: "authenticated",
      authUsesProviderLogin: true,
      capabilities: { ...capabilities, runtimeLabel: "ACP" },
    },
    sdk: {
      presentationMode: "gui",
      installed: true,
      version: "1.0.24",
      installationSource: "global-npm",
      authState: "authenticated",
      authUsesProviderLogin: false,
      capabilities: { ...capabilities, runtimeLabel: "SDK" },
    },
  },
};

describe("ThreadAgentUpdateDock", () => {
  beforeEach(() => {
    bridgeMock.getLatestAgentVersion
      .mockReset()
      .mockResolvedValue({ version: "1.0.31", source: "npm" });
    bridgeMock.refreshAgentStatuses.mockReset().mockResolvedValue(undefined);
    bridgeMock.updateAgentBinary.mockReset().mockResolvedValue({ ok: true });
    runAgentInstallCommandMock.mockReset().mockReturnValue(true);
    toastMock.danger.mockReset();
    toastMock.success.mockReset();
  });

  it("shows and updates the selected Cursor SDK runtime instead of Cursor ACP", async () => {
    render(<ThreadAgentUpdateDock agentStatus={sdkStatus} project={project} />);

    expect(
      await screen.findByText(/Cursor SDK: This computer · v1\.0\.24 → v1\.0\.31/u),
    ).toBeInTheDocument();
    expect(screen.queryByText(/2026\.07\.09/u)).toBeNull();
    expect(bridgeMock.getLatestAgentVersion).toHaveBeenCalledWith({
      agentKind: "cursor",
      npmPackage: {
        name: "@cursor/sdk",
        minVersion: "1.0.24",
        maxExclusiveMajor: 2,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Cursor SDK",
        command: expect.stringContaining("npm install -g '@cursor/sdk@^1.0.24'"),
        purpose: "update",
      }),
    );
    expect(bridgeMock.updateAgentBinary).not.toHaveBeenCalled();

    await act(async () => {
      runAgentInstallCommandMock.mock.calls[0]?.[0].onCommandComplete?.(0);
    });

    expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledWith([], {
      agentKinds: ["cursor"],
      envs: [{ kind: "native" }],
    });
  });

  it("keeps the provider binary updater for the selected Cursor ACP runtime", async () => {
    bridgeMock.getLatestAgentVersion.mockResolvedValue({
      version: "2026.07.23-e383d2b",
      source: "unknown",
    });
    render(
      <ThreadAgentUpdateDock
        agentStatus={{
          ...sdkStatus,
          capabilities: { ...sdkStatus.capabilities, runtimeLabel: "ACP" },
        }}
        project={project}
      />,
    );

    expect(
      await screen.findByText(
        /Cursor: This computer · v2026\.07\.09-a3815c0 → v2026\.07\.23-e383d2b/u,
      ),
    ).toBeInTheDocument();
    expect(bridgeMock.getLatestAgentVersion).toHaveBeenCalledWith({ agentKind: "cursor" });

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await vi.waitFor(() =>
      expect(bridgeMock.updateAgentBinary).toHaveBeenCalledWith({
        agentKind: "cursor",
        envKind: "windows",
      }),
    );
    expect(runAgentInstallCommandMock).not.toHaveBeenCalled();
  });
});
