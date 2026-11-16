import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useLingui } from "@lingui/react/macro";
import type {
  ProfileCoreStats,
  ProfileDevice,
  ProfileDevicesResponse,
  ProfileIdentity,
  ProfileStatScope,
  ProfileStatsRequest,
  ProfileStatsWindow,
  ProfileTokenStats,
} from "@/shared/contracts";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { selectBrowserBridgeClientServer } from "@/renderer/state/remoteServers/browserBridge";
import {
  remoteConnectionKey,
  type RemoteServerRecord,
  type RemoteServerStatus,
  type RemoteServersState,
} from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  mergeProfileCoreStats,
  mergeProfileTokenStats,
  type ProfileCoreViewStats,
  type ProfileTokenViewStats,
} from "./mergeStats";

const REMOTE_DEVICE_PREFIX = "remote:";

export function toRemoteProfileDeviceId(connectionKey: string): string {
  return `${REMOTE_DEVICE_PREFIX}${connectionKey}`;
}

export function fromRemoteProfileDeviceId(deviceId: string | undefined): string | undefined {
  return deviceId?.startsWith(REMOTE_DEVICE_PREFIX)
    ? deviceId.slice(REMOTE_DEVICE_PREFIX.length)
    : undefined;
}

export interface ProfileSelection {
  scope: ProfileStatScope;
  /** Selected device id when scope === "device"; undefined = current device. */
  deviceId?: string;
  /** Account-scoped provider filter; undefined = all accounts. */
  provider?: string;
  window: ProfileStatsWindow;
}

export interface ProfileData {
  devices: ProfileDevice[];
  currentDeviceId: string | null;
  identity?: ProfileIdentity | null;
  remoteStatusByDeviceId?: Readonly<Record<string, RemoteServerStatus>>;
  selection: ProfileSelection;
  setSelection: (selection: ProfileSelection) => void;
  core: ProfileCoreViewStats | null;
  coreLoading: boolean;
  tokens: ProfileTokenViewStats | null;
  tokensLoading: boolean;
  error: string | null;
  /** Optimistically apply an identity edit and persist it. */
  saveIdentity: (identity: ProfileIdentity) => Promise<void>;
  retry?: () => void;
}

interface HostProfileCache {
  identityRevision: number;
  devices?: ProfileDevicesResponse;
  identity?: ProfileIdentity;
  coreByKey: Map<string, ProfileCoreViewStats>;
  tokensByKey: Map<string, ProfileTokenViewStats>;
}

const hostProfileCaches = new Map<string, HostProfileCache>();

function getHostProfileCache(scopeKey: string): HostProfileCache {
  let cache = hostProfileCaches.get(scopeKey);
  if (!cache) {
    cache = { identityRevision: 0, coreByKey: new Map(), tokensByKey: new Map() };
    hostProfileCaches.set(scopeKey, cache);
  }
  return cache;
}

/** Test seam: clear cached renderer profile data. */
export function resetProfileDataCacheForTest(): void {
  hostProfileCaches.clear();
}

interface HostProfileState {
  key: string;
  devices: ProfileDevice[];
  currentDeviceId: string | null;
  identity: ProfileIdentity | null;
}

function withHostIdentity(
  previous: HostProfileState,
  key: string,
  identity: ProfileIdentity,
): HostProfileState {
  const cache = getHostProfileCache(key);
  return {
    key,
    devices: previous.key === key ? previous.devices : (cache.devices?.devices ?? []),
    currentDeviceId:
      previous.key === key ? previous.currentDeviceId : (cache.devices?.currentDeviceId ?? null),
    identity,
  };
}

const EMPTY_SERVERS: readonly RemoteServerRecord[] = [];
const EMPTY_STATUS_MAP: Readonly<Record<string, RemoteServerStatus>> = {};

function selectRemoteServers(state: RemoteServersState): readonly RemoteServerRecord[] {
  return state.servers.length === 0 ? EMPTY_SERVERS : state.servers;
}

function selectRemoteStatusMap(
  state: RemoteServersState,
): Readonly<Record<string, RemoteServerStatus>> {
  if (state.servers.length === 0) return EMPTY_STATUS_MAP;
  const map: Record<string, RemoteServerStatus> = {};
  for (const server of state.servers) {
    const key = remoteConnectionKey(server);
    map[key] = state.runtime[key]?.status ?? "offline";
  }
  return map;
}

