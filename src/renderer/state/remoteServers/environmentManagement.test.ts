import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvironmentPublicProjection } from "@/shared/environments";
import { RemoteClientError } from "@/shared/remote/client";
import { currentRemoteServerGeneration } from "./eventSocketRegistry";
import {
  environmentParentCacheKey,
  type EnvironmentParentRef,
  type RemoteServerRecord,
} from "./types";

const storeState = vi.hoisted(() => ({
  servers: [] as RemoteServerRecord[],
}));

const parentClient = vi.hoisted(() => ({
  listEnvironments: vi.fn<(...args: never[]) => unknown>(),
  getEnvironment: vi.fn<(...args: never[]) => unknown>(),
  createEnvironment: vi.fn<(...args: never[]) => unknown>(),
  updateEnvironment: vi.fn<(...args: never[]) => unknown>(),
  deleteEnvironment: vi.fn<(...args: never[]) => unknown>(),
  connectEnvironment: vi.fn<(...args: never[]) => unknown>(),
  disconnectEnvironment: vi.fn<(...args: never[]) => unknown>(),
  upgradeEnvironment: vi.fn<(...args: never[]) => unknown>(),
  probeEnvironmentTrust: vi.fn<(...args: never[]) => unknown>(),
  acceptEnvironmentTrust: vi.fn<(...args: never[]) => unknown>(),
  adoptLegacyEnvironment: vi.fn<(...args: never[]) => unknown>(),
  pairEnvironment: vi.fn<(...args: never[]) => unknown>(),
}));

const reconnectServer = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => undefined));
const setState = vi.hoisted(() => vi.fn<(...args: never[]) => unknown>());
const createEnvironmentClientForPairing = vi.hoisted(() => vi.fn<(...args: never[]) => unknown>());

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: Object.assign(
    (selector: (state: { servers: RemoteServerRecord[] }) => unknown) => selector(storeState),
    {
      getState: () => ({ ...storeState, reconnectServer }),
      setState,
    },
  ),
}));

vi.mock("./environmentSessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./environmentSessions")>();
  return {
    ...actual,
    parentClientFor: () => parentClient,
    environmentParentEndpointFor: () => "http://127.0.0.1:49153/",
    createEnvironmentClientForPairing,
    releaseEnvironmentChildGrant: () => {},
  };
});

vi.mock("./refreshTokens", () => ({
  rememberRefreshTokenForSubject: vi.fn<() => void>(),
  writeRefreshTokenToVault: vi.fn<() => Promise<boolean>>(async () => true),
}));

import { useEnvironmentManagementStore } from "./environmentManagement";

const PARENT_KEY = "conn-parent";
const PARENT_REF: EnvironmentParentRef = { kind: "connection", connectionId: PARENT_KEY };
const PARENT_BUCKET = environmentParentCacheKey(PARENT_REF);
const ENVIRONMENT_ID = "11111111-1111-4111-8111-111111111111";

function projection(revision: number, overrides: Partial<EnvironmentPublicProjection> = {}) {
  return {
    environmentId: ENVIRONMENT_ID,
    revision,
    label: "Build box",
    target: "user@host",
    trust: { state: "unknown" as const },
    runtime: { hash: "a".repeat(64) },
    credential: "none" as const,
    legacyConnectionIds: [],
    desired: "enabled" as const,
    createdAt: 1,
    updatedAt: 1,
    state: "disconnected" as const,
    ...overrides,
  };
}

function parentRecord(): RemoteServerRecord {
  return {
    connectionId: PARENT_KEY,
    desktopId: "parent-desktop",
    label: "Parent",
    endpoint: "http://127.0.0.1:49153/",
    accessToken: "parent-access",
    scopes: ["session:read"],
    transport: { kind: "direct" },
  } as RemoteServerRecord;
}

beforeEach(() => {
  storeState.servers = [parentRecord()];
  useEnvironmentManagementStore.getState().__resetForTest();
  for (const fn of Object.values(parentClient)) fn.mockReset();
  reconnectServer.mockClear();
  setState.mockClear();
  createEnvironmentClientForPairing.mockReset();
});

