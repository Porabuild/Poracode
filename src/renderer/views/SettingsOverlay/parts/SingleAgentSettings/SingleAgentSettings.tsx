import { useEffect, useState } from "react";
import { Button, Card, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AlertTriangle, ArrowUpCircle, LogIn, LogOut, Save } from "lucide-react";
import { isNewerVersion } from "@/shared/agents/updateResolver";
import type {
  AgentOwnedAuthMethod,
  AgentProviderMetadata,
  AgentStatus,
  AgentTerminalAuthMethod,
} from "@/shared/contracts";
import {
  baseAgentKind,
  extractAcpGenericInstanceId,
  isCursorProfileKind,
  parseAgentProfileKind,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { runAgentInstallCommand, runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useMachines, useSelectedMachine } from "@/renderer/state/machines";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { readBridge } from "@/renderer/bridge";
import {
  agentAuthTarget,
  envLabelForStatus,
  findAgentAuthMethodInStatuses,
  findProjectForStatus,
  findTerminalAuthMethodForStatus,
  findTerminalAuthMethodInStatuses,
  isAgentAuthMethod,
  scopeEnvForStatus,
  statusUpdateScope,
  shouldPreferTerminalLogin,
} from "@/renderer/utils/acpRegistryAuth";
import { Input } from "@/renderer/components/common";
import {
  providerMenuKey,
  providerVisibilityKey,
} from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { expandAgentToVisibilityProviders } from "@/renderer/components/thread/buildModelPickerControls";
import { CombinedRuntimeVersionList } from "@/renderer/components/providers/CombinedRuntimeVersionList";
import { useCombinedProviderRuntimeUpdates } from "@/renderer/components/providers/useCombinedProviderRuntimeUpdates";
import { SettingsPage } from "../SettingsForm";
import { NATIVE_AGENT_REGISTRY_ENTRIES } from "../agentRegistryNative";
import { SAVED_CREDENTIAL_MASK } from "../secretMask";
import { AgentHeader } from "./parts/AgentHeader";
import { AgentSettingRow } from "./parts/AgentSettingRow";
import { ModelVisibilityDropdown } from "./parts/ModelVisibilityDropdown";
import { AgentEnvironmentRow, AgentInstallEnvironmentRow } from "./parts/AgentEnvironmentRow";
import { HookPluginSettings } from "./parts/HookPluginSettings";
import { MachineScopeHeading } from "../machineScope/MachineScopeHeading";
import {
  MachineAttentionHint,
  NoMachineStatusRow,
  RemoteMachineNotice,
} from "../machineScope/MachineScopeRows";
import { useMachineScopedStatuses } from "../machineScope/useMachineScopedStatuses";
import {
  findAgentAuthMethod,
  findEnvVarAuthMethod,
  findTerminalLoginStatus,
  formatStatusList,
  hasInteractiveAuthMethods,
  resolveLivePlanLabel,
  statusEnvKey,
  statusNeedsInteractiveLogin,
  supportsAcpLogoutStatus,
} from "./parts/authHelpers";

export function SingleAgentSettings(props: {
  agentKind: string;
  onOpenProfile?: (profileKind: string) => void;
}) {
  const { t } = useLingui();
  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [authPending, setAuthPending] = useState(false);
  const [authPendingMessage, setAuthPendingMessage] = useState<string | undefined>();
  const [authPendingEnvKey, setAuthPendingEnvKey] = useState<string | undefined>();
  // Tag each cached "latest version" with the agent identity it belongs to.
  // On agent switch, the new render derives `undefined` immediately because
  // the stored owner no longer matches — without this, useEffect cleanup runs
  // after paint and the button flashes the previous provider's target version
  // for ~100ms before settling.
  const [latestRegistryEntry, setLatestRegistryEntry] = useState<{
    agentId: string;
    version: string | undefined;
  }>();
  const [latestNpmEntry, setLatestNpmEntry] = useState<{
    agentKind: string;
    version: string | undefined;
  }>();
  const [installPendingEnvKey, setInstallPendingEnvKey] = useState<string | undefined>();
  const [updatePending, setUpdatePending] = useState(false);
  // Some providers' signed-in accounts aren't part of the detected status
  // (e.g. Antigravity's credential sits behind its language server). Resolved
  // lazily via the registry entry's `accountResolver` when this page opens;
  // undefined for agents without a resolver.
  const [providerAccount, setProviderAccount] = useState<AgentProviderMetadata | undefined>();
  const [binaryUpdatePendingEnvKeys, setBinaryUpdatePendingEnvKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // After a successful update we hide the stale version and show a loader on
  // that row until `refreshAgentStatuses` returns with the freshly-detected
  // version. Without this the user sees "vOld" alongside the success toast and
  // assumes the update silently failed.
  const [redetectingEnvKeys, setRedetectingEnvKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  // Live quota read for this provider. Its plan supersedes the detected one,
  // which is frozen into provider credentials at sign-in time.
  const providerUsage = useProviderUsage(props.agentKind);
  const projects = useAppStore((state) => state.projects);
  const wslProjectDistrosKey = buildWslProjectDistrosKey(projects);
  const platform = navigator.platform.toLowerCase().includes("win") ? "win32" : "posix";
  // Instance-scoped kind of any multi-profile provider (`claude:work`).
  const profileKindParts = parseAgentProfileKind(props.agentKind);
  const profileInstance = useSharedSettings((s) =>
    profileKindParts ? s.agentInstances[profileKindParts.instanceId] : undefined,
  );
  const selectedMachine = useSelectedMachine();
  const machines = useMachines();
  const isRemoteMachine = selectedMachine.ref.host === "remote";
  const { scoped: machineStatuses, othersNeedingAttention } = useMachineScopedStatuses(
    props.agentKind,
    selectedMachine,
  );
  const installedAnywhere = [...agentStatuses, ...wslAgentStatuses].filter(
    (a) => a.kind === props.agentKind && a.installed,
  );
  // Everything actionable on this page — env rows, auth, versions, provider
  // panel — is scoped to the selected machine.
  const installedStatuses = machineStatuses.filter((a) => a.installed);
  const combinedRuntimeUpdates = useCombinedProviderRuntimeUpdates(installedStatuses);
  const combinedRuntimeEntries = installedStatuses.map((status) => ({
    status,
    entry: combinedRuntimeUpdates.entryFor(status),
  }));
  const hasCombinedRuntimeUpdates = combinedRuntimeEntries.some(({ entry }) => entry.supported);
  const nativeRegistryEntry = NATIVE_AGENT_REGISTRY_ENTRIES.find(
    (entry) => entry.id === props.agentKind,
  );
  // Provider-specific settings UI resolves by base kind so instance-scoped
  // kinds (Claude profiles "claude:<id>") render their provider's panel.
  const providerEntry = NATIVE_AGENT_REGISTRY_ENTRIES.find(
    (entry) => entry.id === baseAgentKind(props.agentKind),
  );
  const installableStatuses =
    nativeRegistryEntry && !isRemoteMachine ? machineStatuses.filter((a) => !a.installed) : [];
  // Header and capabilities fall back to any machine's install so the page
  // stays usable while the selected machine has nothing detected yet.
  const agent = installedStatuses[0] ?? installedAnywhere[0];
  const isDisabled = useSharedSettings((s) => s.disabledAgents.includes(props.agentKind));
  const setAgentDisabled = useSharedSettings((s) => s.setAgentDisabled);
  const installedRegistryRecord = useSharedSettings(
    (s) => s.acpRegistryInstalledAgents[extractAcpGenericInstanceId(props.agentKind) ?? ""],
  );
  const syncInstalledAgents = useSharedSettings((s) => s.syncAcpRegistryInstalledAgents);
  const projectWslDistros = wslProjectDistrosKey ? wslProjectDistrosKey.split("\0") : [];
  // Include the selected machine's distro even when no project lives in it, so
  // scoped refreshes keep its statuses inside the supervisor's cache filter.
  const wslDistros =
    selectedMachine.ref.host === "local" &&
    selectedMachine.wslDistro !== undefined &&
    !projectWslDistros.includes(selectedMachine.wslDistro)
      ? [...projectWslDistros, selectedMachine.wslDistro]
      : projectWslDistros;

  const registryAgentId = extractAcpGenericInstanceId(props.agentKind);
  // Read-side guards: any stored "latest version" only counts when its owner
  // matches the currently-rendered agent. A stale value carried over from the
  // previous panel renders as `undefined` on the very first frame after the
  // switch — no flash.
  const latestRegistryVersion =
    latestRegistryEntry && latestRegistryEntry.agentId === registryAgentId
      ? latestRegistryEntry.version
      : undefined;
  const latestNpmVersion =
    latestNpmEntry && latestNpmEntry.agentKind === props.agentKind
      ? latestNpmEntry.version
      : undefined;
  // Peer versions from every machine: a copy lagging behind another machine's
  // install is still a known-good upgrade target for this machine's row.
  const newestInstalledVersion = installedAnywhere.reduce<string | undefined>((latest, status) => {
    const version = status.version;
    if (!version) return latest;
    if (!latest || isNewerVersion(version, latest)) return version;
    return latest;
  }, undefined);

  useEffect(() => {
    if (!registryAgentId) return;
    let cancelled = false;
    readBridge()
      .listAcpRegistry()
      .then((result) => {
        if (cancelled) return;
        const match = result.agents.find((entry) => entry.id === registryAgentId);
        setLatestRegistryEntry({ agentId: registryAgentId, version: match?.version });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [registryAgentId]);

  // Probe the upstream registry (npm) for the kind's latest version so we can
  // gate the per-env Update button on "actually outdated" rather than just
  // "installed". Skipped for ACP-registry agents since they have their own
  // version-comparison path above.
  useEffect(() => {
    if (registryAgentId || hasCombinedRuntimeUpdates) return;
    let cancelled = false;
    const kind = props.agentKind;
    readBridge()
      .getLatestAgentVersion({ agentKind: kind })
      .then((result) => {
        if (cancelled) return;
        setLatestNpmEntry({ agentKind: kind, version: result.version });
      })
      .catch((error) => {
        // Surface IPC / network failures so users can diagnose missing update
        // buttons via DevTools instead of seeing a silently empty UI.
        console.warn(
          `[SingleAgentSettings] getLatestAgentVersion(${kind}) failed:`,
          error instanceof Error ? error.message : error,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [hasCombinedRuntimeUpdates, props.agentKind, registryAgentId]);

  // Resolve the provider account on open. Resolvers may briefly spawn a
  // helper process (e.g. Antigravity's `agy` language server), so this can
  // take a moment; it stays undefined (no account line) when unavailable.
  const accountResolver = providerEntry?.accountResolver;
  useEffect(() => {
    if (!accountResolver) {
      setProviderAccount(undefined);
      return;
    }
    let cancelled = false;
    accountResolver(wslDistros)
      .then((account) => {
        if (!cancelled) setProviderAccount(account);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountResolver, wslProjectDistrosKey]);

  if (!agent) {
    // A profile whose base provider is not installed here — or whose detection
    // has not landed yet — still needs its settings page: it is the only place
    // to fix the credential or config that made detection fail. Driven by the
    // provider registry, so this holds for every multi-profile provider.
    const ProfilePanel = providerEntry?.settingsPanel;
    if (
      profileKindParts &&
      profileInstance?.driver === profileKindParts.driver &&
      providerEntry?.profiles &&
      ProfilePanel
    ) {
      // Profile kinds can lack an *installed* root status while a runtime
      // variant (e.g. @cursor/sdk) is usable; hand over whatever detection
      // produced so the panel shows truthful install/auth states.
      const profileStatuses = [...agentStatuses, ...wslAgentStatuses].filter(
        (candidate) => candidate.kind === props.agentKind,
      );
      const providerLabel =
        profileKindParts.driver.charAt(0).toUpperCase() + profileKindParts.driver.slice(1);
      return (
        <SettingsPage
          title={`${providerLabel} ${profileInstance.displayName ?? profileInstance.id}`}
          bodyClassName=""
        >
          <ProfilePanel
            agentKind={props.agentKind}
            statuses={profileStatuses}
            wslDistros={wslDistros}
            onOpenProfile={props.onOpenProfile}
          />
        </SettingsPage>
      );
    }
    return (
      <SettingsPage title={t`Agent not found`} bodyClassName="">
        <p className="text-sm text-muted">
          <Trans>This agent is not installed.</Trans>
        </p>
      </SettingsPage>
    );
  }

  const defs = (agent.capabilities.settingDefs ?? []).filter(
    (def) => !def.platforms || def.platforms.includes(platform),
  );
  const modelVisibilityProviders = expandAgentToVisibilityProviders(agent);
  const hasSelectableModels = modelVisibilityProviders.length > 0;

  const missingAuthStatuses = installedStatuses.filter((status) => status.authState === "missing");
  const envVarAuthMethod =
    findEnvVarAuthMethod(installedStatuses) ?? findEnvVarAuthMethod(missingAuthStatuses);
  const agentAuthStatuses =
    missingAuthStatuses.length > 0 ? missingAuthStatuses : installedStatuses;
  const agentAuthEntries = agentAuthStatuses.flatMap((status) => {
    const method = status.authMethods?.find(isAgentAuthMethod);
    return method ? [{ status, method }] : [];
  });
  // Auth-method borrowing spans machines: an env that omitted its methods can
  // still offer the sign-in another machine's status advertised.
  const sharedAgentAuthMethod = findAgentAuthMethodInStatuses(installedAnywhere);
  const sharedTerminalAuthMethod = findTerminalAuthMethodInStatuses(installedAnywhere);
  const agentAuth =
    findAgentAuthMethod(agentAuthStatuses) ??
    (sharedAgentAuthMethod && installedStatuses.length > 0
      ? {
          status:
            agentAuthStatuses.find((status) => status.authMethods?.some(isAgentAuthMethod)) ??
            installedStatuses[0]!,
          method: sharedAgentAuthMethod,
        }
      : undefined);
  const loginStatus =
    findTerminalLoginStatus(installedStatuses) ??
    missingAuthStatuses.find((status) => status.loginCommand);
  const loginCommand = loginStatus?.loginCommand;
  const terminalLoginMethod = findTerminalAuthMethodForStatus(loginStatus);
  const acpInstanceId = extractAcpGenericInstanceId(agent.kind);
  // Native ACP adapters (copilot/gemini/cursor) and generic ACP instances all
  // speak the same `authenticate()` / `logout()` over the supervisor's
  // unified dispatcher. The settings UI lets the user drive a sign-in or
  // sign-out whenever the agent exposes a non-env-var auth method (the env-var
  // case is handled separately by the credential-save block).
  const supportsAcpAgentAuth =
    acpInstanceId !== undefined ||
    installedStatuses.some((status) => status.authMethods?.some(isAgentAuthMethod));
  const logoutStatuses = installedStatuses.filter(
    (status) =>
      status.authState === "authenticated" && supportsAcpLogoutStatus(status, acpInstanceId),
  );
  const requiredAuthVars = envVarAuthMethod?.vars.filter((variable) => variable.optional !== true);
  const canSaveEnvAuth =
    acpInstanceId !== undefined &&
    requiredAuthVars?.every((variable) => authValues[variable.name]?.trim()) === true;
  const saveEnvAuth = () => {
    if (!envVarAuthMethod || !acpInstanceId || !canSaveEnvAuth) return;
    const environment = Object.fromEntries(
      envVarAuthMethod.vars.flatMap((variable) => {
        const value = authValues[variable.name]?.trim();
        return value ? [[variable.name, value]] : [];
      }),
    );
    setAuthPending(true);
    readBridge()
      .setAcpRegistryAgentAuth({ agentId: acpInstanceId, environment })
      .then(() => readBridge().refreshAgentStatuses(wslDistros, { agentKinds: [props.agentKind] }))
      .then(() => {
        setAuthValues({});
        toast.success(t`${agent.label} credentials saved.`);
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error ? error.message : t`Unable to save ${agent.label} credentials.`,
        ),
      )
      .finally(() => setAuthPending(false));
  };
  const authenticateAgent = (auth = agentAuth) => {
    if (!auth || !supportsAcpAgentAuth) return;
    setAuthPending(true);
    setAuthPendingEnvKey(statusEnvKey(auth.status));
    const authEnv = envLabelForStatus(auth.status);
    const authMethodName = auth.method.name;
    setAuthPendingMessage(
      authEnv
        ? t`Waiting for ${authEnv} ${authMethodName} authentication. Detected agents will refresh when it finishes.`
        : t`Waiting for ${authMethodName} authentication. Detected agents will refresh when it finishes.`,
    );
    readBridge()
      .authenticateAcpAgent({
        agentKind: props.agentKind,
        methodId: auth.method.id,
        ...agentAuthTarget(auth.status),
      })
      .then(() => readBridge().focusWindow())
      .then(() =>
        readBridge().refreshAgentStatuses(wslDistros, {
          agentKinds: [props.agentKind],
          envs: [scopeEnvForStatus(auth.status)],
        }),
      )
      .then(() => toast.success(t`${agent.label} authenticated.`))
      .catch((error: unknown) =>
        toast.danger(
          error instanceof Error ? friendlyError(error) : t`Unable to authenticate ${agent.label}.`,
        ),
      )
      .finally(() => {
        setAuthPending(false);
        setAuthPendingMessage(undefined);
        setAuthPendingEnvKey(undefined);
      });
  };
  const runTerminalLogin = (status: AgentStatus, method: AgentTerminalAuthMethod | undefined) => {
    if (!status.loginCommand) return;
    const project = findProjectForStatus(status, projects);
    const env = envLabelForStatus(status);
    setAuthPending(true);
    setAuthPendingEnvKey(statusEnvKey(status));
    const methodName = method?.name ?? t`login`;
    setAuthPendingMessage(
      env
        ? t`Waiting for ${env} ${methodName} authentication. Detected agents will refresh when it finishes.`
        : t`Waiting for ${methodName} authentication. Detected agents will refresh when it finishes.`,
    );
    const opened = runAgentLoginCommand({
      label: status.label,
      command: status.loginCommand,
      ...(method?.env ? { env: method.env } : {}),
      ...(project ? { project } : {}),
      onCommandComplete: () => {
        setAuthPendingMessage(
          env
            ? t`Refreshing ${env} ${status.label} authentication status.`
            : t`Refreshing ${status.label} authentication status.`,
        );
        void readBridge()
          .refreshAgentStatuses(wslDistros, {
            agentKinds: [props.agentKind],
            envs: [scopeEnvForStatus(status)],
          })
          .catch((error) =>
            toast.danger(
              error instanceof Error ? error.message : t`Unable to refresh ${status.label} status.`,
            ),
          )
          .finally(() => {
            setAuthPending(false);
            setAuthPendingMessage(undefined);
            setAuthPendingEnvKey(undefined);
          });
      },
    });
    if (!opened) {
      setAuthPending(false);
      setAuthPendingMessage(undefined);
      setAuthPendingEnvKey(undefined);
    }
  };
  const logoutAgent = (status: AgentStatus) => {
    // Native ACP adapters only support sign-out when the agent itself
    // advertised logout support in its capability bag. acp-generic instances
    // always allow it because the local ack clear is what drives the UI state.
    if (!supportsAcpLogoutStatus(status, acpInstanceId)) return;
    const env = envLabelForStatus(status);
    setAuthPending(true);
    setAuthPendingEnvKey(statusEnvKey(status));
    setAuthPendingMessage(
      env
        ? t`Signing out ${env}. Detected agents will refresh when it finishes.`
        : t`Signing out. Detected agents will refresh when it finishes.`,
    );
    readBridge()
      .logoutAcpAgent({
        agentKind: props.agentKind,
        ...agentAuthTarget(status),
      })
      .then(() =>
        readBridge().refreshAgentStatuses(wslDistros, {
          agentKinds: [props.agentKind],
          envs: [scopeEnvForStatus(status)],
        }),
      )
      .then(() => toast.success(t`${agent.label} logged out.`))
      .catch((error: unknown) =>
        toast.danger(error instanceof Error ? error.message : t`Unable to log out ${agent.label}.`),
      )
      .finally(() => {
        setAuthPending(false);
        setAuthPendingMessage(undefined);
        setAuthPendingEnvKey(undefined);
      });
  };
  const hasAdvertisedAuthMethods = installedStatuses.some(
    (status) => (status.authMethods?.length ?? 0) > 0,
  );
  const hasAuthSettings =
    envVarAuthMethod !== undefined ||
    agentAuth !== undefined ||
    loginCommand !== undefined ||
    missingAuthStatuses.length > 0 ||
    logoutStatuses.length > 0 ||
    hasAdvertisedAuthMethods;
  const includeAuthFallbackMetadata = !hasAuthSettings;
  const authMissing = installedStatuses.some(statusNeedsInteractiveLogin);
  const missingAuthLabel = formatStatusList(missingAuthStatuses);
  const showEnvVarOnly = envVarAuthMethod !== undefined && !authMissing;
  // Interactive auth (browser/CLI sign-in) is per-env — Windows and each WSL
  // distro hold their own sessions. We split the auth panel into one row per
  // env so each shows its own state independently. Env-var credentials stay
  // shared (single block above the per-env rows).
  // Provider-level: whether *any* machine advertises an interactive sign-in,
  // so an env whose status omitted methods still renders its login row.
  const hasInteractiveAuth = installedAnywhere.some(hasInteractiveAuthMethods);
  // When env-var credentials already satisfy every env, the user is signed in
  // via the shared key — per-env Logout rows are misleading because there is
  // no per-env session to revoke. Show just the env-var block in that case.
  const envVarFullySatisfied =
    envVarAuthMethod !== undefined &&
    installedStatuses.length > 0 &&
    installedStatuses.every((status) => status.authState === "authenticated");
  const usePerEnvAuthRows = hasInteractiveAuth && !envVarFullySatisfied;
  const clearEnvVarCredentials = () => {
    if (!envVarAuthMethod || !acpInstanceId) return;
    const environment = Object.fromEntries(
      envVarAuthMethod.vars.map((variable) => [variable.name, ""]),
    );
    setAuthPending(true);
    readBridge()
      .setAcpRegistryAgentAuth({ agentId: acpInstanceId, environment })
      .then(() => readBridge().refreshAgentStatuses(wslDistros, { agentKinds: [props.agentKind] }))
      .then(() => {
        setAuthValues({});
        toast.success(t`${agent.label} credentials removed.`);
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error ? error.message : t`Unable to remove ${agent.label} credentials.`,
        ),
      )
      .finally(() => setAuthPending(false));
  };

  const installedVersion = installedRegistryRecord?.version ?? agent.version;
  const updateAvailable =
    acpInstanceId !== undefined &&
    latestRegistryVersion !== undefined &&
    installedVersion !== undefined &&
    isNewerVersion(latestRegistryVersion, installedVersion);
  const performUpdate = () => {
    if (!acpInstanceId || !updateAvailable) return;
    setUpdatePending(true);
    readBridge()
      .updateAcpRegistryAgent({ agentId: acpInstanceId })
      .then((result) => {
        syncInstalledAgents(result.installed);
      })
      .then(() => readBridge().refreshAgentStatuses(wslDistros, { agentKinds: [props.agentKind] }))
      .then(() => toast.success(t`${agent.label} updated to v${latestRegistryVersion}.`))
      .catch((error) =>
        toast.danger(error instanceof Error ? error.message : t`Unable to update ${agent.label}.`),
      )
      .finally(() => setUpdatePending(false));
  };

  const performBinaryUpdate = (status: AgentStatus) => {
    const scope = statusUpdateScope(status);
    const envKey = statusEnvKey(status);
    const envName = envLabelForStatus(status);
    const previousVersion = status.version;
    setBinaryUpdatePendingEnvKeys((current) => new Set(current).add(envKey));
    readBridge()
      .updateAgentBinary({
        agentKind: props.agentKind,
        envKind: scope.envKind,
        ...(scope.wslDistro ? { wslDistro: scope.wslDistro } : {}),
      })
      .then(async (result) => {
        if (result.ok) {
          setRedetectingEnvKeys((current) => new Set(current).add(envKey));
          try {
            await readBridge().refreshAgentStatuses(wslDistros, {
              agentKinds: [props.agentKind],
              envs: [scopeEnvForStatus(status)],
            });
          } finally {
            setRedetectingEnvKeys((current) => {
              const next = new Set(current);
              next.delete(envKey);
              return next;
            });
          }
          const store = useAgentStatusesStore.getState();
          const pool = status.envKind === "wsl" ? store.wslAgentStatuses : store.agentStatuses;
          const newVersion = pool.find(
            (entry) =>
              entry.kind === props.agentKind &&
              entry.envKind === status.envKind &&
              entry.envDistro === status.envDistro,
          )?.version;
          if (newVersion && newVersion === previousVersion) {
            toast.success(
              envName
                ? t`${agent.label} (${envName}) is already up to date.`
                : t`${agent.label} is already up to date.`,
            );
          } else if (newVersion) {
            toast.success(
              envName
                ? t`${agent.label} (${envName}) updated to v${newVersion}.`
                : t`${agent.label} updated to v${newVersion}.`,
            );
          } else {
            toast.success(
              envName ? t`${agent.label} (${envName}) updated.` : t`${agent.label} updated.`,
            );
          }
          return;
        }
        const detail = result.output?.trim();
        const detailText = detail ? detail.slice(0, 240) : "";
        toast.danger(
          detail
            ? envName
              ? t`Unable to update ${agent.label} (${envName}): ${detailText}`
              : t`Unable to update ${agent.label}: ${detailText}`
            : envName
              ? t`Unable to update ${agent.label} (${envName}).`
              : t`Unable to update ${agent.label}.`,
        );
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error
            ? error.message
            : envName
              ? t`Unable to update ${agent.label} (${envName}).`
              : t`Unable to update ${agent.label}.`,
        ),
      )
      .finally(() =>
        setBinaryUpdatePendingEnvKeys((current) => {
          const next = new Set(current);
          next.delete(envKey);
          return next;
        }),
      );
  };

  const installAgentInEnvironment = (status: AgentStatus) => {
    if (!nativeRegistryEntry) return;
    const envKey = statusEnvKey(status);
    const project = findProjectForStatus(status, projects);
    setInstallPendingEnvKey(envKey);
    const opened = runAgentInstallCommand({
      label: agent.label,
      command: nativeRegistryEntry.installCommand,
      ...(project ? { project } : {}),
      onCommandComplete: (exitCode) => {
        const clearPending = () =>
          setInstallPendingEnvKey((current) => (current === envKey ? undefined : current));
        if (exitCode !== 0) {
          clearPending();
          return;
        }
        void readBridge()
          .refreshAgentStatuses(wslDistros, {
            agentKinds: [props.agentKind],
            envs: [scopeEnvForStatus(status)],
          })
          .catch(() => undefined)
          .finally(clearPending);
      },
    });
    if (!opened) setInstallPendingEnvKey(undefined);
  };

  const renderInstalledEnvironmentRow = (status: AgentStatus) => {
    const envKey = statusEnvKey(status);
    const agentMethods =
      status.authMethods?.filter(isAgentAuthMethod) ??
      (sharedAgentAuthMethod ? [sharedAgentAuthMethod] : []);
    const terminalMethod = status.loginCommand
      ? (findTerminalAuthMethodForStatus(status) ??
        sharedTerminalAuthMethod ?? {
          id: "terminal-login",
          name: t`Login`,
          type: "terminal" as const,
        })
      : undefined;
    const methods: Array<AgentOwnedAuthMethod | AgentTerminalAuthMethod> =
      usePerEnvAuthRows && !isRemoteMachine
        ? shouldPreferTerminalLogin(status) && terminalMethod
          ? [terminalMethod]
          : agentMethods.length > 0
            ? agentMethods
            : terminalMethod
              ? [terminalMethod]
              : []
        : [];
    // Match against whichever identity the row actually displays, so the live
    // plan is only adopted when it belongs to that same account.
    const rowMetadata =
      providerAccount && status.authState === "authenticated"
        ? providerAccount
        : status.providerMetadata;
    return (
      <AgentEnvironmentRow
        key={`${status.kind}-${envKey}`}
        accountMetadata={providerAccount}
        acpInstanceId={acpInstanceId}
        agentLabel={agent.label}
        authMethods={methods}
        authPending={authPendingEnvKey === envKey}
        binaryUpdatePending={binaryUpdatePendingEnvKeys.has(envKey)}
        canLogout={!isRemoteMachine && supportsAcpLogoutStatus(status, acpInstanceId)}
        includeAuthFallback={includeAuthFallbackMetadata}
        isRedetecting={redetectingEnvKeys.has(envKey)}
        latestNpmVersion={
          isRemoteMachine || hasCombinedRuntimeUpdates ? undefined : latestNpmVersion
        }
        livePlan={resolveLivePlanLabel(rowMetadata, providerUsage)}
        newestInstalledVersion={hasCombinedRuntimeUpdates ? undefined : newestInstalledVersion}
        pendingMessage={authPendingEnvKey === envKey ? authPendingMessage : undefined}
        status={status}
        onLogin={(method) => {
          if (isAgentAuthMethod(method)) {
            authenticateAgent({ status, method });
            return;
          }
          runTerminalLogin(status, method);
        }}
        onLogout={() => logoutAgent(status)}
        onUpdate={() => performBinaryUpdate(status)}
      />
    );
  };

  const renderInstallableEnvironmentRow = (status: AgentStatus) => {
    const envKey = statusEnvKey(status);
    return (
      <AgentInstallEnvironmentRow
        key={`${status.kind}-${envKey}-install`}
        agentLabel={agent.label}
        installPending={installPendingEnvKey === envKey}
        status={status}
        onInstall={installAgentInEnvironment}
      />
    );
  };

  const environmentRows = (
    <>
      {machines.length > 1 ? (
        <MachineScopeHeading scope="machine" machineLabel={selectedMachine.label} />
      ) : null}
      {installedStatuses.map(renderInstalledEnvironmentRow)}
      {installableStatuses.map(renderInstallableEnvironmentRow)}
      {installedStatuses.length === 0 && installableStatuses.length === 0 ? (
        <NoMachineStatusRow
          machine={selectedMachine}
          agentKind={props.agentKind}
          wslDistros={wslDistros}
        />
      ) : null}
      {isRemoteMachine ? <RemoteMachineNotice machine={selectedMachine} /> : null}
      <MachineAttentionHint machineIds={othersNeedingAttention} machines={machines} />
    </>
  );
  // Panels that group several runtimes place these rows inside the runtime they
  // belong to, so leaving them above the panel would strand one runtime's setup
  // outside the grouping.
  const panelOwnsInstallRows =
    providerEntry?.settingsPanel !== undefined && providerEntry.ownsInstallRows === true;

  return (
    <div className="mx-auto max-w-[720px]">
      <div className={panelOwnsInstallRows ? "mb-2" : "mb-6"}>
        <AgentHeader
          agent={agent}
          isDisabled={isDisabled}
          updateAvailable={updateAvailable}
          updatePending={updatePending}
          latestRegistryVersion={latestRegistryVersion}
          toggleDisabled={
            binaryUpdatePendingEnvKeys.size > 0 ||
            combinedRuntimeEntries.some(({ entry }) => entry.pending)
          }
          wslDistros={wslDistros}
          onPerformUpdate={performUpdate}
          onSetAgentDisabled={setAgentDisabled}
        />

        {hasCombinedRuntimeUpdates && !isRemoteMachine ? (
          <Card className="mb-3 gap-2 rounded-xl border border-border bg-surface-secondary p-3 shadow-none">
            <Card.Header className="flex-row items-center justify-between gap-3 p-0">
              <Card.Title className="text-sm">
                <Trans>Runtime</Trans>
              </Card.Title>
            </Card.Header>
            <Card.Content className="flex flex-col gap-2 p-0">
              {combinedRuntimeEntries.map(({ status, entry }) =>
                entry.supported ? (
                  <div
                    key={statusEnvKey(status)}
                    className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-surface px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      {combinedRuntimeEntries.length > 1 ? (
                        <p className="mb-1 text-[11px] font-medium text-muted">
                          {envLabelForStatus(status)}
                        </p>
                      ) : null}
                      <CombinedRuntimeVersionList entry={entry} className="text-xs" />
                    </div>
                    {entry.updateAvailable ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 min-h-7 shrink-0 gap-1 px-2 text-[11px]"
                        isPending={entry.pending}
                        onPress={() => void combinedRuntimeUpdates.updateStatus(status)}
                      >
                        <ArrowUpCircle className="size-3" />
                        <Trans>Update</Trans>
                      </Button>
                    ) : null}
                  </div>
                ) : null,
              )}
            </Card.Content>
          </Card>
        ) : null}

        {panelOwnsInstallRows && !isRemoteMachine ? null : (
          <div className="space-y-0.5 border-t border-border/10 pt-3">{environmentRows}</div>
        )}
      </div>

      <div className="space-y-4">
        {providerEntry?.settingsPanel && !isRemoteMachine ? (
          <providerEntry.settingsPanel
            agentKind={props.agentKind}
            statuses={installedStatuses}
            wslDistros={wslDistros}
            onOpenProfile={props.onOpenProfile}
            {...(panelOwnsInstallRows ? { installRows: environmentRows } : {})}
          />
        ) : null}

        {/* Panels that own auth UI (e.g. OpenCode's per-AI-provider sign-in)
            make the generic single sign-in row redundant. */}
        {hasAuthSettings && !isRemoteMachine && providerEntry?.ownsAuthUi !== true && (
          <div className="space-y-2">
            {envVarAuthMethod && acpInstanceId ? (
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-secondary px-3 py-2 text-foreground">
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{envVarAuthMethod.name}</p>
                    <p className="text-xs text-muted">
                      <Trans>Saved credentials are shared across all machines.</Trans>
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      {envVarAuthMethod.vars.map((variable) => {
                        const hasAuthValue = Object.prototype.hasOwnProperty.call(
                          authValues,
                          variable.name,
                        );
                        const allEnvVarSaved =
                          missingAuthStatuses.length === 0 && installedStatuses.length > 0;
                        return (
                          <Input
                            key={variable.name}
                            aria-label={variable.label ?? variable.name}
                            className="w-full"
                            placeholder={variable.label ?? variable.name}
                            type={
                              variable.secret === false || (!hasAuthValue && allEnvVarSaved)
                                ? "text"
                                : "password"
                            }
                            value={
                              hasAuthValue
                                ? (authValues[variable.name] ?? "")
                                : allEnvVarSaved
                                  ? SAVED_CREDENTIAL_MASK
                                  : ""
                            }
                            onFocus={() => {
                              if (allEnvVarSaved && !hasAuthValue) {
                                setAuthValues((current) => ({
                                  ...current,
                                  [variable.name]: "",
                                }));
                              }
                            }}
                            onBlur={(event) => {
                              if (!allEnvVarSaved) return;
                              if (
                                event.relatedTarget instanceof HTMLElement &&
                                event.relatedTarget.closest("[data-acp-auth-save]")
                              ) {
                                return;
                              }
                              setAuthValues((current) => {
                                if (!Object.prototype.hasOwnProperty.call(current, variable.name)) {
                                  return current;
                                }
                                const next = { ...current };
                                delete next[variable.name];
                                return next;
                              });
                            }}
                            onChange={(event) =>
                              setAuthValues((current) => ({
                                ...current,
                                [variable.name]: event.target.value,
                              }))
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-row items-center gap-2">
                  <Button
                    size="sm"
                    variant="tertiary"
                    isIconOnly
                    aria-label={t`Save`}
                    isDisabled={!canSaveEnvAuth}
                    isPending={authPending}
                    data-acp-auth-save=""
                    onPress={saveEnvAuth}
                  >
                    <Save className="size-4" />
                  </Button>
                  {!usePerEnvAuthRows && (
                    <Button
                      size="sm"
                      variant="tertiary"
                      isIconOnly
                      aria-label={t`Logout`}
                      isPending={authPending}
                      onPress={clearEnvVarCredentials}
                    >
                      <LogOut className="size-4 text-danger" />
                    </Button>
                  )}
                </div>
              </div>
            ) : null}

            {!usePerEnvAuthRows &&
            !showEnvVarOnly &&
            (agentAuth || loginStatus || logoutStatuses.length > 0) ? (
              <div className="flex items-start justify-between gap-4 py-1">
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${authMissing ? "text-warning" : ""}`}>
                      {authMissing ? (
                        <AlertTriangle className="mr-1.5 inline size-4 -translate-y-px text-warning" />
                      ) : null}
                      {authMissing ? t`Login required` : t`Authentication`}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {authPendingMessage ??
                        (authMissing
                          ? `${missingAuthLabel ? `${t`${missingAuthLabel} needs authentication.`} ` : ""}${
                              envVarAuthMethod
                                ? agentAuth
                                  ? t`Complete ${agentAuth.method.name} sign-in or save ${envVarAuthMethod.name} credentials.`
                                  : t`Save ${envVarAuthMethod.name} credentials.`
                                : agentAuth
                                  ? t`Complete ${agentAuth.method.name} sign-in.`
                                  : loginCommand
                                    ? t`Run ${loginCommand} to sign in.`
                                    : t`Sign in with the agent CLI.`
                            }`
                          : t`Credentials are configured.`)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {agentAuth && supportsAcpAgentAuth ? (
                    (agentAuthEntries.length > 0 ? agentAuthEntries : [agentAuth]).map(
                      (entry, index) => (
                        <Button
                          key={`${entry.status.kind}-${entry.status.envKind ?? "native"}-${entry.status.envDistro ?? index}`}
                          size="sm"
                          variant="tertiary"
                          className="h-7 min-h-7 gap-1 px-2 text-[11px]"
                          isPending={authPending}
                          onPress={() => authenticateAgent(entry)}
                        >
                          <LogIn className="size-3" />
                          {authMissing ? t`Login` : t`Re-login`}
                        </Button>
                      ),
                    )
                  ) : loginStatus && loginCommand ? (
                    <Button
                      size="sm"
                      variant="tertiary"
                      className="h-7 min-h-7 gap-1 px-2 text-[11px]"
                      onPress={() => runTerminalLogin(loginStatus, terminalLoginMethod)}
                    >
                      <LogIn className="size-3" />
                      {authMissing ? t`Login` : t`Re-login`}
                    </Button>
                  ) : null}
                  {logoutStatuses.map((status, index) => (
                    <Button
                      key={`${status.kind}-${status.envKind ?? "native"}-${status.envDistro ?? index}-logout`}
                      size="sm"
                      variant="tertiary"
                      className="h-7 min-h-7 gap-1 px-2 text-[11px]"
                      isPending={authPending}
                      onPress={() => logoutAgent(status)}
                    >
                      <LogOut className="size-3 text-danger" />
                      <Trans>Logout</Trans>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className={`transition-opacity ${isDisabled ? "pointer-events-none opacity-40" : ""}`}>
        {machines.length > 1 && (defs.length > 0 || hasSelectableModels) ? (
          <div className="mt-6">
            <MachineScopeHeading scope="all" />
          </div>
        ) : null}
        {defs.length > 0 && (
          <div className="mt-6">
            {defs.map((def) => (
              <AgentSettingRow key={def.key} agentKind={agent.kind} def={def} />
            ))}
          </div>
        )}

        {hasSelectableModels && (
          <div className="mt-6">
            {modelVisibilityProviders.map((provider) => (
              <ModelVisibilityDropdown
                key={providerMenuKey(provider)}
                settingsKey={providerVisibilityKey(provider)}
                provider={provider}
                showProviderLabel={modelVisibilityProviders.length > 1}
              />
            ))}
          </div>
        )}
      </div>

      {isCursorProfileKind(agent.kind) || isRemoteMachine ? null : (
        <HookPluginSettings
          agentKind={agent.kind}
          agentLabel={agent.label}
          statuses={installedStatuses}
        />
      )}
    </div>
  );
}

export function AgentSettingsEmpty() {
  const { t } = useLingui();
  return (
    <SettingsPage title={t`Agents`} bodyClassName="">
      <p className="text-sm text-muted">
        <Trans>No agents installed.</Trans>
      </p>
    </SettingsPage>
  );
}
