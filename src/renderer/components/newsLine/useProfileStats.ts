import { useEffect, useState } from "react";
import type { ProfileCoreStats, ProfileTokenStats } from "@/shared/contracts";
import type { ProfileEnvSummary } from "@/shared/profile/insights";
import { mergeProfileCoreStats, mergeProfileTokenStats } from "@/shared/profile/merge";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { selectBrowserBridgeClientServer } from "@/renderer/state/remoteServers/browserBridge";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

/** Stats change slowly; reuse one host+remote read across new-thread pages for a while. */
const CACHE_TTL_MS = 10 * 60_000;

export interface CrossEnvProfileStats {
  core: ProfileCoreStats | null;
  tokens: ProfileTokenStats | null;
  envs: ProfileEnvSummary[];
}

const EMPTY_STATS: CrossEnvProfileStats = { core: null, tokens: null, envs: [] };

let cached: { key: string; at: number; data: CrossEnvProfileStats } | null = null;
const inFlight = new Map<string, Promise<CrossEnvProfileStats>>();

function safeIsRemoteSession(): boolean {
  try {
    return isRemoteSession();
  } catch {
    return false;
  }
}

interface TargetHost {
  connectionKey: string;
  label: string;
  platform: string;
}

function collectRemoteTargets(remote: boolean): TargetHost[] {
  const state = useRemoteServersStore.getState();
  const bridgeServer = remote ? selectBrowserBridgeClientServer(state) : undefined;
  const bridgeKey = bridgeServer ? remoteConnectionKey(bridgeServer) : null;
  const targets: TargetHost[] = [];
  for (const server of state.servers) {
    const key = remoteConnectionKey(server);
    if (bridgeKey && key === bridgeKey) continue;
    if (!server.scopes.includes("session:read")) continue;
    if (state.runtime[key]?.status !== "online") continue;
    targets.push({
      connectionKey: key,
      label: desktopTitle(server.label),
      platform: server.platform ?? "linux",
    });
  }
  targets.sort((a, b) => a.connectionKey.localeCompare(b.connectionKey));
  return targets;
}

async function fetchPrimaryHost(utcOffsetMinutes: number): Promise<{
  core: ProfileCoreStats | null;
  tokens: ProfileTokenStats | null;
}> {
  const bridge = readBridge();
  const req = { utcOffsetMinutes, scope: "device" as const, window: "all" as const };
  const corePromise = bridge.getProfileCoreStats(req).catch(() => null);
  const tokensPromise =
    typeof bridge.getProfileTokenStats === "function"
      ? bridge.getProfileTokenStats(req).catch(() => null)
      : Promise.resolve(null);
  const [core, tokens] = await Promise.all([corePromise, tokensPromise]);
  return { core, tokens };
}

async function fetchRemoteHost(
  target: TargetHost,
  utcOffsetMinutes: number,
): Promise<{
  target: TargetHost;
  core: ProfileCoreStats | null;
  tokens: ProfileTokenStats | null;
}> {
  const store = useRemoteServersStore.getState();
  const req = { utcOffsetMinutes, scope: "device" as const, window: "all" as const };
  const corePromise = store
    .withClient(target.connectionKey, (client) => client.profileCoreStats(req))
    .catch(() => null);
  const tokensPromise = store
    .withClient(target.connectionKey, (client) => client.profileTokenStats(req))
    .catch(() => null);
  const [core, tokens] = await Promise.all([corePromise, tokensPromise]);
  return { target, core, tokens };
}

