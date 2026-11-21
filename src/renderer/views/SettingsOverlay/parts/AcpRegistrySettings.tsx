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
  type InstalledAcpRegistryAgent,
  type Project,
  type RefreshAgentScope,
  type RefreshAgentScopeEnv,
} from "@/shared/contracts";
import { isNewerVersion } from "@/shared/agents/updateResolver";
import { localMachineKey } from "@/shared/machines";
import { friendlyError } from "@/shared/messages";
import { msg } from "@lingui/core/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { isWindows, readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { runAgentInstallCommand, runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { useHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import {
  machineIdForStatus,
  useAgentsScopeMachines,
  useMachines,
  useSelectedMachine,
  type MachineDescriptor,
} from "@/renderer/state/machines";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import {
  agentAuthTarget,
  findAgentAuthMethodForStatus,
  findProjectForMachine,
  findStatusForTarget,
  findTerminalAuthMethodForStatus,
  scopeEnvForStatus,
  shouldPreferTerminalLogin,
} from "@/renderer/utils/acpRegistryAuth";
import { PixelLoader } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { CombinedRuntimeVersionList } from "@/renderer/components/providers/CombinedRuntimeVersionList";
import {
  agentManagementHostForMachine,
  distrosForAgentHost,
  hostScopedKey,
  useHostRegistryInstalledAgents,
} from "@/renderer/components/providers/settings/agentManagementHost";
import {
  loadAcpRegistryListing,
  resetAcpRegistryListingCache,
  useCombinedProviderRuntimeUpdates,
} from "@/renderer/components/providers/useCombinedProviderRuntimeUpdates";
import { getProviderManifest } from "@/renderer/components/providers/providerManifest";
import { RemoteMachineNotice } from "./machineScope/MachineScopeRows";
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
  command?: string | ((project: Project, targetVersion?: string) => string);
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
  response: Pick<AgentStatusesResponse, "windows" | "wsl"> | undefined,
  env: RefreshAgentScopeEnv,
  ...kinds: Array<string | undefined>
): AgentStatus | undefined {
  if (!response) return undefined;
  const kindSet = new Set(kinds.filter((kind): kind is string => typeof kind === "string"));
  const pool =
    env.kind === "wsl"
      ? response.wsl.filter((status) => status.envDistro === env.distro)
      : response.windows;
  return pool.find((status) => kindSet.has(status.kind));
}

