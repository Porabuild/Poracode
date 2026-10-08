import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { UsageSettings } from "./UsageSettings";

const session = vi.hoisted(() => ({ remote: false, owner: null as string | null }));
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
    selectBrowserBridgeServer: () => undefined,
  };
});
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
    session.owner = null;
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

  it("defaults attached Electron to its owner rather than the first paired host", () => {
    session.remote = true;
    session.owner = "environment";
    render(<UsageSettings />);
    expect(screen.getByTestId("host-view").textContent).toBe("environment");
    expect(screen.queryByRole("option", { name: "This host" })).toBeNull();
    expect(getProviderUsage).not.toHaveBeenCalled();
  });

  it("selects the actual owning connection when remote records hydrate after mount", async () => {
    session.remote = true;
    useRemoteServersStore.setState({ servers: [] });
    render(<UsageSettings />);
    await act(() => useRemoteServersStore.setState({ servers: [host("parent")] }));
    expect(screen.getByTestId("host-view").textContent).toBe("parent");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      JSON.stringify(["connection", "parent"]),
    );
  });
});
