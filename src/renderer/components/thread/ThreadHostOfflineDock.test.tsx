import { cleanup, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRuntime } from "@/renderer/state/remoteServers/types";
import { useEntityHostOffline } from "@/renderer/hooks/useEntityHostReady";
import {
  setManagedRootCatalogStatus,
  __resetManagedRootCatalogStoreForTest,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { ThreadHostOfflineDock } from "./ThreadHostOfflineDock";

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

  it("treats the desktop's own host as offline only once its connection failed", () => {
    const hook = renderHook(() => useEntityHostOffline(managedThread));
    expect(hook.result.current).toBe(false);
    setManagedRootCatalogStatus({ status: "failed", message: "down", retrying: true });
    hook.rerender();
    expect(hook.result.current).toBe(true);
  });
});
