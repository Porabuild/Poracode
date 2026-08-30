import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { isNewerVersion } from "@/shared/agents/updateResolver";
import type { AcpRegistryListResult, AgentStatus } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  currentWslDistros,
  findStatusForTarget,
  scopeEnvForStatus,
  statusUpdateScope,
} from "@/renderer/utils/acpRegistryAuth";
import { getCombinedRuntimeUpdates, type CombinedRuntimeUpdate } from "./providerComposer";

export interface CombinedProviderRuntimeVersion {
  id: string;
  label: string;
  installed: boolean;
  installedVersion: string | undefined;
  latestVersion: string | undefined;
  updateAvailable: boolean;
}

export interface CombinedProviderRuntimeUpdateEntry {
  supported: boolean;
  runtimes: readonly CombinedProviderRuntimeVersion[];
  updateAvailable: boolean;
  pending: boolean;
}

interface UpdateOptions {
  toast?: boolean;
}

function statusKey(status: AgentStatus): string {
  return `${status.kind}:${status.envKind ?? "native"}:${status.envDistro ?? ""}`;
}

function probeKey(status: AgentStatus, runtime: CombinedRuntimeUpdate): string {
  return runtime.channel.kind === "agent-binary"
    ? `${status.kind}:agent-binary`
    : `${status.kind}:acp-registry:${runtime.channel.agentId}`;
}

function updateAvailable(
  runtime: CombinedRuntimeUpdate,
  installedVersion: string | undefined,
  latestVersion: string | undefined,
): boolean {
  if (!runtime.installed || !installedVersion || !latestVersion) return false;
  return isNewerVersion(latestVersion, installedVersion);
}

/**
 * `listAcpRegistry` is not a cheap read: the supervisor fetches the remote
 * registry and runs the auto-update sweep for every installed generic agent.
 * The composer dock mounts once per thread view, so the listing is shared and
 * short-lived here instead of re-triggering that sweep on every mount.
 */
const REGISTRY_LISTING_TTL_MS = 5 * 60_000;
let registryListing: { at: number; promise: Promise<AcpRegistryListResult> } | undefined;

export function loadAcpRegistryListing(): Promise<AcpRegistryListResult> {
  const now = Date.now();
  if (registryListing && now - registryListing.at < REGISTRY_LISTING_TTL_MS) {
    return registryListing.promise;
  }
  const promise = readBridge()
    .listAcpRegistry()
    .catch((error: unknown) => {
      registryListing = undefined;
      throw error;
    });
  registryListing = { at: now, promise };
  return promise;
}

/** Dropped after an install/update, and by tests so one never inherits another's registry. */
export function resetAcpRegistryListingCache(): void {
  registryListing = undefined;
}

async function probeLatestVersion(
  status: AgentStatus,
  runtime: CombinedRuntimeUpdate,
): Promise<string | undefined> {
  if (runtime.channel.kind === "agent-binary") {
    return (await readBridge().getLatestAgentVersion({ agentKind: status.kind })).version;
  }
  const registryAgentId = runtime.channel.agentId;
  const registry = await loadAcpRegistryListing();
  return registry.agents.find((agent) => agent.id === registryAgentId)?.version;
}

/**
 * Provider-registered, independently versioned runtimes exposed as one update
 * action. The hook owns probing, native/WSL routing, sequential updates and
 * post-update version verification so composer and settings stay in sync.
 */
