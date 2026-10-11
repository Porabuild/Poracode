import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { vi } from "vitest";
import { PORACODE_CLIENT_RUNTIME_VERSION, type ElectronHostBridge } from "@/shared/clientRuntime";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote";
import { RemoteEnvironmentClient } from "@/shared/remote/clientEnvironments";
import type { RemoteEnvironmentImageBytes } from "@/shared/remote/clientEnvironmentImages";
import { setRemoteImageRefResolver } from "@/shared/imageRefDisplay";
import { setRemoteLocalImageResolver } from "@/shared/localImageDisplay";
import type { ManagedLoopbackActivationSnapshot } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  installAttachedElectronClientRuntime,
  installBrowserClientRuntime,
  installElectronClientRuntime,
  resetClientRuntimeForTest,
} from "@/renderer/clientRuntime";
import { setRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import { readBridge } from "@/renderer/bridge";
import { useRemoteServersStore } from "./remoteServersStore";
import { useAppStore } from "./appStore";
import { projectRemoteProject, projectRemoteThread } from "./remoteProjection";
import type { RemoteServerRecord } from "./remoteServers/types";
import { __resetDirectImageSessionsForTest } from "./remoteServers/directImages";
import {
  __resetEnvironmentSessionsForTest,
  configureEnvironmentSessions,
  environmentSessionForServer,
  type EnvironmentSessionDependencies,
} from "./remoteServers/environmentSessions";

const activationSource = vi.hoisted(() => ({
  snapshot: null as ManagedLoopbackActivationSnapshot | null,
  listeners: new Set<(snapshot: ManagedLoopbackActivationSnapshot | null) => void>(),
}));

// Only the activation publisher is controlled. The runtime installer, managed
// session, byte cache, readiness hooks, transcript and gallery stay production.
vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", async (original) => ({
  ...(await original<typeof import("@/renderer/hostTransport/loopbackHttpWsTransport")>()),
  readManagedLoopbackActivation: () => activationSource.snapshot,
  subscribeManagedLoopbackActivation: (
    listener: (snapshot: ManagedLoopbackActivationSnapshot | null) => void,
  ) => {
    activationSource.listeners.add(listener);
    return () => activationSource.listeners.delete(listener);
  },
}));

export const backendResetListeners = new Set<() => void>();
export const createObjectUrl = vi.fn<(blob: Blob) => string>();
export const revokeObjectUrl = vi.fn<(url: string) => void>();
let sequence = 0;

export const imageBytes: RemoteEnvironmentImageBytes = {
  bytes: new Uint8Array([137, 80, 78, 71]),
  contentType: "image/png",
};

export function publishImageActivation(snapshot: ManagedLoopbackActivationSnapshot | null): void {
  activationSource.snapshot = snapshot;
  for (const listener of [...activationSource.listeners]) listener(snapshot);
}

export function createImageActivation(
  fetchBytes: RemoteDesktopClient["fetchTicketedImageBytes"] = () => Promise.resolve(imageBytes),
): ManagedLoopbackActivationSnapshot {
  const client = new RemoteDesktopClient("http://127.0.0.1:49152/", "managed-access");
  vi.spyOn(client, "fetchTicketedImageBytes").mockImplementation(fetchBytes);
  return activationForClient(client);
}

export function activationForClient(
  client: RemoteDesktopClient,
): ManagedLoopbackActivationSnapshot {
  sequence += 1;
  return Object.freeze({
    seq: sequence,
    endpoint: client.endpoint,
    client,
    authority: `managed-image-fixture-${sequence}`,
  });
}

export function installManagedImageRuntime(): ElectronHostBridge {
  const host = {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    arch: "x64",
    platform: "darwin",
    onBackendSupervisorReset: (listener: () => void) => {
      backendResetListeners.add(listener);
      return () => backendResetListeners.delete(listener);
    },
    onSupervisorEvent: () => () => undefined,
    invokeProcedure: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dbSetState: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dbGetLatestThreadGoalItem: vi.fn<() => Promise<null>>().mockResolvedValue(null),
  } as unknown as ElectronHostBridge;
  Object.defineProperty(window, "poracode", { configurable: true, value: host });
  Object.defineProperty(window, "poracodeHost", { configurable: true, value: host });
  installElectronClientRuntime(host);
  return host;
}

export function emitManagedBackendReset(): void {
  for (const listener of [...backendResetListeners]) listener();
}

