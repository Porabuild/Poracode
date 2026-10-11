import { msg } from "@lingui/core/macro";
import { create } from "zustand";
import type { EnvironmentPublicProjection } from "@/shared/environments";
import { filterKnownRemoteAccessScopes, REMOTE_OPERATOR_SCOPES } from "@/shared/remote";
import { RemoteClientError } from "@/shared/remote/client";
import type {
  RemoteEnvironmentCreateBody,
  RemoteEnvironmentTrustProbeResult,
  RemoteEnvironmentUpdatePatch,
} from "@/shared/remote/contract/environmentSchemas";
import { i18n } from "@/renderer/i18n/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  createEnvironmentClientForPairing,
  environmentParentEndpointFor,
  parentClientFor,
  releaseEnvironmentChildGrant,
} from "./environmentSessions";
import { rememberRefreshTokenForSubject, writeRefreshTokenToVault } from "./refreshTokens";
import {
  environmentParentCacheKey,
  environmentParentRef,
  remoteConnectionKey,
  type EnvironmentParentRef,
  type RemoteEnvironmentTransport,
  type RemoteServerRecord,
} from "./types";

/**
 * Thin renderer management actions over the parent client's 13 environment
 * methods (C1.3b). Every action resolves the PARENT authority by its
 * structurally discriminated ref (`parentClientFor`) — a persisted direct/ssh
 * record for `connection`, the live loopback authority for `managed` — and
 * never an environment client. UI calls these, never the raw client.
 *
 * The environment client manages a child host's own registry through the
 * one-hop proxy under the child grant (R4); that path is deliberately not
 * surfaced here.
 */

export interface EnvironmentParentState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly error?: string;
  readonly environments: readonly EnvironmentPublicProjection[];
  readonly lastLoadedAt?: number;
}

export interface EnvironmentManagementState {
  readonly byParent: Readonly<Record<string, EnvironmentParentState>>;
  refreshEnvironments(
    parent: EnvironmentParentRef,
  ): Promise<readonly EnvironmentPublicProjection[]>;
  createEnvironment(
    parent: EnvironmentParentRef,
    body: RemoteEnvironmentCreateBody,
  ): Promise<EnvironmentPublicProjection>;
  updateEnvironment(
    parent: EnvironmentParentRef,
    environmentId: string,
    patch: RemoteEnvironmentUpdatePatch,
  ): Promise<EnvironmentPublicProjection>;
  deleteEnvironment(parent: EnvironmentParentRef, environmentId: string): Promise<void>;
  connectEnvironment(
    parent: EnvironmentParentRef,
    environmentId: string,
  ): Promise<EnvironmentPublicProjection>;
  disconnectEnvironment(
    parent: EnvironmentParentRef,
    environmentId: string,
  ): Promise<EnvironmentPublicProjection>;
  upgradeEnvironment(
    parent: EnvironmentParentRef,
    environmentId: string,
  ): Promise<EnvironmentPublicProjection>;
  probeEnvironmentTrust(
    parent: EnvironmentParentRef,
    environmentId: string,
  ): Promise<RemoteEnvironmentTrustProbeResult>;
  acceptEnvironmentTrust(
    parent: EnvironmentParentRef,
    environmentId: string,
    fingerprint: string,
  ): Promise<EnvironmentPublicProjection>;
  adoptLegacyEnvironment(
    parent: EnvironmentParentRef,
    environmentId: string,
    legacyConnectionId: string,
  ): Promise<EnvironmentPublicProjection>;
  /** Host-side pairing: mint the child grant through the proxy and install it. */
  pairEnvironmentDevice(
    parent: EnvironmentParentRef,
    environmentId: string,
  ): Promise<RemoteServerRecord>;
  __resetForTest(): void;
}

export const EMPTY_ENVIRONMENT_PARENT_STATE: EnvironmentParentState = Object.freeze({
  status: "idle",
  environments: [],
});
const EMPTY_BY_PARENT: Readonly<Record<string, EnvironmentParentState>> = Object.freeze({});

/** Last-known CAS revisions, keyed by canonical parent cache key + environment id. */
const revisionsByEnvironment = new Map<string, number>();

