import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { extractAcpGenericInstanceId, type AgentStatus } from "@/shared/contracts";
import { isNewerVersion } from "@/shared/agents/updateResolver";
import { readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  currentWslDistros,
  envLabelForStatus,
  scopeEnvForStatus,
  statusUpdateScope,
} from "@/renderer/utils/acpRegistryAuth";

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
  /** An update is running for this provider (all of its environments). */
  isPending: boolean;
}

export interface ProviderUpdatesModel {
  entryFor: (kind: string) => ProviderUpdateEntry;
  /** Kinds with an available update, in the order they were passed in. */
  outdatedKinds: readonly string[];
  isUpdatingAll: boolean;
  updateKind: (kind: string) => void;
  updateAll: () => void;
}

const EMPTY_ENTRY: ProviderUpdateEntry = {
  installedVersion: undefined,
  environments: [],
  targetVersion: undefined,
  isPending: false,
};

function newerOf(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return isNewerVersion(right, left) ? right : left;
}

function splitKinds(kindsKey: string): string[] {
  return kindsKey ? kindsKey.split("\0") : [];
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
export function useProviderUpdates(agents: readonly AgentStatus[]): ProviderUpdatesModel {
  const { t } = useLingui();
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const registryInstalled = useSharedSettings((s) => s.acpRegistryInstalledAgents);
  const syncInstalledAgents = useSharedSettings((s) => s.syncAcpRegistryInstalledAgents);
  const [latestByKind, setLatestByKind] = useState<Readonly<Record<string, string>>>({});
  const [registryLatestById, setRegistryLatestById] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const [pendingKinds, setPendingKinds] = useState<ReadonlySet<string>>(() => new Set());
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);

  const kindsKey = agents.map((agent) => agent.kind).join("\0");
  const kinds = splitKinds(kindsKey);
  const hasRegistryKinds = kinds.some((kind) => extractAcpGenericInstanceId(kind) !== undefined);

  // One upstream probe per binary-channel kind. The supervisor caches latest
  // versions for 30 minutes, so reopening the page does not re-hit registries.
  useEffect(() => {
    const probeKinds = splitKinds(kindsKey).filter(
      (kind) => extractAcpGenericInstanceId(kind) === undefined,
    );
    if (probeKinds.length === 0) return;
    let cancelled = false;
    for (const kind of probeKinds) {
      readBridge()
        .getLatestAgentVersion({ agentKind: kind })
        .then((result) => {
          const version = result.version;
          if (cancelled || !version) return;
          setLatestByKind((current) =>
            current[kind] === version ? current : { ...current, [kind]: version },
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
  }, [kindsKey]);

  useEffect(() => {
    if (!hasRegistryKinds) return;
    let cancelled = false;
    readBridge()
      .listAcpRegistry()
      .then((result) => {
        if (cancelled) return;
        setRegistryLatestById(
          Object.fromEntries(result.agents.map((entry) => [entry.id, entry.version])),
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
  }, [hasRegistryKinds]);

  function installedStatusesFor(kind: string): AgentStatus[] {
    return [...agentStatuses, ...wslAgentStatuses].filter(
      (status) => status.kind === kind && status.installed,
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
    const target = newerOf(latestByKind[kind], newestVersionOf(statuses));
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
    const isPending = pendingKinds.has(kind);
    const registryId = extractAcpGenericInstanceId(kind);
    if (registryId !== undefined) {
      const installedVersion = registryInstalled[registryId]?.version ?? newestVersionOf(statuses);
      const latest = registryLatestById[registryId];
      const isOutdated =
        latest !== undefined &&
        installedVersion !== undefined &&
        isNewerVersion(latest, installedVersion);
      return {
        installedVersion,
        // A registry instance is installed once, under the app's own base dir.
        environments: [],
        targetVersion: isOutdated ? latest : undefined,
        isPending,
      };
    }
    const installedVersion = newestVersionOf(statuses);
    const hasOutdatedEnv = outdatedStatusesFor(kind).length > 0;
    return {
      installedVersion,
      environments: environmentsOf(statuses),
      targetVersion: hasOutdatedEnv ? newerOf(latestByKind[kind], installedVersion) : undefined,
      isPending,
    };
  }

  const outdatedKinds = kinds.filter((kind) => entryFor(kind).targetVersion !== undefined);

  async function runBinaryUpdate(agent: AgentStatus): Promise<void> {
    // Attempt every outdated environment even when one fails, so a flaky
    // Windows or WSL install never leaves the others silently stale; the
    // first failure is surfaced after the loop.
    let failure: Error | undefined;
    for (const status of outdatedStatusesFor(agent.kind)) {
      const scope = statusUpdateScope(status);
      try {
        const result = await readBridge().updateAgentBinary({
          agentKind: agent.kind,
          envKind: scope.envKind,
          ...(scope.wslDistro ? { wslDistro: scope.wslDistro } : {}),
        });
        if (!result.ok) {
          const detail = result.output?.trim();
          throw new Error(
            detail
              ? t`Unable to update ${agent.label}: ${detail.slice(0, 240)}`
              : t`Unable to update ${agent.label}.`,
          );
        }
        await readBridge().refreshAgentStatuses(currentWslDistros(), {
          agentKinds: [agent.kind],
          envs: [scopeEnvForStatus(status)],
        });
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(t`Unable to update ${agent.label}.`);
      }
    }
    if (failure) throw failure;
  }

  async function runUpdate(agent: AgentStatus): Promise<void> {
    const entry = entryFor(agent.kind);
    if (!entry.targetVersion) return;
    const registryId = extractAcpGenericInstanceId(agent.kind);
    try {
      if (registryId === undefined) {
        await runBinaryUpdate(agent);
      } else {
        const result = await readBridge().updateAcpRegistryAgent({ agentId: registryId });
        syncInstalledAgents(result.installed);
        await readBridge().refreshAgentStatuses(currentWslDistros(), { agentKinds: [agent.kind] });
      }
      toast.success(t`${agent.label} updated to v${entry.targetVersion}.`);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t`Unable to update ${agent.label}.`);
    }
  }

  function withPending(pending: readonly string[], run: () => Promise<void>): void {
    setPendingKinds((current) => {
      const next = new Set(current);
      for (const kind of pending) next.add(kind);
      return next;
    });
    void run().finally(() => {
      setPendingKinds((current) => {
        const next = new Set(current);
        for (const kind of pending) next.delete(kind);
        return next;
      });
    });
  }

  function updateKind(kind: string): void {
    const agent = agents.find((candidate) => candidate.kind === kind);
    if (!agent || pendingKinds.has(kind)) return;
    withPending([kind], () => runUpdate(agent));
  }

  function updateAll(): void {
    const targets = agents.filter(
      (agent) => outdatedKinds.includes(agent.kind) && !pendingKinds.has(agent.kind),
    );
    if (targets.length === 0) return;
    setIsUpdatingAll(true);
    withPending(
      targets.map((agent) => agent.kind),
      async () => {
        try {
          // Sequential: concurrent installs contend for the same package
          // manager prefix (and the same WSL distro) and fail unpredictably.
          for (const agent of targets) await runUpdate(agent);
        } finally {
          setIsUpdatingAll(false);
        }
      },
    );
  }

  return { entryFor, outdatedKinds, isUpdatingAll, updateKind, updateAll };
}