function resolveBridgeScopeKey(remote: boolean, activeBridgeKey: string | null): string {
  return remote ? `remote-bridge:${activeBridgeKey ?? "default"}` : "local";
}

function buildRemoteDevices(
  servers: readonly RemoteServerRecord[],
  statuses: Readonly<Record<string, RemoteServerStatus>>,
  excludeConnectionKey: string | null,
): {
  remoteDevices: ProfileDevice[];
  statusByDeviceId: Record<string, RemoteServerStatus>;
  remoteTargets: Array<{
    connectionKey: string;
    deviceId: string;
    status: RemoteServerStatus;
    canRead: boolean;
  }>;
} {
  const remoteDevices: ProfileDevice[] = [];
  const statusByDeviceId: Record<string, RemoteServerStatus> = {};
  const remoteTargets: Array<{
    connectionKey: string;
    deviceId: string;
    status: RemoteServerStatus;
    canRead: boolean;
  }> = [];

  for (const server of servers) {
    const connectionKey = remoteConnectionKey(server);
    if (excludeConnectionKey && connectionKey === excludeConnectionKey) continue;
    const deviceId = toRemoteProfileDeviceId(connectionKey);
    const status = statuses[connectionKey] ?? "offline";
    remoteDevices.push({
      id: deviceId,
      label: desktopTitle(server.label),
      platform: server.platform ?? "linux",
      isCurrent: false,
    });
    statusByDeviceId[deviceId] = status;
    remoteTargets.push({
      connectionKey,
      deviceId,
      status,
      canRead: server.scopes.includes("session:read"),
    });
  }

  return { remoteDevices, statusByDeviceId, remoteTargets };
}

/**
 * Fetches profile data in independent async pieces so the header, controls,
 * core activity, token/cost rollups, and remote devices paint progressively
 * without blocking behind a single full-page loader.
 */
