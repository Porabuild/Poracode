import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { BrowserRemoteConnectionGate } from "./BrowserRemoteConnectionGate";

const desktop: RemoteServerRecord = {
  desktopId: "desktop",
  label: "Desktop",
  endpoint: "http://desktop.test/",
  accessToken: "token",
  scopes: [],
};

describe("BrowserRemoteConnectionGate", () => {
  beforeEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    usePanelStore.setState({ settingsOpen: false, settingsSection: "general" });
  });

  afterEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
  });

  it("does not gate the Electron view", () => {
    render(
      <BrowserRemoteConnectionGate>
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByText("Remote feature")).toBeInTheDocument();
  });

  it("shows pairing instead of mounting the remote view while the browser is disconnected", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);

    render(
      <BrowserRemoteConnectionGate>
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.queryByText("Remote feature")).not.toBeInTheDocument();
    expect(screen.getByText("No remote environments connected yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pair with Poracode" }));
    expect(usePanelStore.getState()).toMatchObject({
      settingsOpen: true,
      settingsSection: "remoteServers",
    });
  });

  it("keeps the pairing page hidden while restoring a saved browser connection", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);

    const { rerender } = render(
      <BrowserRemoteConnectionGate checkingConnection fallback={<div>Full connection page</div>}>
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByRole("img", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Full connection page")).not.toBeInTheDocument();
    expect(screen.queryByText("Remote feature")).not.toBeInTheDocument();

    act(() => {
      useRemoteServersStore.setState({
        servers: [desktop],
        runtime: { desktop: { status: "online", projects: [], threads: [] } },
      });
    });
    rerender(
      <BrowserRemoteConnectionGate
        checkingConnection={false}
        fallback={<div>Full connection page</div>}
      >
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByText("Remote feature")).toBeInTheDocument();
    expect(screen.queryByText("Full connection page")).not.toBeInTheDocument();
  });

  it("keeps the full connection page visible for a saved but offline browser server", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);
    useRemoteServersStore.setState({
      servers: [desktop],
      runtime: { desktop: { status: "offline", projects: [], threads: [] } },
    });

    render(
      <BrowserRemoteConnectionGate fallback={<div>Full connection page</div>}>
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByText("Full connection page")).toBeInTheDocument();
    expect(screen.queryByText("No remote environments connected yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Remote feature")).not.toBeInTheDocument();
  });

  it("mounts the browser app for a saved server while it is offline", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);
    useRemoteServersStore.setState({
      servers: [desktop],
      runtime: { desktop: { status: "offline", projects: [], threads: [] } },
    });

    render(
      <BrowserRemoteConnectionGate allowOffline fallback={<div>Full connection page</div>}>
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByText("Remote feature")).toBeInTheDocument();
    expect(screen.queryByText("Full connection page")).not.toBeInTheDocument();
  });

  it("keeps the pairing page hidden while a saved browser server is connecting", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);
    useRemoteServersStore.setState({
      servers: [desktop],
      runtime: { desktop: { status: "connecting", projects: [], threads: [] } },
    });

    render(
      <BrowserRemoteConnectionGate
        checkingConnection={false}
        fallback={<div>Full connection page</div>}
      >
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByRole("img", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Full connection page")).not.toBeInTheDocument();
    expect(screen.queryByText("Remote feature")).not.toBeInTheDocument();
  });

  it("keeps an online remote view mounted while another saved server is connecting", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);
    const connectingDesktop = {
      ...desktop,
      desktopId: "connecting-desktop",
      label: "Connecting desktop",
    };
    useRemoteServersStore.setState({
      servers: [desktop, connectingDesktop],
      runtime: {
        desktop: { status: "online", projects: [], threads: [] },
        "connecting-desktop": { status: "connecting", projects: [], threads: [] },
      },
    });

    render(
      <BrowserRemoteConnectionGate fallback={<div>Full connection page</div>}>
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByText("Remote feature")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Loading" })).not.toBeInTheDocument();
    expect(screen.queryByText("Full connection page")).not.toBeInTheDocument();
  });

  it("mounts the browser app without waiting for a saved server to connect", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);
    useRemoteServersStore.setState({
      servers: [desktop],
      runtime: { desktop: { status: "connecting", projects: [], threads: [] } },
    });

    render(
      <BrowserRemoteConnectionGate
        allowOffline
        checkingConnection={false}
        fallback={<div>Full connection page</div>}
      >
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByText("Remote feature")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Loading" })).not.toBeInTheDocument();
    expect(screen.queryByText("Full connection page")).not.toBeInTheDocument();
  });

  it("mounts the remote view as soon as a browser server is online", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);
    const { rerender } = render(
      <BrowserRemoteConnectionGate fallback={<div>Full connection page</div>}>
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByText("Full connection page")).toBeInTheDocument();

    act(() => {
      useRemoteServersStore.setState({
        servers: [desktop],
        runtime: { desktop: { status: "online", projects: [], threads: [] } },
      });
    });
    rerender(
      <BrowserRemoteConnectionGate fallback={<div>Full connection page</div>}>
        <div>Remote feature</div>
      </BrowserRemoteConnectionGate>,
    );

    expect(screen.getByText("Remote feature")).toBeInTheDocument();
    expect(screen.queryByText("Full connection page")).not.toBeInTheDocument();
  });
});
