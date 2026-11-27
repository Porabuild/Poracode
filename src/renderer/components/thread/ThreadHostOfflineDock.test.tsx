import { act, cleanup, fireEvent, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { msg as sharedMsg } from "@/shared/messages";
import type { Thread } from "@/shared/contracts";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import type { RemoteServerRuntime } from "@/renderer/state/remoteServers/types";
import { useEntityHostOffline } from "@/renderer/hooks/useEntityHostReady";
import {
  setManagedRootCatalogStatus,
  __resetManagedRootCatalogStoreForTest,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { resolveHostOfflineOwner, isSessionExpiredFailure } from "./ThreadHostOfflineDockModel";
import { ThreadHostOfflineDock } from "./ThreadHostOfflineDock";

const { loopbackState, intake, reconnect } = vi.hoisted(() => ({
  loopbackState: {
    offline: false,
    listeners: new Set<(offline: boolean) => void>(),
    setOffline(next: boolean) {
      this.offline = next;
      for (const listener of [...this.listeners]) listener(next);
    },
  },
  intake: { retryManagedLoopbackIntake: vi.fn<() => void>() },
  reconnect: { reconnectServer: vi.fn<(key: string) => Promise<void>>() },
}));

vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/renderer/hostTransport/loopbackHttpWsTransport")>();
  return {
    ...actual,
    isManagedLoopbackOffline: () => loopbackState.offline,
    subscribeManagedLoopbackOffline: (listener: (offline: boolean) => void) => {
      loopbackState.listeners.add(listener);
      return () => {
        loopbackState.listeners.delete(listener);
      };
    },
    retryManagedLoopbackIntake: intake.retryManagedLoopbackIntake,
  };
});

const pairedThread = { remoteServerId: "pc", remoteId: "remote-thread" } as Thread;
const managedThread = {} as Thread;
const pairedOwner = { kind: "paired", connectionKey: "pc" } as const;
const managedOwner = { kind: "managed" } as const;

function runtime(status: RemoteServerRuntime["status"], message?: string): RemoteServerRuntime {
  return {
    status,
    projects: [],
    threads: [],
    ...(message !== undefined ? { message } : {}),
  } as RemoteServerRuntime;
}

function setPairedStatus(status: RemoteServerRuntime["status"], message?: string): void {
  useRemoteServersStore.setState({ runtime: { pc: runtime(status, message) } });
}

const originalReconnectServer = useRemoteServersStore.getState().reconnectServer;

describe("host offline notice", () => {
  afterEach(() => {
    cleanup();
    loopbackState.listeners.clear();
    loopbackState.setOffline(false);
    intake.retryManagedLoopbackIntake.mockClear();
    reconnect.reconnectServer.mockClear();
    useRemoteServersStore.setState({
      runtime: {},
      reconnectServer: originalReconnectServer,
    });
    usePanelStore.setState({
      settingsSection: null,
      settingsOpen: false,
      activeSettingsSection: "general",
      settingsAnchor: null,
      settingsMachineId: null,
    });
    __resetManagedRootCatalogStoreForTest();
  });

  it("warns in the composer that the conversation may be out of date", () => {
    render(<ThreadHostOfflineDock owner={managedOwner} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Server offline — this conversation may be out of date.",
    );
  });

  it.each([
    ["offline", true],
    ["error", true],
    ["connecting", false],
    ["online", false],
  ] as const)("treats a paired host that is %s as offline: %s", (status, offline) => {
    setPairedStatus(status);
    expect(renderHook(() => useEntityHostOffline(pairedThread)).result.current).toBe(offline);
  });

  it("treats the desktop's own host as offline only when the loopback leg is offline", () => {
    const hook = renderHook(() => useEntityHostOffline(managedThread));
    expect(hook.result.current).toBe(false);

    // A catalog read hiccup alone never marks local threads offline while connected.
    act(() => {
      setManagedRootCatalogStatus({ status: "failed", message: "catalog failed", retrying: false });
    });
    expect(hook.result.current).toBe(false);

    act(() => {
      loopbackState.setOffline(true);
    });
    expect(hook.result.current).toBe(true);

    act(() => {
      loopbackState.setOffline(false);
    });
    expect(hook.result.current).toBe(false);
  });

  // Root/paired routing: the retry must target the same owner the notice used.
  describe("root/paired routing", () => {
    it("routes a projected remote thread to its paired connection key", () => {
      expect(resolveHostOfflineOwner(pairedThread)).toEqual({
        kind: "paired",
        connectionKey: "pc",
      });
    });

    it("routes a local thread to the desktop's managed host", () => {
      expect(resolveHostOfflineOwner(managedThread)).toEqual({ kind: "managed" });
    });

    it("treats a partial projection as managed (matches remoteOwner semantics)", () => {
      expect(resolveHostOfflineOwner({ remoteServerId: "pc" } as Thread)).toEqual({
        kind: "managed",
      });
    });

    it("reconnects the paired host through generation-safe reconnectServer", () => {
      reconnect.reconnectServer.mockResolvedValue(undefined);
      useRemoteServersStore.setState({
        reconnectServer: reconnect.reconnectServer,
        runtime: { pc: runtime("offline") },
      });
      render(<ThreadHostOfflineDock owner={pairedOwner} />);
      fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
      expect(reconnect.reconnectServer).toHaveBeenCalledExactlyOnceWith("pc");
      expect(intake.retryManagedLoopbackIntake).not.toHaveBeenCalled();
    });

    it("retries the desktop's own host through retryManagedLoopbackIntake", () => {
      useRemoteServersStore.setState({ reconnectServer: reconnect.reconnectServer });
      render(<ThreadHostOfflineDock owner={managedOwner} />);
      fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
      expect(intake.retryManagedLoopbackIntake).toHaveBeenCalledOnce();
      expect(reconnect.reconnectServer).not.toHaveBeenCalled();
    });
  });

  describe("recovery states", () => {
    it("shows a disabled pending state while a paired host is connecting", () => {
      useRemoteServersStore.setState({
        reconnectServer: reconnect.reconnectServer,
        runtime: { pc: runtime("connecting") },
      });
      render(<ThreadHostOfflineDock owner={pairedOwner} />);
      expect(screen.getByRole("status")).toHaveTextContent("Reconnecting to the server…");
      expect(screen.getByRole("button", { name: "Connecting…" })).toBeDisabled();
      // No repeated jobs while connecting.
      fireEvent.click(screen.getByRole("button", { name: "Connecting…" }));
      expect(reconnect.reconnectServer).not.toHaveBeenCalled();
    });

    it("routes an expired session to connect/pair settings instead of reconnecting", () => {
      useRemoteServersStore.setState({
        reconnectServer: reconnect.reconnectServer,
        runtime: { pc: runtime("error", sharedMsg("remote.session.expired")) },
      });
      render(<ThreadHostOfflineDock owner={pairedOwner} />);
      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Connect" }));
      expect(usePanelStore.getState().settingsSection).toBe("remoteServers");
      expect(reconnect.reconnectServer).not.toHaveBeenCalled();
    });

    it("keeps a generic error retryable (not mistaken for an expired session)", () => {
      expect(isSessionExpiredFailure("error", "protocol version mismatch")).toBe(false);
      expect(isSessionExpiredFailure("error", sharedMsg("remote.session.expired"))).toBe(true);
      expect(isSessionExpiredFailure("offline", sharedMsg("remote.session.expired"))).toBe(false);
    });
  });
});
