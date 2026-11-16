import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { ThreadAuthRequiredDock } from "./ThreadAuthRequiredDock";

const { bridge, loginActions, session } = vi.hoisted(() => ({
  bridge: {
    authenticateAcpAgent: vi.fn<(input: unknown) => Promise<void>>(),
    focusWindow: vi.fn<() => Promise<void>>(),
    refreshAgentStatuses: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  },
  loginActions: { runAgentLoginCommand: vi.fn<(input: unknown) => boolean>() },
  session: { browser: false },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => session.browser,
}));
vi.mock("@/renderer/actions/agentLoginActions", () => loginActions);
vi.mock("@/renderer/actions/panelActions", () => ({ openSettings: vi.fn<() => void>() }));

const oauthStatus = {
  kind: "agent",
  label: "Agent",
  installed: true,
  authState: "missing",
  authMethods: [{ id: "oauth", name: "Agent OAuth" }],
  capabilities: { presentationMode: "gui" },
} as unknown as AgentStatus;
const terminalStatus = {
  ...oauthStatus,
  authMethods: [],
  loginCommand: "agent login",
} as unknown as AgentStatus;

function project(remoteServerId?: string): Project {
  return {
    id: "project",
    name: "Project",
    createdAt: "2026-11-01T00:00:00.000Z",
    location: { kind: "posix", path: "/repo", ...(remoteServerId ? { remoteServerId } : {}) },
    ...(remoteServerId ? { remoteServerId, remoteId: "host-project" } : {}),
  } as Project;
}

function renderDock(status: AgentStatus, owner: Project) {
  return render(
    <AppProvider>
      <ThreadAuthRequiredDock agentStatus={status} project={owner} />
    </AppProvider>,
  );
}

describe("ThreadAuthRequiredDock host resolution", () => {
  const refreshServer = vi.fn<(desktopId: string) => Promise<void>>();
  const originalRefreshServer = useRemoteServersStore.getState().refreshServer;
  beforeEach(() => {
    session.browser = false;
    bridge.authenticateAcpAgent.mockReset().mockResolvedValue(undefined);
    bridge.focusWindow.mockReset().mockResolvedValue(undefined);
    bridge.refreshAgentStatuses.mockReset().mockResolvedValue({ windows: [], wsl: [] });
    loginActions.runAgentLoginCommand.mockReset().mockReturnValue(true);
    refreshServer.mockReset().mockResolvedValue(undefined);
    useRemoteServersStore.setState({ refreshServer });
  });
  afterEach(() => {
    useRemoteServersStore.setState({ refreshServer: originalRefreshServer });
  });

  it("signs in on this machine for a project whose host runs here", async () => {
    renderDock(oauthStatus, project());

    expect(
      screen.getByText("Agent: Complete Agent OAuth sign-in before this thread can run."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    await waitFor(() => expect(bridge.authenticateAcpAgent).toHaveBeenCalledOnce());
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledOnce();
    expect(refreshServer).not.toHaveBeenCalled();
  });

  it("never opens this machine's OAuth window for a paired host's agent", async () => {
    renderDock(oauthStatus, project("desktop-1"));

    expect(
      screen.getByText("Agent: Sign in on the paired desktop, then refresh this status."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh Agent authentication" }));
    await waitFor(() => expect(refreshServer).toHaveBeenCalledWith("desktop-1"));
    expect(bridge.authenticateAcpAgent).not.toHaveBeenCalled();
    expect(bridge.refreshAgentStatuses).not.toHaveBeenCalled();
  });

  it("runs a paired host's login command on that host and refreshes that host", async () => {
    const owner = project("desktop-1");
    renderDock(terminalStatus, owner);

    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    const input = loginActions.runAgentLoginCommand.mock.calls[0]?.[0] as {
      project: Project;
      onCommandComplete: (exitCode: number) => void;
    };
    expect(input.project).toBe(owner);
    act(() => input.onCommandComplete(0));

    await waitFor(() => expect(refreshServer).toHaveBeenCalledWith("desktop-1"));
    expect(bridge.refreshAgentStatuses).not.toHaveBeenCalled();
  });

  it("offers no desktop sign-in controls in a browser client", () => {
    session.browser = true;
    renderDock(terminalStatus, project("desktop-1"));

    expect(
      screen.getByText("Agent: Sign in on the paired desktop, then refresh this status."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Login" })).not.toBeInTheDocument();
  });
});
