import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { RemoteClientError, type RemoteDesktopClient } from "@/shared/remote/client";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServersState } from "@/renderer/state/remoteServers/types";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { PortsPanel } from "./PortsPanel";
import { usePortsPanelChromeStore } from "./portsPanelStore";

const adaptiveLayout = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => adaptiveLayout.compact,
}));

const forward = { id: "forward-1", targetPort: 3000, listenPort: 4100, createdAt: 1 };

describe("PortsPanel", () => {
  const originalWithClient = useRemoteServersStore.getState().withClient;

  beforeEach(() => {
    adaptiveLayout.compact = false;
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
          browserForwardAvailable: true,
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
    vi.restoreAllMocks();
    useRemoteServersStore.setState({ servers: [], runtime: {}, withClient: originalWithClient });
    usePortsPanelChromeStore.setState({
      refreshVersion: 0,
      manualForwardVersion: 0,
      loading: false,
    });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  function stubClipboardWrite() {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    return writeText;
  }

  function clientFor(
    overrides: Partial<
      Pick<RemoteDesktopClient, "listPorts" | "startPortForward" | "enterPortForward">
    >,
  ): void {
    const listPorts =
      overrides.listPorts ??
      vi.fn<RemoteDesktopClient["listPorts"]>(async () => ({
        detected: [{ port: 3000, protocol: "http", label: "Vite" }],
        forwards: [],
      }));
    const client = { listPorts, ...overrides } as unknown as RemoteDesktopClient;
    useRemoteServersStore.setState({
      withClient: async (_desktopId, invoke) => invoke(client),
    });
  }

  it("loads detected ports and forwards one through the selected desktop client", async () => {
    render(<PortsPanel />);

    const row = await screen.findByRole("button", { name: /localhost:3000/u });
    expect(row).toHaveClass("poracode-sidebar-thread-row");
    expect(row).not.toHaveClass("m-thread-row");
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forward a port" })).not.toBeInTheDocument();
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
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Port 3000" })).not.toBeInTheDocument(),
    );

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

  it("places compact refresh at the bottom left and tightens the header gap", async () => {
    adaptiveLayout.compact = true;

    const { container } = render(<PortsPanel />);

    expect(screen.getByRole("button", { name: "Refresh" })).toHaveClass(
      "fixed",
      "left-[var(--m-page-inline)]",
    );
    expect(screen.getByRole("button", { name: "Forward a port" })).toHaveClass("fixed");
    expect(container.firstElementChild).toHaveClass("pt-1");
    expect(await screen.findByRole("button", { name: /localhost:3000/u })).toHaveClass(
      "m-thread-row",
    );
  });

  it("reloads when the header refresh version increments", async () => {
    const listPorts = vi.fn<RemoteDesktopClient["listPorts"]>(async () => ({
      detected: [{ port: 3000, protocol: "http", label: "Vite" }],
      forwards: [],
    }));
    const client = { listPorts } as unknown as RemoteDesktopClient;
    useRemoteServersStore.setState({
      withClient: async (_desktopId, invoke) => invoke(client),
    });

    render(<PortsPanel />);
    await screen.findByRole("button", { name: /localhost:3000/u });
    expect(listPorts).toHaveBeenCalledTimes(1);

    usePortsPanelChromeStore.getState().requestRefresh();
    await waitFor(() => expect(listPorts).toHaveBeenCalledTimes(2));
  });

  it("keeps the forward listed and opens nothing when start issues no enter path", async () => {
    const warning = vi.spyOn(toast, "warning").mockImplementation(() => undefined as never);
    clientFor({
      listPorts: vi
        .fn<RemoteDesktopClient["listPorts"]>()
        .mockResolvedValueOnce({
          detected: [{ port: 3000, protocol: "http", label: "Vite" }],
          forwards: [],
        })
        .mockResolvedValue({ detected: [], forwards: [forward] }),
      startPortForward: vi.fn<RemoteDesktopClient["startPortForward"]>(async () => ({ forward })),
    });

    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /localhost:3000/u }));

    await waitFor(() =>
      expect(warning).toHaveBeenCalledWith("Browser forwarding isn't set up on this desktop."),
    );
    expect(window.poracode.openExternal).not.toHaveBeenCalled();
    expect(await screen.findByText("Port 3000")).toBeInTheDocument();
  });

  it("reports an unsupported desktop when browser-forward support is authoritatively absent", async () => {
    useRemoteServersStore.setState((state) => ({
      servers: state.servers.map((entry) => ({ ...entry, browserForwardAvailable: false })),
    }));
    const warning = vi.spyOn(toast, "warning").mockImplementation(() => undefined as never);
    clientFor({
      listPorts: vi
        .fn<RemoteDesktopClient["listPorts"]>()
        .mockResolvedValueOnce({
          detected: [{ port: 3000, protocol: "http", label: "Vite" }],
          forwards: [],
        })
        .mockResolvedValue({ detected: [], forwards: [forward] }),
      startPortForward: vi.fn<RemoteDesktopClient["startPortForward"]>(async () => ({ forward })),
    });

    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /localhost:3000/u }));

    await waitFor(() =>
      expect(warning).toHaveBeenCalledWith(
        "This desktop's Poracode version doesn't support browser forwarding. Update Poracode on your desktop.",
      ),
    );
    expect(window.poracode.openExternal).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    "blocks legacy browser URLs with support %s while creating raw forwards",
    async (support) => {
      useRemoteServersStore.setState((state) => ({
        servers: state.servers.map(({ browserForwardAvailable: _support, ...entry }) => ({
          ...entry,
          ...(support === undefined ? {} : { browserForwardAvailable: support }),
        })),
      }));
      const warning = vi.spyOn(toast, "warning").mockImplementation(() => undefined as never);
      const writeText = stubClipboardWrite();
      const enterPortForward = vi.fn<RemoteDesktopClient["enterPortForward"]>(async () => ({
        enterPath: "/forward/forward-1/enter?fwt=legacy",
      }));
      const startPortForward = vi.fn<RemoteDesktopClient["startPortForward"]>(async () => ({
        forward,
        enterPath: "/forward/forward-1/enter?fwt=legacy",
      }));
      clientFor({
        listPorts: vi
          .fn<RemoteDesktopClient["listPorts"]>()
          .mockResolvedValueOnce({
            detected: [{ port: 3000, protocol: "http", label: "Vite" }],
            forwards: [],
          })
          .mockResolvedValue({ detected: [], forwards: [forward] }),
        startPortForward,
        enterPortForward,
      });
      render(<PortsPanel />);
      fireEvent.click(await screen.findByRole("button", { name: /localhost:3000/u }));
      await waitFor(() => expect(startPortForward).toHaveBeenCalledWith(3000));
      fireEvent.click(await screen.findByRole("button", { name: /Port 3000/u }));
      fireEvent.click(screen.getByRole("button", { name: "Actions" }));
      fireEvent.click(await screen.findByText("Copy link"));
      expect(warning).toHaveBeenCalled();
      expect(enterPortForward).not.toHaveBeenCalled();
      expect(window.poracode.openExternal).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    },
  );

  it("surfaces the definitive 503 on open instead of falling back to raw HTTP", async () => {
    const warning = vi.spyOn(toast, "warning").mockImplementation(() => undefined as never);
    clientFor({
      listPorts: vi.fn<RemoteDesktopClient["listPorts"]>(async () => ({
        detected: [],
        forwards: [forward],
      })),
      enterPortForward: vi.fn<RemoteDesktopClient["enterPortForward"]>(async () => {
        throw new RemoteClientError(
          "Browser forwarding is not configured.",
          503,
          "forward_browser_unavailable",
        );
      }),
    });

    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Port 3000/u }));

    await waitFor(() =>
      expect(warning).toHaveBeenCalledWith("Browser forwarding isn't set up on this desktop."),
    );
    expect(window.poracode.openExternal).not.toHaveBeenCalled();
    expect(screen.getByText("Port 3000")).toBeInTheDocument();
  });

  it("copies the enter link and the raw address as separate labeled actions on a direct endpoint", async () => {
    const writeText = stubClipboardWrite();
    const success = vi.spyOn(toast, "success").mockImplementation(() => undefined as never);
    const enterPortForward = vi.fn<RemoteDesktopClient["enterPortForward"]>(async () => ({
      enterPath: "/forward/forward-1/enter?fwt=fresh",
    }));
    clientFor({
      listPorts: vi.fn<RemoteDesktopClient["listPorts"]>(async () => ({
        detected: [],
        forwards: [forward],
      })),
      enterPortForward,
    });

    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Actions" }));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy raw address" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy raw address" }));
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        "Copied raw TCP address (LAN only) — opens outside the isolated forward.",
      ),
    );
    expect(writeText).toHaveBeenCalledWith("http://192.168.1.10:4100/");
    expect(enterPortForward).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Copied"));
    expect(enterPortForward).toHaveBeenCalledWith("forward-1");
    expect(writeText).toHaveBeenCalledWith(
      "http://192.168.1.10:3200/forward/forward-1/enter?fwt=fresh",
    );
  });

  it("offers only the enter link on a relay endpoint", async () => {
    useRemoteServersStore.setState((state) => ({
      servers: state.servers.map((entry) => ({
        ...entry,
        endpoint: "https://relay.example.test/s/desktop-1/",
      })),
    }));
    const writeText = stubClipboardWrite();
    const success = vi.spyOn(toast, "success").mockImplementation(() => undefined as never);
    clientFor({
      listPorts: vi.fn<RemoteDesktopClient["listPorts"]>(async () => ({
        detected: [],
        forwards: [forward],
      })),
      enterPortForward: vi.fn<RemoteDesktopClient["enterPortForward"]>(async () => ({
        enterPath: "/forward/forward-1/enter?fwt=fresh",
      })),
    });

    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Actions" }));
    expect(screen.queryByRole("button", { name: "Copy raw address" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Copied"));
    expect(writeText).toHaveBeenCalledWith(
      "https://relay.example.test/s/desktop-1/forward/forward-1/enter?fwt=fresh",
    );
  });

  it("writes nothing to the clipboard when copying the link reports browser forwarding unavailable", async () => {
    const writeText = stubClipboardWrite();
    const warning = vi.spyOn(toast, "warning").mockImplementation(() => undefined as never);
    clientFor({
      listPorts: vi.fn<RemoteDesktopClient["listPorts"]>(async () => ({
        detected: [],
        forwards: [forward],
      })),
      enterPortForward: vi.fn<RemoteDesktopClient["enterPortForward"]>(async () => {
        throw new RemoteClientError(
          "Browser forwarding is not configured.",
          503,
          "forward_browser_unavailable",
        );
      }),
    });

    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(warning).toHaveBeenCalledWith("Browser forwarding isn't set up on this desktop."),
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("keeps the forward listed when the browser fails to open the enter URL", async () => {
    const danger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        openExternal: vi.fn<(url: string) => Promise<void>>(async () => {
          throw new Error("no browser");
        }),
      } as unknown as PoracodeBridge,
    });
    clientFor({
      listPorts: vi.fn<RemoteDesktopClient["listPorts"]>(async () => ({
        detected: [],
        forwards: [forward],
      })),
      enterPortForward: vi.fn<RemoteDesktopClient["enterPortForward"]>(async () => ({
        enterPath: "/forward/forward-1/enter?fwt=fresh",
      })),
    });

    render(<PortsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Port 3000/u }));

    await waitFor(() =>
      expect(window.poracode.openExternal).toHaveBeenCalledWith(
        "http://192.168.1.10:3200/forward/forward-1/enter?fwt=fresh",
      ),
    );
    await waitFor(() => expect(danger).toHaveBeenCalled());
    expect(screen.getByText("Port 3000")).toBeInTheDocument();
  });
});
