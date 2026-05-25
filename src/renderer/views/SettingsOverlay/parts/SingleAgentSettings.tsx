import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { Button, Popover, Switch, Tooltip, toast } from "@heroui/react";
import {
  AlertTriangle,
  ArrowUpCircle,
  Check,
  Download,
  LogIn,
  LogOut,
  Minus,
  Save,
  Search,
} from "lucide-react";
import {
  formatUpdateCommandLine,
  isNewerVersion,
  resolveSharedUpdateCommand,
} from "@/shared/agents/updateResolver";
import type {
  AgentEnvVarAuthMethod,
  AgentOwnedAuthMethod,
  AgentSettingDef,
  AgentStatus,
  AgentTerminalAuthMethod,
} from "@/shared/contracts";
import { runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { readBridge } from "@/renderer/bridge";
import {
  acpGenericInstanceId,
  agentAuthTarget,
  envLabelForStatus,
  findAgentAuthMethodInStatuses,
  findProjectForStatus,
  findTerminalAuthMethodForStatus,
  findTerminalAuthMethodInStatuses,
  isAgentAuthMethod,
  isEnvVarAuthMethod,
  isTerminalAuthMethod,
  scopeEnvForStatus,
  statusUpdateScope,
} from "@/renderer/utils/acpRegistryAuth";
import { Input, PixelLoader, Select } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  buildProviderModelItems,
  statusToMenuProvider,
  type ProviderModelItem,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu";

const SAVED_SECRET_MASK = "***********";

function AgentSettingRow(props: { agentKind: string; def: AgentSettingDef }) {
  const { agentKind, def } = props;
  const value = useSharedSettings((s) => s.agentSettings[agentKind]?.[def.key] ?? def.default);
  const setAgentSetting = useSharedSettings((s) => s.setAgentSetting);

  if (def.type !== "toggle" && def.type !== "select") return null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{def.label}</p>
        <p className="text-xs text-muted">{def.description}</p>
      </div>
      {def.type === "toggle" ? (
        <Switch
          isSelected={value as boolean}
          onChange={(selected) => {
            startTransition(() => {
              setAgentSetting(agentKind, def.key, selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      ) : (
        <Select
          aria-label={def.label}
          className="w-[160px] shrink-0"
          options={def.options}
          value={String(value)}
          onChange={(v) => {
            startTransition(() => {
              setAgentSetting(agentKind, def.key, v);
            });
          }}
        />
      )}
    </div>
  );
}

function ModelVisibilityDropdown(props: {
  agentKind: string;
  provider: ProviderModelMenuProvider;
}) {
  const { agentKind, provider } = props;
  const hiddenIds = useSharedSettings((s) => s.hiddenModels[agentKind]);
  const setHiddenModels = useSharedSettings((s) => s.setHiddenModels);

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const allModels = provider.capabilities.models.filter((m) => m.id !== "auto");
  const totalCount = allModels.length;
  const hiddenSet = new Set(hiddenIds ?? []);
  const visibleCount = totalCount - allModels.filter((m) => hiddenSet.has(m.id)).length;

  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  const items = isOpen
    ? buildProviderModelItems({
        providers: [provider],
        search: deferredSearch,
      }).filter((item) => !(item.type === "model" && item.modelId === "auto"))
    : [];

  type SubGroupState = "all" | "some" | "none";
  const subGroupModelIds = new Map<string, string[]>();
  let activeSubHeaderId: string | null = null;
  for (const item of items) {
    if (item.type === "header-sub") {
      activeSubHeaderId = item.id;
      if (!subGroupModelIds.has(item.id)) subGroupModelIds.set(item.id, []);
    } else if (item.type === "header-plain" || item.type === "header-provider") {
      activeSubHeaderId = null;
    } else if (item.type === "model" && activeSubHeaderId) {
      subGroupModelIds.get(activeSubHeaderId)?.push(item.modelId);
    }
  }
  const subGroupStates = new Map<string, SubGroupState>();
  for (const [headerId, modelIds] of subGroupModelIds) {
    const hiddenInGroup = modelIds.filter((id) => hiddenSet.has(id)).length;
    const state: SubGroupState =
      hiddenInGroup === 0 ? "all" : hiddenInGroup === modelIds.length ? "none" : "some";
    subGroupStates.set(headerId, state);
  }

  function toggleModel(modelId: string) {
    const next = new Set(hiddenSet);
    if (next.has(modelId)) next.delete(modelId);
    else next.add(modelId);
    setHiddenModels(agentKind, [...next]);
  }

  function toggleSubGroup(headerId: string) {
    const modelIds = subGroupModelIds.get(headerId);
    if (!modelIds || modelIds.length === 0) return;
    const state = subGroupStates.get(headerId) ?? "all";
    // all → none; some/none → all
    const nextHidden = state === "all";
    const next = new Set(hiddenSet);
    for (const id of modelIds) {
      if (nextHidden) next.add(id);
      else next.delete(id);
    }
    setHiddenModels(agentKind, [...next]);
  }

  function setAllHidden(hideAll: boolean) {
    setHiddenModels(agentKind, hideAll ? allModels.map((m) => m.id) : []);
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Visible models</p>
        <p className="text-xs text-muted">Toggle models off to hide them from the selector.</p>
      </div>
      <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger>
          <Button variant="secondary" size="sm" className="min-w-[4.5rem] tabular-nums">
            {visibleCount} / {totalCount}
          </Button>
        </Popover.Trigger>
        <Popover.Content placement="bottom end" className="w-80 p-0">
          <Popover.Dialog className="flex max-h-[28rem] flex-col overflow-hidden !p-0">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted" />
              <input
                aria-label="Search models"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
                placeholder="Search models..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted/80">
              <span className="tabular-nums">
                {visibleCount} of {totalCount} visible
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-foreground/70 hover:text-foreground"
                  onClick={() => setAllHidden(false)}
                >
                  Show all
                </button>
                <span className="text-muted/40">·</span>
                <button
                  type="button"
                  className="text-foreground/70 hover:text-foreground"
                  onClick={() => setAllHidden(true)}
                >
                  Hide all
                </button>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="px-3 py-3 text-center text-sm text-muted">No models found</div>
            ) : (
              <div
                role="listbox"
                aria-label="Visible models"
                aria-multiselectable="true"
                className="lightcode-menu no-scrollbar max-h-[22rem] overflow-y-auto py-1.5"
              >
                {items.map((item) => (
                  <ModelVisibilityRow
                    key={item.id}
                    item={item}
                    isVisible={item.type === "model" ? !hiddenSet.has(item.modelId) : false}
                    {...(item.type === "header-sub"
                      ? { subGroupState: subGroupStates.get(item.id) ?? "all" }
                      : {})}
                    onToggle={toggleModel}
                    onToggleSubGroup={toggleSubGroup}
                  />
                ))}
              </div>
            )}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}

function ModelVisibilityRow(props: {
  item: ProviderModelItem;
  isVisible: boolean;
  subGroupState?: "all" | "some" | "none";
  onToggle: (modelId: string) => void;
  onToggleSubGroup?: (headerId: string) => void;
}) {
  const { item, isVisible, subGroupState, onToggle, onToggleSubGroup } = props;

  if (item.type === "header-sub") {
    const state = subGroupState ?? "all";
    const handleToggle = () => onToggleSubGroup?.(item.id);
    const checkClass =
      state === "all"
        ? "opacity-100 text-foreground"
        : state === "some"
          ? "opacity-100 text-foreground"
          : "opacity-0";
    return (
      <div
        role="option"
        aria-selected={state === "all"}
        aria-checked={state === "all" ? "true" : state === "none" ? "false" : "mixed"}
        tabIndex={0}
        className="lightcode-menu-item group mx-1.5 mb-1 flex h-7 cursor-default items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80"
        onClick={handleToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleToggle();
          }
        }}
      >
        {state === "some" ? (
          <Minus className={`size-3 shrink-0 transition-opacity ${checkClass}`} />
        ) : (
          <Check className={`size-3 shrink-0 transition-opacity ${checkClass}`} />
        )}
        <span className="ml-1 min-w-0 truncate">{item.label}</span>
      </div>
    );
  }
  if (item.type === "header-plain") {
    return (
      <div
        role="presentation"
        className="mx-1.5 mb-1 flex h-7 items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80"
      >
        {item.label}
      </div>
    );
  }
  if (item.type === "header-provider") {
    return (
      <div
        role="presentation"
        className="mx-1.5 mb-1 flex h-7 items-center gap-1.5 border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80"
      >
        <ProviderIcon
          kind={item.providerKind}
          {...(item.providerIcon ? { icon: item.providerIcon } : {})}
          tone="active"
          className="size-3"
        />
        <span className="min-w-0 truncate">{item.label}</span>
      </div>
    );
  }

  const labelParts = item.label.split(" · ");
  const name = labelParts[0] ?? item.label;
  const hint = labelParts.length > 1 ? labelParts.slice(1).join(" · ") : undefined;
  const mutedHint = [hint, item.contextDescription].filter(Boolean).join(" · ");

  return (
    <div
      role="option"
      aria-selected={isVisible}
      tabIndex={0}
      className="lightcode-menu-item group mx-1.5 flex h-7 cursor-default items-center text-foreground"
      onClick={() => onToggle(item.modelId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(item.modelId);
        }
      }}
    >
      <Check
        className={`size-3 shrink-0 transition-opacity ${isVisible ? "opacity-100" : "opacity-0"}`}
      />
      <span className="ml-1 flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate">{name}</span>
        {mutedHint ? (
          <span className="shrink-0 text-[10px] leading-none text-muted/60">· {mutedHint}</span>
        ) : null}
      </span>
      {item.subProviderLabel ? (
        <span className="ml-auto shrink-0 truncate text-[10px] text-muted/70">
          {item.subProviderLabel}
        </span>
      ) : null}
    </div>
  );
}

const envLabel = envLabelForStatus;

function formatAgentMetadataSummary(
  status: AgentStatus,
  options?: { includeAuthFallback?: boolean },
): string | undefined {
  const metadata = status.providerMetadata;
  const identityParts: string[] = [];
  if (metadata?.authenticatedAs) identityParts.push(metadata.authenticatedAs);
  if (metadata?.organization) identityParts.push(metadata.organization);
  if (metadata?.plan) identityParts.push(metadata.plan);

  if (identityParts.length > 0) return identityParts.join(" · ");

  const providers = metadata?.connectedProviders ?? [];
  if (providers.length > 0) {
    const labels = providers.map((p) => p.label).join(", ");
    const noun = providers.length === 1 ? "provider" : "providers";
    return `${providers.length} ${noun} · ${labels}`;
  }

  if (options?.includeAuthFallback === false) return undefined;
  if (metadata?.authMethod) return `via ${metadata.authMethod}`;
  if (status.authState === "authenticated") return "Signed in";
  return undefined;
}

function AgentMetadataLine(props: {
  status: AgentStatus;
  showEnvironmentLabel: boolean;
  includeAuthFallback: boolean;
}) {
  const summary = formatAgentMetadataSummary(props.status, {
    includeAuthFallback: props.includeAuthFallback,
  });
  if (!summary) return null;
  const prefix = props.showEnvironmentLabel ? `${envLabel(props.status)} · ` : "";
  return <p className="truncate text-xs text-muted">{`${prefix}${summary}`}</p>;
}

function formatStatusList(statuses: readonly AgentStatus[]): string {
  return statuses
    .map((status) => envLabel(status))
    .filter((label) => label.length > 0)
    .join(", ");
}

const findProjectForAgentStatus = findProjectForStatus;

function findEnvVarAuthMethod(statuses: readonly AgentStatus[]): AgentEnvVarAuthMethod | undefined {
  for (const status of statuses) {
    const method = status.authMethods?.find(isEnvVarAuthMethod);
    if (method) return method;
  }
  return undefined;
}

function findAgentAuthMethod(
  statuses: readonly AgentStatus[],
): { status: AgentStatus; method: AgentOwnedAuthMethod } | undefined {
  for (const status of statuses) {
    const method = status.authMethods?.find(isAgentAuthMethod);
    if (method) return { status, method };
  }
  return undefined;
}

function findTerminalLoginStatus(statuses: readonly AgentStatus[]): AgentStatus | undefined {
  return statuses.find(
    (status) => status.loginCommand && status.authMethods?.some(isTerminalAuthMethod),
  );
}

function statusEnvKey(status: AgentStatus): string {
  return status.envKind === "wsl" && status.envDistro ? `wsl:${status.envDistro}` : "native";
}

function supportsAcpLogoutStatus(status: AgentStatus, acpInstanceId: string | undefined): boolean {
  return status.authLogoutSupported === true || acpInstanceId !== undefined;
}

function AcpAgentAuthEnvRow(props: {
  status: AgentStatus;
  authMethods: ReadonlyArray<AgentOwnedAuthMethod | AgentTerminalAuthMethod>;
  canLogout: boolean;
  authPending: boolean;
  pendingMessage: string | undefined;
  showEnvironmentLabel: boolean;
  onLogin: (method: AgentOwnedAuthMethod | AgentTerminalAuthMethod) => void;
  onLogout: () => void;
}) {
  const { status, authMethods, showEnvironmentLabel } = props;
  const hasAnyMethod = authMethods.length > 0;
  const isAuthenticated = status.authState === "authenticated";
  const isMissing =
    status.authState === "missing" || (status.authState === "unknown" && hasAnyMethod);
  const env = envLabel(status);
  const envSuffix = showEnvironmentLabel && env ? ` ${env}` : "";
  const envScope = env ? ` for ${env}` : "";
  const envSubject = env || "Agent";
  const canLogout = isAuthenticated && props.canLogout;
  const canReLogin = isAuthenticated && !canLogout && hasAnyMethod;
  const canLogin = (isMissing || canReLogin) && hasAnyMethod;
  const loginLabel = canReLogin ? "Re-login" : "Login";
  const pendingLabel = canLogout ? "Logging out" : "Logging in";
  const headerLabel = isMissing
    ? "Login required"
    : isAuthenticated
      ? "Signed in"
      : "Authentication";
  const headerPrefix = env ? `${env} · ` : "";
  const hasMultipleMethods = authMethods.length > 1;
  const singleMethod = !hasMultipleMethods ? authMethods[0] : undefined;
  const description = isMissing
    ? hasMultipleMethods
      ? `Choose how to sign in${envScope}.`
      : singleMethod
        ? `Complete ${singleMethod.name} sign-in${envScope}.`
        : `${envSubject} needs authentication.`
    : isAuthenticated
      ? `${envSubject} credentials are configured.`
      : "";
  const detail = props.pendingMessage ?? description;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${isMissing ? "text-warning" : ""}`}>
            {isMissing ? (
              <AlertTriangle className="mr-1.5 inline size-4 -translate-y-px text-warning" />
            ) : null}
            {headerPrefix}
            {headerLabel}
          </p>
          {detail ? <p className="text-xs text-muted">{detail}</p> : null}
        </div>
      </div>
      {canLogin || canLogout ? (
        <div className="flex shrink-0 flex-row items-center gap-2">
          {props.authPending ? (
            <div
              className="flex h-8 w-8 items-center justify-center"
              role="status"
              aria-label={pendingLabel}
            >
              <PixelLoader size="xs" />
            </div>
          ) : (
            <>
              {canLogin && hasMultipleMethods
                ? authMethods.map((method) => (
                    <Button
                      key={method.id}
                      size="sm"
                      variant="tertiary"
                      aria-label={`${loginLabel} ${method.name}${envSuffix}`}
                      onPress={() => props.onLogin(method)}
                    >
                      <LogIn className="size-4" />
                      {method.name}
                    </Button>
                  ))
                : null}
              {canLogin && !hasMultipleMethods && singleMethod ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  isIconOnly
                  aria-label={`${loginLabel}${envSuffix}`}
                  onPress={() => props.onLogin(singleMethod)}
                >
                  <LogIn className="size-4" />
                </Button>
              ) : null}
              {canLogout ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  isIconOnly
                  aria-label={`Logout${envSuffix}`}
                  onPress={props.onLogout}
                >
                  <LogOut className="size-4 text-danger" />
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SingleAgentSettings(props: { agentKind: string }) {
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
  const [updatePending, setUpdatePending] = useState(false);
  const [binaryUpdatePendingEnvKey, setBinaryUpdatePendingEnvKey] = useState<string | undefined>();
  // After a successful update we hide the stale version and show a loader on
  // that row until `refreshAgentStatuses` returns with the freshly-detected
  // version. Without this the user sees "vOld" alongside the success toast and
  // assumes the update silently failed.
  const [redetectingEnvKey, setRedetectingEnvKey] = useState<string | undefined>();
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const projects = useAppStore((state) => state.projects);
  const wslProjectDistrosKey = buildWslProjectDistrosKey(projects);
  const platform = navigator.platform.toLowerCase().includes("win") ? "win32" : "posix";
  const installedHere = agentStatuses.filter((a) => a.kind === props.agentKind && a.installed);
  const installedWsl = wslAgentStatuses.filter((a) => a.kind === props.agentKind && a.installed);
  const installedStatuses = [...installedHere, ...installedWsl];
  const agent = installedHere[0] ?? installedWsl[0];
  const isDisabled = useSharedSettings((s) => s.disabledAgents.includes(props.agentKind));
  const setAgentDisabled = useSharedSettings((s) => s.setAgentDisabled);
  const installedRegistryRecord = useSharedSettings(
    (s) => s.acpRegistryInstalledAgents[acpGenericInstanceId(props.agentKind) ?? ""],
  );
  const syncInstalledAgents = useSharedSettings((s) => s.syncAcpRegistryInstalledAgents);
  const wslDistros = wslProjectDistrosKey ? wslProjectDistrosKey.split("\0") : [];

  const registryAgentId = acpGenericInstanceId(props.agentKind);
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
  const newestInstalledVersion = installedStatuses.reduce<string | undefined>((latest, status) => {
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
    if (registryAgentId) return;
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
  }, [props.agentKind, registryAgentId]);

  if (!agent) {
    return (
      <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
        <div className="mx-auto max-w-[720px]">
          <h1 className="mb-6 text-lg font-semibold text-foreground">Agent not found</h1>
          <p className="text-sm text-muted">This agent is not installed.</p>
        </div>
      </div>
    );
  }

  const defs = (agent.capabilities.settingDefs ?? []).filter(
    (def) => !def.platforms || def.platforms.includes(platform),
  );
  const hasSelectableModels = agent.capabilities.models.some((m) => m.id !== "auto");
  const menuProvider = statusToMenuProvider(agent);

  const versionRows: { label: string; status: AgentStatus }[] = [];
  if (platform === "win32") {
    for (const s of installedHere) versionRows.push({ label: envLabel(s), status: s });
    for (const s of installedWsl) versionRows.push({ label: envLabel(s), status: s });
  } else {
    for (const s of installedHere)
      versionRows.push({ label: envLabel(s) || "Installed", status: s });
  }
  const showEnvironmentMetadataLabels = installedStatuses.length > 1;
  const missingAuthStatuses = installedStatuses.filter((status) => status.authState === "missing");
  const envVarAuthMethod =
    findEnvVarAuthMethod(installedStatuses) ?? findEnvVarAuthMethod(missingAuthStatuses);
  const agentAuthStatuses =
    missingAuthStatuses.length > 0 ? missingAuthStatuses : installedStatuses;
  const agentAuthEntries = agentAuthStatuses.flatMap((status) => {
    const method = status.authMethods?.find(isAgentAuthMethod);
    return method ? [{ status, method }] : [];
  });
  const sharedAgentAuthMethod = findAgentAuthMethodInStatuses(installedStatuses);
  const sharedTerminalAuthMethod = findTerminalAuthMethodInStatuses(installedStatuses);
  const agentAuth =
    findAgentAuthMethod(agentAuthStatuses) ??
    (sharedAgentAuthMethod
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
  const acpInstanceId = acpGenericInstanceId(agent.kind);
  // Native ACP adapters (copilot/gemini/cursor) and generic ACP instances all
  // speak the same `authenticate()` / `unstable_logout()` over the supervisor's
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
        toast.success(`${agent.label} credentials saved.`);
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error ? error.message : `Unable to save ${agent.label} credentials.`,
        ),
      )
      .finally(() => setAuthPending(false));
  };
  const authenticateAgent = (auth = agentAuth) => {
    if (!auth || !supportsAcpAgentAuth) return;
    setAuthPending(true);
    setAuthPendingEnvKey(statusEnvKey(auth.status));
    setAuthPendingMessage(
      `Waiting for ${envLabel(auth.status) ? `${envLabel(auth.status)} ` : ""}${auth.method.name} authentication. Detected agents will refresh when it finishes.`,
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
      .then(() => toast.success(`${agent.label} authenticated.`))
      .catch((error: unknown) =>
        toast.danger(
          error instanceof Error ? error.message : `Unable to authenticate ${agent.label}.`,
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
    const project = findProjectForAgentStatus(status, projects);
    const env = envLabel(status);
    setAuthPending(true);
    setAuthPendingEnvKey(statusEnvKey(status));
    setAuthPendingMessage(
      `Waiting for ${env ? `${env} ` : ""}${method?.name ?? "login"} authentication. Detected agents will refresh when it finishes.`,
    );
    const opened = runAgentLoginCommand({
      label: status.label,
      command: status.loginCommand,
      ...(method?.env ? { env: method.env } : {}),
      ...(project ? { project } : {}),
      onCommandComplete: (exitCode) => {
        if (exitCode !== 0) {
          setAuthPending(false);
          setAuthPendingMessage(undefined);
          setAuthPendingEnvKey(undefined);
          return;
        }
        setAuthPendingMessage(
          `Refreshing ${env ? `${env} ` : ""}${status.label} authentication status.`,
        );
        void readBridge()
          .refreshAgentStatuses(wslDistros, {
            agentKinds: [props.agentKind],
            envs: [scopeEnvForStatus(status)],
          })
          .catch((error) =>
            toast.danger(
              error instanceof Error ? error.message : `Unable to refresh ${status.label} status.`,
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
    // advertised `unstable_logout` in its capability bag. acp-generic instances
    // always allow it because the local ack clear is what drives the UI state.
    if (!supportsAcpLogoutStatus(status, acpInstanceId)) return;
    const env = envLabel(status);
    setAuthPending(true);
    setAuthPendingEnvKey(statusEnvKey(status));
    setAuthPendingMessage(
      `Signing out${env ? ` ${env}` : ""}. Detected agents will refresh when it finishes.`,
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
      .then(() => toast.success(`${agent.label} logged out.`))
      .catch((error: unknown) =>
        toast.danger(error instanceof Error ? error.message : `Unable to log out ${agent.label}.`),
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
  const metadataStatuses = installedStatuses.filter(
    (status) =>
      formatAgentMetadataSummary(status, {
        includeAuthFallback: includeAuthFallbackMetadata,
      }) !== undefined,
  );
  const authMissing =
    missingAuthStatuses.length > 0 ||
    (hasAdvertisedAuthMethods &&
      !installedStatuses.some((status) => status.authState === "authenticated"));
  const missingAuthLabel = formatStatusList(missingAuthStatuses);
  const showAuthEnvironmentLabels = installedStatuses.length > 1;
  const showEnvVarOnly = envVarAuthMethod !== undefined && !authMissing;
  // Interactive auth (browser/CLI sign-in) is per-env — Windows and each WSL
  // distro hold their own sessions. We split the auth panel into one row per
  // env so each shows its own state independently. Env-var credentials stay
  // shared (single block above the per-env rows).
  const hasInteractiveAuth = installedStatuses.some((status) =>
    status.authMethods?.some((method) => isAgentAuthMethod(method) || method.type === "terminal"),
  );
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
        toast.success(`${agent.label} credentials removed.`);
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error ? error.message : `Unable to remove ${agent.label} credentials.`,
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
      .then(() => toast.success(`${agent.label} updated to v${latestRegistryVersion}.`))
      .catch((error) =>
        toast.danger(error instanceof Error ? error.message : `Unable to update ${agent.label}.`),
      )
      .finally(() => setUpdatePending(false));
  };

  const performBinaryUpdate = (status: AgentStatus) => {
    const scope = statusUpdateScope(status);
    const envKey = statusEnvKey(status);
    const envSuffix = envLabel(status) ? ` (${envLabel(status)})` : "";
    const previousVersion = status.version;
    setBinaryUpdatePendingEnvKey(envKey);
    readBridge()
      .updateAgentBinary({
        agentKind: props.agentKind,
        envKind: scope.envKind,
        ...(scope.wslDistro ? { wslDistro: scope.wslDistro } : {}),
      })
      .then(async (result) => {
        if (result.ok) {
          // Switch the row to a loader while we wait for the supervisor to
          // re-detect the new installed version. The store updates via the
          // `agent-status-updated` events emitted during refresh; once the row
          // re-renders with the fresh version, we clear the loader.
          setRedetectingEnvKey(envKey);
          try {
            await readBridge().refreshAgentStatuses(wslDistros, {
              agentKinds: [props.agentKind],
              envs: [scopeEnvForStatus(status)],
            });
          } finally {
            setRedetectingEnvKey(undefined);
          }
          // Many built-in updaters exit 0 even when there's nothing to do.
          // Compare the freshly-detected version to the pre-update value so
          // the toast reflects what actually happened.
          const store = useAgentStatusesStore.getState();
          const pool = status.envKind === "wsl" ? store.wslAgentStatuses : store.agentStatuses;
          const newVersion = pool.find(
            (entry) =>
              entry.kind === props.agentKind &&
              entry.envKind === status.envKind &&
              entry.envDistro === status.envDistro,
          )?.version;
          if (newVersion && newVersion === previousVersion) {
            toast.success(`${agent.label}${envSuffix} is already up to date.`);
          } else if (newVersion) {
            toast.success(`${agent.label}${envSuffix} updated to v${newVersion}.`);
          } else {
            toast.success(`${agent.label}${envSuffix} updated.`);
          }
          return;
        }
        const detail = result.output?.trim();
        toast.danger(
          detail
            ? `Unable to update ${agent.label}${envSuffix}: ${detail.slice(0, 240)}`
            : `Unable to update ${agent.label}${envSuffix}.`,
        );
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error ? error.message : `Unable to update ${agent.label}${envSuffix}.`,
        ),
      )
      .finally(() => setBinaryUpdatePendingEnvKey(undefined));
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <ProviderIcon
              kind={agent.kind}
              icon={agent.icon}
              fallbackLabel={agent.label}
              className="size-5"
            />
            <h1 className="text-lg font-semibold text-foreground">{agent.label}</h1>
            {updateAvailable ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 min-h-6 gap-1 px-2 text-[11px]"
                isPending={updatePending}
                onPress={performUpdate}
              >
                <ArrowUpCircle className="size-3" />
                Update to v{latestRegistryVersion}
              </Button>
            ) : null}
          </div>
          {versionRows.length > 0 ? (
            <div className="mt-1 space-y-0.5">
              {versionRows.map((row, i) => {
                const envKey = statusEnvKey(row.status);
                const isPending = binaryUpdatePendingEnvKey === envKey;
                const installedVer = row.status.version;
                const isRedetecting = redetectingEnvKey === envKey;
                const registryTargetVersion =
                  latestNpmVersion !== undefined &&
                  installedVer !== undefined &&
                  isNewerVersion(latestNpmVersion, installedVer)
                    ? latestNpmVersion
                    : undefined;
                const peerTargetVersion =
                  newestInstalledVersion !== undefined &&
                  installedVer !== undefined &&
                  isNewerVersion(newestInstalledVersion, installedVer)
                    ? newestInstalledVersion
                    : undefined;
                const targetVersion = registryTargetVersion ?? peerTargetVersion;
                const updateLabel = targetVersion ? `Update to v${targetVersion}` : "";
                const showUpdateButton =
                  !isRedetecting &&
                  acpInstanceId === undefined &&
                  row.status.installed &&
                  targetVersion !== undefined;
                // Resolve the update command client-side from the same shared
                // module the supervisor uses, so the tooltip always has the
                // exact command we're about to run — no extra IPC roundtrip
                // and no stale-supervisor edge case.
                const previewScope = statusUpdateScope(row.status);
                const previewCommand = showUpdateButton
                  ? resolveSharedUpdateCommand({
                      update: row.status.update,
                      executablePath: row.status.executablePath,
                      envKind: previewScope.envKind,
                    })
                  : undefined;
                const previewCommandLine = previewCommand
                  ? formatUpdateCommandLine(previewCommand)
                  : undefined;
                return (
                  <div
                    key={`${row.label}-${i}`}
                    // Fixed row height so the per-env Update button can appear
                    // without shifting siblings down. Height matches the
                    // button's `h-5` so the row looks identical whether the
                    // button is present or not.
                    className="flex h-5 items-center gap-2 text-xs text-muted"
                  >
                    <span className="w-[120px] shrink-0">{row.label}</span>
                    {isRedetecting ? (
                      <PixelLoader size="xs" />
                    ) : (
                      <span className="tabular-nums">
                        {installedVer ? `v${installedVer}` : "—"}
                      </span>
                    )}
                    {showUpdateButton ? (
                      <Tooltip delay={0}>
                        <Tooltip.Trigger>
                          <Button
                            size="sm"
                            variant="tertiary"
                            className="ml-1 h-5 min-h-5 gap-1 px-2 py-0 text-[11px] leading-none"
                            aria-label={`${updateLabel} for ${agent.label}${row.label ? ` (${row.label})` : ""}`}
                            isPending={isPending}
                            isDisabled={
                              binaryUpdatePendingEnvKey !== undefined &&
                              binaryUpdatePendingEnvKey !== envKey
                            }
                            onPress={() => performBinaryUpdate(row.status)}
                          >
                            <Download className="size-3" />
                            {updateLabel}
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content placement="right" className="max-w-[440px]">
                          {previewCommandLine ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[11px] text-muted">
                                Will run in {row.label || "this environment"}:
                              </span>
                              <code className="font-mono text-[11px]">{previewCommandLine}</code>
                            </div>
                          ) : (
                            <span className="text-[11px]">
                              Update {agent.label} to v{targetVersion}
                            </span>
                          )}
                        </Tooltip.Content>
                      </Tooltip>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            agent.version && <p className="mt-0.5 text-xs text-muted">v{agent.version}</p>
          )}
          {metadataStatuses.length > 0 ? (
            <div className="mt-1 space-y-0.5">
              {metadataStatuses.map((status, index) => (
                <AgentMetadataLine
                  key={`${status.kind}-${status.envKind ?? "native"}-${status.envDistro ?? index}`}
                  status={status}
                  showEnvironmentLabel={showEnvironmentMetadataLabels}
                  includeAuthFallback={includeAuthFallbackMetadata}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {hasAuthSettings && usePerEnvAuthRows ? (
            <div className="space-y-2">
              {envVarAuthMethod && acpInstanceId ? (
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-secondary px-3 py-2 text-foreground">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{envVarAuthMethod.name}</p>
                      <p className="text-xs text-muted">
                        Saved credentials are shared across all environments.
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
                                    ? SAVED_SECRET_MASK
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
                                  if (
                                    !Object.prototype.hasOwnProperty.call(current, variable.name)
                                  ) {
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
                      aria-label="Save"
                      isDisabled={!canSaveEnvAuth}
                      isPending={authPending}
                      data-acp-auth-save=""
                      onPress={saveEnvAuth}
                    >
                      <Save className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
              {installedStatuses.map((status) => {
                const envKey = statusEnvKey(status);
                const agentMethods =
                  status.authMethods?.filter(isAgentAuthMethod) ??
                  (sharedAgentAuthMethod ? [sharedAgentAuthMethod] : []);
                const terminalMethod = status.loginCommand
                  ? (findTerminalAuthMethodForStatus(status) ??
                    sharedTerminalAuthMethod ?? {
                      id: "terminal-login",
                      name: "Login",
                      type: "terminal" as const,
                    })
                  : undefined;
                const methods: Array<AgentOwnedAuthMethod | AgentTerminalAuthMethod> =
                  terminalMethod ? [terminalMethod] : agentMethods;
                const isAuthenticated = status.authState === "authenticated";
                const needsInteractiveRow =
                  isAuthenticated ||
                  status.authState === "missing" ||
                  (status.authState === "unknown" && methods.length > 0);
                if (!needsInteractiveRow) return null;
                return (
                  <AcpAgentAuthEnvRow
                    key={`${status.kind}-${envKey}-auth-row`}
                    status={status}
                    authMethods={methods}
                    canLogout={supportsAcpLogoutStatus(status, acpInstanceId)}
                    authPending={authPendingEnvKey === envKey}
                    pendingMessage={authPendingEnvKey === envKey ? authPendingMessage : undefined}
                    showEnvironmentLabel={showAuthEnvironmentLabels}
                    onLogin={(method) => {
                      if (isAgentAuthMethod(method)) {
                        authenticateAgent({ status, method });
                        return;
                      }
                      runTerminalLogin(status, method);
                    }}
                    onLogout={() => logoutAgent(status)}
                  />
                );
              })}
            </div>
          ) : hasAuthSettings ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${authMissing ? "text-warning" : ""}`}>
                      {authMissing ? (
                        <AlertTriangle className="mr-1.5 inline size-4 -translate-y-px text-warning" />
                      ) : null}
                      {authMissing ? "Login required" : "Authentication"}
                    </p>
                    <p className="text-xs text-muted">
                      {authPendingMessage ??
                        (authMissing
                          ? `${missingAuthLabel ? `${missingAuthLabel} needs authentication. ` : ""}${
                              envVarAuthMethod
                                ? agentAuth
                                  ? `Complete ${agentAuth.method.name} sign-in or save ${envVarAuthMethod.name} credentials, then detected agents will refresh.`
                                  : `Save ${envVarAuthMethod.name} credentials, then detected agents will refresh.`
                                : agentAuth
                                  ? `Complete ${agentAuth.method.name} sign-in, then detected agents will refresh.`
                                  : loginCommand
                                    ? `Run ${loginCommand} to sign in.`
                                    : "Sign in with the agent CLI, then refresh detected agents."
                            }`
                          : envVarAuthMethod
                            ? `Saved ${envVarAuthMethod.name} credentials are configured. Enter a new value to replace them.`
                            : agentAuth
                              ? `Sign in again with ${agentAuth.method.name}.`
                              : loginCommand
                                ? `Run ${loginCommand} again to refresh credentials.`
                                : "Credentials are configured.")}
                    </p>
                  </div>
                </div>
                {showEnvVarOnly && acpInstanceId ? (
                  <div className="flex shrink-0 flex-row items-center gap-2">
                    <Button
                      size="sm"
                      variant="tertiary"
                      isIconOnly
                      aria-label="Save"
                      isDisabled={!canSaveEnvAuth}
                      isPending={authPending}
                      data-acp-auth-save=""
                      onPress={saveEnvAuth}
                    >
                      <Save className="size-4" />
                    </Button>
                    {/* Env-var credentials are shared across envs — a single
                      "Logout" clears them for all environments. */}
                    <Button
                      size="sm"
                      variant="tertiary"
                      isIconOnly
                      aria-label="Logout"
                      isPending={authPending}
                      onPress={clearEnvVarCredentials}
                    >
                      <LogOut className="size-4 text-danger" />
                    </Button>
                  </div>
                ) : agentAuth && supportsAcpAgentAuth ? (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {(agentAuthEntries.length > 0 ? agentAuthEntries : [agentAuth]).map(
                      (entry, index) => (
                        <Button
                          key={`${entry.status.kind}-${entry.status.envKind ?? "native"}-${entry.status.envDistro ?? index}`}
                          size="sm"
                          variant="tertiary"
                          isPending={authPending}
                          onPress={() => authenticateAgent(entry)}
                        >
                          <LogIn className="size-4" />
                          {authMissing ? "Login" : "Re-login"}
                          {showAuthEnvironmentLabels ? ` ${envLabel(entry.status)}` : ""}
                        </Button>
                      ),
                    )}
                    {envVarAuthMethod ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        isIconOnly
                        aria-label="Save"
                        isDisabled={!canSaveEnvAuth}
                        isPending={authPending}
                        data-acp-auth-save=""
                        onPress={saveEnvAuth}
                      >
                        <Save className="size-4" />
                      </Button>
                    ) : null}
                    {logoutStatuses.map((status, index) => (
                      <Button
                        key={`${status.kind}-${status.envKind ?? "native"}-${status.envDistro ?? index}-logout`}
                        size="sm"
                        variant="tertiary"
                        isPending={authPending}
                        onPress={() => logoutAgent(status)}
                      >
                        <LogOut className="size-4" />
                        Logout
                        {showAuthEnvironmentLabels ? ` ${envLabel(status)}` : ""}
                      </Button>
                    ))}
                  </div>
                ) : envVarAuthMethod && acpInstanceId ? (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Button
                      size="sm"
                      variant="tertiary"
                      isIconOnly
                      aria-label="Save"
                      isDisabled={!canSaveEnvAuth}
                      isPending={authPending}
                      data-acp-auth-save=""
                      onPress={saveEnvAuth}
                    >
                      <Save className="size-4" />
                    </Button>
                    {logoutStatuses.map((status, index) => (
                      <Button
                        key={`${status.kind}-${status.envKind ?? "native"}-${status.envDistro ?? index}-logout`}
                        size="sm"
                        variant="tertiary"
                        isPending={authPending}
                        onPress={() => logoutAgent(status)}
                      >
                        <LogOut className="size-4" />
                        Logout
                        {showAuthEnvironmentLabels ? ` ${envLabel(status)}` : ""}
                      </Button>
                    ))}
                  </div>
                ) : loginStatus && loginCommand ? (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Button
                      size="sm"
                      variant="tertiary"
                      onPress={() => runTerminalLogin(loginStatus, terminalLoginMethod)}
                    >
                      <LogIn className="size-4" />
                      {authMissing ? "Login" : "Re-login"}
                    </Button>
                    {logoutStatuses.map((status, index) => (
                      <Button
                        key={`${status.kind}-${status.envKind ?? "native"}-${status.envDistro ?? index}-logout`}
                        size="sm"
                        variant="tertiary"
                        isPending={authPending}
                        onPress={() => logoutAgent(status)}
                      >
                        <LogOut className="size-4" />
                        Logout
                        {showAuthEnvironmentLabels ? ` ${envLabel(status)}` : ""}
                      </Button>
                    ))}
                  </div>
                ) : logoutStatuses.length > 0 ? (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {logoutStatuses.map((status, index) => (
                      <Button
                        key={`${status.kind}-${status.envKind ?? "native"}-${status.envDistro ?? index}-logout`}
                        size="sm"
                        variant="tertiary"
                        isPending={authPending}
                        onPress={() => logoutAgent(status)}
                      >
                        <LogOut className="size-4" />
                        Logout
                        {showAuthEnvironmentLabels ? ` ${envLabel(status)}` : ""}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              {envVarAuthMethod && acpInstanceId ? (
                <div className="flex flex-col gap-2">
                  {envVarAuthMethod.vars.map((variable) => {
                    const hasAuthValue = Object.prototype.hasOwnProperty.call(
                      authValues,
                      variable.name,
                    );
                    return (
                      <Input
                        key={variable.name}
                        aria-label={variable.label ?? variable.name}
                        className="w-full"
                        placeholder={variable.label ?? variable.name}
                        type={
                          variable.secret === false || (!hasAuthValue && !authMissing)
                            ? "text"
                            : "password"
                        }
                        value={
                          hasAuthValue
                            ? (authValues[variable.name] ?? "")
                            : authMissing
                              ? ""
                              : SAVED_SECRET_MASK
                        }
                        onFocus={() => {
                          if (!authMissing && !hasAuthValue) {
                            setAuthValues((current) => ({ ...current, [variable.name]: "" }));
                          }
                        }}
                        onBlur={(event) => {
                          if (authMissing) return;
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
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Enabled</p>
              <p className="text-xs text-muted">
                Show this agent in the agent picker when creating threads.
              </p>
            </div>
            <Switch
              isSelected={!isDisabled}
              onChange={(selected) => {
                startTransition(() => {
                  setAgentDisabled(agent.kind, !selected);
                });
                if (selected) {
                  void readBridge()
                    .refreshAgentStatuses(wslDistros, { agentKinds: [agent.kind] })
                    .catch(() => undefined);
                }
              }}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>
        </div>

        <div className={`transition-opacity ${isDisabled ? "pointer-events-none opacity-40" : ""}`}>
          {defs.length > 0 && (
            <div className="mt-8 space-y-4">
              {defs.map((def) => (
                <AgentSettingRow key={def.key} agentKind={agent.kind} def={def} />
              ))}
            </div>
          )}

          {hasSelectableModels && (
            <div className="mt-8 space-y-4">
              <ModelVisibilityDropdown agentKind={agent.kind} provider={menuProvider} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentSettingsEmpty() {
  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Agents</h1>
        <p className="text-sm text-muted">No agents installed.</p>
      </div>
    </div>
  );
}
