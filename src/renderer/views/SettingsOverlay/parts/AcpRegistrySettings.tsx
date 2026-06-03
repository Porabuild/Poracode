import { useEffect, useRef, useState } from "react";
import { Button, Input, Tooltip, Card, Dropdown, Label, toast } from "@heroui/react";
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  GitFork,
  Link,
  LogIn,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import type {
  AcpRegistryAgent,
  AgentStatus,
  AgentStatusesResponse,
  Project,
  RefreshAgentScope,
} from "@/shared/contracts";
import { isWindows, readBridge } from "@/renderer/bridge";
import { runAgentInstallCommand, runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  agentAuthTarget,
  findAgentAuthMethodForStatus,
  findTerminalAuthMethodForStatus,
  registryAdapterKind,
  scopeEnvForStatus,
} from "@/renderer/utils/acpRegistryAuth";
import { PixelLoader } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  APP_SUPPORTED_ACP_AGENT_IDS,
  KNOWN_NATIVE_FAMILY_ACP_AGENT_IDS,
  NATIVE_AGENT_REGISTRY_ENTRIES,
  REGISTRY_AGENT_FAMILY_KIND,
  type NativeAgentRegistryEntry,
} from "./agentRegistryNative";

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
        v{props.latestNpmVersion} <span className="text-muted/60">available</span>
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
  if (agent.distribution.binary) return "Binary";
  return "Custom";
}

interface InstallTarget {
  id: string;
  label: string;
  project?: Project;
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
      className={`size-8 shrink-0 rounded-lg ${props.isInstalled ? "!text-white !opacity-100" : ""}`}
    />
  );
}

