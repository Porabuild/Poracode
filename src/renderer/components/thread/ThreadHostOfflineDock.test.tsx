import { act, cleanup, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRuntime } from "@/renderer/state/remoteServers/types";
import { useEntityHostOffline } from "@/renderer/hooks/useEntityHostReady";
import {
  setManagedRootCatalogStatus,
  __resetManagedRootCatalogStoreForTest,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { ThreadHostOfflineDock } from "./ThreadHostOfflineDock";

const loopbackState = vi.hoisted(() => ({
  offline: false,
  listeners: new Set<(offline: boolean) => void>(),
  setOffline(next: boolean) {
    this.offline = next;
    for (const listener of [...this.listeners]) listener(next);
  },
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
  };
});

const pairedThread = { remoteServerId: "pc", remoteId: "remote-thread" };
const managedThread = {};

function setPairedStatus(status: RemoteServerRuntime["status"]): void {
  useRemoteServersStore.setState({
    runtime: { pc: { status, projects: [], threads: [] } as RemoteServerRuntime },
  });
}

describe("host offline notice", () => {
  afterEach(() => {
    cleanup();
    loopbackState.listeners.clear();
    loopbackState.setOffline(false);
    useRemoteServersStore.setState({ runtime: {} });
    __resetManagedRootCatalogStoreForTest();
  });

  it("warns in the composer that the conversation may be out of date", () => {
    render(<ThreadHostOfflineDock />);
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
});
