import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteServerRecord } from "./remoteServers/types";
import { useMachineSelectionStore } from "./machineSelectionStore";
import {
  chooseMachine,
  useMachines,
  useWslDistroListStore,
  type MachineDescriptor,
} from "./machines";
import { useRemoteServersStore } from "./remoteServersStore";
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