export function AcpRegistrySettings(props: { onOpenAgentSettings?: (kind: string) => void }) {
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
  const projects = useAppStore((state) => state.projects);
  const wslProjectDistrosKey = useAppStore((state) => buildWslProjectDistrosKey(state.projects));
  const wslDistros = wslProjectDistrosKey ? wslProjectDistrosKey.split("\0") : [];
  const isWindowsPlatform = isWindows();

  const refreshStatuses = (options?: { reset?: boolean; scope?: RefreshAgentScope }) => {
    if (options?.reset !== false) {
      useAgentStatusesStore.getState().resetDiscoveredAgents();
    }
    return readBridge()
      .refreshAgentStatuses(wslDistros, options?.scope)
      .catch(() => undefined);
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(undefined);
    readBridge()
      .listAcpRegistry()
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
    return [agent.id, agent.label, agent.description]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const installedAgents: AcpRegistryAgent[] = [];
  const availableAgents: AcpRegistryAgent[] = [];

  for (const agent of agents) {
    if (normalizedQuery && !registrySearchText(agent).includes(normalizedQuery)) continue;
    const registryInstalled = installedById.has(agent.id);
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
        const adapterKind = registryAdapterKind(agentId);
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
          toast.warning(`${agent.name} needs authentication.`, {
            actionProps: {
              children: "Open settings",
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
        refreshStatuses();
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
        const adapterKind = registryAdapterKind(agentId);
        await refreshStatuses({ reset: false, scope: { agentKinds: [adapterKind] } });
        syncInstalledAgents(result.installed);
        toast.success(`${agent.name} updated to v${agent.version}.`);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setPendingAgentId(undefined));
  };

  const authenticateAgent = (agentId: string, methodId: string, status: AgentStatus) => {
    setPendingAuthAgentId(agentId);
    setError(undefined);
    readBridge()
      .authenticateAcpAgent({
        agentKind: registryAdapterKind(agentId),
        methodId,
        ...agentAuthTarget(status),
      })
      .then(() => readBridge().focusWindow())
      .then(() =>
        refreshStatuses({
          reset: false,
          scope: {
            agentKinds: [registryAdapterKind(agentId)],
            envs: [scopeEnvForStatus(status)],
          },
        }),
      )
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
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

  const renderTag = (label: string) => (
    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted">
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
      return status.envDistro ? `WSL (${status.envDistro})` : "WSL";
    }
    if (status.envKind === "windows") return "Windows";
    return "local";
  }

  const renderNativeAgentCard = (agent: NativeAgentRegistryEntry) => {
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
    const missingAuthStatus = authStatuses.find((status) => status.authState === "missing");
    const loginCommand = missingAuthStatus?.loginCommand;
    const terminalAuthMethod = findTerminalAuthMethodForStatus(missingAuthStatus);
    const loginProject = projectForStatus(missingAuthStatus);
    const supportsNativeWindows = agent.supportsWindows !== false;
    const installTargets: InstallTarget[] = [];
    const shouldOfferWslTargets = isWindowsPlatform && wslProjectsByDistro.size > 0;
    if (shouldOfferWslTargets) {
      if (supportsNativeWindows && !nativeStatus && firstWindowsProject) {
        installTargets.push({
          id: "windows",
          label: "Install on Windows",
          project: firstWindowsProject,
        });
      }
      for (const [distro, project] of wslProjectsByDistro) {
        if (installedWslDistros.has(distro)) continue;
        installTargets.push({
          id: `wsl:${distro}`,
          label: `Install in WSL: ${distro}`,
          project,
        });
      }
    } else if (!nativeStatus && (supportsNativeWindows || !isWindowsPlatform)) {
      installTargets.push({ id: "default", label: "Install" });
    }
    // Native Windows without WSL available, for an agent that has no Windows
    // installer (e.g. Grok Build): nothing to install here yet.
    const showWindowsUnsupportedNotice =
      !isInstalled && !supportsNativeWindows && isWindowsPlatform && installTargets.length === 0;

    const runInstallTarget = (target: InstallTarget | undefined) => {
      setError(undefined);
      setPendingAgentId(agent.id);
      runAgentInstallCommand({
        label: agent.label,
        command: agent.installCommand,
        ...(target?.project ? { project: target.project } : {}),
        // Re-detect once the installer exits so the card flips to "Detected"
        // without the user manually refreshing, mirroring the ACP install flow.
        // Keep the loader on through the probe so it doesn't flicker back to
        // "Install" before detection confirms the binary.
        onCommandComplete: (exitCode) => {
          const clearPending = () =>
            setPendingAgentId((current) => (current === agent.id ? undefined : current));
          if (exitCode === 0) {
            void refreshStatuses({ reset: false, scope: { agentKinds: [agent.id] } }).finally(
              clearPending,
            );
          } else {
            clearPending();
          }
        },
      });
    };

    const isNativePending = pendingAgentId === agent.id;

    const renderInstallControl = () => {
      if (installTargets.length === 0) return null;
      if (installTargets.length === 1) {
        const target = installTargets[0];
        return (
          <Button
            size="sm"
            variant="tertiary"
            isPending={isNativePending}
            onPress={() => runInstallTarget(target)}
          >
            {({ isPending }) => (
              <>
                {isPending ? <PixelLoader size="xs" /> : <Download className="size-4" />}
                {isPending ? "Installing" : (target?.label ?? "Install")}
              </>
            )}
          </Button>
        );
      }
      const targetsById = new Map(installTargets.map((target) => [target.id, target]));
      return (
        <Dropdown>
          <Button size="sm" variant="tertiary" isPending={isNativePending}>
            {({ isPending }) => (
              <>
                {isPending ? <PixelLoader size="xs" /> : <Download className="size-4" />}
                {isPending ? "Installing" : "Install"}
                {isPending ? null : <ChevronDown className="size-3.5" />}
              </>
            )}
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              aria-label={`${agent.label} install targets`}
              onAction={(key) => runInstallTarget(targetsById.get(String(key)))}
            >
              {installTargets.map((target) => (
                <Dropdown.Item key={target.id} id={target.id} textValue={target.label}>
                  <Label>{target.label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      );
    };

    return (
      <Card
        key={`native-${agent.id}`}
        className="w-full rounded-lg bg-surface-secondary shadow-none border border-border p-4"
      >
        <div className="flex items-start gap-4">
          <ProviderIcon
            kind={agent.id}
            fallbackLabel={agent.label}
            className={`size-8 shrink-0 rounded-lg ${isInstalled ? "!text-white !opacity-100" : ""}`}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <Card.Header className="flex min-w-0 flex-1 flex-col items-start gap-1 p-0">
                <div className="flex items-center gap-2">
                  <Card.Title className="truncate text-base font-semibold">
                    {agent.label}
                  </Card.Title>
                  {renderTag("Native")}
                </div>
                <Card.Description className="line-clamp-2 text-sm text-foreground/85">
                  {agent.description}
                </Card.Description>
              </Card.Header>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {isInstalled ? (
                  <div className="flex flex-col items-end gap-1">
                    {nativeStatus ? (
                      <span className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted">
                        <CheckCircle2 className="size-3.5 text-white" />
                        Detected <span className="text-muted/70">(local)</span>
                      </span>
                    ) : null}
                    {installedWslStatuses.map((status) => (
                      <span
                        key={`${agent.id}-${status.envDistro ?? "wsl"}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted"
                      >
                        <CheckCircle2 className="size-3.5 text-white" />
                        Detected{" "}
                        <span className="text-muted/70">
                          {status.envDistro ? `WSL (${status.envDistro})` : "WSL"}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
                {renderInstallControl()}
                {showWindowsUnsupportedNotice ? (
                  <span className="max-w-[13rem] text-right text-xs text-muted">
                    Windows is not supported yet. Install inside WSL or on macOS/Linux.
                  </span>
                ) : null}
                {isInstalled && missingAuthStatus ? (
                  <div className="flex items-center gap-2 text-xs text-warning">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <AlertTriangle className="size-3.5" />
                      Sign in required
                    </span>
                    {loginCommand ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        isPending={pendingAuthAgentId === agent.id}
                        onPress={() =>
                          runTerminalLogin({
                            agentKind: agent.id,
                            agentId: agent.id,
                            status: missingAuthStatus,
                            loginCommand,
                            ...(terminalAuthMethod?.env ? { env: terminalAuthMethod.env } : {}),
                            ...(loginProject ? { project: loginProject } : {}),
                          })
                        }
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? <PixelLoader size="xs" /> : <LogIn className="size-3.5" />}
                            {isPending ? "Signing in" : "Login"}
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <Card.Footer className="flex flex-wrap items-center gap-x-4 gap-y-2 p-0 text-xs text-muted">
              <span className="font-medium">ID: {agent.id}</span>
              <NativeAgentVersionLabel
                installedVersion={nativeStatus?.version ?? installedWslStatuses[0]?.version}
                latestNpmVersion={nativeLatestVersions[agent.id]}
              />
              <button
                type="button"
                className="inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
                onClick={() => void readBridge().openExternal(agent.docsUrl)}
              >
                <Link className="size-3.5" />
                Docs
              </button>
            </Card.Footer>
          </div>
        </div>
      </Card>
    );
  };

  const renderAgentCard = (agent: AcpRegistryAgent) => {
    const installedRecord = installedById.get(agent.id);
    const adapterKind = registryAdapterKind(agent.id);
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
                  {renderTag("ACP")}
                  {APP_SUPPORTED_ACP_AGENT_IDS.has(agent.id) ? renderTag("Native support") : null}
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
                            {isPending ? "Updating" : `Update to v${agent.version}`}
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
                          {isPending ? "Deleting" : "Delete"}
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
                        <CheckCircle2 className="size-3.5 text-white" />
                        Detected{" "}
                        <span className="text-muted/70">({detectionScopeLabel(status)})</span>
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
                        {isPending ? "Installing" : "Install"}
                      </>
                    )}
                  </Button>
                )}
                {isAvailable && needsLogin ? (
                  <div className="flex max-w-[13rem] flex-col items-end gap-1 text-right text-xs text-warning">
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="size-3.5" />
                      Sign in required
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
                            Login
                            {agentAuthEntries.length > 1
                              ? ` ${detectionScopeLabel(entry.status)}`
                              : ""}
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
                            {isPending ? "Signing in" : "Login"}
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <Card.Footer className="flex flex-wrap items-center gap-x-4 gap-y-2 p-0 text-xs text-muted">
              <span className="font-medium">ID: {agent.id}</span>
              <span>{distributionLabel(agent)}</span>
              {agent.repository ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
                  onClick={() => void readBridge().openExternal(agent.repository!)}
                >
                  <GitFork className="size-3.5" />
                  Repository
                </button>
              ) : null}
              {agent.website ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
                  onClick={() => void readBridge().openExternal(agent.website!)}
                >
                  <Link className="size-3.5" />
                  Website
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
      return <div className="py-10 text-sm text-muted">Loading registry...</div>;
    }

    if (
      visibleNativeAgents.length === 0 &&
      installedAgents.length === 0 &&
      availableAgents.length === 0
    ) {
      return <div className="py-10 text-sm text-muted">No matching agents.</div>;
    }

    return (
      <div className="flex flex-col gap-8">
        {visibleNativeAgents.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted">Native Providers</h2>
            {visibleNativeAgents.map(renderNativeAgentCard)}
          </div>
        )}

        {installedAgents.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted">ACP Agents</h2>
            {installedAgents.map(renderAgentCard)}
          </div>
        )}

        {availableAgents.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted">Available ACP Agents</h2>
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
              <h1 className="text-xl font-semibold text-foreground">Agent Registry</h1>
              <p className="text-sm text-muted">
                Install native providers first; use ACP for additional protocol agents.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <Tooltip.Trigger>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    isPending={isLoading}
                    onPress={() => {
                      setIsLoading(true);
                      setError(undefined);
                      readBridge()
                        .listAcpRegistry()
                        .then((result) => {
                          setAgents(result.agents);
                          refreshStatuses({ reset: false });
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
                <Tooltip.Content>Refresh registry</Tooltip.Content>
              </Tooltip>
            </div>
          </div>

          <div className="relative w-full shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label="Search agents"
              className="w-full pl-9"
              placeholder="Search agents..."
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
