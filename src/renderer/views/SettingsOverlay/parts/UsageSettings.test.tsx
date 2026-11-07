import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { useSettingsHostStore } from "@/renderer/state/settingsHostStore";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import { UsageSettings } from "./UsageSettings";

const session = vi.hoisted(() => ({
  remote: false,
  compact: true,
  owner: null as string | null,
  bridgeHost: undefined as RemoteServerRecord | undefined,
}));
const getProviderUsage = vi.hoisted(() =>
  vi.fn<() => Promise<{ snapshots: []; fromCache: boolean }>>(),
);
vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => session.remote,
  readBridge: () => ({ getProviderUsage }),
}));
vi.mock("@/renderer/state/remoteServersStore", async () => {
  const { create } = await import("zustand");
  return {
    useRemoteServersStore: create(() => ({ servers: [] })),
    getStandaloneOwnerDesktopId: () => session.owner,
  };
});
vi.mock("@/renderer/state/settingsHostStore", async () => {
  const { create } = await import("zustand");
  return {
    useSettingsHostStore: create(() => ({ desktopId: null as string | null })),
    useSettingsHostServer: () => session.bridgeHost,
  };
});
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => session.compact }));
vi.mock("./HostUsageSettings", () => ({
  HostUsageSettings: (props: { connectionId: string; selector: ReactNode }) => (
    <div>
      {props.selector}
      <span data-testid="host-view">{props.connectionId}</span>
    </div>
  ),
}));
vi.mock("@/renderer/components/providers/settings/UsageProviderRow", () => ({
  UsageProviderRow: () => <span />,
}));
vi.mock("./SettingsForm", () => ({
  SettingsPage: (props: { children: ReactNode }) => <div>{props.children}</div>,
  SettingRow: (props: { children: ReactNode }) => <div>{props.children}</div>,
}));
vi.mock("@/renderer/components/common", () => ({
  Button: () => <span />,
  ToggleSwitch: () => <span />,
  Select: (props: {
    options: { id: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label="Usage host"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

function host(connectionId: string): RemoteServerRecord {
  return {
    connectionId,
    desktopId: "same-host",
    label: connectionId,
    endpoint: "https://host.test",
    accessToken: "fixture",
    scopes: ["session:read"],
  };
}

describe("usage host selection", () => {
  beforeEach(() => {
    session.remote = false;
    session.compact = true;
    session.owner = null;
    session.bridgeHost = undefined;
    useUsageScopeStore.setState({ desktopId: null });
    useSettingsHostStore.setState({ desktopId: null });
    getProviderUsage.mockResolvedValue({ snapshots: [], fromCache: true });
    useRemoteServersStore.setState({
      servers: [
        host("parent"),
        {
          ...host("environment"),
          transport: {
            kind: "environment",
            environmentId: "child",
            parentConnectionId: "parent",
            childDesktopId: "same-host",
          },
        },
      ],
    });
  });
  afterEach(cleanup);

  it("selects environment connection identity rather than an aliased desktop ID, then returns to current host", () => {
    render(<UsageSettings />);
    expect(screen.queryByTestId("host-view")).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: JSON.stringify(["connection", "environment"]) },
    });
    expect(screen.getByTestId("host-view").textContent).toBe("environment");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "current" } });
    expect(screen.queryByTestId("host-view")).toBeNull();
  });

  it("keeps the current-host option reachable after the last selected connection is removed", async () => {
    useRemoteServersStore.setState({ servers: [host("parent")] });
    render(<UsageSettings />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: JSON.stringify(["connection", "parent"]) },
    });
    await act(() => useRemoteServersStore.setState({ servers: [] }));
    expect(screen.getByTestId("host-view").textContent).toBe("parent");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "current" } });
    expect(screen.queryByTestId("host-view")).toBeNull();
  });

  it("follows the scope the Usage panel shares and leaves the wide layout to the host bar", () => {
    session.compact = false;
    useUsageScopeStore.setState({ desktopId: "parent" });
    render(<UsageSettings />);
    expect(screen.getByTestId("host-view").textContent).toBe("parent");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("defaults attached Electron to its owner rather than the first paired host", () => {
    session.remote = true;
    session.owner = "environment";
    session.bridgeHost = host("parent");
    render(<UsageSettings />);
    expect(screen.getByTestId("host-view").textContent).toBe("environment");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(getProviderUsage).not.toHaveBeenCalled();
  });

  it("shows the chosen settings host in a remote client", () => {
    session.remote = true;
    session.owner = "environment";
    session.bridgeHost = host("parent");
    useSettingsHostStore.setState({ desktopId: "parent" });
    render(<UsageSettings />);
    expect(screen.getByTestId("host-view").textContent).toBe("parent");
  });

  it("keeps a connection named current distinct from the local sentinel", () => {
    useRemoteServersStore.setState({ servers: [host("current")] });
    render(<UsageSettings />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: JSON.stringify(["connection", "current"]) },
    });
    expect(screen.getByTestId("host-view").textContent).toBe("current");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "current" } });
    expect(screen.queryByTestId("host-view")).toBeNull();
  });
});
