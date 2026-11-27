import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { agentStatusSchema } from "@/shared/contracts";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { AgentDiscoveryScreen } from "./AgentDiscoveryScreen";

const mocks = vi.hoisted(() => ({
  runAgentLoginCommand:
    vi.fn<
      (input: {
        command: string;
        status: unknown;
        project?: { remoteServerId?: string; location: { remoteServerId?: string } };
      }) => boolean
    >(),
  refreshHostAgentAuthStatus: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  onHide: vi.fn<() => void>(),
  onCancel: vi.fn<() => void>(),
}));
const client = vi.hoisted(() => ({ browser: false }));

vi.mock("@/renderer/actions/agentLoginActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/actions/agentLoginActions")>()),
  runAgentLoginCommand: mocks.runAgentLoginCommand,
}));
vi.mock("@/renderer/actions/hostAgentAuthActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/actions/hostAgentAuthActions")>()),
  refreshHostAgentAuthStatus: mocks.refreshHostAgentAuthStatus,
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({}) }));
vi.mock("@/renderer/clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/clientRuntime")>()),
  isBrowserClientRuntime: () => client.browser,
}));

const signedOut = agentStatusSchema.parse({
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "missing",
  loginCommand: "codex login",
  capabilities: {},
});
const signedIn = agentStatusSchema.parse({
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities: {},
});
const needsSettings = agentStatusSchema.parse({
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "missing",
  capabilities: {},
});

function openDiscovery(agents: (typeof signedOut)[]) {
  useAgentStatusesStore.setState({
    inFirstLaunchDiscovery: true,
    discoveryScanning: false,
    discoveryAutoHideCancelled: true,
    discoveryHidden: false,
    discoveryScope: { kind: "native" },
    discoveredAgents: agents,
  });
  return render(<AgentDiscoveryScreen onHide={mocks.onHide} onCancel={mocks.onCancel} />);
}

describe("discovery direct sign-in", () => {
  beforeEach(() => {
    client.browser = false;
    mocks.runAgentLoginCommand.mockReset().mockReturnValue(true);
    mocks.refreshHostAgentAuthStatus.mockReset().mockResolvedValue(undefined);
    mocks.onHide.mockReset();
    mocks.onCancel.mockReset();
  });
  afterEach(() => {
    cleanup();
    client.browser = false;
    useAgentStatusesStore.getState().resetDiscoveredAgents();
  });

  it("makes the signed-out status one accessible, iconless text action", () => {
    openDiscovery([signedOut]);
    const signIn = screen.getByRole("button", { name: /Sign in to Codex/ });
    expect(signIn.tagName).toBe("BUTTON");
    // The small amber status dot and the row geometry stay on the action.
    expect(signIn.querySelector("span.rounded-full")).toBeInTheDocument();
    expect(signIn.classList.contains("agent-discovery-row__status")).toBe(true);
    // No appended button column, no icons, no redundant status copy.
    expect(screen.getAllByRole("button", { name: /Sign in/ })).toHaveLength(1);
    expect(signIn.querySelector("svg")).toBeNull();
    expect(screen.queryByText("Sign in needed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Codex" })).toBeInTheDocument();
  });

  it("keeps the terminal login handoff with a concrete exact local project", () => {
    openDiscovery([signedOut]);
    fireEvent.click(screen.getByRole("button", { name: /Sign in to Codex/ }));
    // The action targets the exact row's status, never a different scope.
    expect(mocks.runAgentLoginCommand).toHaveBeenCalledOnce();
    const input = mocks.runAgentLoginCommand.mock.calls[0]![0];
    expect(input).toMatchObject({ command: "codex login", status: signedOut });
    expect(input.project).toBeDefined();
    expect(input.project?.remoteServerId).toBeUndefined();
    expect(input.project?.location.remoteServerId).toBeUndefined();
    expect(mocks.onHide).toHaveBeenCalledOnce();
  });

  it("keeps ordinary status and the paired-desktop hint on a browser client", () => {
    client.browser = true;
    openDiscovery([signedOut]);
    const status = screen.getByText("Sign in needed");
    expect(status.closest("button")).toBeNull();
    expect(screen.getByText("Sign in on the paired desktop, then refresh.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Sign in to / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Codex" })).toBeInTheDocument();
  });

  it("uses the Settings wording for a row without a direct auth method", () => {
    openDiscovery([needsSettings]);
    const settings = screen.getByRole("button", {
      name: /Add credentials for Codex in Settings/,
    });
    expect(settings).toHaveTextContent("Settings");
    expect(settings.querySelector("span.rounded-full")).toBeInTheDocument();
    expect(settings.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sign in to / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Codex" })).toBeInTheDocument();
  });

  it("keeps only Refresh and ordinary status on a row that needs no sign-in", () => {
    openDiscovery([signedIn]);
    const statuses = document.querySelectorAll(".agent-discovery-row__status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: /^Sign in to / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Codex" })).toBeInTheDocument();
  });
});