function assembleCrossEnvStats(
  primary: { core: ProfileCoreStats | null; tokens: ProfileTokenStats | null },
  remotes: readonly {
    target: TargetHost;
    core: ProfileCoreStats | null;
    tokens: ProfileTokenStats | null;
  }[],
): CrossEnvProfileStats {
  const coreBlobs: ProfileCoreStats[] = [];
  const tokenBlobs: ProfileTokenStats[] = [];
  const seenDeviceIds = new Set<string>();
  const envs: ProfileEnvSummary[] = [];

  if (primary.core) {
    const deviceId = primary.core.device?.id ?? "primary";
    seenDeviceIds.add(deviceId);
    coreBlobs.push(primary.core);
    envs.push({
      id: deviceId,
      label: primary.core.device?.label ?? "",
      platform: primary.core.device?.platform ?? "linux",
      isCurrent: true,
      core: primary.core,
      ...(primary.tokens ? { tokens: primary.tokens } : {}),
    });
  }
  if (primary.tokens) {
    tokenBlobs.push(primary.tokens);
  }

  for (const remote of remotes) {
    const remoteDeviceId = remote.core?.device?.id ?? remote.target.connectionKey;
    if (remote.core && !seenDeviceIds.has(remoteDeviceId)) {
      seenDeviceIds.add(remoteDeviceId);
      coreBlobs.push(remote.core);
      envs.push({
        id: remoteDeviceId,
        label: remote.target.label,
        platform: remote.target.platform,
        isCurrent: false,
        core: remote.core,
        ...(remote.tokens ? { tokens: remote.tokens } : {}),
      });
    }
    const tokenDeviceId = remote.tokens?.device?.id;
    if (
      remote.tokens &&
      (!tokenDeviceId || !tokenBlobs.some((b) => b.device?.id === tokenDeviceId))
    ) {
      tokenBlobs.push(remote.tokens);
    }
  }

  if (coreBlobs.length === 0) return EMPTY_STATS;

  const core = coreBlobs.length === 1 ? coreBlobs[0]! : mergeProfileCoreStats(coreBlobs);
  const tokens =
    tokenBlobs.length === 0
      ? null
      : tokenBlobs.length === 1
        ? tokenBlobs[0]!
        : mergeProfileTokenStats(tokenBlobs);

  return { core, tokens, envs };
}

async function loadCrossEnvStats(
  cacheKey: string,
  targets: readonly TargetHost[],
  onPrimary?: (partial: CrossEnvProfileStats) => void,
): Promise<CrossEnvProfileStats> {
  if (cached && cached.key === cacheKey && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const pending = (async (): Promise<CrossEnvProfileStats> => {
    if (targets.length === 0) {
      const primary = await fetchPrimaryHost(utcOffsetMinutes);
      const data = assembleCrossEnvStats(primary, []);
      if (data.core) cached = { key: cacheKey, at: Date.now(), data };
      return data;
    }

    const primaryPromise = fetchPrimaryHost(utcOffsetMinutes);
    const remotesPromise = Promise.all(
      targets.map((target) => fetchRemoteHost(target, utcOffsetMinutes)),
    );

    const primary = await primaryPromise;
    if (primary.core && onPrimary) {
      onPrimary(assembleCrossEnvStats(primary, []));
    }
    const remotes = await remotesPromise;
    const data = assembleCrossEnvStats(primary, remotes);
    if (data.core) cached = { key: cacheKey, at: Date.now(), data };
    return data;
  })().finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, pending);
  return pending;
}

/**
 * Aggregated profile + token stats across the active host and every online
 * connected environment, plus per-environment breakdowns.
 */
export function useCrossEnvProfileStats(): CrossEnvProfileStats {
  const remote = safeIsRemoteSession();
  const targetSignature = useRemoteServersStore((state) => {
    const bridgeServer = remote ? selectBrowserBridgeClientServer(state) : undefined;
    const bridgeKey = bridgeServer ? remoteConnectionKey(bridgeServer) : null;
    const keys: string[] = [];
    for (const server of state.servers) {
      const key = remoteConnectionKey(server);
      if (bridgeKey && key === bridgeKey) continue;
      if (!server.scopes.includes("session:read")) continue;
      if (state.runtime[key]?.status !== "online") continue;
      keys.push(key);
    }
    return keys.sort().join("\0");
  });

  const [data, setData] = useState<CrossEnvProfileStats>(() =>
    cached && cached.key === targetSignature ? cached.data : EMPTY_STATS,
  );

  useEffect(() => {
    let active = true;
    const targets = collectRemoteTargets(remote);
    void loadCrossEnvStats(targetSignature, targets, (partial) => {
      if (active) setData((prev) => (prev.core ? prev : partial));
    }).then((result) => {
      if (active && (result.core !== null || cached !== null)) {
        setData(result);
      }
    });
    return () => {
      active = false;
    };
  }, [remote, targetSignature]);

  return data;
}

/** The merged core stats across all connected environments, or null when unavailable. */
export function useProfileStats(): ProfileCoreStats | null {
  return useCrossEnvProfileStats().core;
}

/** Test seam: forget the cached host read. */
export function resetProfileStatsCache(): void {
  cached = null;
  inFlight.clear();
}