export function installRemoteImageRuntime(
  surface: "browser" | "attached Electron",
  host: ElectronHostBridge,
): void {
  if (surface === "browser") {
    installBrowserClientRuntime(readBridge());
    Reflect.deleteProperty(window, "poracodeHost");
    return;
  }
  installAttachedElectronClientRuntime(host, {
    profileNamespace: "image-fixture",
    dataRoot: "/image-fixture",
    endpoint: "http://127.0.0.1:49152/",
    ownerGeneration: "11111111-1111-4111-8111-111111111111",
    remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    pairingUrl: "http://127.0.0.1:49152/#token=fixture",
  });
}

export function projectImageFixtureThread(connectionKey: string, canonicalThreadId: string) {
  const state = useAppStore.getState();
  const thread = state.threads.find((entry) => entry.id === canonicalThreadId)!;
  const projected = projectRemoteThread(connectionKey, thread);
  const project = state.projects.find((entry) => entry.id === thread.projectId);
  useAppStore.setState({
    threads: [projected],
    projects: project ? [projectRemoteProject(connectionKey, project)] : [],
    runtimeItemIdsByThread: { [projected.id]: state.runtimeItemIdsByThread[canonicalThreadId]! },
    runtimeItemsByIdByThread: {
      [projected.id]: state.runtimeItemsByIdByThread[canonicalThreadId]!,
    },
    runtimeStructuralVersionByThread: {
      [projected.id]: state.runtimeStructuralVersionByThread[canonicalThreadId] ?? 0,
    },
  });
  return projected;
}

/** Real environment client/cache, with only the network and grant writes stubbed. */
export function installImageEnvironmentProjection() {
  const environmentId = "22222222-2222-4222-8222-222222222222";
  const parent: RemoteServerRecord = {
    connectionId: "image-parent",
    desktopId: "parent-host",
    label: "Parent",
    endpoint: "https://parent.test/",
    accessToken: "parent-access",
    scopes: ["session:read"],
    transport: { kind: "direct" },
  };
  const child: RemoteServerRecord = {
    connectionId: "image-child",
    desktopId: "child-host",
    label: "Child",
    endpoint: `${parent.endpoint}api/environments/${environmentId}/proxy/`,
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      parentConnectionId: "image-parent",
      environmentId,
      childDesktopId: "child-host",
    },
  };
  const fetch = vi.fn<RemoteFetch>(() =>
    Promise.resolve(
      new Response(imageBytes.bytes.slice().buffer, { headers: { "content-type": "image/png" } }),
    ),
  );
  const createClient = vi.fn<
    NonNullable<EnvironmentSessionDependencies["createEnvironmentClient"]>
  >(
    (endpoint, accessToken, options) =>
      new RemoteEnvironmentClient(endpoint, accessToken, fetch, options),
  );
  useRemoteServersStore.setState({ servers: [parent, child] });
  configureEnvironmentSessions({
    getState: () => useRemoteServersStore.getState(),
    clientFactory: () => (endpoint, accessToken) => new RemoteDesktopClient(endpoint, accessToken),
    certPinForConnection: () => "approved-parent-pin",
    refreshTokenForSubject: () => undefined,
    rememberRefreshToken: () => undefined,
    writeRefreshTokenToVault: async () => true,
    deleteRefreshTokenFromVault: async () => undefined,
    createEnvironmentClient: createClient,
  });
  const client = environmentSessionForServer(child)!.client;
  setRemoteBridgeClient(client);
  return { child, client, fetch, createClient };
}

export function setupManagedImageFixture(): void {
  resetClientRuntimeForTest();
  setRemoteBridgeClient(null);
  activationSource.snapshot = null;
  activationSource.listeners.clear();
  backendResetListeners.clear();
  configureEnvironmentSessions({
    getState: () => useRemoteServersStore.getState(),
    clientFactory: () => useRemoteServersStore.getState().clientFactory,
    certPinForConnection: () => undefined,
    refreshTokenForSubject: () => undefined,
    rememberRefreshToken: () => undefined,
    writeRefreshTokenToVault: async () => true,
    deleteRefreshTokenFromVault: async () => undefined,
  });
  sequence = 0;
  let urlSequence = 0;
  createObjectUrl.mockReset().mockImplementation(() => `blob:managed-image-${++urlSequence}`);
  revokeObjectUrl.mockReset();
  class ImageUrl extends URL {
    static override createObjectURL = createObjectUrl;
    static override revokeObjectURL = revokeObjectUrl;
  }
  vi.stubGlobal("URL", ImageUrl);
}

export function teardownManagedImageFixture(): void {
  cleanup();
  resetClientRuntimeForTest();
  publishImageActivation(null);
  setRemoteBridgeClient(null);
  __resetDirectImageSessionsForTest();
  __resetEnvironmentSessionsForTest();
  setRemoteImageRefResolver(null);
  setRemoteLocalImageResolver(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
}
