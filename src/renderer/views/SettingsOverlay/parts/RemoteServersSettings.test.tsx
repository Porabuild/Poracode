import { act } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { RemoteServersSettings } from "./RemoteServersSettings";

// Regression for React #185 on the remote-servers settings page: the row's
// dependents selector allocated a new array per snapshot, so every mounted row
// looped useSyncExternalStore and crashed the renderer as soon as a paired
// record existed. These tests subscribe through the REAL store — a mocked store
// module calls the selector once per render and cannot observe snapshot
// instability — and stub only the connection side-effect bridge so no test
// opens a socket or fetches.
const session = vi.hoisted(() => ({
  connectAll: vi.fn<() => Promise<void>>(async () => {}),
  reconnectServer: vi.fn<(connectionKey: string) => Promise<void>>(async () => {}),
  removeServer:
    vi.fn<(connectionKey: string, options?: { readonly cascadeEnvironments?: boolean }) => void>(),
  getHostUpdateState: vi.fn<(desktopId: string) => unknown>(),
  checkHostUpdate: vi.fn<(desktopId: string) => unknown>(),
  installHostUpdate: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock("@/renderer/state/remoteServers/sessionReconnect", () => ({
  createSessionReconnectActions: () => session,
  closeRemoteServerEventSocket: () => {},
  closeAllRemoteServerEventSockets: () => {},
  __resetConnectAllForTest: () => {},
}));

const parentServer: RemoteServerRecord = {
  connectionId: "conn-parent",
  desktopId: "desk-parent",
  label: "Workstation",
  endpoint: "http://127.0.0.1:49153/",
  accessToken: "token-parent",
  scopes: ["projects:manage", "session:read", "session:operate"],
  transport: { kind: "direct" },
};

function environmentDependent(parentConnectionId: string): RemoteServerRecord {
  return {
    connectionId: "conn-environment",
    desktopId: "child-desktop",
    label: "Build box",
    endpoint: "http://127.0.0.1:49154/",
    accessToken: "token-child",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      environmentId: "11111111-1111-4111-8111-111111111111",
      childDesktopId: "child-desktop",
      parentConnectionId,
    },
  };
}

function runtimeOf(connectionKey: string, status: "online" | "offline") {
  return { [connectionKey]: { status, projects: [], threads: [] } };
}

describe("RemoteServersSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    session.reconnectServer.mockReset().mockResolvedValue(undefined);
    useRemoteServersStore.setState({ servers: [], runtime: {}, openThread: null });
  });

  it("shows the saved endpoint without URL credentials and the exact granted permissions", async () => {
    useRemoteServersStore.setState({
      servers: [
        {
          ...parentServer,
          endpoint: "https://user:password@host.example/prefix/?token=secret#credential",
          scopes: ["session:operate"],
        },
      ],
      runtime: runtimeOf("conn-parent", "offline"),
    });
    render(<RemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Workstation" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("https://host.example/prefix/")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("password");
    expect(dialog).not.toHaveTextContent("secret");
    expect(dialog).not.toHaveTextContent("token-parent");
    expect(within(dialog).getByText("desk-parent")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText(/^Granted permissions/));
    expect(within(dialog).getByText("Operate sessions")).toBeVisible();
    expect(within(dialog).queryByText("Manage projects")).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("View-only");
    expect(within(dialog).getByText("This connection can't manage projects.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(session.reconnectServer).toHaveBeenCalledWith("conn-parent"));
  });

  it("keeps reconnect disabled during a pending attempt and displays a rejected reconnect", async () => {
    let rejectReconnect!: (error: Error) => void;
    session.reconnectServer.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectReconnect = reject;
        }),
    );
    useRemoteServersStore.setState({
      servers: [parentServer],
      runtime: runtimeOf("conn-parent", "offline"),
    });
    render(<RemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Workstation" }));
    const dialog = await screen.findByRole("dialog");
    const reconnect = within(dialog).getByRole("button", { name: "Reconnect" });
    fireEvent.click(reconnect);
    expect(reconnect).toBeDisabled();
    await act(async () => rejectReconnect(new Error("Reconnect failed")));
    expect(
      within(within(dialog).getByRole("region", { name: "Connection details" })).getByRole("alert"),
    ).toHaveTextContent("Reconnect failed");
    expect(reconnect).toBeEnabled();
    await act(async () => {
      useRemoteServersStore.setState({
        runtime: { "conn-parent": { status: "connecting", projects: [], threads: [] } },
      });
    });
    expect(reconnect).toBeDisabled();
  });

  it("shows an environment's child identity without exposing its loopback endpoint", async () => {
    const child = environmentDependent("conn-parent");
    useRemoteServersStore.setState({
      servers: [child],
      runtime: runtimeOf("conn-environment", "offline"),
    });
    render(<RemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Build box" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("child-desktop")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("127.0.0.1:49154");
    expect(within(dialog).queryByText("Saved endpoint")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(session.reconnectServer).toHaveBeenCalledWith("conn-environment"));
  });

  it("shows the offline reason returned by the real reconnect contract", async () => {
    session.reconnectServer.mockImplementation(async () => {
      useRemoteServersStore.setState({
        runtime: {
          "conn-parent": {
            status: "offline",
            message: "Host is unreachable",
            projects: [],
            threads: [],
          },
        },
      });
    });
    useRemoteServersStore.setState({
      servers: [parentServer],
      runtime: runtimeOf("conn-parent", "offline"),
    });
    render(<RemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Workstation" }));
    const details = await screen.findByRole("region", { name: "Connection details" });
    fireEvent.click(within(details).getByRole("button", { name: "Reconnect" }));
    expect(await within(details).findByRole("alert")).toHaveTextContent("Host is unreachable");
    expect(within(details).getByRole("button", { name: "Reconnect" })).toBeEnabled();
  });

  it.each([
    {
      endpoint: "not-a-url password=secret",
      transport: { kind: "direct" } as const,
      expected: "Unavailable",
    },
    {
      endpoint: "http://127.0.0.1:49153/",
      transport: {
        kind: "ssh",
        connection: {
          id: "11111111-1111-4111-8111-111111111111",
          label: "SSH",
          target: "builder@build-box",
          port: 2222,
        },
      } as const,
      expected: "builder@build-box:2222",
    },
    {
      endpoint: "http://127.0.0.1:49153/",
      transport: {
        kind: "ssh",
        connection: {
          id: "11111111-1111-4111-8111-111111111111",
          label: "SSH",
          target: "build-alias",
        },
      } as const,
      expected: "build-alias",
    },
  ])(
    "shows a safe endpoint for $expected and an empty grant",
    async ({ endpoint, transport, expected }) => {
      useRemoteServersStore.setState({
        servers: [{ ...parentServer, endpoint, transport, scopes: [] }],
      });
      render(<RemoteServersSettings />);
      fireEvent.click(screen.getByRole("button", { name: "Workstation" }));
      const dialog = await screen.findByRole("dialog");
      const details = within(dialog).getByRole("region", { name: "Connection details" });
      expect(within(details).getByText(expected)).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent("password=secret");
      fireEvent.click(within(dialog).getByText(/^Granted permissions/));
      expect(within(dialog).getByText("No permissions granted.")).toBeVisible();
    },
  );

  it("hands off from details to dependent-removal confirmation without leaving two dialogs open", async () => {
    useRemoteServersStore.setState({
      servers: [parentServer, environmentDependent("conn-parent")],
    });
    render(<RemoteServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Workstation" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove connection" }));
    expect(await screen.findByText("Remove this connection?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(session.removeServer).not.toHaveBeenCalled();
  });

  it("renders stored paired rows from a real store subscription without an update loop", () => {
    useRemoteServersStore.setState({
      servers: [parentServer],
      runtime: runtimeOf("conn-parent", "online"),
    });

    render(<RemoteServersSettings />);

    // The allocating selector crashed on first mount — before any interaction —
    // so merely painting the stored row is the regression assertion.
    expect(screen.getByRole("button", { name: "Workstation" })).toBeInTheDocument();

    // Any store notification re-runs the row selector; snapshot stability must
    // survive it too, and the offline label must still update.
    act(() => {
      useRemoteServersStore.setState({ runtime: runtimeOf("conn-parent", "offline") });
    });
    expect(screen.getByText("Offline")).toBeInTheDocument();
    // Opening the panel reconnects persisted servers exactly once.
    expect(session.connectAll).toHaveBeenCalledTimes(1);
  });

  it("confirms before removing a paired row that owns environment dependents", async () => {
    useRemoteServersStore.setState({
      servers: [parentServer, environmentDependent("conn-parent")],
      runtime: runtimeOf("conn-parent", "online"),
    });

    render(<RemoteServersSettings />);

    expect(screen.getByRole("button", { name: "Build box" })).toBeInTheDocument();
    // Seed order puts the paired parent's kebab menu first.
    fireEvent.click(screen.getAllByRole("button", { name: "Actions" })[0]!);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));

    expect(await screen.findByText("Remove this connection?")).toBeInTheDocument();
    expect(session.removeServer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove connection and environments" }));
    expect(session.removeServer).toHaveBeenCalledWith("conn-parent", {
      cascadeEnvironments: true,
    });
  });

  it("removes a paired row without dependents immediately", async () => {
    useRemoteServersStore.setState({
      servers: [parentServer],
      runtime: runtimeOf("conn-parent", "online"),
    });

    render(<RemoteServersSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));

    expect(session.removeServer).toHaveBeenCalledWith("conn-parent");
    expect(screen.queryByText("Remove this connection?")).not.toBeInTheDocument();
  });
});
