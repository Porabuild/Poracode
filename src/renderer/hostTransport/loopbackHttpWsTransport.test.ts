import { afterEach, describe, expect, it, vi } from "vitest";
import { UNKNOWN_HOST_SERVICE_CAPABILITIES } from "@/shared/hostControlProtocol";
import type { IpcProcedureName } from "@/shared/ipc";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { isRemoteRoutableProcedure } from "@/renderer/remoteProcedureRoutes";
import {
  registerManagedLoopbackProcedureHost,
  resetRemoteProcedureRouterForTest,
  type RemoteProcedureHost,
} from "@/renderer/remoteProcedureRouter";
import {
  createManagedLoopbackProcedureHost,
  LoopbackHttpWsTransport,
  resetDesktopLoopbackIntakeForTest,
} from "./loopbackHttpWsTransport";
import { MANAGED_LOOPBACK_DESKTOP_ID } from "./managedIdentity";
import type { PreloadIpcTransport } from "./preloadIpcTransport";

/**
 * Unit coverage for the managed loopback REQUEST plane through the real
 * `LoopbackHttpWsTransport.request` (V2 regression: a local-resolving
 * routable passthrough previously fell through to preload, which refuses
 * every routable name — the call had no executing data plane).
 *
 * The composed host is built by the production factory, so paired-host
 * precedence and the lean managed branch are the real wiring, not a copy.
 */
describe("LoopbackHttpWsTransport request routing", () => {
  const managedCallRemoteProcedure = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(
    async () => ({ managed: true }),
  );
  const managedClient = {
    callRemoteProcedure: managedCallRemoteProcedure,
  } as unknown as RemoteDesktopClient;

  const persistedCallRemoteProcedure = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(
    async () => ({ persisted: true }),
  );
  const persistedClient = {
    callRemoteProcedure: persistedCallRemoteProcedure,
  } as unknown as RemoteDesktopClient;
  const persistedHost: RemoteProcedureHost = {
    resolveThreadOwner: () => undefined,
    resolveProjectOwner: () => undefined,
    resolveDesktopOwner: () => undefined,
    withClient: async (desktopId, invoke) => {
      expect(desktopId).toBe("paired-d1");
      return invoke(persistedClient);
    },
  };

  /** Mirrors the real PreloadIpcTransport.request policy: bootstrap and
   * local-shell names execute here; router-routable names are refused. */
  const preloadRequest = vi.fn<(name: IpcProcedureName) => Promise<unknown>>(
    async (name: IpcProcedureName) => {
      if (isRemoteRoutableProcedure(name)) {
        throw new Error(`IPC data plane removed for ${name}; loopback HTTP is required`);
      }
      return { local: true };
    },
  );
  const preload = {
    request: preloadRequest,
    subscribeEvents: vi.fn<() => () => void>(() => () => {}),
  } as unknown as PreloadIpcTransport;

  function makeTransport(): LoopbackHttpWsTransport {
    return new LoopbackHttpWsTransport(preload, UNKNOWN_HOST_SERVICE_CAPABILITIES);
  }

  function activateLeg(): void {
    const composedHost = createManagedLoopbackProcedureHost(managedClient, persistedHost);
    registerManagedLoopbackProcedureHost({
      desktopId: MANAGED_LOOPBACK_DESKTOP_ID,
      host: composedHost,
      isCurrent: () => true,
    });
  }

  afterEach(() => {
    resetDesktopLoopbackIntakeForTest();
    resetRemoteProcedureRouterForTest();
  });

  it("executes the global skills scan ({} payload) on the co-located host instead of falling back to preload", async () => {
    activateLeg();
    const transport = makeTransport();

    await expect(transport.request("scanSkills", [{}])).resolves.toEqual({ managed: true });

    expect(managedCallRemoteProcedure).toHaveBeenCalledTimes(1);
    expect(managedCallRemoteProcedure).toHaveBeenCalledWith("scanSkills", {});
    expect(preloadRequest).not.toHaveBeenCalled();
  });

  it("executes a project-scoped scan over the same client with the unprojected payload", async () => {
    activateLeg();
    const transport = makeTransport();

    await expect(
      transport.request("scanSkills", [
        { projectLocation: { kind: "posix", path: "/managed/project" } },
      ]),
    ).resolves.toEqual({ managed: true });

    expect(managedCallRemoteProcedure).toHaveBeenCalledWith("scanSkills", {
      projectLocation: { kind: "posix", path: "/managed/project" },
    });
    expect(JSON.stringify(managedCallRemoteProcedure.mock.calls.at(-1)?.[1])).not.toContain(
      "remoteServerId",
    );
    expect(preloadRequest).not.toHaveBeenCalled();
  });

  it("keeps paired-host precedence: a paired-stamped scope executes through the persisted host", async () => {
    activateLeg();
    const transport = makeTransport();

    await expect(
      transport.request("scanSkills", [
        {
          projectLocation: { kind: "posix", path: "/paired/project", remoteServerId: "paired-d1" },
        },
      ]),
    ).resolves.toEqual({ persisted: true });

    // The router unprojects the stamp before the wire.
    expect(persistedCallRemoteProcedure).toHaveBeenCalledWith("scanSkills", {
      projectLocation: { kind: "posix", path: "/paired/project" },
    });
    expect(managedCallRemoteProcedure).not.toHaveBeenCalled();
    expect(preloadRequest).not.toHaveBeenCalled();
  });

  it("propagates a loopback HTTP failure and never retries it over preload IPC", async () => {
    activateLeg();
    const transport = makeTransport();
    managedCallRemoteProcedure.mockRejectedValueOnce(new Error("loopback 503"));

    await expect(transport.request("scanSkills", [{}])).rejects.toThrow("loopback 503");
    expect(preloadRequest).not.toHaveBeenCalled();

    // Same for the stamped project-scoped shape.
    managedCallRemoteProcedure.mockRejectedValueOnce(new Error("loopback timeout"));
    await expect(
      transport.request("scanSkills", [
        { projectLocation: { kind: "posix", path: "/managed/project" } },
      ]),
    ).rejects.toThrow("loopback timeout");
    expect(preloadRequest).not.toHaveBeenCalled();
  });

  it("keeps non-router local-shell procedures on preload", async () => {
    activateLeg();
    const transport = makeTransport();

    await expect(transport.request("getSharedSettings", [])).resolves.toEqual({ local: true });

    expect(preloadRequest).toHaveBeenCalledWith("getSharedSettings", []);
    expect(managedCallRemoteProcedure).not.toHaveBeenCalled();
  });

  it("fails a routable name truthfully when the leg is down instead of reopening preload", async () => {
    // No registration: the offline leg. Preload refuses routable names —
    // the loopback HTTP leg is required, and that refusal stays the truth.
    const transport = makeTransport();

    await expect(transport.request("scanSkills", [{}])).rejects.toThrow(
      "IPC data plane removed for scanSkills; loopback HTTP is required",
    );
    expect(managedCallRemoteProcedure).not.toHaveBeenCalled();
  });
});