export function useCombinedProviderRuntimeUpdates(
  statuses: readonly AgentStatus[],
  registryVersions: Readonly<Record<string, string>> = {},
) {
  const { t } = useLingui();
  const syncInstalledAgents = useSharedSettings((state) => state.syncAcpRegistryInstalledAgents);
  const [latestByProbe, setLatestByProbe] = useState<Readonly<Record<string, string>>>({});
  const [verifiedVersions, setVerifiedVersions] = useState<Readonly<Record<string, string>>>({});
  const [pendingStatusKeys, setPendingStatusKeys] = useState<ReadonlySet<string>>(() => new Set());

  const probes = new Map<string, { status: AgentStatus; runtime: CombinedRuntimeUpdate }>();
  for (const status of statuses) {
    const runtimes = getCombinedRuntimeUpdates(status.kind)?.({ agentStatus: status }) ?? [];
    for (const runtime of runtimes) {
      if (runtime.channel.kind === "acp-registry" && registryVersions[runtime.channel.agentId]) {
        continue;
      }
      probes.set(probeKey(status, runtime), { status, runtime });
    }
  }
  const probesKey = [...probes.entries()]
    .map(
      ([key, { runtime }]) =>
        `${key}:${runtime.installed ? "installed" : "missing"}:${runtime.installedVersion ?? ""}`,
    )
    .toSorted()
    .join("\0");

  useEffect(() => {
    if (!probesKey) return;
    let cancelled = false;
    for (const [key, probe] of probes) {
      void probeLatestVersion(probe.status, probe.runtime)
        .then((version) => {
          if (cancelled || !version) return;
          setLatestByProbe((current) =>
            current[key] === version ? current : { ...current, [key]: version },
          );
        })
        .catch((error) => {
          console.warn(
            `[combined-runtime-updates] probe failed for ${key}:`,
            error instanceof Error ? error.message : error,
          );
        });
    }
    return () => {
      cancelled = true;
    };
    // `probesKey` is the stable identity of the provider-owned probe set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probesKey]);

  function entryFor(status: AgentStatus): CombinedProviderRuntimeUpdateEntry {
    const resolver = getCombinedRuntimeUpdates(status.kind);
    if (!resolver) {
      return { supported: false, runtimes: [], updateAvailable: false, pending: false };
    }
    const key = statusKey(status);
    const runtimes = resolver({ agentStatus: status }).map((runtime) => {
      const installedVersion = verifiedVersions[`${key}:${runtime.id}`] ?? runtime.installedVersion;
      const probedLatestVersion =
        (runtime.channel.kind === "acp-registry"
          ? registryVersions[runtime.channel.agentId]
          : undefined) ?? latestByProbe[probeKey(status, runtime)];
      const latestVersion =
        installedVersion &&
        probedLatestVersion &&
        isNewerVersion(installedVersion, probedLatestVersion)
          ? installedVersion
          : probedLatestVersion;
      return {
        id: runtime.id,
        label: t(runtime.label),
        installed: runtime.installed,
        installedVersion,
        latestVersion,
        updateAvailable: updateAvailable(runtime, installedVersion, latestVersion),
      };
    });
    return {
      supported: true,
      runtimes,
      updateAvailable: runtimes.some((runtime) => runtime.updateAvailable),
      pending: pendingStatusKeys.has(key),
    };
  }

  async function updateStatus(status: AgentStatus, options: UpdateOptions = {}): Promise<void> {
    const resolver = getCombinedRuntimeUpdates(status.kind);
    if (!resolver) return;
    const key = statusKey(status);
    const runtimes = resolver({ agentStatus: status });
    try {
      const resolved = await Promise.all(
        runtimes.map(async (runtime) => {
          const latestVersion =
            (runtime.channel.kind === "acp-registry"
              ? registryVersions[runtime.channel.agentId]
              : undefined) ??
            latestByProbe[probeKey(status, runtime)] ??
            (await probeLatestVersion(status, runtime));
          const installedVersion =
            verifiedVersions[`${key}:${runtime.id}`] ?? runtime.installedVersion;
          return { runtime, latestVersion, installedVersion };
        }),
      );
      const outdated = resolved.filter(({ runtime, latestVersion, installedVersion }) =>
        updateAvailable(runtime, installedVersion, latestVersion),
      );
      if (outdated.length === 0) return;

      setPendingStatusKeys((current) => new Set(current).add(key));
      let failure: Error | undefined;
      const expected = new Map<
        string,
        {
          version: string;
          channel: CombinedRuntimeUpdate["channel"]["kind"];
          probe: string;
        }
      >();
      try {
        for (const { runtime, latestVersion } of outdated) {
          if (!latestVersion) continue;
          let expectedVersion = latestVersion;
          try {
            if (runtime.channel.kind === "agent-binary") {
              const scope = statusUpdateScope(status);
              const result = await readBridge().updateAgentBinary({
                agentKind: status.kind,
                envKind: scope.envKind,
                ...(scope.wslDistro ? { wslDistro: scope.wslDistro } : {}),
              });
              if (!result.ok) {
                throw new Error(result.output?.trim() || t`Unable to update ${status.label}.`);
              }
            } else {
              const target = scopeEnvForStatus(status);
              const registryAgentId = runtime.channel.agentId;
              const result = await readBridge().updateAcpRegistryAgent({
                agentId: registryAgentId,
                target,
              });
              syncInstalledAgents(result.installed);
              resetAcpRegistryListingCache();
              const record = result.installed.find((installed) => installed.id === registryAgentId);
              expectedVersion =
                (target.kind === "wsl"
                  ? record?.installations?.wsl?.[target.distro]?.version
                  : record?.installations?.native?.version) ??
                record?.version ??
                latestVersion;
            }
            expected.set(runtime.id, {
              version: expectedVersion,
              channel: runtime.channel.kind,
              probe: probeKey(status, runtime),
            });
          } catch (error) {
            failure ??=
              error instanceof Error ? error : new Error(t`Unable to update ${status.label}.`);
          }
        }

        const response = await readBridge().refreshAgentStatuses(currentWslDistros(), {
          agentKinds: [status.kind],
          envs: [scopeEnvForStatus(status)],
        });
        const refreshed = findStatusForTarget(response, status.kind, scopeEnvForStatus(status));
        for (const [runtimeId, expectedRuntime] of expected) {
          const detected = refreshed?.runtimeVariants?.[runtimeId];
          const detectedVersion = detected?.version;
          const versionMatches =
            detectedVersion !== undefined &&
            (expectedRuntime.channel === "agent-binary"
              ? !isNewerVersion(expectedRuntime.version, detectedVersion)
              : detectedVersion === expectedRuntime.version);
          if (!detected?.installed || !versionMatches) {
            failure ??= new Error(t`Unable to refresh ${status.label} status.`);
            continue;
          }
          setVerifiedVersions((current) => ({
            ...current,
            [`${key}:${runtimeId}`]: detectedVersion,
          }));
          setLatestByProbe((current) => ({
            ...current,
            [expectedRuntime.probe]: detectedVersion,
          }));
        }
        if (failure) throw failure;
        if (options.toast !== false) toast.success(t`${status.label} updated.`);
      } finally {
        setPendingStatusKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    } catch (error) {
      const resolvedError =
        error instanceof Error ? error : new Error(t`Unable to update ${status.label}.`);
      if (options.toast !== false) {
        toast.danger(resolvedError.message);
        return;
      }
      throw resolvedError;
    }
  }

  return { entryFor, updateStatus };
}
