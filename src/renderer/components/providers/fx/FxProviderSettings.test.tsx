import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import type {
  AgentStatus,
  ManageAgentCredentialsPayload,
  ManageAgentCredentialsResult,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { FxProviderSettings } from "./FxProviderSettings";

const runAgentLoginCommandMock = vi.hoisted(() =>
  vi.fn<(input: { label: string; command: string }) => boolean>(),
);
vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentLoginCommand: runAgentLoginCommandMock,
}));

const bridge = vi.hoisted(() => ({
  manageAgentCredentials:
    vi.fn<(payload: ManageAgentCredentialsPayload) => Promise<ManageAgentCredentialsResult>>(),
  refreshAgentStatuses: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const statuses = [
  {
    kind: "fx",
    label: "fx",
    installed: true,
    envKind: "posix",
    authState: "authenticated",
    loginCommand: "fx login",
    providerMetadata: {
      connectedProviders: [{ id: "codex", label: "Codex" }],
    },
  },
] as unknown as AgentStatus[];

const renderPanel = (agentStatuses = statuses) => {
  const result = render(
    <FxProviderSettings agentKind="fx" statuses={agentStatuses} wslDistros={[]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /AI providers/ }));
  return result;
};

function addTrigger(): HTMLElement {
  const [trigger] = screen.getAllByRole("button", { name: /Add provider/ });
  if (!trigger) throw new Error("Missing Add provider trigger");
  return trigger;
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.manageAgentCredentials.mockResolvedValue({ providers: [] });
  bridge.refreshAgentStatuses.mockResolvedValue(undefined);
  runAgentLoginCommandMock.mockReturnValue(true);
});

afterEach(async () => {
  await dynamicActivate("en");
});

describe("fx provider settings", () => {
  it("lists the signed-in backends with a Logout action", () => {
    renderPanel();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out of Codex" })).toBeInTheDocument();
  });

  it("offers only the backends that are not connected yet", async () => {
    renderPanel();
    fireEvent.click(addTrigger());

    expect(await screen.findByRole("menuitem", { name: "Vercel AI Gateway" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Grok" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Codex" })).not.toBeInTheDocument();
  });

  it("logs in with the chosen backend slug", async () => {
    renderPanel();
    fireEvent.click(addTrigger());
    fireEvent.click(await screen.findByRole("menuitem", { name: "Grok" }));

    expect(runAgentLoginCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ command: "fx login grok" }),
    );
  });

  it("confirms before signing out of a backend", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sign out of Codex" }));
    await screen.findByText("Sign out of Codex");
    expect(bridge.manageAgentCredentials).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    await waitFor(() =>
      expect(bridge.manageAgentCredentials).toHaveBeenCalledWith({
        agentKind: "fx",
        env: { kind: "native" },
        action: "remove",
        credentialId: "codex",
      }),
    );
    await waitFor(() => expect(bridge.refreshAgentStatuses).toHaveBeenCalled());
  });

  it("shows an empty state when no backend is connected", () => {
    renderPanel([{ ...statuses[0], providerMetadata: undefined }] as unknown as AgentStatus[]);
    expect(screen.getByText("No providers connected yet.")).toBeInTheDocument();
  });
});
