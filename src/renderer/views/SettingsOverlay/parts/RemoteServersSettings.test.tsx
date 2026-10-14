import { act } from "react";
import { fireEvent, screen } from "@testing-library/react";
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
  reconnectServer: vi.fn<() => Promise<void>>(async () => {}),
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
    useRemoteServersStore.setState({ servers: [], runtime: {}, openThread: null });
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
