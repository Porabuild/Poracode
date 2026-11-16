import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RemoteBoundedReadProtocolError,
  RemoteClientError,
  RemoteDesktopClient,
} from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { useEntityHostOffline } from "@/renderer/hooks/useEntityHostReady";
import {
  installElectronClientRuntime,
  isDesktopLoopbackIntakeActive,
  resetDesktopLoopbackIntakeForTest,
  startDesktopLoopbackEventIntake,
  __setDesktopLoopbackIntakeTestSeamsForTest,
} from "@/renderer/clientRuntime";
import {
  isManagedLoopbackOffline,
  readManagedLoopbackActivation,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  DesktopLoopbackIntake,
  type DesktopLoopbackIntakeDeps,
} from "@/renderer/state/remoteServers/desktopLoopbackIntake";
import {
  __setManagedRootRetryDelayForTest,
  installManagedRootCatalogRuntime,
  refreshManagedRootCatalogSoon,
} from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import { getManagedRootCatalogStatus } from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { noteBoundedCatalogMembershipEvent } from "@/renderer/state/remoteServers/catalog/boundedCatalogController";
import { MANAGED_ROOT_CATALOG_KEY } from "@/renderer/state/managedRootCatalog/managedRootOrderFence";
import {
  failManagedParentAuthority,
  getManagedParentAuthorityState,
} from "@/renderer/state/remoteServers/managedLoopbackOwner";
import {
  activate,
  bootstrapPayloadFor,
  electronHost,
  setupManagedRootFixture,
  startFixtureServer,
  teardownManagedRootFixture,
  wsSocketFactory,
} from "./managedRootFixture";

async function installRecoveryRuntime(retryDelayMs: number) {
  const server = await startFixtureServer();
  const bootstrap = bootstrapPayloadFor(server);
  const host = electronHost(() => bootstrap);
  // oxlint-disable-next-line no-restricted-properties
  (window as unknown as { poracodeHost?: unknown }).poracodeHost = host;
  installElectronClientRuntime(host);
  __setDesktopLoopbackIntakeTestSeamsForTest({
    socketFactory: wsSocketFactory,
    retryDelayMs: 50,
    discoveryRetryMs: 80,
    descriptorRetryMs: 5_000,
  });
  __setManagedRootRetryDelayForTest(retryDelayMs);
  return server;
}