/** In-flight dedupe: concurrent identical actions share one dispatch. */
const inflightActions = new Map<string, Promise<unknown>>();

function actionKey(...parts: readonly string[]): string {
  return parts.join("\u0000");
}

function runOnce<Result>(key: string, operation: () => Promise<Result>): Promise<Result> {
  const existing = inflightActions.get(key);
  if (existing) return existing as Promise<Result>;
  const promise = operation()
    .catch((error: unknown) => {
      // Typed host conflicts get a localized, actionable message; the original
      // error stays as `cause` for diagnostics.
      throw localizeActionError(error);
    })
    .finally(() => {
      inflightActions.delete(key);
    });
  inflightActions.set(key, promise);
  return promise;
}

function requireParentProjectionRevision(
  parentKey: string,
  environmentId: string,
): number | undefined {
  return revisionsByEnvironment.get(actionKey(parentKey, environmentId));
}

function localizeActionError(error: unknown): Error {
  if (error instanceof RemoteClientError) {
    if (error.code === "environment_revision_conflict") {
      return new Error(i18n._(msg`The environment changed on the host. Refresh and try again.`), {
        cause: error,
      });
    }
    if (error.code === "environment_identity_changed") {
      return new Error(
        i18n._(msg`This environment's host identity changed. Re-pair it explicitly from the host.`),
        { cause: error },
      );
    }
  }
  return error instanceof Error ? error : new Error(i18n._(msg`The host rejected the request.`));
}

function findEnvironmentRecord(
  parent: EnvironmentParentRef,
  environmentId: string,
): RemoteServerRecord | undefined {
  const parentKey = environmentParentCacheKey(parent);
  return useRemoteServersStore.getState().servers.find((server) => {
    if (server.transport?.kind !== "environment") return false;
    if (server.transport.environmentId !== environmentId) return false;
    const ref = environmentParentRef(server.transport);
    return ref !== undefined && environmentParentCacheKey(ref) === parentKey;
  });
}

/** Resolves the host-returned proxy path against the current parent endpoint. */
function pairingEndpoint(parentEndpoint: string, pairingPath: string): string {
  try {
    return new URL(pairingPath, parentEndpoint).toString();
  } catch {
    throw new Error(i18n._(msg`The host returned an invalid environment pairing endpoint.`));
  }
}

function environmentTransportFor(
  parent: EnvironmentParentRef,
  environmentId: string,
  childDesktopId: string,
): RemoteEnvironmentTransport {
  return parent.kind === "connection"
    ? {
        kind: "environment",
        parentConnectionId: parent.connectionId,
        environmentId,
        childDesktopId,
      }
    : {
        kind: "environment",
        managedHostDesktopId: parent.hostDesktopId,
        environmentId,
        childDesktopId,
      };
}

