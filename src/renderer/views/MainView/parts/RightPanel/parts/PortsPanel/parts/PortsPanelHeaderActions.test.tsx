import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { usePortsPanelChromeStore } from "../portsPanelStore";
import { PortsPanelHeaderActions } from "./PortsPanelHeaderActions";

describe("PortsPanelHeaderActions", () => {
  const originalWithClient = useRemoteServersStore.getState().withClient;

  beforeEach(() => {
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
    });
    usePortsPanelChromeStore.setState({
      refreshVersion: 0,
      manualForwardVersion: 0,
      loading: false,
    });
  });

  afterEach(() => {
    useRemoteServersStore.setState({ servers: [], runtime: {}, withClient: originalWithClient });
    usePortsPanelChromeStore.setState({
      refreshVersion: 0,
      manualForwardVersion: 0,
      loading: false,
    });
  });

  it("puts small header actions on the chrome store", () => {
    render(<PortsPanelHeaderActions dragControlClass="header-ctl" />);

    fireEvent.click(screen.getByRole("button", { name: "Forward a port" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(usePortsPanelChromeStore.getState().manualForwardVersion).toBe(1);
    expect(usePortsPanelChromeStore.getState().refreshVersion).toBe(1);
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveClass("header-ctl");
  });
});
