import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServersState } from "@/renderer/state/remoteServers/types";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { PortsPanel } from "./PortsPanel";

const forward = { id: "forward-1", targetPort: 3000, listenPort: 4100, createdAt: 1 };

describe("PortsPanel", () => {
  const originalWithClient = useRemoteServersStore.getState().withClient;

  beforeEach(() => {
    const listPorts = vi.fn<RemoteDesktopClient["listPorts"]>(async () => ({
      detected: [{ port: 3000, protocol: "http", label: "Vite" }],
      forwards: [],
    }));
    const startPortForward = vi.fn<RemoteDesktopClient["startPortForward"]>(async () => ({
      forward,
      enterPath: "/forward/forward-1/enter?fwt=token",
    }));
    const client = { listPorts, startPortForward } as unknown as RemoteDesktopClient;
    const withClient: RemoteServersState["withClient"] = async (_desktopId, invoke) =>
      invoke(client);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "http://192.168.1.10:3200",
          accessToken: "token",
          scopes: ["ports:forward"],
          hostMode: "desktop",
        },
      ],
      runtime: {
        "desktop-1": { status: "online", projects: [], threads: [] },
      },
      withClient,
    });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        openExternal: vi.fn<(url: string) => Promise<void>>(async () => undefined),
      } as unknown as PoracodeBridge,
    });
  });

  afterEach(() => {
    useRemoteServersStore.setState({ servers: [], runtime: {}, withClient: originalWithClient });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: undefined,
    });
  });

  it("loads detected ports and forwards one through the selected desktop client", async () => {
    render(<PortsPanel />);

    const row = await screen.findByRole("button", { name: /localhost:3000/u });
    fireEvent.click(row);

    const invoke = useRemoteServersStore.getState().withClient;
    await waitFor(() =>
      expect(window.poracode.openExternal).toHaveBeenCalledWith(
        "http://192.168.1.10:3200/forward/forward-1/enter?fwt=token",
      ),
    );
    expect(invoke).toBeTypeOf("function");
  });

  it("exposes active-forward actions without replacing the row open target", async () => {
    const enterPortForward = vi.fn<RemoteDesktopClient["enterPortForward"]>(async () => ({
      enterPath: "/forward/forward-1/enter?fwt=fresh",
    }));
    const client = {
      listPorts: vi.fn<RemoteDesktopClient["listPorts"]>(async () => ({
        detected: [],
        forwards: [forward],
      })),
      enterPortForward,
    } as unknown as RemoteDesktopClient;
    useRemoteServersStore.setState({
      withClient: async (_desktopId, invoke) => invoke(client),
    });

    render(<PortsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Actions" }));
    expect(await screen.findByText("Stop forwarding")).toBeInTheDocument();
    expect(window.poracode.openExternal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close forward actions" }));

    fireEvent.click(screen.getByRole("button", { name: /Port 3000/u }));
    await waitFor(() => expect(enterPortForward).toHaveBeenCalledWith("forward-1"));
    expect(window.poracode.openExternal).toHaveBeenCalledWith(
      "http://192.168.1.10:3200/forward/forward-1/enter?fwt=fresh",
    );
  });

  it("explains when the paired credential lacks port-forwarding scope", async () => {
    useRemoteServersStore.setState((state) => ({
      servers: state.servers.map((server) => ({ ...server, scopes: [] })),
    }));

    render(<PortsPanel />);

    expect(await screen.findByText("Port forwarding isn't enabled")).toBeInTheDocument();
  });
});