function installedRecordForMachine(
  record: InstalledAcpRegistryAgent | undefined,
  machine: MachineDescriptor,
  scopedRegistryStatus: AgentStatus | undefined,
): InstalledAcpRegistryAgent | undefined {
  if (!record) return undefined;
  if (record.installations) {
    if (machine.ref.env.kind === "wsl") {
      const wslInstall = record.installations.wsl?.[machine.ref.env.distro];
      return wslInstall ? { ...record, version: wslInstall.version } : undefined;
    }
    const nativeInstall = record.installations.native;
    return nativeInstall ? { ...record, version: nativeInstall.version } : undefined;
  }
  if (machine.ref.env.kind === "wsl") {
    return scopedRegistryStatus ? record : undefined;
  }
  return record;
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
  const [listingsByHost, setListingsByHost] = useState<
    Readonly<Record<string, AcpRegistryAgent[]>>
  >({});
  const [query, setQuery] = useState("");
  const [errorsByHost, setErrorsByHost] = useState<Readonly<Record<string, string>>>({});
  const [errorsByMachine, setErrorsByMachine] = useState<Readonly<Record<string, string>>>({});
  const [pendingAgentKeys, setPendingAgentKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingAuthKeys, setPendingAuthKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [nativeLatestVersions, setNativeLatestVersions] = useState<Record<string, string>>({});
  // Native kinds we've already probed for a latest version, so the fetch effect
  // never re-requests the same kind across re-renders. A failed probe is removed
  // again so a later pass can retry.
  const requestedLatestVersionsRef = useRef<Set<string>>(new Set());

  const selectedMachine = useSelectedMachine();
  const machines = useAgentsScopeMachines(useMachines());
  const compactLayout = useCompactLayout();
  const showsScopeBar = !compactLayout && machines.length > 1;
  const agentHost = agentManagementHostForMachine(selectedMachine);
  const isRemoteHost = agentHost.isRemote;
  const isMachineOnline = selectedMachine.status === "online";
  const machineHost =
    selectedMachine.ref.host === "remote" ? selectedMachine.ref.desktopId : undefined;
  const machinePools = useHostAgentStatusPools(machineHost);
  const machineEnvId = localMachineKey(selectedMachine.ref.env);
  const scopedStatuses =
    selectedMachine.ref.env.kind === "native"
      ? machinePools.windows
      : machinePools.wsl.filter((status) => machineIdForStatus(status) === machineEnvId);

  const settingsInstalled = useHostRegistryInstalledAgents(agentHost);
  const agents = listingsByHost[agentHost.key] ?? [];
  const combinedRuntimeUpdates = useCombinedProviderRuntimeUpdates(
    scopedStatuses,
    Object.fromEntries(agents.map((agent) => [agent.id, agent.version])),
    agentHost,
  );
  const projects = useAppStore((state) => state.projects);
  const wslProjectDistrosKey = useAppStore((state) => buildWslProjectDistrosKey(state.projects));
  const projectWslDistros = wslProjectDistrosKey ? wslProjectDistrosKey.split("\0") : [];
  const wslDistros =
    selectedMachine.ref.host === "local" &&
    selectedMachine.wslDistro !== undefined &&
    !projectWslDistros.includes(selectedMachine.wslDistro)
      ? [...projectWslDistros, selectedMachine.wslDistro]
      : projectWslDistros;
  const wslDistrosKey = wslDistros.join("\0");
  const isWindowsPlatform = isWindows();

  const [loadingHostKey, setLoadingHostKey] = useState<string | undefined>(() =>
    isMachineOnline ? agentHost.key : undefined,
  );
  const loadScope = `${agentHost.key}\0${isMachineOnline}`;
  const [prevLoadScope, setPrevLoadScope] = useState(loadScope);
  if (prevLoadScope !== loadScope) {
    setPrevLoadScope(loadScope);
    setLoadingHostKey(
      isMachineOnline && !(agentHost.key in listingsByHost) ? agentHost.key : undefined,
    );
  }
  const isLoading = loadingHostKey === agentHost.key;
  const error = errorsByMachine[selectedMachine.id] ?? errorsByHost[agentHost.key];

  const clearMachineError = (machineId = selectedMachine.id, hostKey = agentHost.key) => {
    setErrorsByMachine((prev) => {
      if (!(machineId in prev)) return prev;
      const next = { ...prev };
      delete next[machineId];
      return next;
    });
    setErrorsByHost((prev) => {
      if (!(hostKey in prev)) return prev;
      const next = { ...prev };
      delete next[hostKey];
      return next;
    });
  };

  const setMachineError = (message: string, machineId = selectedMachine.id) => {
    setErrorsByMachine((prev) => ({ ...prev, [machineId]: message }));
  };

  const markPendingAgent = (key: string, pending: boolean) => {
    setPendingAgentKeys((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const markPendingAuth = (key: string, pending: boolean) => {
    setPendingAuthKeys((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const distrosForHost = (targetHost: typeof agentHost, env: RefreshAgentScopeEnv) =>
    distrosForAgentHost(targetHost, env, wslDistros);

  const requestStatusRefresh = (options?: {
    reset?: boolean;
    scope?: RefreshAgentScope;
    host?: typeof agentHost;
    distros?: string[];
    rediscover?: boolean;
  }) => {
    const targetHost = options?.host ?? agentHost;
    const targetDistros = options?.distros ?? wslDistros;
    if (
      !targetHost.isRemote &&
      options?.reset !== false &&
      !useAgentStatusesStore.getState().inFirstLaunchDiscovery
    ) {
      useAgentStatusesStore.getState().resetDiscoveredAgents();
    }
    return options?.rediscover
      ? targetHost.rediscoverAgents(targetDistros, options?.scope)
      : targetHost.refreshAgentStatuses(targetDistros, options?.scope);
  };

  const refreshStatuses = (options?: {
    reset?: boolean;
    scope?: RefreshAgentScope;
    host?: typeof agentHost;
    distros?: string[];
    rediscover?: boolean;
  }) => {
    return requestStatusRefresh(options).catch(() => undefined);
  };

  useEffect(() => {
    if (!isMachineOnline) return;
    let cancelled = false;
    const host = agentHost;
    const hostKey = host.key;
    // Through the shared listing loader: a direct call would race the
    // combined-runtime probe's own listing and run two supervisor
    // auto-update sweeps against the same install dirs.
    loadAcpRegistryListing(host)
      .then((result) => {
        if (cancelled) return;
        setListingsByHost((prev) => ({ ...prev, [hostKey]: result.agents }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorsByHost((prev) => ({
          ...prev,
          [hostKey]: err instanceof Error ? err.message : String(err),
        }));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingHostKey((current) => (current === hostKey ? undefined : current));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentHost, isMachineOnline]);

  useEffect(() => {
    if (isRemoteHost) return;
    const distros = wslDistrosKey ? wslDistrosKey.split("\0") : [];
    void readBridge()
      .getAgentStatuses(distros)
      .catch(() => undefined);
  }, [isRemoteHost, wslDistrosKey]);

  const installedById = new Map(Object.entries(settingsInstalled));
  const detectedInstalledByKind = new Map<string, AgentStatus[]>();
  for (const status of scopedStatuses) {
    if (!status.installed) continue;
    const existing = detectedInstalledByKind.get(status.kind);
    if (existing) {
      existing.push(status);
    } else {
      detectedInstalledByKind.set(status.kind, [status]);
    }
  }

  // Native agents not detected on the selected machine. Only these cards fall
  // back to the npm "latest" label (installed agents show their detected
  // version), so they are the only kinds worth a registry version probe.
  const statusesLoaded = machinePools.windows.length > 0 || machinePools.wsl.length > 0;
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
    if (isLoading || !statusesLoaded || !isMachineOnline) return;
    let cancelled = false;
    const host = agentHost;
    const requested = requestedLatestVersionsRef.current;
    for (const id of notInstalledNativeKey ? notInstalledNativeKey.split(",") : []) {
      const scopedKey = hostScopedKey(host.key, id);
      if (requested.has(scopedKey)) continue;
      requested.add(scopedKey);
      host
        .getLatestAgentVersion({ agentKind: id })
        .then((result) => {
          if (cancelled || !result.version) return;
          const version = result.version;
          setNativeLatestVersions((prev) => ({ ...prev, [scopedKey]: version }));
        })
        .catch((fetchError) => {
          requested.delete(scopedKey);
          console.warn(
            `[AcpRegistrySettings] getLatestAgentVersion(${id}) failed:`,
            fetchError instanceof Error ? fetchError.message : fetchError,
          );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [agentHost, isLoading, isMachineOnline, statusesLoaded, notInstalledNativeKey]);

  const normalizedQuery = query.trim().toLowerCase();
  const machineProject = findProjectForMachine(
    selectedMachine,
    projects,
    isWindowsPlatform,
    scopedStatuses,
  );
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
    const scopedRegistryStatus = findDetectedStatus(acpGenericKind(agent.id));
    const installedRecord = installedRecordForMachine(
      installedById.get(agent.id),
      selectedMachine,
      scopedRegistryStatus,
    );
    const registryInstalled =
      installedRecord !== undefined || (isRemoteHost && scopedRegistryStatus !== undefined);
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
    if (!isMachineOnline) return;
    const agentId = agent.id;
    const targetMachine = selectedMachine;
    const targetHost = agentHost;
    const actionKey = `${targetMachine.id}\0${agentId}`;
    const targetEnv = targetMachine.ref.env;
    markPendingAgent(actionKey, true);
    clearMachineError(targetMachine.id);
    targetHost
      .installAcpRegistryAgent({
        agentId,
        ...(targetEnv.kind === "wsl" ? { target: targetEnv } : {}),
      })
      .then(async (result) => {
        const adapterKind = acpGenericKind(agentId);
        const response = await refreshStatuses({
          reset: false,
          host: targetHost,
          distros: distrosForHost(targetHost, targetEnv),
          scope: { agentKinds: [adapterKind], envs: [targetEnv] },
        });
        targetHost.recordRegistryInstalls(result.installed);
        const status = findStatusInResponse(
          response,
          targetEnv,
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
        setMachineError(err instanceof Error ? err.message : String(err), targetMachine.id);
      })
      .finally(() => markPendingAgent(actionKey, false));
  };

  const removeAgent = (agentId: string) => {
    if (!isMachineOnline) return;
    const targetMachine = selectedMachine;
    const targetHost = agentHost;
    const targetEnv = targetMachine.ref.env;
    const actionKey = `${targetMachine.id}\0${agentId}`;
    markPendingAgent(actionKey, true);
    clearMachineError(targetMachine.id);
    targetHost
      .removeAcpRegistryAgent({ agentId })
      .then((result) => {
        targetHost.recordRegistryInstalls(result.installed);
        void refreshStatuses({
          host: targetHost,
          distros: distrosForHost(targetHost, targetEnv),
        });
      })
      .catch((err: unknown) => {
        setMachineError(err instanceof Error ? err.message : String(err), targetMachine.id);
      })
      .finally(() => markPendingAgent(actionKey, false));
  };

  const updateAgent = (agent: AcpRegistryAgent) => {
    if (!isMachineOnline) return;
    const agentId = agent.id;
    const targetMachine = selectedMachine;
    const targetHost = agentHost;
    const actionKey = `${targetMachine.id}\0${agentId}`;
    const targetEnv = targetMachine.ref.env;
    markPendingAgent(actionKey, true);
    clearMachineError(targetMachine.id);
    targetHost
      .updateAcpRegistryAgent({
        agentId,
        ...(targetEnv.kind === "wsl" ? { target: targetEnv } : {}),
      })
      .then(async (result) => {
        const adapterKind = acpGenericKind(agentId);
        await refreshStatuses({
          reset: false,
          host: targetHost,
          distros: distrosForHost(targetHost, targetEnv),
          scope: { agentKinds: [adapterKind], envs: [targetEnv] },
        });
        targetHost.recordRegistryInstalls(result.installed);
        resetAcpRegistryListingCache();
        toast.success(t`${agent.name} updated to v${agent.version}.`);
      })
      .catch((err: unknown) => {
        setMachineError(err instanceof Error ? err.message : String(err), targetMachine.id);
      })
      .finally(() => markPendingAgent(actionKey, false));
  };

  const authenticateAgent = (
    agentId: string,
    methodId: string,
    status: AgentStatus,
    agentKind = acpGenericKind(agentId),
  ) => {
    if (!isMachineOnline) return;
    const targetMachine = selectedMachine;
    const targetHost = agentHost;
    const targetEnv = scopeEnvForStatus(status);
    const actionKey = `${targetMachine.id}\0${agentId}`;
    markPendingAuth(actionKey, true);
    clearMachineError(targetMachine.id);
    targetHost
      .authenticateAcpAgent({
        agentKind,
        methodId,
        ...agentAuthTarget(status),
      })
      .then(() => targetHost.focusAfterAuth())
      .then(() =>
        refreshStatuses({
          reset: false,
          host: targetHost,
          distros: distrosForHost(targetHost, targetEnv),
          rediscover: true,
          scope: {
            agentKinds: [agentKind],
            envs: [targetEnv],
          },
        }),
      )
      .catch((err: unknown) => {
        setMachineError(err instanceof Error ? friendlyError(err) : String(err), targetMachine.id);
      })
      .finally(() => markPendingAuth(actionKey, false));
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
    if (!isMachineOnline) return;
    const targetMachine = selectedMachine;
    const targetHost = agentHost;
    const targetEnv = scopeEnvForStatus(input.status);
    const actionKey = `${targetMachine.id}\0${input.agentId}`;
    clearMachineError(targetMachine.id);
    markPendingAuth(actionKey, true);
    const clearPending = () => markPendingAuth(actionKey, false);
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
          host: targetHost,
          distros: distrosForHost(targetHost, targetEnv),
          rediscover: true,
          scope: { agentKinds: [input.agentKind], envs: [targetEnv] },
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
      statuses[0]
    );
  }

  const renderNativeAgentCard = (agent: NativeAgentRegistryEntry) => {
    const manifestLabel = getProviderManifest(agent.id)?.label;
    const agentLabel = manifestLabel ? t(manifestLabel) : agent.id;
    const status = scopedStatuses.find(
      (candidate) => candidate.kind === agent.id && candidate.installed,
    );
    const isInstalled = status !== undefined;
    const authStatuses = status ? [status] : [];
    const runtimeSlots = agent.runtimeSlots;
    const installedRuntimes = runtimeSlots
      ? installedRuntimeIds(runtimeSlots, authStatuses)
      : undefined;
    const missingAuthStatus = status?.authState === "missing" ? status : undefined;
    const agentAuthMethod =
      missingAuthStatus && !shouldPreferTerminalLogin(missingAuthStatus)
        ? findAgentAuthMethodForStatus(missingAuthStatus)
        : undefined;
    const loginCommand = missingAuthStatus?.loginCommand;
    const terminalAuthMethod = findTerminalAuthMethodForStatus(missingAuthStatus);
    const loginProject = machineProject;
    const nativeAuthKey = `${selectedMachine.id}\0${agent.id}`;
    const isAuthPending = pendingAuthKeys.has(nativeAuthKey);
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
    const registryTarget: AcpRegistryInstallTarget = selectedMachine.ref.env;
    const installTargets: InstallTarget[] =
      runtimeSlots !== undefined || !isInstalled
        ? [
            {
              id: selectedMachine.id,
              label: selectedMachine.label,
              ...(machineProject ? { project: machineProject } : {}),
              registryTarget,
            },
          ]
        : [];

    const installActions: NativeInstallAction[] = runtimeSlots
      ? installTargets.flatMap((target) => {
          return availableRuntimeInstallOptions(runtimeSlots, status).map((option) => {
            return {
              ...target,
              id: `${target.id}:${option.id}`,
              label: t(option.installLabel(undefined)),
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
          label: t`Install`,
        }));
    // One update control per updatable runtime, so each keeps its own labels.
    const runtimeUpdateGroups = (runtimeSlots?.runtimes ?? []).flatMap((slot) => {
      const update = slot.update;
      if (!update || !status) return [];
      const registryAgent = update.registryAgentId
        ? agents.find((candidate) => candidate.id === update.registryAgentId)
        : undefined;
      if (
        runtimeSlots?.unifiedAgent &&
        runtimeSlots.runtimes.some((runtime) => !detectAgentRuntime(runtime, status).installed)
      ) {
        return [];
      }
      if (!update.canUpdate(status, registryAgent)) return [];
      const action: NativeRuntimeUpdateAction = {
        id: `${slot.id}-update:${status.envKind ?? "native"}:${status.envDistro ?? ""}`,
        label: t(update.actionLabel(undefined)),
        status,
        slot,
        ...(machineProject ? { project: machineProject } : {}),
        registryTarget,
        ...(update.command
          ? {
              command: (targetProject: Project, targetVersion?: string) =>
                update.command?.(status, targetProject, targetVersion) ?? "",
            }
          : {}),
        ...(update.registryAgentId ? { registryAgentId: update.registryAgentId } : {}),
        ...(registryAgent ? { expectedRegistryVersion: registryAgent.version } : {}),
      };
      return [{ slot, update, actions: [action] }];
    });
    const combinedEntry = status ? combinedRuntimeUpdates.entryFor(status) : undefined;
    const combinedUpdateActions: CombinedRuntimeUpdateAction[] =
      status &&
      combinedEntry?.updateAvailable &&
      (!runtimeSlots || availableRuntimeInstallOptions(runtimeSlots, status).length === 0)
        ? [
            {
              id: `combined-update:${status.envKind ?? "native"}:${status.envDistro ?? ""}`,
              label: t`Update`,
              status,
            },
          ]
        : [];
    const combinedUpdatePending = combinedEntry?.pending ?? false;

    const runInstallTarget = (target: NativeInstallAction | undefined) => {
      if (!target || !isMachineOnline) return;
      const targetMachine = selectedMachine;
      const targetHost = agentHost;
      const actionKey = `${targetMachine.id}\0${agent.id}`;
      clearMachineError(targetMachine.id);
      markPendingAgent(actionKey, true);
      const clearPending = () => markPendingAgent(actionKey, false);
      const finishInstall = () => {
        void (async () => {
          let installError: Error | undefined;
          let response: Pick<AgentStatusesResponse, "windows" | "wsl"> | undefined;
          let statusBeforeRegistry: AgentStatus | undefined;
          const targetEnv = target.registryTarget;
          const targetDistros = distrosForHost(targetHost, targetEnv);
          if (target.verifyRuntimeId) {
            const detected = await requestStatusRefresh({
              reset: false,
              host: targetHost,
              distros: targetDistros,
              rediscover: true,
              scope: { agentKinds: [agent.id] },
            });
            const detectedStatus = findStatusForTarget(detected, agent.id, targetEnv);
            if (!detectedStatus?.runtimeVariants?.[target.verifyRuntimeId]?.installed) {
              throw new Error(t`Unable to refresh ${agentLabel} status.`);
            }
            statusBeforeRegistry = detectedStatus;
          }
          try {
            const registrySlot = runtimeSlots?.runtimes.find(
              (slot) => slot.registryAgentId === target.registryAgentId,
            );
            const registryAgentId = target.registryAgentId;
            if (registryAgentId) {
              const payload = {
                agentId: registryAgentId,
                target: targetEnv,
              };
              const registryInstalled = registrySlot
                ? detectAgentRuntime(registrySlot, statusBeforeRegistry).installed
                : false;
              const result = registryInstalled
                ? await targetHost.updateAcpRegistryAgent(payload)
                : await targetHost.installAcpRegistryAgent(payload);
              targetHost.recordRegistryInstalls(result.installed);
            }
          } catch (installFailure) {
            installError =
              installFailure instanceof Error ? installFailure : new Error(String(installFailure));
          }
          try {
            response = await requestStatusRefresh({
              reset: false,
              host: targetHost,
              distros: targetDistros,
              rediscover: target.command !== undefined,
              scope: { agentKinds: [agent.id] },
            });
          } catch (refreshFailure) {
            if (installError === undefined) throw refreshFailure;
          }
          if (installError !== undefined) throw installError;
          const refreshed = response
            ? findStatusForTarget(response, agent.id, targetEnv)
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
          .catch((err: unknown) =>
            setMachineError(err instanceof Error ? err.message : String(err), targetMachine.id),
          )
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
      if (!opened) clearPending();
    };

    const nativePendingKey = `${selectedMachine.id}\0${agent.id}`;
    const isNativePending = pendingAgentKeys.has(nativePendingKey);

    const runRuntimeUpdate = (action: NativeRuntimeUpdateAction | undefined) => {
      if (!action || !isMachineOnline) return;
      const update = action.slot.update;
      if (!update) return;
      const targetMachine = selectedMachine;
      const targetHost = agentHost;
      const npmPackage = update.npmPackage;
      const command = action.command;
      if (npmPackage && typeof command === "function") {
        void targetHost
          .getLatestAgentVersion({ agentKind: action.status.kind, npmPackage })
          .then((result) => {
            const targetVersion = result.version;
            const installedVersion = detectAgentRuntime(action.slot, action.status).version;
            if (!targetVersion) {
              setMachineError(t`Unable to update ${agentLabel}.`, targetMachine.id);
              return;
            }
            if (installedVersion && !isNewerVersion(targetVersion, installedVersion)) {
              toast.success(t(update.upToDateToast));
              return;
            }
            startRuntimeUpdate(
              {
                ...action,
                command: (project: Project) => command(project, targetVersion),
              },
              targetVersion,
            );
          })
          .catch((probeError: unknown) => {
            setMachineError(
              probeError instanceof Error ? probeError.message : t`Unable to update ${agentLabel}.`,
              targetMachine.id,
            );
          });
        return;
      }
      startRuntimeUpdate(action);
    };

    const startRuntimeUpdate = (action: NativeRuntimeUpdateAction, expectedVersion?: string) => {
      const update = action.slot.update;
      if (!update || !isMachineOnline) return;
      const targetMachine = selectedMachine;
      const targetHost = agentHost;
      const actionKey = `${targetMachine.id}\0${agent.id}`;
      const previousVersion = detectAgentRuntime(action.slot, action.status).version;
      clearMachineError(targetMachine.id);
      markPendingAgent(actionKey, true);
      const clearPending = () => markPendingAgent(actionKey, false);
      const finishUpdate = () => {
        void (async () => {
          let updateError: Error | undefined;
          try {
            if (action.registryAgentId) {
              const result = await targetHost.updateAcpRegistryAgent({
                agentId: action.registryAgentId,
                target: action.registryTarget,
              });
              targetHost.recordRegistryInstalls(result.installed);
            }
          } catch (updateFailure) {
            updateError =
              updateFailure instanceof Error ? updateFailure : new Error(String(updateFailure));
          }
          let response: Pick<AgentStatusesResponse, "windows" | "wsl"> | undefined;
          try {
            const targetEnv = scopeEnvForStatus(action.status);
            response = await requestStatusRefresh({
              reset: false,
              host: targetHost,
              distros: distrosForHost(targetHost, targetEnv),
              rediscover: action.command !== undefined,
              scope: {
                agentKinds: [agent.id],
                envs: [targetEnv],
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
          if (expectedVersion && (!nextVersion || isNewerVersion(expectedVersion, nextVersion))) {
            throw new Error(t`Unable to update ${agentLabel}.`);
          }
          if (nextVersion && nextVersion !== previousVersion) {
            toast.success(t(update.updatedToast(nextVersion)));
          } else {
            toast.success(t(update.upToDateToast));
          }
        })()
          .catch((err: unknown) =>
            setMachineError(err instanceof Error ? err.message : String(err), targetMachine.id),
          )
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
            setMachineError(t`Unable to update ${agentLabel}.`, targetMachine.id);
            clearPending();
            return;
          }
          finishUpdate();
        },
      });
      if (!opened) clearPending();
    };

    return (
      <Card key={`native-${agent.id}`} className="w-full p-4">
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
                  <span className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted">
                    <CheckCircle2 className="size-3.5 text-success" />
                    <Trans>Detected</Trans>
                  </span>
                ) : null}
                <NativeAgentActionControl
                  actions={installActions}
                  icon={Download}
                  label={t`Install`}
                  soloLabel={installActions[0]?.label ?? t`Install`}
                  pendingLabel={t`Installing`}
                  menuLabel={t`${agentLabel} install targets`}
                  isPending={isNativePending}
                  isDisabled={!isMachineOnline}
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
                    isDisabled={!isMachineOnline}
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
                  isDisabled={!isMachineOnline}
                  onRun={(action) => {
                    if (!action || !isMachineOnline) return;
                    const targetMachine = selectedMachine;
                    clearMachineError(targetMachine.id);
                    void combinedRuntimeUpdates
                      .updateStatus(action.status, { toast: false })
                      .catch((updateError: unknown) => {
                        setMachineError(
                          updateError instanceof Error ? updateError.message : String(updateError),
                          targetMachine.id,
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
                        isPending={isAuthPending}
                        isDisabled={!isMachineOnline}
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
              {runtimeSlots && status ? (
                <div className="min-w-0">
                  {combinedEntry?.supported ? (
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
              ) : (
                <NativeAgentVersionLabel
                  installedVersion={status?.version}
                  latestNpmVersion={nativeLatestVersions[hostScopedKey(agentHost.key, agent.id)]}
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
    const adapterKind = acpGenericKind(agent.id);
    const familyKind = REGISTRY_AGENT_FAMILY_KIND[agent.id];
    const scopedRegistryStatus = findDetectedStatus(adapterKind);
    const installedRecord = installedRecordForMachine(
      installedById.get(agent.id),
      selectedMachine,
      scopedRegistryStatus,
    );
    const detectedStatuses = findDetectedStatuses(adapterKind, familyKind);
    const familyDetectedStatuses = findDetectedStatuses(familyKind);
    const localStatus = findDetectedStatus(adapterKind, familyKind);
    const localInstalled = familyDetectedStatuses.length > 0;
    const isRemoteInstalled = isRemoteHost && scopedRegistryStatus !== undefined;
    const rowInstalledKind = installedRecord?.adapterKind ?? familyKind;
    const actionKey = `${selectedMachine.id}\0${agent.id}`;
    const isAgentPending = pendingAgentKeys.has(actionKey);
    const isAuthPending = pendingAuthKeys.has(actionKey);
    const canRemove = installedRecord !== undefined || isRemoteInstalled;
    const installedVersion =
      installedRecord?.version ?? (isRemoteInstalled ? scopedRegistryStatus?.version : undefined);
    const isAvailable = canRemove || localInstalled;
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
    const loginProject = machineProject;

    return (
      <Card key={agent.id} className="w-full p-4">
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
                    v{installedVersion ?? agent.version}
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
                    {installedVersion !== undefined && installedVersion !== agent.version ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        isPending={isAgentPending}
                        isDisabled={!isMachineOnline}
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
                      isDisabled={!isMachineOnline}
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
                  <span className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted">
                    <CheckCircle2 className="size-3.5 text-success" />
                    <Trans>Detected</Trans>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="tertiary"
                    isPending={isAgentPending}
                    isDisabled={!isMachineOnline}
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
                            isPending={isAuthPending}
                            isDisabled={!isMachineOnline}
                            onPress={() =>
                              authenticateAgent(agent.id, entry.method.id, entry.status)
                            }
                          >
                            <LogIn className="size-3.5" />
                            {t`Login`}
                          </Button>
                        ))}
                      </div>
                    ) : loginCommand && localStatus ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        isPending={isAuthPending}
                        isDisabled={!isMachineOnline}
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
    <div className="flex h-full min-h-0 flex-col px-6 pt-4">
      <div className="mx-auto flex min-h-0 w-full max-w-[980px] flex-1 flex-col overflow-hidden">
        <div className="mb-6 flex shrink-0 flex-col gap-4">
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
              {isRemoteHost ? <RemoteMachineNotice machine={selectedMachine} /> : null}
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
                    isDisabled={isLoading || !isMachineOnline}
                    onPress={() => {
                      if (isLoading || !isMachineOnline) return;
                      const targetMachine = selectedMachine;
                      const targetHost = agentHost;
                      setLoadingHostKey(targetHost.key);
                      clearMachineError(targetMachine.id, targetHost.key);
                      // An explicit refresh must bypass the shared listing's
                      // TTL, then leave the fresh result in the shared cache.
                      resetAcpRegistryListingCache();
                      loadAcpRegistryListing(targetHost)
                        .then((result) => {
                          setListingsByHost((prev) => ({
                            ...prev,
                            [targetHost.key]: result.agents,
                          }));
                          if (targetHost.isRemote) {
                            void targetHost
                              .rediscoverAgents(distrosForHost(targetHost, targetMachine.ref.env))
                              .catch(() => undefined);
                          } else {
                            void refreshStatuses({
                              reset: false,
                              host: targetHost,
                              distros: wslDistros,
                            });
                          }
                        })
                        .catch((err: unknown) => {
                          setErrorsByHost((prev) => ({
                            ...prev,
                            [targetHost.key]: err instanceof Error ? err.message : String(err),
                          }));
                        })
                        .finally(() => {
                          setLoadingHostKey((current) =>
                            current === targetHost.key ? undefined : current,
                          );
                        });
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

        <div
          data-settings-scroll-area="true"
          className={`min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-gutter:stable] ${
            showsScopeBar ? "pb-20" : "pb-8"
          }`}
        >
          {renderAgentList()}
        </div>
      </div>
    </div>
  );
}
