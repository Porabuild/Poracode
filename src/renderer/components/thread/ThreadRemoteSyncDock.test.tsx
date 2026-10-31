import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRuntime } from "@/renderer/state/remoteServers/types";
import { ThreadRemoteSyncDock } from "./ThreadRemoteSyncDock";

const thread = { remoteServerId: "pc", remoteId: "remote-thread" };

function setHostStatus(status: RemoteServerRuntime["status"]): void {
  useRemoteServersStore.setState({
    runtime: { pc: { status, projects: [], threads: [] } as RemoteServerRuntime },
  });
}

describe("ThreadRemoteSyncDock", () => {
  const originalRefreshServer = useRemoteServersStore.getState().refreshServer;
  afterEach(() => {
    cleanup();
    useRemoteServersStore.setState({ runtime: {}, refreshServer: originalRefreshServer });
    useAppStore.setState({ truncateReloadExhausted: {} });
  });

  it("warns in the composer that an offline host's conversation may be out of date", () => {
    setHostStatus("offline");
    render(<ThreadRemoteSyncDock thread={thread} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Server offline — this conversation may be out of date.",
    );
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  it("prefers the unconfirmed deletion and refreshes the host from its action", () => {
    setHostStatus("offline");
    const refreshServer = vi.fn<RemoteServerRefresh>(async () => undefined);
    useRemoteServersStore.setState({ refreshServer });
    useAppStore.setState({ truncateReloadExhausted: { "pc\u0000remote-thread": true } });
    render(<ThreadRemoteSyncDock thread={thread} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "A message deletion could not be confirmed.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refreshServer).toHaveBeenCalledWith("pc", { includeAgentStatuses: false });
  });

  it("renders nothing while the host is online", () => {
    setHostStatus("online");
    const { container } = render(<ThreadRemoteSyncDock thread={thread} />);
    expect(container).toBeEmptyDOMElement();
  });
});

type RemoteServerRefresh = ReturnType<typeof useRemoteServersStore.getState>["refreshServer"];
