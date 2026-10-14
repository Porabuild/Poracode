import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REMOTE_OPERATOR_SCOPES, type RemoteAgentStatuses } from "@/shared/remote";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  __resetManagedLoopbackOwnerForTest,
  clearManagedParentAuthority,
  publishManagedParentAuthority,
} from "./managedLoopbackOwner";
import {
  __resetManagedParentRuntimeForTest,
  installManagedParentRuntime,
} from "./managedParentRuntime";
import {
  __resetRemoteServersStoreForTest,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey, type RemoteServerRecord } from "./types";

/**
 * Managed-parent runtime alignment: ready authority reconnects persisted
 * children of THAT root, a root switch retires the old root's children without
 * dialing the new root with their grants, and a clear marks them offline.
 */

const HOST_A = "managed-host-a";
const HOST_B = "managed-host-b";

function managedChild(host: string, id: string, environmentId: string): RemoteServerRecord {
  return {
    connectionId: id,
    desktopId: `child-${id}`,
    label: `Child ${id}`,
    endpoint: `http://127.0.0.1:6000/api/environments/${environmentId}/proxy/`,
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      managedHostDesktopId: host,
      environmentId,
      childDesktopId: `child-${id}`,
    },
  } as unknown as RemoteServerRecord;
}

function directRecord(): RemoteServerRecord {
  return {
    connectionId: "direct-connection",
    desktopId: "direct-desktop",
    label: "Direct",
    endpoint: "http://127.0.0.1:49153/",
    accessToken: "direct-access",
    scopes: ["session:read"],
    transport: { kind: "direct" },
  } as unknown as RemoteServerRecord;
}

function fakeClient(): RemoteDesktopClient {
  return {
    refreshTokens: async () => null,
    environmentWebSocketTicket: async () => ({ ticket: "t", expiresAt: "" }),
    setTokenLifecycle: () => undefined,
    setCertFingerprintPin: () => undefined,
  } as unknown as RemoteDesktopClient;
}

function publish(host: string): void {
  publishManagedParentAuthority({
    hostDesktopId: host,
    endpoint: "http://127.0.0.1:6000/",
    sshEnvironments: true,
    scopes: REMOTE_OPERATOR_SCOPES,
    client: fakeClient(),
    accessToken: () => "managed-access",
  });
}

async function flushRuntime(): Promise<void> {
  await vi.waitFor(() => expect(useRemoteServersStore.getState().reconnectServer).toBeDefined());
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let reconnectServer: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetRemoteServersStoreForTest();
  __resetManagedLoopbackOwnerForTest();
  __resetManagedParentRuntimeForTest();
  reconnectServer = vi.fn<() => Promise<void>>(async () => undefined);
  useRemoteServersStore.setState({ reconnectServer: reconnectServer as never });
  installManagedParentRuntime();
});

afterEach(() => {
  clearManagedParentAuthority();
  __resetRemoteServersStoreForTest();
  __resetManagedLoopbackOwnerForTest();
  __resetManagedParentRuntimeForTest();
});

describe("managed parent runtime", () => {
  it("reconnects every persisted child of the published root only", async () => {
    const a1 = managedChild(HOST_A, "child-a1", "env-a1");
    const a2 = managedChild(HOST_A, "child-a2", "env-a2");
    const b1 = managedChild(HOST_B, "child-b1", "env-b1");
    useRemoteServersStore.setState({ servers: [directRecord(), a1, a2, b1] });

    publish(HOST_A);
    await vi.waitFor(() => expect(reconnectServer).toHaveBeenCalledTimes(2));
    expect(reconnectServer.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([remoteConnectionKey(a1), remoteConnectionKey(a2)]),
    );
    expect(reconnectServer.mock.calls.map((call) => call[0])).not.toContain(
      remoteConnectionKey(b1),
    );
  });

  it("keeps sessions on a same-identity republish and reconnects on a fresh root", async () => {
    const a1 = managedChild(HOST_A, "child-a1", "env-a1");
    const b1 = managedChild(HOST_B, "child-b1", "env-b1");
    useRemoteServersStore.setState({
      servers: [a1, b1],
      runtime: {
        [remoteConnectionKey(a1)]: { status: "online", projects: [], threads: [] },
        [remoteConnectionKey(b1)]: { status: "online", projects: [], threads: [] },
      },
    });

    publish(HOST_A);
    await vi.waitFor(() => expect(reconnectServer).toHaveBeenCalledTimes(1));

    // Same identity: no reconnect, no disposal.
    publish(HOST_A);
    await flushRuntime();
    expect(reconnectServer).toHaveBeenCalledTimes(1);

    // Root switch: A's child goes offline (never dialed with B's grants), B's
    // child reconnects.
    publish(HOST_B);
    await vi.waitFor(() => expect(reconnectServer).toHaveBeenCalledTimes(2));
    expect(useRemoteServersStore.getState().runtime[remoteConnectionKey(a1)]?.status).toBe(
      "offline",
    );
    expect(useRemoteServersStore.getState().servers).toHaveLength(2);
    expect(reconnectServer.mock.calls[1]![0]).toBe(remoteConnectionKey(b1));
  });

  it("preserves agentStatuses when marking children offline", async () => {
    const a1 = managedChild(HOST_A, "child-a1", "env-a1");
    const agentStatuses: RemoteAgentStatuses = {
      windows: [
        {
          kind: "claude",
          label: "Claude",
          installed: true,
          authState: "authenticated",
        } as unknown as RemoteAgentStatuses["windows"][number],
      ],
      wsl: [],
      updatedAt: "now",
    };
    const key = remoteConnectionKey(a1);
    useRemoteServersStore.setState({
      servers: [a1],
      runtime: {
        [key]: { status: "online", projects: [], threads: [], agentStatuses },
      },
    });
    publish(HOST_A);
    await vi.waitFor(() => expect(reconnectServer).toHaveBeenCalledTimes(1));

    clearManagedParentAuthority();
    await vi.waitFor(() =>
      expect(useRemoteServersStore.getState().runtime[key]?.status).toBe("offline"),
    );
    expect(useRemoteServersStore.getState().runtime[key]?.agentStatuses).toEqual(agentStatuses);
  });

  it("marks children offline on authority clear without deleting records or grants", async () => {
    const a1 = managedChild(HOST_A, "child-a1", "env-a1");
    useRemoteServersStore.setState({
      servers: [a1],
      runtime: {
        [remoteConnectionKey(a1)]: {
          status: "connecting",
          projects: [],
          threads: [],
        },
      },
    });
    publish(HOST_A);
    await vi.waitFor(() => expect(reconnectServer).toHaveBeenCalledTimes(1));

    clearManagedParentAuthority();
    await vi.waitFor(() =>
      expect(useRemoteServersStore.getState().runtime[remoteConnectionKey(a1)]?.status).toBe(
        "offline",
      ),
    );
    expect(useRemoteServersStore.getState().servers).toHaveLength(1);
  });
});