export function useProfileData(): ProfileData {
  const { t } = useLingui();
  const remote = isRemoteSession();
  const servers = useRemoteServersStore(useShallow(selectRemoteServers));
  const statusMap = useRemoteServersStore(useShallow(selectRemoteStatusMap));
  const bridgeServer = useRemoteServersStore((state) =>
    remote ? selectBrowserBridgeClientServer(state) : undefined,
  );
  const activeBridgeKey = bridgeServer ? remoteConnectionKey(bridgeServer) : null;
  const hostScopeKey = resolveBridgeScopeKey(remote, activeBridgeKey);
  const hostCache = getHostProfileCache(hostScopeKey);

  const [hostState, setHostState] = useState<HostProfileState>(() => ({
    key: hostScopeKey,
    devices: hostCache.devices?.devices ?? [],
    currentDeviceId: hostCache.devices?.currentDeviceId ?? null,
    identity: hostCache.identity ?? null,
  }));
  const hostDevices =
    hostState.key === hostScopeKey ? hostState.devices : (hostCache.devices?.devices ?? []);
  const currentDeviceId =
    hostState.key === hostScopeKey
      ? hostState.currentDeviceId
      : (hostCache.devices?.currentDeviceId ?? null);
  const identity =
    hostState.key === hostScopeKey ? hostState.identity : (hostCache.identity ?? null);
  const [selection, setSelection] = useState<ProfileSelection>({
    scope: "device",
    window: "all",
  });
  const [retryToken, setRetryToken] = useState(0);

  const { remoteDevices, statusByDeviceId, remoteTargets } = buildRemoteDevices(
    servers,
    statusMap,
    remote ? activeBridgeKey : null,
  );
  const devices: ProfileDevice[] = [...hostDevices, ...remoteDevices];

  const { scope, deviceId, provider, window } = selection;
  const locale = useSharedSettings((state) => state.locale);
  const onlineTargetsKey =
    scope === "all"
      ? remoteTargets
          .filter((target) => target.status === "online" && target.canRead)
          .map((target) => target.connectionKey)
          .join(",")
      : "";
  const selectedRemoteKey = scope === "device" ? fromRemoteProfileDeviceId(deviceId) : undefined;
  const statsRequestKey = `${hostScopeKey}\0${scope}\0${deviceId ?? ""}\0${provider ?? ""}\0${window}\0${locale}`;
  const attemptKey = `${statsRequestKey}\0${retryToken}`;

  const cachedCore = hostCache.coreByKey.get(statsRequestKey) ?? null;
  const cachedTokens = hostCache.tokensByKey.get(statsRequestKey) ?? null;

  const [coreState, setCoreState] = useState<{
    key: string;
    data: ProfileCoreViewStats | null;
    loading: boolean;
  }>(() => ({ key: attemptKey, data: cachedCore, loading: cachedCore === null }));
  const [tokensState, setTokensState] = useState<{
    key: string;
    data: ProfileTokenViewStats | null;
    loading: boolean;
  }>(() => ({ key: attemptKey, data: cachedTokens, loading: cachedTokens === null }));
  const [errorState, setErrorState] = useState<{ key: string; message: string | null }>({
    key: attemptKey,
    message: null,
  });

  const core = coreState.key === attemptKey ? coreState.data : cachedCore;
  const coreLoading = coreState.key === attemptKey ? coreState.loading : cachedCore === null;
  const tokens = tokensState.key === attemptKey ? tokensState.data : cachedTokens;
  const tokensLoading =
    tokensState.key === attemptKey ? tokensState.loading : cachedTokens === null;
  const error = errorState.key === attemptKey ? errorState.message : null;

  // Fetch host device list + fast identity independently of heavy stats scans.
  useEffect(() => {
    let active = true;
    const cache = getHostProfileCache(hostScopeKey);
    const identityRevision = cache.identityRevision;
    const bridge = readBridge();
    void bridge
      .getProfileDevices()
      .then((result) => {
        if (!active) return;
        cache.devices = result;
        setHostState((prev) => ({
          key: hostScopeKey,
          devices: result.devices,
          currentDeviceId: result.currentDeviceId,
          identity: prev.key === hostScopeKey ? prev.identity : (cache.identity ?? null),
        }));
      })
      .catch(() => {
        // The device selector can still show paired peers when this host is unavailable.
      });

    if (!remote && typeof bridge.getProfileIdentity === "function") {
      void bridge
        .getProfileIdentity()
        .then((result) => {
          if (!active || cache.identityRevision !== identityRevision) return;
          cache.identity = result.identity;
          setHostState((prev) => withHostIdentity(prev, hostScopeKey, result.identity));
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [hostScopeKey, remote]);

  useEffect(() => {
    let active = true;
    const capturedAttemptKey = attemptKey;
    const cache = getHostProfileCache(hostScopeKey);
    const identityRevision = cache.identityRevision;
    const utcOffsetMinutes = -new Date().getTimezoneOffset();

    function projectPrimaryIdentity(result: ProfileCoreStats): ProfileCoreStats {
      if (cache.identityRevision !== identityRevision && cache.identity) {
        return { ...result, identity: cache.identity };
      }
      cache.identity = result.identity;
      setHostState((prev) => withHostIdentity(prev, hostScopeKey, result.identity));
      return result;
    }

    if (scope === "device") {
      const req: ProfileStatsRequest = {
        utcOffsetMinutes,
        scope: "device",
        window,
        ...(!selectedRemoteKey && deviceId ? { deviceId } : {}),
        ...(provider ? { provider } : {}),
      };
      const bridge = readBridge();
      const store = useRemoteServersStore.getState();
      const coreRequest = selectedRemoteKey
        ? store.withClient(selectedRemoteKey, (client) => client.profileCoreStats(req))
        : bridge.getProfileCoreStats(req);
      const tokenRequest = selectedRemoteKey
        ? store.withClient(selectedRemoteKey, (client) => client.profileTokenStats(req))
        : bridge.getProfileTokenStats(req);

      void coreRequest
        .then((result) => {
          if (!active) return;
          let data = result;
          if (!selectedRemoteKey && (!deviceId || deviceId === currentDeviceId)) {
            data = projectPrimaryIdentity(result);
          } else if (cache.identityRevision !== identityRevision) {
            const saved = cache.coreByKey.get(statsRequestKey)?.identity;
            if (saved) data = { ...result, identity: saved };
          }
          cache.coreByKey.set(statsRequestKey, data);
          setCoreState({ key: capturedAttemptKey, data, loading: false });
          setErrorState({ key: capturedAttemptKey, message: null });
        })
        .catch((err: unknown) => {
          if (!active) return;
          const cached = cache.coreByKey.get(statsRequestKey) ?? null;
          setCoreState({ key: capturedAttemptKey, data: cached, loading: false });
          if (!cached) {
            setErrorState({
              key: capturedAttemptKey,
              message: err instanceof Error ? err.message : t`Failed to load profile stats.`,
            });
          }
        });
      void tokenRequest
        .then((result) => {
          if (!active) return;
          cache.tokensByKey.set(statsRequestKey, result);
          setTokensState({ key: capturedAttemptKey, data: result, loading: false });
        })
        .catch(() => {
          if (!active) return;
          setTokensState({
            key: capturedAttemptKey,
            data: cache.tokensByKey.get(statsRequestKey) ?? null,
            loading: false,
          });
        });
      return () => {
        active = false;
      };
    }

    // Case 3: "All devices" — query primary host + every online remote device
    // in parallel and merge progressively as each async piece resolves.
    const primaryReq: ProfileStatsRequest = {
      utcOffsetMinutes,
      scope: "device",
      window,
      ...(provider ? { provider } : {}),
    };
    const bridge = readBridge();
    const store = useRemoteServersStore.getState();
    const activeRemoteTargets = onlineTargetsKey ? onlineTargetsKey.split(",").filter(Boolean) : [];

    const coreResults = new Map<string, ProfileCoreViewStats>();
    const tokenResults = new Map<string, ProfileTokenViewStats>();
    let primaryDeviceId: string | null = currentDeviceId;

    const totalTargets = 1 + activeRemoteTargets.length;
    let settledCore = 0;
    let settledTokens = 0;
    let lastCoreError: unknown = null;

    const publishMergedCore = () => {
      const blobs: ProfileCoreStats[] = [];
      const seenDeviceIds = new Set<string>();
      const primaryBlob = coreResults.get("__primary__");
      if (primaryBlob) {
        primaryDeviceId = primaryBlob.device.id;
        seenDeviceIds.add(primaryBlob.device.id);
        blobs.push(primaryBlob);
      }
      for (const targetKey of activeRemoteTargets) {
        const blob = coreResults.get(targetKey);
        if (!blob) continue;
        if (seenDeviceIds.has(blob.device.id)) continue;
        seenDeviceIds.add(blob.device.id);
        blobs.push(blob);
      }
      if (blobs.length === 0) return;
      const merged = mergeProfileCoreStats(
        blobs,
        primaryBlob?.identity ?? cache.identity,
        primaryBlob?.device,
      );
      cache.coreByKey.set(statsRequestKey, merged);
      setCoreState({ key: capturedAttemptKey, data: merged, loading: false });
      setErrorState({ key: capturedAttemptKey, message: null });
    };

    const publishMergedTokens = () => {
      const blobs: ProfileTokenStats[] = [];
      const seenDeviceIds = new Set<string>();
      const primaryBlob = tokenResults.get("__primary__");
      if (primaryBlob) {
        primaryDeviceId = primaryBlob.device.id;
        seenDeviceIds.add(primaryBlob.device.id);
        blobs.push(primaryBlob);
      }
      for (const targetKey of activeRemoteTargets) {
        const blob = tokenResults.get(targetKey);
        if (!blob) continue;
        if (seenDeviceIds.has(blob.device.id)) continue;
        seenDeviceIds.add(blob.device.id);
        blobs.push(blob);
      }
      if (blobs.length === 0) return;
      const merged = mergeProfileTokenStats(blobs, primaryBlob?.device);
      cache.tokensByKey.set(statsRequestKey, merged);
      setTokensState({
        key: capturedAttemptKey,
        data: merged,
        loading: settledTokens < totalTargets,
      });
    };

    const checkCoreDone = () => {
      if (settledCore < totalTargets) return;
      if (coreResults.size === 0) {
        const cached = cache.coreByKey.get(statsRequestKey) ?? null;
        setCoreState({ key: capturedAttemptKey, data: cached, loading: false });
        if (!cached) {
          setErrorState({
            key: capturedAttemptKey,
            message:
              lastCoreError instanceof Error
                ? lastCoreError.message
                : t`Failed to load profile stats.`,
          });
        }
      }
    };

    const checkTokensDone = () => {
      if (settledTokens < totalTargets) return;
      if (tokenResults.size === 0) {
        setTokensState({
          key: capturedAttemptKey,
          data: cache.tokensByKey.get(statsRequestKey) ?? null,
          loading: false,
        });
      } else {
        setTokensState((prev) =>
          prev.key === capturedAttemptKey ? { ...prev, loading: false } : prev,
        );
      }
    };

    void bridge
      .getProfileCoreStats(primaryReq)
      .then((result) => {
        if (!active) return;
        primaryDeviceId = result.device.id;
        coreResults.set("__primary__", projectPrimaryIdentity(result));
        publishMergedCore();
      })
      .catch((err: unknown) => {
        lastCoreError = err;
      })
      .finally(() => {
        if (!active) return;
        settledCore += 1;
        checkCoreDone();
      });

    void bridge
      .getProfileTokenStats(primaryReq)
      .then((result) => {
        if (!active) return;
        primaryDeviceId = result.device.id;
        tokenResults.set("__primary__", result);
        publishMergedTokens();
      })
      .catch(() => {})
      .finally(() => {
        if (!active) return;
        settledTokens += 1;
        checkTokensDone();
      });

    for (const targetKey of activeRemoteTargets) {
      void store
        .withClient(targetKey, (client) => client.profileCoreStats(primaryReq))
        .then((result) => {
          if (!active) return;
          if (primaryDeviceId && result.device.id === primaryDeviceId) return;
          coreResults.set(targetKey, result);
          publishMergedCore();
        })
        .catch(() => {})
        .finally(() => {
          if (!active) return;
          settledCore += 1;
          checkCoreDone();
        });

      void store
        .withClient(targetKey, (client) => client.profileTokenStats(primaryReq))
        .then((result) => {
          if (!active) return;
          if (primaryDeviceId && result.device.id === primaryDeviceId) return;
          tokenResults.set(targetKey, result);
          publishMergedTokens();
        })
        .catch(() => {})
        .finally(() => {
          if (!active) return;
          settledTokens += 1;
          checkTokensDone();
        });
    }

    return () => {
      active = false;
    };
  }, [
    attemptKey,
    currentDeviceId,
    deviceId,
    hostScopeKey,
    onlineTargetsKey,
    provider,
    scope,
    selectedRemoteKey,
    statsRequestKey,
    t,
    window,
  ]);

  async function saveIdentity(nextIdentity: ProfileIdentity): Promise<void> {
    if (selectedRemoteKey && !core) return;
    const cache = getHostProfileCache(hostScopeKey);
    const revision = ++cache.identityRevision;
    const response = selectedRemoteKey
      ? await useRemoteServersStore
          .getState()
          .withClient(selectedRemoteKey, (client) => client.setProfileIdentity(nextIdentity))
      : await readBridge().setProfileIdentity(nextIdentity);
    if (cache.identityRevision !== revision) return;
    for (const [key, value] of cache.coreByKey) {
      if (value.device.id === response.device.id) {
        cache.coreByKey.set(key, { ...value, identity: response.identity });
      }
    }
    if (!selectedRemoteKey) {
      cache.identity = response.identity;
      setHostState((prev) => withHostIdentity(prev, hostScopeKey, response.identity));
    }
    setCoreState((prev) => {
      if (prev.key !== attemptKey || !prev.data) return prev;
      const updated = { ...prev.data, identity: response.identity };
      cache.coreByKey.set(statsRequestKey, updated);
      return { ...prev, data: updated };
    });
  }

  return {
    devices,
    currentDeviceId,
    identity: scope === "device" && selectedRemoteKey ? (core?.identity ?? null) : identity,
    remoteStatusByDeviceId: statusByDeviceId,
    selection,
    setSelection,
    core,
    coreLoading,
    tokens,
    tokensLoading,
    error,
    saveIdentity,
    retry: () => setRetryToken((n) => n + 1),
  };
}
