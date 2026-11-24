import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteServerRecord } from "./remoteServers/types";
import { useAppStore } from "./appStore";
import { useMachineSelectionStore } from "./machineSelectionStore";
import {
  chooseMachine,
  useAgentsScopeMachines,
  useMachines,
  useWslDistroListStore,
  type MachineDescriptor,
} from "./machines";
import { useRemoteServersStore } from "./remoteServersStore";
import { projectRemoteProject } from "./remoteProjection";
import { useSettingsHostStore } from "./settingsHostStore";

const session = vi.hoisted(() => ({ remote: true }));
vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => session.remote,
}));
const selectBrowserBridgeDesktop = vi.hoisted(() => vi.fn<(desktopId: string) => void>());
vi.mock("@/renderer/state/remoteServers/browserBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/state/remoteServers/browserBridge")>()),
  selectBrowserBridgeDesktop,
}));
const bound = vi.hoisted(() => ({ host: undefined as RemoteServerRecord | undefined }));
vi.mock("./settingsHostStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./settingsHostStore")>()),
  useSettingsHostServer: () => bound.host,
}));

function host(desktopId: string, label: string): RemoteServerRecord {
  return { desktopId, label, endpoint: `https://${desktopId}.test/`, accessToken: "t", scopes: [] };
}

const macWsl: MachineDescriptor = {
  id: "remote:mac/wsl:Ubuntu",
  ref: { host: "remote", desktopId: "mac", env: { kind: "wsl", distro: "Ubuntu" } },
  kind: "remote-wsl",
  label: "Mac · WSL Ubuntu",
  status: "online",
  desktopId: "mac",
  wslDistro: "Ubuntu",
};

describe("chooseMachine", () => {
  afterEach(() => {
    session.remote = true;
    selectBrowserBridgeDesktop.mockClear();
    useMachineSelectionStore.setState({ selectedMachineId: "local" });
    useSettingsHostStore.setState({ desktopId: null });
  });

  it("rebinds a remote client to another host and selects that host's local entry", () => {
    chooseMachine(macWsl);
    expect(selectBrowserBridgeDesktop).toHaveBeenCalledWith("mac");
    expect(useSettingsHostStore.getState().desktopId).toBe("mac");
    expect(useMachineSelectionStore.getState().selectedMachineId).toBe("local/wsl:Ubuntu");
  });

  it("keeps the desktop's remote machine selection without touching the bridge", () => {
    session.remote = false;
    chooseMachine(macWsl);
    expect(selectBrowserBridgeDesktop).not.toHaveBeenCalled();
    expect(useMachineSelectionStore.getState().selectedMachineId).toBe(macWsl.id);
  });

  it("ignores the previous host's enumerated distros after the bridge moves", () => {
    useRemoteServersStore.setState({
      servers: [host("pc", "PC"), host("mac", "Mac")],
      runtime: {},
    });
    bound.host = host("mac", "Mac");
    useWslDistroListStore.setState({ distros: ["Debian"], loadedFor: "pc" });
    const { result, rerender } = renderHook(() => useMachines().map((machine) => machine.label));
    expect(result.current).toEqual(["Mac", "PC"]);

    useWslDistroListStore.setState({ distros: ["Debian"], loadedFor: "mac" });
    rerender();
    expect(result.current).toEqual(["Mac", "Mac · WSL Debian", "PC"]);
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useWslDistroListStore.setState({ distros: [], loadedFor: null });
  });
});

describe("useAgentsScopeMachines", () => {
  afterEach(() => {
    bound.host = undefined;
    useAppStore.setState({ projects: [] });
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useWslDistroListStore.setState({ distros: [], loadedFor: null });
    useMachineSelectionStore.setState({ selectedMachineId: "local" });
  });

  it("maps the bridge host and its projects onto the local entry and keeps other hosts' projects", () => {
    bound.host = host("mac", "Mac");
    useRemoteServersStore.setState({ servers: [host("pc", "PC")], runtime: {} });
    useWslDistroListStore.setState({ distros: [], loadedFor: "mac" });
    useAppStore.setState({
      projects: [
        {
          id: "bridge-project",
          name: "Bridge project",
          createdAt: "2026-11-21T00:00:00.000Z",
          location: { kind: "posix", path: "/repo" },
        },
        {
          id: "paired-project",
          name: "Paired project",
          createdAt: "2026-11-21T00:00:00.000Z",
          location: { kind: "posix", path: "/srv/repo", remoteServerId: "pc" },
        },
      ],
    });

    const { result } = renderHook(() => useAgentsScopeMachines(useMachines()));

    // The bridge host's own project keys to the local entry; the other paired
    // host keeps its remote id. Both projectless hosts are dropped.
    expect(result.current.map((machine) => machine.id)).toEqual(["local", "remote:pc"]);
  });

  it("keeps the bridge host's WSL distros that host its own active projects", () => {
    bound.host = host("pc", "PC");
    useRemoteServersStore.setState({
      servers: [host("pc", "PC"), host("mac", "Mac")],
      runtime: {},
    });
    useWslDistroListStore.setState({ distros: ["Debian", "Ubuntu"], loadedFor: "pc" });
    useAppStore.setState({
      projects: [
        // Mirrored projects of the bridge host are stamped with its remote id,
        // while the host itself is listed as the local entries.
        projectRemoteProject("pc", {
          id: "ubuntu",
          name: "Ubuntu project",
          createdAt: "2026-11-21T00:00:00.000Z",
          location: {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/repo",
            uncPath: "\\\\wsl$\\Ubuntu\\repo",
          },
        }),
      ],
    });

    const { result } = renderHook(() => useAgentsScopeMachines(useMachines()));

    // Debian hosts no project and Mac hosts none, so neither is offered.
    expect(result.current.map((machine) => machine.id)).toEqual(["local", "local/wsl:Ubuntu"]);
  });
});
