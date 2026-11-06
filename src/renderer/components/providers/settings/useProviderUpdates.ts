import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  extractAcpGenericInstanceId,
  isAgentProfileKind,
  type AgentStatus,
} from "@/shared/contracts";
import { isNewerVersion } from "@/shared/agents/updateResolver";
import { machineKey } from "@/shared/machines";
import { localizeCatalogMessage } from "@/shared/messages";
import { getCombinedRuntimeUpdates } from "@/renderer/components/providers/providerComposer";
import { useHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { machineIdForStatus, type MachineDescriptor } from "@/renderer/state/machines";
import {
  currentWslDistros,
  envLabelForStatus,
  scopeEnvForStatus,
  statusUpdateScope,
} from "@/renderer/utils/acpRegistryAuth";
import {
  agentManagementHostForMachine,
  hostScopedKey,
  useHostRegistryInstalledAgents,
} from "./agentManagementHost";
import {
  useProviderUpdateQueue,
  type ActiveProviderUpdatePhase,
  type ProviderUpdateAllProgress,
  type ProviderUpdatePhase,
  type ProviderUpdateTarget,
} from "./useProviderUpdateQueue";

export type { ProviderUpdateAllProgress, ProviderUpdatePhase } from "./useProviderUpdateQueue";

export interface ProviderEnvironmentVersion {
  /** Environment name, e.g. `Windows` or `WSL (Ubuntu)`. */
  label: string;
  version: string | undefined;
}

export interface ProviderUpdateEntry {
  /** Newest version detected across the provider's environments. */
  installedVersion: string | undefined;
  /**
   * Per-environment versions, native first — only populated when the provider
   * is installed in several environments that disagree on the version, so the
   * common single-environment case stays a bare version string.
   */
  environments: readonly ProviderEnvironmentVersion[];
  /** Version to update to; `undefined` when the provider is current. */
  targetVersion: string | undefined;
  /** Current bulk/manual update phase; `undefined` when no update is pending. */
  updatePhase: ProviderUpdatePhase | undefined;
}

export interface ProviderUpdatesModel {
  entryFor: (kind: string) => ProviderUpdateEntry;
  /** Kinds with an available update, in the order they were passed in. */
  outdatedKinds: readonly string[];
  isUpdatingAll: boolean;
  updateAllProgress: ProviderUpdateAllProgress | undefined;
  updateKind: (kind: string) => void;
  updateAll: () => void;
}

const EMPTY_ENTRY: ProviderUpdateEntry = {
  installedVersion: undefined,
  environments: [],
  targetVersion: undefined,
  updatePhase: undefined,
};

function newerOf(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return isNewerVersion(right, left) ? right : left;
}

function splitKinds(kindsKey: string): string[] {
  return kindsKey ? kindsKey.split("\0") : [];
}

function hasCombinedRuntimes(kind: string): boolean {
  return getCombinedRuntimeUpdates(kind) !== undefined;
}

/**
 * Version and update state for a list of provider kinds, so the agents list can
 * offer per-provider and "update all" upgrades in one place instead of one
 * settings page per provider.
 *
 * Both update channels of the per-agent settings page are covered: ACP registry
 * instances update through the registry, every other provider updates its
 * binary once per environment it is installed in (Windows and each WSL distro).
 */
export function useProviderUpdates(
  agents: readonly AgentStatus[],
  /** The machine whose providers the list shows; updates run on that machine's host. */
  machine: MachineDescriptor,
): ProviderUpdatesModel {
  const { t } = useLingui();
  const host = agentManagementHostForMachine(machine);
  const pools = useHostAgentStatusPools(host.connectionKey);
  const machineEnvId = machineKey({ host: "local", env: machine.ref.env });
  const registryInstalled = useHostRegistryInstalledAgents(host);
  const [latestByKind, setLatestByKind] = useState<Readonly<Record<string, string>>>({});
  const [registryLatestById, setRegistryLatestById] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const queue = useProviderUpdateQueue(runUpdate, (error, { agent }) => {
    toast.danger(error instanceof Error ? error.message : t`Unable to update ${agent.label}.`);
  });

  const kindsKey = agents.map((agent) => agent.kind).join("\0");
  const kinds = splitKinds(kindsKey);
  const hasRegistryKinds = kinds.some((kind) => extractAcpGenericInstanceId(kind) !== undefined);

  // One upstream probe per binary-channel kind. The supervisor caches latest
  // versions for 30 minutes, so reopening the page does not re-hit registries.
  useEffect(() => {
    const probeKinds = splitKinds(kindsKey).filter(
      (kind) =>
        !isAgentProfileKind(kind) &&
        extractAcpGenericInstanceId(kind) === undefined &&
        !hasCombinedRuntimes(kind),
    );
    if (probeKinds.length === 0) return;
    let cancelled = false;
    for (const kind of probeKinds) {
      const cacheKey = hostScopedKey(host.key, kind);
      host
        .getLatestAgentVersion({ agentKind: kind })
        .then((result) => {
          const version = result.version;
          if (cancelled || !version) return;
          setLatestByKind((current) =>
            current[cacheKey] === version ? current : { ...current, [cacheKey]: version },
          );
        })
        .catch((error) => {
          console.warn(
            `[useProviderUpdates] getLatestAgentVersion(${kind}) failed:`,
            error instanceof Error ? error.message : error,
          );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [kindsKey, host]);

  useEffect(() => {
    if (!hasRegistryKinds) return;
    let cancelled = false;
    host
      .listAcpRegistry()
      .then((result) => {
        if (cancelled) return;
        setRegistryLatestById(
          Object.fromEntries(
            result.agents.map((entry) => [hostScopedKey(host.key, entry.id), entry.version]),
          ),
        );
      })
      .catch((error) => {
        console.warn(
          "[useProviderUpdates] listAcpRegistry failed:",
          error instanceof Error ? error.message : error,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [hasRegistryKinds, host]);

  function installedStatusesFor(kind: string): AgentStatus[] {
    return [...pools.windows, ...pools.wsl].filter(
      (status) =>
        status.kind === kind && status.installed && machineIdForStatus(status) === machineEnvId,
    );
  }

  function newestVersionOf(statuses: readonly AgentStatus[]): string | undefined {
    return statuses.reduce<string | undefined>(
      (newest, status) => newerOf(newest, status.version),
      undefined,
    );
  }

  /**
   * Environments of a binary-channel provider that are behind. A peer
   * environment counts as a target too: with no upstream version available, a
   * WSL install lagging the Windows one is still a known-good upgrade.
   */
  function outdatedStatusesFor(kind: string): AgentStatus[] {
    const statuses = installedStatusesFor(kind);
    const target = newerOf(latestByKind[hostScopedKey(host.key, kind)], newestVersionOf(statuses));
    if (!target) return [];
    return statuses.filter(
      (status) => status.version !== undefined && isNewerVersion(target, status.version),
    );
  }

  /**
   * Per-environment breakdown, native first — empty unless the environments
   * disagree, so a provider that is consistent everywhere renders as one
   * version instead of repeating it per environment.
   */
  function environmentsOf(statuses: readonly AgentStatus[]): ProviderEnvironmentVersion[] {
    if (new Set(statuses.map((status) => status.version)).size < 2) return [];
    const ordered = [
      ...statuses.filter((status) => status.envKind !== "wsl"),
      ...statuses.filter((status) => status.envKind === "wsl"),
    ];
    return ordered.map((status) => ({
      label: envLabelForStatus(status),
      version: status.version,
    }));
  }

  function entryFor(kind: string): ProviderUpdateEntry {
    const statuses = installedStatusesFor(kind);
    if (statuses.length === 0) return EMPTY_ENTRY;
    const pendingUpdate = queue.pendingUpdates.get(hostScopedKey(host.key, kind));
    const pendingTargetVersion = pendingUpdate?.targetVersion;
    // A provider whose surfaces ship as independently versioned runtimes has no
    // single binary to compare here — its root version is whichever runtime is
    // installed. Its update action lives on the provider page and the composer
    // dock, which compare every runtime against its own upstream.
    if (isAgentProfileKind(kind) || hasCombinedRuntimes(kind)) {
      return {
        installedVersion: newestVersionOf(statuses),
        environments: environmentsOf(statuses),
        targetVersion: undefined,
        updatePhase: undefined,
      };
    }
    const registryId = extractAcpGenericInstanceId(kind);
    if (registryId !== undefined) {
      const installedVersion = registryInstalled[registryId]?.version ?? newestVersionOf(statuses);
      const latest = registryLatestById[hostScopedKey(host.key, registryId)];
      const isOutdated =
        latest !== undefined &&
        installedVersion !== undefined &&
        isNewerVersion(latest, installedVersion);
      return {
        installedVersion,
        // A registry instance is installed once, under the app's own base dir.
        environments: [],
        targetVersion: pendingTargetVersion ?? (isOutdated ? latest : undefined),
        updatePhase: pendingUpdate?.phase,
      };
    }
    const installedVersion = newestVersionOf(statuses);
    const hasOutdatedEnv = outdatedStatusesFor(kind).length > 0;
    return {
      installedVersion,
      environments: environmentsOf(statuses),
      targetVersion:
        pendingTargetVersion ??
        (hasOutdatedEnv
          ? newerOf(latestByKind[hostScopedKey(host.key, kind)], installedVersion)
          : undefined),
      updatePhase: pendingUpdate?.phase,
    };
  }

  const outdatedKinds = kinds.filter((kind) => entryFor(kind).targetVersion !== undefined);

  async function runBinaryUpdate(
    agent: AgentStatus,
    onPhaseChange: (phase: ActiveProviderUpdatePhase) => void,
  ): Promise<void> {
    // Attempt every outdated environment even when one fails, so a flaky
    // Windows or WSL install never leaves the others silently stale; the
    // first failure is surfaced after the loop.
    let failure: Error | undefined;
    for (const status of outdatedStatusesFor(agent.kind)) {
      const scope = statusUpdateScope(status);
      try {
        onPhaseChange("updating");
        const result = await host.updateAgentBinary({
          agentKind: agent.kind,
          envKind: scope.envKind,
          ...(scope.wslDistro ? { wslDistro: scope.wslDistro } : {}),
        });
        if (!result.ok) {
          const detail = localizeCatalogMessage(result.output?.trim() ?? "");
          throw new Error(
            detail
              ? t`Unable to update ${agent.label}: ${detail.slice(0, 240)}`
              : t`Unable to update ${agent.label}.`,
          );
        }
        onPhaseChange("probing");
        await host.refreshAgentStatuses(currentWslDistros(), {
          agentKinds: [agent.kind],
          envs: [scopeEnvForStatus(status)],
        });
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(t`Unable to update ${agent.label}.`);
      }
    }
    if (failure) throw failure;
  }

  async function runUpdate(
    target: ProviderUpdateTarget,
    onPhaseChange: (phase: ActiveProviderUpdatePhase) => void,
  ): Promise<void> {
    const { agent } = target;
    const registryId = extractAcpGenericInstanceId(agent.kind);
    if (registryId === undefined) {
      await runBinaryUpdate(agent, onPhaseChange);
    } else {
      onPhaseChange("updating");
      const result = await host.updateAcpRegistryAgent({ agentId: registryId });
      host.recordRegistryInstalls(result.installed, [registryId]);
      onPhaseChange("probing");
      await host.refreshAgentStatuses(currentWslDistros(), { agentKinds: [agent.kind] });
    }
    toast.success(t`${agent.label} updated to v${target.targetVersion}.`);
  }

  function updateKind(kind: string): void {
    const agent = agents.find((candidate) => candidate.kind === kind);
    const targetVersion = entryFor(kind).targetVersion;
    if (!agent || !targetVersion || isAgentProfileKind(kind)) return;
    queue.updateKind({ agent, targetVersion, hostKey: host.key });
  }

  function updateAll(): void {
    queue.updateAll(
      agents.flatMap((agent) => {
        const targetVersion = entryFor(agent.kind).targetVersion;
        return targetVersion ? [{ agent, targetVersion, hostKey: host.key }] : [];
      }),
    );
  }

  return {
    entryFor,
    outdatedKinds,
    isUpdatingAll: queue.isUpdatingAll,
    updateAllProgress: queue.updateAllProgress,
    updateKind,
    updateAll,
  };
}