describe("environment management actions", () => {
  it("loads the parent's environments into the reactive bucket", async () => {
    parentClient.listEnvironments.mockResolvedValue([projection(3)]);
    const result = await useEnvironmentManagementStore.getState().refreshEnvironments(PARENT_REF);
    expect(result).toHaveLength(1);
    const bucket = useEnvironmentManagementStore.getState().byParent[PARENT_BUCKET];
    expect(bucket?.status).toBe("ready");
    expect(bucket?.environments[0]?.revision).toBe(3);
  });

  it("uses the cached CAS revision for an update", async () => {
    parentClient.listEnvironments.mockResolvedValue([projection(7)]);
    parentClient.updateEnvironment.mockResolvedValue(projection(8, { label: "Renamed" }));
    await useEnvironmentManagementStore.getState().refreshEnvironments(PARENT_REF);
    await useEnvironmentManagementStore
      .getState()
      .updateEnvironment(PARENT_REF, ENVIRONMENT_ID, { label: "Renamed" });
    expect(parentClient.updateEnvironment).toHaveBeenCalledWith(ENVIRONMENT_ID, {
      expectedRevision: 7,
      patch: { label: "Renamed" },
    });
    expect(parentClient.getEnvironment).not.toHaveBeenCalled();
  });

  it("fetches the projection first when no revision is cached", async () => {
    parentClient.getEnvironment.mockResolvedValue(projection(5));
    parentClient.deleteEnvironment.mockResolvedValue(undefined);
    await useEnvironmentManagementStore.getState().deleteEnvironment(PARENT_REF, ENVIRONMENT_ID);
    expect(parentClient.getEnvironment).toHaveBeenCalledWith(ENVIRONMENT_ID);
    expect(parentClient.deleteEnvironment).toHaveBeenCalledWith(ENVIRONMENT_ID, {
      expectedRevision: 5,
    });
  });

  it("coalesces concurrent identical actions (inflight guard)", async () => {
    let release!: (value: EnvironmentPublicProjection) => void;
    parentClient.connectEnvironment.mockImplementation(
      () => new Promise<EnvironmentPublicProjection>((resolve) => (release = resolve)),
    );
    const first = useEnvironmentManagementStore
      .getState()
      .connectEnvironment(PARENT_REF, ENVIRONMENT_ID);
    const second = useEnvironmentManagementStore
      .getState()
      .connectEnvironment(PARENT_REF, ENVIRONMENT_ID);
    expect(parentClient.connectEnvironment).toHaveBeenCalledTimes(1);
    release(projection(2, { state: "connected" }));
    await Promise.all([first, second]);
    expect(
      useEnvironmentManagementStore.getState().byParent[PARENT_BUCKET]?.environments[0]?.state,
    ).toBe("connected");
  });

  it("surfaces a revision conflict as a localized retryable error", async () => {
    parentClient.listEnvironments.mockResolvedValue([projection(1)]);
    parentClient.updateEnvironment.mockRejectedValue(
      new RemoteClientError("conflict", 409, "environment_revision_conflict"),
    );
    await useEnvironmentManagementStore.getState().refreshEnvironments(PARENT_REF);
    await expect(
      useEnvironmentManagementStore
        .getState()
        .updateEnvironment(PARENT_REF, ENVIRONMENT_ID, { label: "x" }),
    ).rejects.toThrow(/changed on the host/i);
  });

  it("retires the previous authority generation after a successful environment re-pair", async () => {
    storeState.servers = [
      parentRecord(),
      {
        connectionId: "conn-child",
        desktopId: "child-1",
        label: "Child",
        endpoint: `http://127.0.0.1:49153/api/environments/${ENVIRONMENT_ID}/proxy/`,
        accessToken: "old-child-access",
        scopes: ["session:read"],
        transport: {
          kind: "environment",
          parentConnectionId: PARENT_KEY,
          environmentId: ENVIRONMENT_ID,
          childDesktopId: "child-1",
        },
      },
    ];
    parentClient.pairEnvironment.mockResolvedValue({
      environmentId: ENVIRONMENT_ID,
      endpoint: `/api/environments/${ENVIRONMENT_ID}/proxy/`,
      pairingCredential: "pair-new",
      childDesktopId: "child-1",
    });
    const dispose = vi.fn<() => void>();
    createEnvironmentClientForPairing.mockReturnValue({
      client: {
        exchangePairingCredential: async () => ({
          accessToken: "new-child-access",
          scopes: ["session:read"],
        }),
        environment: async () => ({ label: "Child" }),
        dispose,
      },
    });
    const previousGeneration = currentRemoteServerGeneration("conn-child");
    const paired = await useEnvironmentManagementStore
      .getState()
      .pairEnvironmentDevice(PARENT_REF, ENVIRONMENT_ID);
    expect(paired.connectionId).toBe("conn-child");
    expect(currentRemoteServerGeneration("conn-child")).toBe(previousGeneration + 1);
    expect(reconnectServer).toHaveBeenCalledWith("conn-child");
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("refuses to repoint an environment whose child identity changed", async () => {
    storeState.servers = [
      parentRecord(),
      {
        connectionId: "conn-child",
        desktopId: "old-child",
        label: "Child",
        endpoint: "http://127.0.0.1:49153/api/environments/x/proxy/",
        accessToken: "child-access",
        scopes: ["session:read"],
        transport: {
          kind: "environment",
          parentConnectionId: PARENT_KEY,
          environmentId: ENVIRONMENT_ID,
          childDesktopId: "old-child",
        },
      } as RemoteServerRecord,
    ];
    parentClient.pairEnvironment.mockResolvedValue({
      environmentId: ENVIRONMENT_ID,
      endpoint: `/api/environments/${ENVIRONMENT_ID}/proxy/`,
      pairingCredential: "pair-1",
      childDesktopId: "new-child",
    });
    await expect(
      useEnvironmentManagementStore.getState().pairEnvironmentDevice(PARENT_REF, ENVIRONMENT_ID),
    ).rejects.toThrow(/identity changed/i);
    expect(createEnvironmentClientForPairing).not.toHaveBeenCalled();
  });
});
