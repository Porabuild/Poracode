import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { isNewerVersion } from "@/shared/agents/updateResolver";
import type { AcpRegistryListResult, AgentStatus, Project } from "@/shared/contracts";
import { agentEnvKey } from "@/shared/machines";
import { localizeCatalogMessage } from "@/shared/messages";
import { runAgentInstallCommand } from "@/renderer/actions/agentLoginActions";
import {
  currentWslDistros,
  findStatusForTarget,
  scopeEnvForStatus,
  statusUpdateScope,
} from "@/renderer/utils/acpRegistryAuth";
import {
  hostScopedKey,
  LOCAL_AGENT_MANAGEMENT_HOST,
  type AgentManagementHost,
} from "./settings/agentManagementHost";
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

let packageUpdateTail: Promise<void> = Promise.resolve();

/** Package installers share one terminal overlay, so different jobs must take turns. */
function runPackageCommand(project: Project, label: string, command: string): Promise<boolean> {
  const result = packageUpdateTail.then(
    () =>
      new Promise<boolean>((resolve) => {
        const opened = runAgentInstallCommand({
          label,
          project,
          command,
          purpose: "update",
          onCommandComplete: (exitCode) => resolve(exitCode === 0),
        });
        if (!opened) resolve(false);
      }),
  );
  packageUpdateTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function statusKey(status: AgentStatus): string {
  const env = scopeEnvForStatus(status);
  return `${status.kind}:${env.kind}:${env.kind === "wsl" ? env.distro : ""}`;
}

function probeKey(status: AgentStatus, runtime: CombinedRuntimeUpdate, hostKey: string): string {
  if (runtime.channel.kind === "npm-package") {
    return hostScopedKey(hostKey, `npm-package:${JSON.stringify(runtime.channel.query)}`);
  }
  const key =
    runtime.channel.kind === "agent-binary"
      ? `${status.kind}:agent-binary`
      : `${status.kind}:acp-registry:${runtime.channel.agentId}`;
  return hostScopedKey(hostKey, key);
}

function updateAvailable(
  runtime: CombinedRuntimeUpdate,
  installedVersion: string | undefined,
  latestVersion: string | undefined,
): boolean {
  if (runtime.channel.kind === "npm-package" && !runtime.channel.commandForVersion) return false;
  if (!runtime.installed || !installedVersion || !latestVersion) return false;
  return isNewerVersion(latestVersion, installedVersion);
}

/**
 * `listAcpRegistry` is not a cheap read: the supervisor fetches the remote
 * registry and runs the auto-update sweep for every installed generic agent.
 * The composer dock mounts once per thread view, so the listing is shared and
 * short-lived here instead of re-triggering that sweep on every mount. Each
 * machine has its own listing: a paired host's registry is not this client's.
 */
const REGISTRY_LISTING_TTL_MS = 5 * 60_000;
const registryListings = new Map<string, { at: number; promise: Promise<AcpRegistryListResult> }>();

export function loadAcpRegistryListing(
  host: AgentManagementHost = LOCAL_AGENT_MANAGEMENT_HOST,
): Promise<AcpRegistryListResult> {
  const now = Date.now();
  const cached = registryListings.get(host.key);
  if (cached && now - cached.at < REGISTRY_LISTING_TTL_MS) {
    return cached.promise;
  }
  const promise = host.listAcpRegistry().catch((error: unknown) => {
    if (registryListings.get(host.key)?.promise === promise) {
      registryListings.delete(host.key);
    }
    throw error;
  });
  registryListings.set(host.key, { at: now, promise });
  return promise;
}

/** Dropped after an install/update, and by tests so one never inherits another's registry. */
export function resetAcpRegistryListingCache(): void {
  registryListings.clear();
}

async function probeLatestVersion(
  status: AgentStatus,
  runtime: CombinedRuntimeUpdate,
  host: AgentManagementHost,
): Promise<string | undefined> {
  if (runtime.channel.kind === "agent-binary") {
    return (await host.getLatestAgentVersion({ agentKind: status.kind })).version;
  }
  if (runtime.channel.kind === "npm-package") {
    return (
      await host.getLatestAgentVersion({
        agentKind: status.kind,
        npmPackage: runtime.channel.query,
      })
    ).version;
  }
  const registryAgentId = runtime.channel.agentId;
  const registry = await loadAcpRegistryListing(host);
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
  host: AgentManagementHost = LOCAL_AGENT_MANAGEMENT_HOST,
  providerList?: { resolveProject: (status: AgentStatus) => Project | undefined },
) {
  const { t } = useLingui();
  const [latestByProbe, setLatestByProbe] = useState<Readonly<Record<string, string>>>({});
  const [verifiedVersions, setVerifiedVersions] = useState<
    Readonly<Record<string, { version: string; snapshot?: AgentStatus }>>
  >({});
  const [pendingStatusKeys, setPendingStatusKeys] = useState<ReadonlySet<string>>(() => new Set());
  const packageJobs = useRef(new Map<string, Promise<void>>());
  // Bulk workers can hold status snapshots from before a sibling updated the same package.
  const verifiedPackageSnapshots = useRef(new WeakMap<AgentStatus, Map<string, string>>());

  function resolveRuntimes(status: AgentStatus) {
    return getCombinedRuntimeUpdates(status.kind, providerList ? "provider-list" : undefined);
  }

  function installedVersionFor(status: AgentStatus, runtime: CombinedRuntimeUpdate) {
    const key = hostScopedKey(host.key, statusKey(status));
    const verified = verifiedVersions[`${key}:${runtime.id}`];
    return verified && (!verified.snapshot || verified.snapshot === status)
      ? verified.version
      : runtime.installedVersion;
  }

  const probes = new Map<string, { status: AgentStatus; runtime: CombinedRuntimeUpdate }>();
  for (const status of statuses) {
    const runtimes = resolveRuntimes(status)?.({ agentStatus: status }) ?? [];
    for (const runtime of runtimes) {
      if (
        runtime.channel.kind === "npm-package" &&
        (!runtime.installed || !runtime.channel.commandForVersion)
      )
        continue;
      if (runtime.channel.kind === "acp-registry" && registryVersions[runtime.channel.agentId]) {
        continue;
      }
      probes.set(probeKey(status, runtime, host.key), { status, runtime });
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
      void probeLatestVersion(probe.status, probe.runtime, host)
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
  }, [probesKey, host]);

  function entryFor(status: AgentStatus): CombinedProviderRuntimeUpdateEntry {
    const resolver = resolveRuntimes(status);
    if (!resolver) {
      return { supported: false, runtimes: [], updateAvailable: false, pending: false };
    }
    const key = hostScopedKey(host.key, statusKey(status));
    const runtimes = resolver({ agentStatus: status }).map((runtime) => {
      const installedVersion = installedVersionFor(status, runtime);
      const probedLatestVersion =
        (runtime.channel.kind === "acp-registry"
          ? registryVersions[runtime.channel.agentId]
          : undefined) ?? latestByProbe[probeKey(status, runtime, host.key)];
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

  async function updatePackage(
    status: AgentStatus,
    runtime: CombinedRuntimeUpdate,
    version: string,
  ): Promise<void> {
    const channel = runtime.channel;
    if (channel.kind !== "npm-package") return;
    const { commandForVersion, query, reservePackage } = channel;
    const env = scopeEnvForStatus(status);
    const envKey = agentEnvKey(env);
    const jobKey = hostScopedKey(host.key, JSON.stringify([envKey, query.name]));
    const updateLabel = t(runtime.label);
    function versionVerified() {
      const verified = verifiedPackageSnapshots.current.get(status)?.get(jobKey);
      return verified !== undefined && !isNewerVersion(version, verified);
    }

    async function installAndRediscover() {
      const project = providerList?.resolveProject(status);
      if (!project) throw new Error(t`Add a project before updating an agent.`);
      const command = commandForVersion?.(project, version);
      if (!command || !(await runPackageCommand(project, updateLabel, command))) {
        throw new Error(t`Unable to update ${updateLabel}.`);
      }

      const related = statuses.flatMap((candidate) =>
        (resolveRuntimes(candidate)?.({ agentStatus: candidate }) ?? [])
          .filter(
            (entry) =>
              entry.channel.kind === "npm-package" &&
              entry.channel.query.name === query.name &&
              agentEnvKey(scopeEnvForStatus(candidate)) === envKey,
          )
          .map((entry) => ({ status: candidate, runtimeId: entry.id })),
      );
      const refreshed = await host.rediscoverAgents(env.kind === "wsl" ? [env.distro] : [], {
        agentKinds: [...new Set(related.map((entry) => entry.status.kind))],
        envs: [env],
      });
      const verifiedUpdates: Record<string, { version: string; snapshot: AgentStatus }> = {};
      for (const entry of related) {
        const detected = findStatusForTarget(refreshed, entry.status.kind, env);
        const detectedRuntime = detected
          ? resolveRuntimes(detected)?.({ agentStatus: detected }).find(
              (candidate) => candidate.id === entry.runtimeId,
            )
          : undefined;
        const detectedVersion = detectedRuntime?.installedVersion;
        if (
          !detectedRuntime?.installed ||
          !detectedVersion ||
          isNewerVersion(version, detectedVersion)
        ) {
          continue;
        }
        const key = hostScopedKey(host.key, statusKey(entry.status));
        verifiedUpdates[`${key}:${entry.runtimeId}`] = {
          version: detectedVersion,
          snapshot: entry.status,
        };
        const versions = verifiedPackageSnapshots.current.get(entry.status) ?? new Map();
        versions.set(jobKey, detectedVersion);
        verifiedPackageSnapshots.current.set(entry.status, versions);
      }
      setVerifiedVersions((current) => ({ ...current, ...verifiedUpdates }));
    }
    if (versionVerified()) return;
    const pending = packageJobs.current.get(jobKey);
    if (pending) {
      await pending;
    } else {
      const releasePackage = reservePackage?.(host.key);
      if (reservePackage && !releasePackage) throw new Error(t`Unable to update ${updateLabel}.`);
      const job = installAndRediscover().finally(releasePackage);
      packageJobs.current.set(jobKey, job);
      try {
        await job;
      } finally {
        packageJobs.current.delete(jobKey);
      }
    }
    if (!versionVerified()) throw new Error(t`Unable to update ${updateLabel}.`);
  }

  async function updateStatus(status: AgentStatus, options: UpdateOptions = {}): Promise<void> {
    const resolver = resolveRuntimes(status);
    if (!resolver) return;
    const key = hostScopedKey(host.key, statusKey(status));
    const runtimes = resolver({ agentStatus: status });
    try {
      const resolved = await Promise.all(
        runtimes.map(async (runtime) => {
          const installedVersion = installedVersionFor(status, runtime);
          if (
            runtime.channel.kind === "npm-package" &&
            (!runtime.installed || !runtime.channel.commandForVersion)
          ) {
            return { runtime, latestVersion: undefined, installedVersion };
          }
          const latestVersion =
            (runtime.channel.kind === "acp-registry"
              ? registryVersions[runtime.channel.agentId]
              : undefined) ??
            latestByProbe[probeKey(status, runtime, host.key)] ??
            (await probeLatestVersion(status, runtime, host));
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
            if (runtime.channel.kind === "npm-package") {
              await updatePackage(status, runtime, latestVersion);
              continue;
            }
            if (runtime.channel.kind === "agent-binary") {
              const scope = statusUpdateScope(status);
              const result = await host.updateAgentBinary({
                agentKind: status.kind,
                envKind: scope.envKind,
                ...(scope.wslDistro ? { wslDistro: scope.wslDistro } : {}),
              });
              if (!result.ok) {
                throw new Error(
                  localizeCatalogMessage(result.output?.trim() ?? "") ||
                    t`Unable to update ${status.label}.`,
                );
              }
            } else {
              const target = scopeEnvForStatus(status);
              const registryAgentId = runtime.channel.agentId;
              const result = await host.updateAcpRegistryAgent({
                agentId: registryAgentId,
                target,
              });
              host.recordRegistryInstalls(result.installed, [registryAgentId]);
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
              probe: probeKey(status, runtime, host.key),
            });
          } catch (error) {
            failure ??=
              error instanceof Error ? error : new Error(t`Unable to update ${status.label}.`);
          }
        }

        const response = outdated.some(({ runtime }) => runtime.channel.kind !== "npm-package")
          ? await host.refreshAgentStatuses(currentWslDistros(), {
              agentKinds: [status.kind],
              envs: [scopeEnvForStatus(status)],
            })
          : undefined;
        const refreshed = findStatusForTarget(response, status.kind, scopeEnvForStatus(status));
        const refreshedRuntimes = refreshed ? resolver({ agentStatus: refreshed }) : [];
        for (const [runtimeId, expectedRuntime] of expected) {
          const detected = refreshedRuntimes.find((runtime) => runtime.id === runtimeId);
          const detectedVersion = detected?.installedVersion;
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
            [`${key}:${runtimeId}`]: { version: detectedVersion },
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