export const useEnvironmentManagementStore = create<EnvironmentManagementState>()((set) => {
  const patchParent = (
    parentKey: string,
    update: (previous: EnvironmentParentState) => EnvironmentParentState,
  ) => {
    set((state) => ({
      byParent: {
        ...state.byParent,
        [parentKey]: update(state.byParent[parentKey] ?? EMPTY_ENVIRONMENT_PARENT_STATE),
      },
    }));
  };

  const rememberProjection = (parentKey: string, projection: EnvironmentPublicProjection) => {
    revisionsByEnvironment.set(actionKey(parentKey, projection.environmentId), projection.revision);
    patchParent(parentKey, (previous) => ({
      ...previous,
      status: "ready",
      environments: previous.environments.some(
        (entry) => entry.environmentId === projection.environmentId,
      )
        ? previous.environments.map((entry) =>
            entry.environmentId === projection.environmentId ? projection : entry,
          )
        : [...previous.environments, projection],
    }));
  };

  const forgetProjection = (parentKey: string, environmentId: string) => {
    revisionsByEnvironment.delete(actionKey(parentKey, environmentId));
    patchParent(parentKey, (previous) => ({
      ...previous,
      environments: previous.environments.filter((entry) => entry.environmentId !== environmentId),
    }));
  };

  const requireParentClient = (parent: EnvironmentParentRef) => {
    const client = parentClientFor(parent);
    if (!client) {
      throw new Error(i18n._(msg`The paired server that owns this environment is not connected.`));
    }
    return client;
  };

  const requireRevision = async (
    parent: EnvironmentParentRef,
    environmentId: string,
  ): Promise<number> => {
    const parentKey = environmentParentCacheKey(parent);
    const cached = requireParentProjectionRevision(parentKey, environmentId);
    if (cached !== undefined) return cached;
    const projection = await requireParentClient(parent).getEnvironment(environmentId);
    rememberProjection(parentKey, projection);
    return projection.revision;
  };

  return {
    byParent: EMPTY_BY_PARENT,

    refreshEnvironments: (parent) =>
      runOnce(actionKey("refresh", environmentParentCacheKey(parent)), async () => {
        const parentKey = environmentParentCacheKey(parent);
        patchParent(parentKey, (previous) => ({ ...previous, status: "loading" }));
        try {
          const environments = await requireParentClient(parent).listEnvironments();
          for (const projection of environments) {
            revisionsByEnvironment.set(
              actionKey(parentKey, projection.environmentId),
              projection.revision,
            );
          }
          patchParent(parentKey, () => ({
            status: "ready",
            environments,
            lastLoadedAt: Date.now(),
          }));
          return environments;
        } catch (error) {
          const localized = localizeActionError(error);
          patchParent(parentKey, (previous) => ({
            status: "error",
            environments: previous.environments,
            error: localized.message,
          }));
          throw localized;
        }
      }),

    createEnvironment: (parent, body) =>
      runOnce(actionKey("create", environmentParentCacheKey(parent)), async () => {
        const parentKey = environmentParentCacheKey(parent);
        const projection = await requireParentClient(parent).createEnvironment(body);
        rememberProjection(parentKey, projection);
        return projection;
      }),

    updateEnvironment: (parent, environmentId, patch) =>
      runOnce(actionKey("update", environmentParentCacheKey(parent), environmentId), async () => {
        const parentKey = environmentParentCacheKey(parent);
        const expectedRevision = await requireRevision(parent, environmentId);
        const projection = await requireParentClient(parent).updateEnvironment(environmentId, {
          expectedRevision,
          patch,
        });
        rememberProjection(parentKey, projection);
        return projection;
      }),

    deleteEnvironment: (parent, environmentId) =>
      runOnce(actionKey("delete", environmentParentCacheKey(parent), environmentId), async () => {
        const expectedRevision = await requireRevision(parent, environmentId);
        await requireParentClient(parent).deleteEnvironment(environmentId, { expectedRevision });
        forgetProjection(environmentParentCacheKey(parent), environmentId);
      }),

    connectEnvironment: (parent, environmentId) =>
      runOnce(actionKey("connect", environmentParentCacheKey(parent), environmentId), async () => {
        const projection = await requireParentClient(parent).connectEnvironment(environmentId);
        rememberProjection(environmentParentCacheKey(parent), projection);
        return projection;
      }),

    disconnectEnvironment: (parent, environmentId) =>
      runOnce(
        actionKey("disconnect", environmentParentCacheKey(parent), environmentId),
        async () => {
          const projection = await requireParentClient(parent).disconnectEnvironment(environmentId);
          rememberProjection(environmentParentCacheKey(parent), projection);
          return projection;
        },
      ),

    upgradeEnvironment: (parent, environmentId) =>
      runOnce(actionKey("upgrade", environmentParentCacheKey(parent), environmentId), async () => {
        const expectedRevision = await requireRevision(parent, environmentId);
        const projection = await requireParentClient(parent).upgradeEnvironment(environmentId, {
          expectedRevision,
        });
        rememberProjection(environmentParentCacheKey(parent), projection);
        return projection;
      }),

    probeEnvironmentTrust: (parent, environmentId) =>
      runOnce(actionKey("trust-probe", environmentParentCacheKey(parent), environmentId), () =>
        requireParentClient(parent).probeEnvironmentTrust(environmentId),
      ),

    acceptEnvironmentTrust: (parent, environmentId, fingerprint) =>
      runOnce(
        actionKey("trust-accept", environmentParentCacheKey(parent), environmentId),
        async () => {
          const expectedRevision = await requireRevision(parent, environmentId);
          const projection = await requireParentClient(parent).acceptEnvironmentTrust(
            environmentId,
            { expectedRevision, fingerprint },
          );
          rememberProjection(environmentParentCacheKey(parent), projection);
          return projection;
        },
      ),

    adoptLegacyEnvironment: (parent, environmentId, legacyConnectionId) =>
      runOnce(
        actionKey("adopt-legacy", environmentParentCacheKey(parent), environmentId),
        async () => {
          const expectedRevision = await requireRevision(parent, environmentId);
          const projection = await requireParentClient(parent).adoptLegacyEnvironment(
            environmentId,
            { expectedRevision, legacyConnectionId },
          );
          rememberProjection(environmentParentCacheKey(parent), projection);
          return projection;
        },
      ),

    pairEnvironmentDevice: (parent, environmentId) =>
      runOnce(
        actionKey("pair-device", environmentParentCacheKey(parent), environmentId),
        async () => {
          const parentEndpoint = environmentParentEndpointFor(parent);
          if (parentEndpoint === undefined) {
            throw new Error(
              i18n._(msg`The paired server that owns this environment is not connected.`),
            );
          }
          const pairing = await requireParentClient(parent).pairEnvironment(environmentId);
          const existing = findEnvironmentRecord(parent, environmentId);
          if (
            existing?.transport?.kind === "environment" &&
            existing.transport.childDesktopId !== undefined &&
            existing.transport.childDesktopId !== pairing.childDesktopId
          ) {
            throw new Error(
              i18n._(
                msg`This environment's host identity changed. Re-pair it explicitly from the host.`,
              ),
            );
          }
          const endpoint = pairingEndpoint(parentEndpoint, pairing.endpoint);
          const created = createEnvironmentClientForPairing({
            parent,
            environmentId,
            childDesktopId: pairing.childDesktopId,
            endpoint,
          });
          if (!created) {
            throw new Error(
              i18n._(msg`The paired server that owns this environment is not connected.`),
            );
          }
          let record: RemoteServerRecord;
          try {
            const tokens = await created.client.exchangePairingCredential({
              credential: pairing.pairingCredential,
              scopes: REMOTE_OPERATOR_SCOPES,
              client: { label: "Poracode Desktop", deviceType: "desktop" },
            });
            if (tokens.refreshToken) {
              rememberRefreshTokenForSubject(created.childGrantSubject, tokens.refreshToken);
              void writeRefreshTokenToVault(
                created.childGrantSubject,
                tokens.refreshToken,
                created.grantOwner,
              );
            }
            const descriptor = await created.client.environment().catch(() => null);
            const connectionId = existing ? remoteConnectionKey(existing) : crypto.randomUUID();
            record = {
              connectionId,
              desktopId: pairing.childDesktopId,
              label: descriptor?.label ?? existing?.label ?? pairing.childDesktopId,
              ...(descriptor?.label ? { remoteLabel: descriptor.label } : {}),
              endpoint,
              accessToken: tokens.accessToken,
              scopes: filterKnownRemoteAccessScopes(tokens.scopes),
              ...(descriptor?.appVersion ? { appVersion: descriptor.appVersion } : {}),
              ...(descriptor?.platform ? { platform: descriptor.platform } : {}),
              ...(descriptor?.hostMode ? { hostMode: descriptor.hostMode } : {}),
              transport: environmentTransportFor(parent, environmentId, pairing.childDesktopId),
            };
          } finally {
            created.client.dispose();
            releaseEnvironmentChildGrant(created.childGrantSubject, created.grantOwner);
          }
          useRemoteServersStore.setState((previous) => ({
            servers: [
              ...previous.servers.filter(
                (candidate) => remoteConnectionKey(candidate) !== record.connectionId,
              ),
              record,
            ],
            runtime: {
              ...previous.runtime,
              [record.connectionId!]: {
                status: "connecting",
                projects: previous.runtime[record.connectionId!]?.projects ?? [],
                threads: previous.runtime[record.connectionId!]?.threads ?? [],
              },
            },
          }));
          await useRemoteServersStore.getState().reconnectServer(record.connectionId!);
          return record;
        },
      ),

    __resetForTest: () => {
      revisionsByEnvironment.clear();
      inflightActions.clear();
      set({ byParent: EMPTY_BY_PARENT });
    },
  };
});
