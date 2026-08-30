import { useEffect, useRef, useState } from "react";
import { Button, Input, Tooltip, Card, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  GitFork,
  Link,
  LogIn,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  acpGenericKind,
  type AcpRegistryAgent,
  type AcpRegistryInstallTarget,
  type AgentStatus,
  type AgentStatusesResponse,
  type Project,
  type RefreshAgentScope,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { msg } from "@lingui/core/macro";
import { isWindows, readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { runAgentInstallCommand, runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  agentAuthTarget,
  findAgentAuthMethodForStatus,
  findStatusForTarget,
  findTerminalAuthMethodForStatus,
  scopeEnvForStatus,
  shouldPreferTerminalLogin,
} from "@/renderer/utils/acpRegistryAuth";
import { PixelLoader } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { CombinedRuntimeVersionList } from "@/renderer/components/providers/CombinedRuntimeVersionList";
import {
  loadAcpRegistryListing,
  resetAcpRegistryListingCache,
  useCombinedProviderRuntimeUpdates,
} from "@/renderer/components/providers/useCombinedProviderRuntimeUpdates";
import { getProviderManifest } from "@/renderer/components/providers/providerManifest";
import {
  APP_SUPPORTED_ACP_AGENT_IDS,
  KNOWN_NATIVE_FAMILY_ACP_AGENT_IDS,
  NATIVE_AGENT_REGISTRY_ENTRIES,
  REGISTRY_AGENT_FAMILY_KIND,
  type NativeAgentRegistryEntry,
} from "./agentRegistryNative";
import {
  availableRuntimeInstallOptions,
  detectAgentRuntime,
  installedRuntimeIds,
  runtimeSummaryText,
  type NativeAgentRuntimeSlot,
} from "./nativeAgentRuntimes";
import { NativeAgentActionControl } from "./NativeAgentActionControl";

/**
 * Pure version label for a native agent card. Shows the installed version when
 * the agent is detected locally; otherwise the latest version published on npm
 * (fetched lazily in the background by the parent — see `nativeLatestVersions`).
 * Renders nothing when neither exists (e.g. installer-only agents with no npm
 * package, like Antigravity).
 */
function NativeAgentVersionLabel(props: {
  installedVersion: string | undefined;
  latestNpmVersion: string | undefined;
}) {
  if (props.installedVersion) return <span>v{props.installedVersion}</span>;
  if (props.latestNpmVersion) {
    return (
      <span>
        v{props.latestNpmVersion}{" "}
        <span className="text-muted/60">
          <Trans>available</Trans>
        </span>
      </span>
    );
  }
  return null;
}

function registrySearchText(agent: AcpRegistryAgent): string {
  return [
    agent.id,
    agent.name,
    agent.description,
    agent.repository,
    agent.website,
    ...(agent.authors ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function distributionLabel(agent: AcpRegistryAgent): string {
  if (agent.distribution.npx) return `npx ${agent.distribution.npx.package}`;
  if (agent.distribution.uvx) return `uvx ${agent.distribution.uvx.package}`;
  if (agent.distribution.binary) return i18n._(msg`Binary`);
  return i18n._(msg`Custom`);
}

interface InstallTarget {
  id: string;
  label: string;
  project?: Project;
  registryTarget: AcpRegistryInstallTarget;
}

interface NativeInstallAction extends InstallTarget {
  command?: string | ((project: Project) => string);
  registryAgentId?: string;
  verifyRuntimeId?: string;
}

interface CombinedRuntimeUpdateAction {
  id: string;
  label: string;
  status: AgentStatus;
}

interface NativeRuntimeUpdateAction extends NativeInstallAction {
  status: AgentStatus;
  slot: NativeAgentRuntimeSlot;
  expectedRegistryVersion?: string;
}

function findStatusInResponse(
  response: AgentStatusesResponse | undefined,
  ...kinds: Array<string | undefined>
): AgentStatus | undefined {
  if (!response) return undefined;
  const kindSet = new Set(kinds.filter((kind): kind is string => typeof kind === "string"));
  return [...response.windows, ...response.wsl].find((status) => kindSet.has(status.kind));
}

function AgentIcon(props: {
  agent: AcpRegistryAgent;
  installedKind?: string;
  isInstalled?: boolean;
}) {
  return (
    <ProviderIcon
      kind={props.installedKind ?? `acp-registry:${props.agent.id}`}
      icon={props.agent.icon}
      fallbackLabel={props.agent.name}
      className={`size-8 shrink-0 rounded-lg ${props.isInstalled ? "!text-foreground !opacity-100" : ""}`}
    />
  );
}

export function AcpRegistrySettings(props: { onOpenAgentSettings?: (kind: string) => void }) {
  const { t } = useLingui();
  const [agents, setAgents] = useState<AcpRegistryAgent[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [pendingAgentId, setPendingAgentId] = useState<string | undefined>();
  const [pendingAuthAgentId, setPendingAuthAgentId] = useState<string | undefined>();
  const [nativeLatestVersions, setNativeLatestVersions] = useState<Record<string, string>>({});
  // Native kinds we've already probed for a latest version, so the fetch effect
  // never re-requests the same kind across re-renders. A failed probe is removed
  // again so a later pass can retry.
  const requestedLatestVersionsRef = useRef<Set<string>>(new Set());

  const settingsInstalled = useSharedSettings((s) => s.acpRegistryInstalledAgents);
  const syncInstalledAgents = useSharedSettings((s) => s.syncAcpRegistryInstalledAgents);
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const combinedRuntimeUpdates = useCombinedProviderRuntimeUpdates(
    [...agentStatuses, ...wslAgentStatuses],
    Object.fromEntries(agents.map((agent) => [agent.id, agent.version])),
  );
  const projects = useAppStore((state) => state.projects);
  const wslProjectDistrosKey = useAppStore((state) => buildWslProjectDistrosKey(state.projects));
  const wslDistros = wslProjectDistrosKey ? wslProjectDistrosKey.split("\0") : [];
  const isWindowsPlatform = isWindows();

  const requestStatusRefresh = (options?: { reset?: boolean; scope?: RefreshAgentScope }) => {
    if (options?.reset !== false) {
      useAgentStatusesStore.getState().resetDiscoveredAgents();
    }
    return readBridge().refreshAgentStatuses(wslDistros, options?.scope);
  };

  const refreshStatuses = (options?: { reset?: boolean; scope?: RefreshAgentScope }) => {
    return requestStatusRefresh(options).catch(() => undefined);
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(undefined);
    // Through the shared listing loader: a direct call would race the
    // combined-runtime probe's own listing and run two supervisor
    // auto-update sweeps against the same install dirs.
    loadAcpRegistryListing()
      .then((result) => {
        if (cancelled) return;
        setAgents(result.agents);
        void readBridge()
          .getAgentStatuses(wslProjectDistrosKey ? wslProjectDistrosKey.split("\0") : [])
          .catch(() => undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wslProjectDistrosKey]);

  const installedById = new Map(Object.entries(settingsInstalled));
  const detectedInstalledByKind = new Map<string, AgentStatus[]>();
  for (const status of [...agentStatuses, ...wslAgentStatuses]) {
    if (!status.installed) continue;
    const existing = detectedInstalledByKind.get(status.kind);
    if (existing) {
      existing.push(status);
    } else {
      detectedInstalledByKind.set(status.kind, [status]);
    }
  }

  // Native agents not detected locally. Only these cards fall back to the npm
  // "latest" label (installed agents show their detected version), so they are
  // the only kinds worth a registry version probe.
  const statusesLoaded = agentStatuses.length > 0 || wslAgentStatuses.length > 0;
  // Joined into a stable primitive so it can key the effect below without a
  // useMemo (React Compiler) and without re-running every render on a fresh
  // array identity.
  const notInstalledNativeKey = NATIVE_AGENT_REGISTRY_ENTRIES.map((entry) => entry.id)
    .filter((id) => !detectedInstalledByKind.has(id))
    .join(",");

  // Probe npm for the latest version of each not-installed native agent so its
  // card can show the version an Install would fetch. Held until the registry
  // list and agent statuses have loaded (so the not-installed set is accurate
  // and the probes don't compete with the initial load), then fired
  // concurrently — the small not-installed set resolves without one slow probe
  // blocking the rest. Results are cached supervisor-side.
  useEffect(() => {
    if (isLoading || !statusesLoaded) return;
    let cancelled = false;
    const requested = requestedLatestVersionsRef.current;
    for (const id of notInstalledNativeKey ? notInstalledNativeKey.split(",") : []) {
      if (requested.has(id)) continue;
      requested.add(id);
      readBridge()
        .getLatestAgentVersion({ agentKind: id })
        .then((result) => {
          if (cancelled || !result.version) return;
          const version = result.version;
          setNativeLatestVersions((prev) => ({ ...prev, [id]: version }));
        })
        .catch((fetchError) => {
          requested.delete(id);
          console.warn(
            `[AcpRegistrySettings] getLatestAgentVersion(${id}) failed:`,
            fetchError instanceof Error ? fetchError.message : fetchError,
          );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isLoading, statusesLoaded, notInstalledNativeKey]);

  const normalizedQuery = query.trim().toLowerCase();
  const wslProjectsByDistro = new Map<string, Project>();
  let firstWindowsProject: Project | undefined;
  for (const project of projects) {
    if (project.location.kind === "windows" && !firstWindowsProject) {
      firstWindowsProject = project;
      continue;
    }
    if (project.location.kind === "wsl" && !wslProjectsByDistro.has(project.location.distro)) {
      wslProjectsByDistro.set(project.location.distro, project);
    }
  }
  const visibleNativeAgents = NATIVE_AGENT_REGISTRY_ENTRIES.filter((agent) => {
    if (!normalizedQuery) return true;
    const manifestLabel = getProviderManifest(agent.id)?.label;
    return [agent.id, manifestLabel ? t(manifestLabel) : agent.id, t(agent.description)]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const installedAgents: AcpRegistryAgent[] = [];
  const availableAgents: AcpRegistryAgent[] = [];

  for (const agent of agents) {
    if (normalizedQuery && !registrySearchText(agent).includes(normalizedQuery)) continue;
    const installedRecord = installedById.get(agent.id);
    const registryInstalled = installedRecord !== undefined;
    // A registry artifact a built-in provider adopted as one of its runtimes is
    // owned by that provider card. Generic installs of the same id predate the
    // adoption and must stay listed so they remain updatable and removable.
    if (
      APP_SUPPORTED_ACP_AGENT_IDS.has(agent.id) &&
      (!registryInstalled || installedRecord?.installKind === "first-class")
    ) {
      continue;
    }
    const familyKind = REGISTRY_AGENT_FAMILY_KIND[agent.id];
    const localInstalled = familyKind ? hasDetectedInstalledKind(familyKind) : false;
    if (KNOWN_NATIVE_FAMILY_ACP_AGENT_IDS.has(agent.id) && !registryInstalled) {
      continue;
    }
    if (registryInstalled || localInstalled) {
      installedAgents.push(agent);
    } else {
      availableAgents.push(agent);
    }
  }

  const installAgent = (agent: AcpRegistryAgent) => {
    const agentId = agent.id;
    setPendingAgentId(agentId);
    setError(undefined);
    readBridge()
      .installAcpRegistryAgent({ agentId })
      .then(async (result) => {
        const adapterKind = acpGenericKind(agentId);
        const response = await refreshStatuses({
          reset: false,
          scope: { agentKinds: [adapterKind] },
        });
        syncInstalledAgents(result.installed);
        const status = findStatusInResponse(
          response,
          adapterKind,
          REGISTRY_AGENT_FAMILY_KIND[agentId],
        );
        if (status?.authState === "missing") {
          toast.warning(t`${agent.name} needs authentication.`, {
            actionProps: {
              children: t`Open settings`,
              onPress: () => props.onOpenAgentSettings?.(adapterKind),
            },
          });
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setPendingAgentId(undefined));
  };

  const removeAgent = (agentId: string) => {
    setPendingAgentId(agentId);
    setError(undefined);
    readBridge()
      .removeAcpRegistryAgent({ agentId })
      .then((result) => {
        syncInstalledAgents(result.installed);
        void refreshStatuses();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setPendingAgentId(undefined));
  };

  const updateAgent = (agent: AcpRegistryAgent) => {
    const agentId = agent.id;
    setPendingAgentId(agentId);
    setError(undefined);
    readBridge()
      .updateAcpRegistryAgent({ agentId })
      .then(async (result) => {
        const adapterKind = acpGenericKind(agentId);
        await refreshStatuses({ reset: false, scope: { agentKinds: [adapterKind] } });
        syncInstalledAgents(result.installed);
        toast.success(t`${agent.name} updated to v${agent.version}.`);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setPendingAgentId(undefined));
  };

  const authenticateAgent = (
    agentId: string,
    methodId: string,
    status: AgentStatus,
    agentKind = acpGenericKind(agentId),
  ) => {
    setPendingAuthAgentId(agentId);
    setError(undefined);
    readBridge()
      .authenticateAcpAgent({
        agentKind,
        methodId,
        ...agentAuthTarget(status),
      })
      .then(() => readBridge().focusWindow())
      .then(() =>
        refreshStatuses({
          reset: false,
          scope: {
            agentKinds: [agentKind],
            envs: [scopeEnvForStatus(status)],
          },
        }),
      )
      .catch((err: unknown) => {
        setError(err instanceof Error ? friendlyError(err) : String(err));
      })
      .finally(() => setPendingAuthAgentId(undefined));
  };

  // Terminal-based login (CLI `login` command run in the overlay). Unlike the
  // ACP method auth above, the CLI exit doesn't update detection on its own, so
  // we re-probe the scoped agent on success — matching the Agent Settings login
  // flow — and keep the button pending through the probe.
  const runTerminalLogin = (input: {
    agentKind: string;
    agentId: string;
    status: AgentStatus;
    loginCommand: string;
    env?: Record<string, string>;
    project?: Project;
  }) => {
    setError(undefined);
    setPendingAuthAgentId(input.agentId);
    const clearPending = () =>
      setPendingAuthAgentId((current) => (current === input.agentId ? undefined : current));
    const opened = runAgentLoginCommand({
      label: input.status.label ?? input.agentId,
      command: input.loginCommand,
      ...(input.env ? { env: input.env } : {}),
      ...(input.project ? { project: input.project } : {}),
      onCommandComplete: (exitCode) => {
        if (exitCode !== 0) {
          clearPending();
          return;
        }
        void refreshStatuses({
          reset: false,
          scope: { agentKinds: [input.agentKind], envs: [scopeEnvForStatus(input.status)] },
        }).finally(clearPending);
      },
    });
    if (!opened) clearPending();
  };

  const renderTag = (label: string, key?: string) => (
    <span
      key={key}
      className="rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted"
    >
      {label}
    </span>
  );

  function hasDetectedInstalledKind(kind: string): boolean {
    return (detectedInstalledByKind.get(kind)?.length ?? 0) > 0;
  }

  function findDetectedStatuses(...kinds: Array<string | undefined>): AgentStatus[] {
    return kinds.flatMap((kind) => (kind ? (detectedInstalledByKind.get(kind) ?? []) : []));
  }

  function findDetectedStatus(...kinds: Array<string | undefined>): AgentStatus | undefined {
    const statuses = findDetectedStatuses(...kinds);
    return (
      statuses.find((status) => status.authState === "missing" && status.loginCommand) ??
      statuses.find((status) => status.authState === "missing") ??
      statuses.find((status) => status.envKind !== "wsl") ??
      statuses[0]
    );
  }

  function projectForStatus(status: AgentStatus | undefined): Project | undefined {
    if (!status) return undefined;
    if (status.envKind === "wsl" && status.envDistro) {
      return wslProjectsByDistro.get(status.envDistro);
    }
    if (status.envKind === "windows") return firstWindowsProject;
    return undefined;
  }

  function detectionScopeLabel(status: AgentStatus): string {
    if (status.envKind === "wsl") {
      return status.envDistro ? t`WSL (${status.envDistro})` : t`WSL`;
    }
    if (status.envKind === "windows") return t`Windows`;
    return t`local`;
  }

  const renderNativeAgentCard = (agent: NativeAgentRegistryEntry) => {
    const manifestLabel = getProviderManifest(agent.id)?.label;
    const agentLabel = manifestLabel ? t(manifestLabel) : agent.id;
    const nativeStatus = agentStatuses.find(
      (status) => status.kind === agent.id && status.installed,
    );
    const installedWslStatuses = wslAgentStatuses.filter(
      (status) => status.kind === agent.id && status.installed,
    );
    const installedWslDistros = new Set(
      installedWslStatuses.flatMap((status) => (status.envDistro ? [status.envDistro] : [])),
    );
    const isInstalled = nativeStatus !== undefined || installedWslStatuses.length > 0;
    const authStatuses = [nativeStatus, ...installedWslStatuses].filter(
      (status): status is AgentStatus => status !== undefined,
    );
    const runtimeSlots = agent.runtimeSlots;
    const installedRuntimes = runtimeSlots
      ? installedRuntimeIds(runtimeSlots, authStatuses)
      : undefined;
    const missingAuthStatus = authStatuses.find((status) => status.authState === "missing");
    const agentAuthMethod =
      missingAuthStatus && !shouldPreferTerminalLogin(missingAuthStatus)
        ? findAgentAuthMethodForStatus(missingAuthStatus)
        : undefined;
    const loginCommand = missingAuthStatus?.loginCommand;
    const terminalAuthMethod = findTerminalAuthMethodForStatus(missingAuthStatus);
    const loginProject = projectForStatus(missingAuthStatus);
    const runLogin =
      agentAuthMethod && missingAuthStatus
        ? () => authenticateAgent(agent.id, agentAuthMethod.id, missingAuthStatus, agent.id)
        : loginCommand && missingAuthStatus
          ? () =>
              runTerminalLogin({
                agentKind: agent.id,
                agentId: agent.id,
                status: missingAuthStatus,
                loginCommand,
                ...(terminalAuthMethod?.env ? { env: terminalAuthMethod.env } : {}),
                ...(loginProject ? { project: loginProject } : {}),
              })
          : undefined;
    const installTargets: InstallTarget[] = [];
    const shouldOfferWslTargets = isWindowsPlatform && wslProjectsByDistro.size > 0;
    // Runtime-slot providers keep every target on offer even where they are
    // already detected, because individual runtimes may still be missing there.
    const offersPerRuntimeInstalls = runtimeSlots !== undefined;
    if (shouldOfferWslTargets) {
      if ((offersPerRuntimeInstalls || !nativeStatus) && firstWindowsProject) {
        installTargets.push({
          id: "windows",
          label: t`Windows`,
          project: firstWindowsProject,
          registryTarget: { kind: "native" },
        });
      }
      for (const [distro, project] of wslProjectsByDistro) {
        if (!offersPerRuntimeInstalls && installedWslDistros.has(distro)) continue;
        installTargets.push({
          id: `wsl:${distro}`,
          label: t`WSL: ${distro}`,
          project,
          registryTarget: { kind: "wsl", distro },
        });
      }
    } else if (offersPerRuntimeInstalls || !nativeStatus) {
      installTargets.push({
        id: "default",
        label: t`local`,
        registryTarget: { kind: "native" },
      });
    }

    const installActions: NativeInstallAction[] = runtimeSlots
      ? installTargets.flatMap((target) => {
          const targetStatus =
            target.id === "windows" || target.id === "default"
              ? nativeStatus
              : installedWslStatuses.find(
                  (status) => `wsl:${status.envDistro ?? ""}` === target.id,
                );
          const environment = installTargets.length > 1 ? target.label : undefined;
          return availableRuntimeInstallOptions(runtimeSlots, targetStatus).map((option) => {
            return {
              ...target,
              id: `${target.id}:${option.id}`,
              label: t(option.installLabel(environment)),
              ...(option.installCommand ? { command: option.installCommand } : {}),
              ...(option.installCommand && runtimeSlots.unifiedAgent
                ? { verifyRuntimeId: option.commandRuntimeId ?? option.id }
                : {}),
              ...(option.registryAgentId ? { registryAgentId: option.registryAgentId } : {}),
            };
          });
        })
      : installTargets.map((target) => ({
          ...target,
          command: agent.installCommand,
          label:
            target.id === "windows"
              ? t`Install on Windows`
              : target.id.startsWith("wsl:")
                ? t`Install in ${target.label}`
                : t`Install`,
        }));
    // One update control per updatable runtime, so each keeps its own labels.
    const runtimeUpdateGroups = (runtimeSlots?.runtimes ?? []).flatMap((slot) => {
      const update = slot.update;
      if (!update) return [];
      const registryAgent = update.registryAgentId
        ? agents.find((candidate) => candidate.id === update.registryAgentId)
        : undefined;
      const actions: NativeRuntimeUpdateAction[] = authStatuses.flatMap((status) => {
        if (
          runtimeSlots?.unifiedAgent &&
          runtimeSlots.runtimes.some((runtime) => !detectAgentRuntime(runtime, status).installed)
        ) {
          return [];
        }
        if (!update.canUpdate(status, registryAgent)) return [];
        const project = projectForStatus(status);
        const environment = detectionScopeLabel(status);
        return [
          {
            id: `${slot.id}-update:${status.envKind ?? "native"}:${status.envDistro ?? ""}`,
            label: t(update.actionLabel(authStatuses.length > 1 ? environment : undefined)),
            status,
            slot,
            ...(project ? { project } : {}),
            registryTarget:
              status.envKind === "wsl" && status.envDistro
                ? { kind: "wsl", distro: status.envDistro }
                : { kind: "native" },
            ...(update.command
              ? {
                  command: (targetProject: Project) =>
                    update.command?.(status, targetProject) ?? "",
                }
              : {}),
            ...(update.registryAgentId ? { registryAgentId: update.registryAgentId } : {}),
            ...(registryAgent ? { expectedRegistryVersion: registryAgent.version } : {}),
          },
        ];
      });
      return actions.length > 0 ? [{ slot, update, actions }] : [];
    });
    const combinedEntries = authStatuses.map((status) => ({
      status,
      entry: combinedRuntimeUpdates.entryFor(status),
    }));
    const combinedUpdateActions: CombinedRuntimeUpdateAction[] = combinedEntries.flatMap(
      ({ status, entry }) =>
        entry.updateAvailable &&
        (!runtimeSlots || availableRuntimeInstallOptions(runtimeSlots, status).length === 0)
          ? [
              {
                id: `combined-update:${status.envKind ?? "native"}:${status.envDistro ?? ""}`,
                label: detectionScopeLabel(status),
                status,
              },
            ]
          : [],
    );
    const combinedUpdatePending = combinedEntries.some(({ entry }) => entry.pending);

    const runInstallTarget = (target: NativeInstallAction | undefined) => {
      if (!target) return;
      setError(undefined);
      setPendingAgentId(agent.id);
      const clearPending = () =>
        setPendingAgentId((current) => (current === agent.id ? undefined : current));
      const finishInstall = () => {
        void (async () => {
          let installError: Error | undefined;
          let response: AgentStatusesResponse | undefined;
          let statusBeforeRegistry: AgentStatus | undefined;
          const registryTarget = target.registryTarget;
          if (target.verifyRuntimeId) {
            const detected = await requestStatusRefresh({
              reset: false,
              scope: { agentKinds: [agent.id] },
            });
            const status = findStatusForTarget(detected, agent.id, registryTarget);
            if (!status?.runtimeVariants?.[target.verifyRuntimeId]?.installed) {
              throw new Error(t`Unable to refresh ${agentLabel} status.`);
            }
            statusBeforeRegistry = status;
          }
          try {
            const registrySlot = runtimeSlots?.runtimes.find(
              (slot) => slot.registryAgentId === target.registryAgentId,
            );
            const registryAgentId = target.registryAgentId;
            if (registryAgentId) {
              const payload = {
                agentId: registryAgentId,
                target: registryTarget,
              };
              const registryInstalled = registrySlot
                ? detectAgentRuntime(registrySlot, statusBeforeRegistry).installed
                : false;
              const result = registryInstalled
                ? await readBridge().updateAcpRegistryAgent(payload)
                : await readBridge().installAcpRegistryAgent(payload);
              syncInstalledAgents(result.installed);
            }
          } catch (installFailure) {
            installError =
              installFailure instanceof Error ? installFailure : new Error(String(installFailure));
          }
          try {
            response = await requestStatusRefresh({
              reset: false,
              scope: { agentKinds: [agent.id] },
            });
          } catch (refreshFailure) {
            if (installError === undefined) throw refreshFailure;
          }
          if (installError !== undefined) throw installError;
          const refreshed = response
            ? findStatusForTarget(response, agent.id, registryTarget)
            : undefined;
          // One unified action reconciles the whole agent: with the missing
          // runtime installed, the combined updater brings any stale runtime
          // current (toast stays silent — this is an install action).
          if (refreshed && combinedRuntimeUpdates.entryFor(refreshed).supported) {
            await combinedRuntimeUpdates.updateStatus(refreshed, { toast: false });
          } else if (runtimeSlots?.unifiedAgent && !refreshed) {
            throw new Error(t`Unable to refresh ${agentLabel} status.`);
          }
        })()
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          .finally(clearPending);
      };
      if (!target.command) {
        finishInstall();
        return;
      }
      const opened = runAgentInstallCommand({
        label: agentLabel,
        command: target.command,
        ...(target.project ? { project: target.project } : {}),
        // Re-detect once the installer exits so the card flips to "Detected"
        // without the user manually refreshing, mirroring the ACP install flow.
        // Keep the loader on through the probe so it doesn't flicker back to
        // "Install" before detection confirms the binary.
        onCommandComplete: (exitCode) => {
          if (exitCode === 0) {
            finishInstall();
          } else {
            clearPending();
          }
        },
      });
      if (!opened) setPendingAgentId(undefined);
    };

    const isNativePending = pendingAgentId === agent.id;

    const runRuntimeUpdate = (action: NativeRuntimeUpdateAction | undefined) => {
      if (!action) return;
      const update = action.slot.update;
      if (!update) return;
      const previousVersion = detectAgentRuntime(action.slot, action.status).version;
      setError(undefined);
      setPendingAgentId(agent.id);
      const clearPending = () =>
        setPendingAgentId((current) => (current === agent.id ? undefined : current));
      const finishUpdate = () => {
        void (async () => {
          let updateError: Error | undefined;
          try {
            if (action.registryAgentId) {
              const result = await readBridge().updateAcpRegistryAgent({
                agentId: action.registryAgentId,
                target: action.registryTarget,
              });
              syncInstalledAgents(result.installed);
            }
          } catch (updateFailure) {
            updateError =
              updateFailure instanceof Error ? updateFailure : new Error(String(updateFailure));
          }
          let response: AgentStatusesResponse | undefined;
          try {
            response = await requestStatusRefresh({
              reset: false,
              scope: {
                agentKinds: [agent.id],
                envs: [scopeEnvForStatus(action.status)],
              },
            });
          } catch (refreshFailure) {
            if (updateError === undefined) throw refreshFailure;
          }
          if (updateError !== undefined) throw updateError;
          const refreshed = response
            ? findStatusForTarget(response, agent.id, action.registryTarget)
            : undefined;
          const refreshedRuntime = detectAgentRuntime(action.slot, refreshed);
          const nextVersion = refreshedRuntime.version;
          if (
            action.expectedRegistryVersion &&
            (!refreshedRuntime.installed || nextVersion !== action.expectedRegistryVersion)
          ) {
            throw new Error(t`Unable to refresh ${agentLabel} status.`);
          }
          if (nextVersion && nextVersion !== previousVersion) {
            toast.success(t(update.updatedToast(nextVersion)));
          } else {
            toast.success(t(update.upToDateToast));
          }
        })()
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          .finally(clearPending);
      };
      if (!action.command) {
        finishUpdate();
        return;
      }
      const opened = runAgentInstallCommand({
        label: t(update.actionLabel(undefined)),
        command: action.command,
        purpose: "update",
        ...(action.project ? { project: action.project } : {}),
        onCommandComplete: (exitCode) => {
          if (exitCode !== 0) {
            clearPending();
            return;
          }
          finishUpdate();
        },
      });
      if (!opened) clearPending();
    };

    return (
      <Card
        key={`native-${agent.id}`}
        className="w-full rounded-lg bg-surface-secondary shadow-none border border-border p-4"
      >
        <div className="flex items-start gap-4">
          <ProviderIcon
            kind={agent.id}
            fallbackLabel={agentLabel}
            className={`size-8 shrink-0 rounded-lg ${isInstalled ? "!text-foreground !opacity-100" : ""}`}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <Card.Header className="flex min-w-0 flex-1 flex-col items-start gap-1 p-0">
                <div className="flex items-center gap-2">
                  <Card.Title className="truncate text-base font-semibold">{agentLabel}</Card.Title>
                  {renderTag(t`Native`)}
                  {!runtimeSlots?.unifiedAgent &&
                    runtimeSlots?.runtimes.map((slot) =>
                      renderTag(
                        t(
                          installedRuntimes?.has(slot.id)
                            ? slot.installedTag
                            : slot.notInstalledTag,
                        ),
                        `${agent.id}-runtime-tag-${slot.id}`,
                      ),
                    )}
                </div>
                <Card.Description className="line-clamp-2 text-sm text-foreground/85">
                  {t(agent.description)}
                </Card.Description>
              </Card.Header>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {isInstalled ? (
                  <div className="flex flex-col items-end gap-1">
                    {nativeStatus ? (
                      <span className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted">
                        <CheckCircle2 className="size-3.5 text-success" />
                        <Trans>
                          Detected <span className="text-muted/70">(local)</span>
                        </Trans>
                      </span>
                    ) : null}
                    {installedWslStatuses.map((status) => (
                      <span
                        key={`${agent.id}-${status.envDistro ?? "wsl"}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted"
                      >
                        <CheckCircle2 className="size-3.5 text-success" />
                        <Trans>
                          Detected{" "}
                          <span className="text-muted/70">
                            {status.envDistro ? `WSL (${status.envDistro})` : "WSL"}
                          </span>
                        </Trans>
                      </span>
                    ))}
                  </div>
                ) : null}
                <NativeAgentActionControl
                  actions={installActions}
                  icon={Download}
                  label={t`Install`}
                  soloLabel={installActions[0]?.label ?? t`Install`}
                  pendingLabel={t`Installing`}
                  menuLabel={t`${agentLabel} install targets`}
                  isPending={isNativePending}
                  onRun={runInstallTarget}
                />
                {runtimeUpdateGroups.map((group) => (
                  <NativeAgentActionControl
                    key={`${agent.id}-runtime-update-${group.slot.id}`}
                    actions={group.actions}
                    icon={ArrowUpCircle}
                    label={t(group.update.buttonLabel)}
                    soloLabel={t(group.update.buttonLabel)}
                    pendingLabel={t`Updating`}
                    menuLabel={t(group.update.menuLabel)}
                    isPending={isNativePending}
                    onRun={runRuntimeUpdate}
                  />
                ))}
                <NativeAgentActionControl
                  actions={combinedUpdateActions}
                  icon={ArrowUpCircle}
                  label={t`Update`}
                  soloLabel={t`Update`}
                  pendingLabel={t`Updating`}
                  menuLabel={t`Update`}
                  isPending={combinedUpdatePending}
                  onRun={(action) => {
                    if (!action) return;
                    setError(undefined);
                    void combinedRuntimeUpdates
                      .updateStatus(action.status, { toast: false })
                      .catch((updateError: unknown) => {
                        setError(
                          updateError instanceof Error ? updateError.message : String(updateError),
                        );
                      });
                  }}
                />
                {isInstalled && missingAuthStatus ? (
                  <div className="flex items-center gap-2 text-xs text-warning">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <AlertTriangle className="size-3.5" />
                      <Trans>Sign in required</Trans>
                    </span>
                    {runLogin ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        isPending={pendingAuthAgentId === agent.id}
                        onPress={runLogin}
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? <PixelLoader size="xs" /> : <LogIn className="size-3.5" />}
                            {isPending ? t`Signing in` : t`Login`}
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <Card.Footer className="flex flex-wrap items-start gap-x-4 gap-y-2 p-0 text-xs text-muted">
              <span className="font-medium">
                <Trans>ID: {agent.id}</Trans>
              </span>
              {runtimeSlots ? (
                authStatuses.map((status) => {
                  const combinedEntry = combinedRuntimeUpdates.entryFor(status);
                  return (
                    <div
                      key={`${agent.id}-runtime-${status.envKind ?? "native"}-${status.envDistro ?? ""}`}
                      className="min-w-0"
                    >
                      {authStatuses.length > 1 ? (
                        <span className="mb-0.5 block">{detectionScopeLabel(status)}:</span>
                      ) : null}
                      {combinedEntry.supported ? (
                        <CombinedRuntimeVersionList
                          entry={combinedEntry}
                          className="text-xs"
                          showInstallTarget
                        />
                      ) : (
                        <span>
                          {runtimeSummaryText(runtimeSlots, status, (descriptor) => t(descriptor))}
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <NativeAgentVersionLabel
                  installedVersion={nativeStatus?.version ?? installedWslStatuses[0]?.version}
                  latestNpmVersion={nativeLatestVersions[agent.id]}
                />
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
                onClick={() => void readBridge().openExternal(agent.docsUrl)}
              >
                <Link className="size-3.5" />
                <Trans>Docs</Trans>
              </button>
            </Card.Footer>
          </div>
        </div>
      </Card>
    );
  };

  const renderAgentCard = (agent: AcpRegistryAgent) => {
    const installedRecord = installedById.get(agent.id);
    const adapterKind = acpGenericKind(agent.id);
    const familyKind = REGISTRY_AGENT_FAMILY_KIND[agent.id];
    const detectedStatuses = findDetectedStatuses(adapterKind, familyKind);
    const familyDetectedStatuses = findDetectedStatuses(familyKind);
    const localStatus = findDetectedStatus(adapterKind, familyKind);
    const localInstalled = familyDetectedStatuses.length > 0;
    const rowInstalledKind = installedRecord?.adapterKind ?? familyKind;
    const isAgentPending = pendingAgentId === agent.id;
    const canRemove = installedRecord !== undefined;
    const isAvailable = installedRecord !== undefined || localInstalled;
    const needsLogin = localStatus?.authState === "missing";
    const loginCommand = localStatus?.loginCommand;
    const agentAuthMethod = findAgentAuthMethodForStatus(localStatus);
    const terminalAuthMethod = findTerminalAuthMethodForStatus(localStatus);
    const agentAuthStatuses = needsLogin
      ? detectedStatuses.filter((status) => status.authState === "missing")
      : detectedStatuses;
    const agentAuthEntries = agentAuthStatuses.flatMap((status) => {
      const method = findAgentAuthMethodForStatus(status);
      return method ? [{ status, method }] : [];
    });
    const loginProject = projectForStatus(localStatus);

    return (
      <Card
        key={agent.id}
        className="w-full rounded-lg bg-surface-secondary shadow-none border border-border p-4"
      >
        <div className="flex items-start gap-4">
          <AgentIcon
            agent={agent}
            {...(rowInstalledKind ? { installedKind: rowInstalledKind } : {})}
            isInstalled={isAvailable}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <Card.Header className="flex min-w-0 flex-1 flex-col items-start gap-1 p-0">
                <div className="flex items-center gap-2">
                  <Card.Title className="truncate text-base font-semibold">{agent.name}</Card.Title>
                  <span className="text-sm font-medium tabular-nums text-muted">
                    v{installedRecord?.version ?? agent.version}
                  </span>
                  {renderTag(t`ACP`)}
                  {APP_SUPPORTED_ACP_AGENT_IDS.has(agent.id) ? renderTag(t`Native support`) : null}
                </div>
                <Card.Description className="line-clamp-2 text-xs text-foreground/85">
                  {agent.description}
                </Card.Description>
              </Card.Header>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {canRemove ? (
                  <>
                    {installedRecord && installedRecord.version !== agent.version ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        isPending={isAgentPending}
                        onPress={() => updateAgent(agent)}
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? (
                              <PixelLoader size="xs" />
                            ) : (
                              <ArrowUpCircle className="size-4" />
                            )}
                            {isPending ? t`Updating` : t`Update to v${agent.version}`}
                          </>
                        )}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="tertiary"
                      className="text-danger hover:bg-danger hover:text-white"
                      isPending={isAgentPending}
                      onPress={() => removeAgent(agent.id)}
                    >
                      {({ isPending }) => (
                        <>
                          {isPending ? <PixelLoader size="xs" /> : <Trash2 className="size-4" />}
                          {isPending ? t`Deleting` : t`Delete`}
                        </>
                      )}
                    </Button>
                  </>
                ) : localInstalled ? (
                  <div className="flex flex-col items-end gap-1">
                    {familyDetectedStatuses.map((status) => (
                      <span
                        key={`${status.kind}-${status.envKind ?? "local"}-${status.envDistro ?? "default"}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted"
                      >
                        <CheckCircle2 className="size-3.5 text-success" />
                        <Trans>
                          Detected{" "}
                          <span className="text-muted/70">({detectionScopeLabel(status)})</span>
                        </Trans>
                      </span>
                    ))}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="tertiary"
                    isPending={isAgentPending}
                    onPress={() => installAgent(agent)}
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? <PixelLoader size="xs" /> : <Download className="size-4" />}
                        {isPending ? t`Installing` : t`Install`}
                      </>
                    )}
                  </Button>
                )}
                {isAvailable && needsLogin ? (
                  <div className="flex max-w-[13rem] flex-col items-end gap-1 text-right text-xs text-warning">
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="size-3.5" />
                      <Trans>Sign in required</Trans>
                    </span>
                    {agentAuthMethod ? (
                      <div className="flex flex-col items-end gap-2">
                        {(agentAuthEntries.length > 0
                          ? agentAuthEntries
                          : localStatus
                            ? [{ status: localStatus, method: agentAuthMethod }]
                            : []
                        ).map((entry) => (
                          <Button
                            key={`${entry.status.kind}-${entry.status.envKind ?? "local"}-${entry.status.envDistro ?? "default"}-auth`}
                            size="sm"
                            variant="tertiary"
                            isPending={pendingAuthAgentId === agent.id}
                            onPress={() =>
                              authenticateAgent(agent.id, entry.method.id, entry.status)
                            }
                          >
                            <LogIn className="size-3.5" />
                            {agentAuthEntries.length > 1
                              ? t`Login ${detectionScopeLabel(entry.status)}`
                              : t`Login`}
                          </Button>
                        ))}
                      </div>
                    ) : loginCommand && localStatus ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        isPending={pendingAuthAgentId === agent.id}
                        onPress={() =>
                          runTerminalLogin({
                            agentKind: adapterKind,
                            agentId: agent.id,
                            status: localStatus,
                            loginCommand,
                            ...(terminalAuthMethod?.env ? { env: terminalAuthMethod.env } : {}),
                            ...(loginProject ? { project: loginProject } : {}),
                          })
                        }
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? <PixelLoader size="xs" /> : <LogIn className="size-3.5" />}
                            {isPending ? t`Signing in` : t`Login`}
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <Card.Footer className="flex flex-wrap items-start gap-x-4 gap-y-2 p-0 text-xs text-muted">
              <span className="font-medium">
                <Trans>ID: {agent.id}</Trans>
              </span>
              <span>{distributionLabel(agent)}</span>
              {agent.repository ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
                  onClick={() => void readBridge().openExternal(agent.repository!)}
                >
                  <GitFork className="size-3.5" />
                  <Trans>Repository</Trans>
                </button>
              ) : null}
              {agent.website ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
                  onClick={() => void readBridge().openExternal(agent.website!)}
                >
                  <Link className="size-3.5" />
                  <Trans>Website</Trans>
                </button>
              ) : null}
            </Card.Footer>
          </div>
        </div>
      </Card>
    );
  };

  const renderAgentList = () => {
    if (isLoading) {
      return (
        <div className="py-10 text-sm text-muted">
          <Trans>Loading registry...</Trans>
        </div>
      );
    }

    if (
      visibleNativeAgents.length === 0 &&
      installedAgents.length === 0 &&
      availableAgents.length === 0
    ) {
      return (
        <div className="py-10 text-sm text-muted">
          <Trans>No matching agents.</Trans>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-8">
        {visibleNativeAgents.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted">
              <Trans>Native Providers</Trans>
            </h2>
            {visibleNativeAgents.map(renderNativeAgentCard)}
          </div>
        )}

        {installedAgents.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted">
              <Trans>ACP Agents</Trans>
            </h2>
            {installedAgents.map(renderAgentCard)}
          </div>
        )}

        {availableAgents.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted">
              <Trans>Available ACP Agents</Trans>
            </h2>
            {availableAgents.map(renderAgentCard)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col px-6 pb-8 pt-4">
      <div className="mx-auto flex w-full max-w-[980px] flex-col overflow-hidden">
        <div className="mb-6 flex flex-col gap-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground">
                <Trans>Agent Registry</Trans>
              </h1>
              <p className="text-sm text-muted">
                <Trans>
                  Install native providers first; use ACP for additional protocol agents.
                </Trans>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <Tooltip.Trigger>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    aria-label={t`Refresh registry`}
                    isPending={isLoading}
                    onPress={() => {
                      setIsLoading(true);
                      setError(undefined);
                      // An explicit refresh must bypass the shared listing's
                      // TTL, then leave the fresh result in the shared cache.
                      resetAcpRegistryListingCache();
                      loadAcpRegistryListing()
                        .then((result) => {
                          setAgents(result.agents);
                          void refreshStatuses({ reset: false });
                        })
                        .catch((err: unknown) => {
                          setError(err instanceof Error ? err.message : String(err));
                        })
                        .finally(() => setIsLoading(false));
                    }}
                  >
                    {({ isPending }) =>
                      isPending ? <PixelLoader size="xs" /> : <RefreshCw className="size-4" />
                    }
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <Trans>Refresh registry</Trans>
                </Tooltip.Content>
              </Tooltip>
            </div>
          </div>

          <div className="relative w-full shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label={t`Search agents`}
              className="w-full pl-9"
              placeholder={t`Search agents...`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <div className="mb-4 shrink-0 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto pr-2 pb-4">{renderAgentList()}</div>
      </div>
    </div>
  );
}