describe("managed root catalog retry and recovery", () => {
  beforeEach(setupManagedRootFixture);
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await teardownManagedRootFixture();
  });

  it("automatically retries transient page-1 snapshot failures and recovers to ready", async () => {
    await installRecoveryRuntime(20);

    const originalShellSnapshot = RemoteDesktopClient.prototype.boundedShellSnapshot;
    let attempts = 0;
    vi.spyOn(RemoteDesktopClient.prototype, "boundedShellSnapshot").mockImplementation(function (
      this: RemoteDesktopClient,
      options,
    ) {
      attempts += 1;
      if (attempts <= 2) {
        return Promise.reject(
          new RemoteClientError(
            "Database read is temporarily locked. Retry shortly.",
            503,
            "persistence_read_refused",
          ),
        );
      }
      return originalShellSnapshot.call(this, options);
    });

    installManagedRootCatalogRuntime();
    void startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 10_000 });
    await vi.waitFor(() => expect(getManagedRootCatalogStatus().status).toBe("ready"), {
      timeout: 10_000,
    });

    expect(attempts).toBe(3);
    expect(useAppStore.getState().threads.some((thread) => thread.id === "t-1")).toBe(true);
  });

  it("re-arms page-1 loading on membership events if auto-retries were exhausted", async () => {
    await installRecoveryRuntime(15);

    const originalShellSnapshot = RemoteDesktopClient.prototype.boundedShellSnapshot;
    let rejectSnapshot = true;
    vi.spyOn(RemoteDesktopClient.prototype, "boundedShellSnapshot").mockImplementation(function (
      this: RemoteDesktopClient,
      options,
    ) {
      if (rejectSnapshot) {
        return Promise.reject(
          new RemoteClientError(
            "Database read is temporarily locked. Retry shortly.",
            503,
            "persistence_read_refused",
          ),
        );
      }
      return originalShellSnapshot.call(this, options);
    });

    installManagedRootCatalogRuntime();
    void startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 10_000 });
    await vi.waitFor(() => expect(getManagedRootCatalogStatus().status).toBe("failed"), {
      timeout: 10_000,
    });

    rejectSnapshot = false;
    // Trigger a live remote-threads-changed membership broadcast from the host.
    await readManagedLoopbackActivation()!.client.sendThreadCommand({
      kind: "rename",
      threadId: "t-1",
      title: "Recovered after event",
    });

    await vi.waitFor(() => expect(getManagedRootCatalogStatus().status).toBe("ready"), {
      timeout: 10_000,
    });
    expect(useAppStore.getState().threads.find((thread) => thread.id === "t-1")?.title).toBe(
      "Recovered after event",
    );
  });

  it("recovers from protocol failure only when the failing catalog kind commits rows", async () => {
    const originalThreadListPage = RemoteDesktopClient.prototype.boundedThreadListPage;
    let failThreadProtocol = false;
    const threadPageSpy = vi
      .spyOn(RemoteDesktopClient.prototype, "boundedThreadListPage")
      .mockImplementation(function (this: RemoteDesktopClient, options) {
        if (failThreadProtocol) {
          return Promise.reject(
            new RemoteBoundedReadProtocolError(
              "bounded_response_invalid",
              "Simulated malformed page",
            ),
          );
        }
        return originalThreadListPage.call(this, options);
      });
    const projectPageSpy = vi.spyOn(RemoteDesktopClient.prototype, "boundedProjectListPage");

    await activate();
    // Wait for the initial background inventory passes spawned by page-1 install to finish completely.
    await vi.waitFor(
      () =>
        expect(
          threadPageSpy.mock.calls.some(([options]) => options?.mode === "inventory") &&
            projectPageSpy.mock.calls.some(([options]) => options?.mode === "inventory"),
        ).toBe(true),
      { timeout: 10_000 },
    );
    await Promise.allSettled([
      ...threadPageSpy.mock.results.map((result) => result.value as Promise<unknown>),
      ...projectPageSpy.mock.results.map((result) => result.value as Promise<unknown>),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 25));

    failThreadProtocol = true;
    const beforeThreadCalls = threadPageSpy.mock.calls.length;
    const beforeThreadInventoryCalls = threadPageSpy.mock.calls.filter(
      ([options]) => options?.mode === "inventory",
    ).length;
    refreshManagedRootCatalogSoon();
    await vi.waitFor(
      () => expect(threadPageSpy.mock.calls.length).toBeGreaterThan(beforeThreadCalls),
      { timeout: 10_000 },
    );
    await vi.waitFor(() => expect(getManagedRootCatalogStatus().status).toBe("failed"), {
      timeout: 10_000,
    });

    // A successful projects commit while threads are failing must not mask the thread failure.
    const beforeProjectCalls = projectPageSpy.mock.calls.length;
    const beforeProjectInventoryCalls = projectPageSpy.mock.calls.filter(
      ([options]) => options?.mode === "inventory",
    ).length;
    noteBoundedCatalogMembershipEvent(MANAGED_ROOT_CATALOG_KEY, "remote-projects-changed");
    await vi.waitFor(
      () => expect(projectPageSpy.mock.calls.length).toBeGreaterThan(beforeProjectCalls),
      { timeout: 10_000 },
    );
    await Promise.allSettled(
      projectPageSpy.mock.results.map((result) => result.value as Promise<unknown>),
    );
    expect(getManagedRootCatalogStatus().status).toBe("failed");

    failThreadProtocol = false;
    refreshManagedRootCatalogSoon();
    await vi.waitFor(() => expect(getManagedRootCatalogStatus().status).toBe("ready"), {
      timeout: 10_000,
    });
    // Wait for both scheduled 600ms follow-up inventory passes so no timer leaks across tests.
    await vi.waitFor(
      () =>
        expect(
          threadPageSpy.mock.calls.filter(([options]) => options?.mode === "inventory").length >
            beforeThreadInventoryCalls &&
            projectPageSpy.mock.calls.filter(([options]) => options?.mode === "inventory").length >
              beforeProjectInventoryCalls,
        ).toBe(true),
      { timeout: 10_000 },
    );
    await Promise.allSettled([
      ...threadPageSpy.mock.results.map((result) => result.value as Promise<unknown>),
      ...projectPageSpy.mock.results.map((result) => result.value as Promise<unknown>),
    ]);
  });

  it("clears failed managed parent authority before publishing deactivation and tracks real loopback offline state", async () => {
    const created: DesktopLoopbackIntake[] = [];
    const originalActivate = DesktopLoopbackIntake.prototype.activate;
    vi.spyOn(DesktopLoopbackIntake.prototype, "activate").mockImplementation(function (
      this: DesktopLoopbackIntake,
    ) {
      created.push(this);
      return originalActivate.call(this);
    });

    const offlineHook = renderHook(() => useEntityHostOffline({}));
    expect(offlineHook.result.current).toBe(false);

    await activate();
    expect(created).toHaveLength(1);
    expect(offlineHook.result.current).toBe(false);
    expect(isManagedLoopbackOffline()).toBe(false);

    await vi.waitFor(() => expect(getManagedParentAuthorityState().status).toBe("ready"), {
      timeout: 10_000,
    });

    failManagedParentAuthority("Simulated descriptor outage");
    expect(getManagedParentAuthorityState().status).toBe("failed");
    // Descriptor authority failure alone leaves the loopback leg live and local threads online.
    expect(offlineHook.result.current).toBe(false);

    const dependencies = Reflect.get(created[0]!, "deps") as DesktopLoopbackIntakeDeps;
    act(() => {
      dependencies.onActiveChanged?.(false);
    });

    expect(readManagedLoopbackActivation()).toBeNull();
    expect(getManagedRootCatalogStatus().status).toBe("starting");
    expect(isManagedLoopbackOffline()).toBe(true);
    expect(offlineHook.result.current).toBe(true);

    act(() => {
      dependencies.onActiveChanged?.(true);
    });
    expect(isManagedLoopbackOffline()).toBe(false);
    expect(offlineHook.result.current).toBe(false);
    await vi.waitFor(() => expect(getManagedRootCatalogStatus().status).toBe("ready"), {
      timeout: 10_000,
    });

    failManagedParentAuthority("Simulated descriptor outage");
    expect(getManagedParentAuthorityState().status).toBe("failed");
    act(() => {
      resetDesktopLoopbackIntakeForTest();
    });
    expect(getManagedRootCatalogStatus().status).toBe("starting");
    expect(isManagedLoopbackOffline()).toBe(false);
    expect(offlineHook.result.current).toBe(false);
  });
});
