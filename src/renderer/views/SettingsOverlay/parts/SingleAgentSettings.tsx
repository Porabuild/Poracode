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
  Trash2,
} from "lucide-react";
import {
  formatUpdateCommandLine,
  isNewerVersion,
  resolveSharedUpdateCommand,
} from "@/shared/agents/updateResolver";
import type {
  AgentEnvVarAuthMethod,
  AgentHookPluginEnv,
  AgentHookPluginStatus,
  AgentOwnedAuthMethod,
  AgentSettingDef,
  AgentStatus,
  AgentTerminalAuthMethod,
} from "@/shared/contracts";
import { hookEnvForAgentStatus, hookEnvKey, hookEnvLabel } from "@/shared/agentHookPluginEnv";
import { runAgentInstallCommand, runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
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
import { SettingsPage } from "./SettingsForm";
import {
  buildProviderModelItems,
  statusToMenuProvider,
  type ProviderModelItem,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu";
import { NATIVE_AGENT_REGISTRY_ENTRIES } from "./agentRegistryNative";

const SAVED_SECRET_MASK = "***********";

function AgentSettingRow(props: { agentKind: string; def: AgentSettingDef }) {
  const { agentKind, def } = props;
  const value = useSharedSettings((s) => s.agentSettings[agentKind]?.[def.key] ?? def.default);
  const setAgentSetting = useSharedSettings((s) => s.setAgentSetting);

  if (def.type !== "toggle" && def.type !== "select") return null;

  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/10 last:border-0 group">
      <div className="flex flex-col min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{def.label}</p>
        <p className="text-[11px] text-muted line-clamp-1 group-hover:line-clamp-none transition-all">
          {def.description}
        </p>
      </div>
      {def.type === "toggle" ? (
        <Switch
          isSelected={value as boolean}
          size="sm"
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
          className="w-[140px] shrink-0"
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
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/10 last:border-0 group">
      <div className="flex flex-col min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Visible models</p>
        <p className="text-[11px] text-muted line-clamp-1 group-hover:line-clamp-none transition-all">
          Toggle models off to hide them from the selector.
        </p>
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

function shouldPreferTerminalLogin(status: AgentStatus): boolean {
  return status.kind === "grok" && Boolean(status.loginCommand);
}

function AgentInstallEnvironmentRow(props: {
  agentLabel: string;
  status: AgentStatus;
  installPending: boolean;
  onInstall: (status: AgentStatus) => void;
}) {
  const env = envLabel(props.status);
  const envSuffix = env ? ` ${env}` : "";

  return (
    <div className="flex flex-col py-1.5 px-2 -mx-2 hover:bg-surface-secondary/40 rounded-lg transition-colors group/env">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="shrink-0 text-foreground/90">{env || "Default"}</span>
          <span className="shrink-0 tabular-nums text-muted/60 font-normal text-xs">
            Not installed
          </span>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          className="h-6 min-h-6 px-2 py-0 text-[10px] text-muted hover:text-foreground"
          aria-label={`Install${envSuffix}`}
          isPending={props.installPending}
          onPress={() => props.onInstall(props.status)}
        >
          {props.installPending ? <PixelLoader size="xs" /> : <Download className="size-3" />}
          {props.installPending ? "Installing" : "Install"}
        </Button>
      </div>
      <div className="flex min-w-0 h-4 items-center">
        <span className="min-w-0 truncate text-[11px] font-normal text-muted/60">
          Install {props.agentLabel}
          {env ? ` for ${env}` : ""}.
        </span>
      </div>
    </div>
  );
}

function AgentEnvironmentRow(props: {
  agentLabel: string;
  status: AgentStatus;
  authMethods: ReadonlyArray<AgentOwnedAuthMethod | AgentTerminalAuthMethod>;
  canLogout: boolean;
  authPending: boolean;
  pendingMessage: string | undefined;
  onLogin: (method: AgentOwnedAuthMethod | AgentTerminalAuthMethod) => void;
  onLogout: () => void;

  latestNpmVersion: string | undefined;
  newestInstalledVersion: string | undefined;
  binaryUpdatePending: boolean;
  isRedetecting: boolean;
  onUpdate: (status: AgentStatus) => void;

  includeAuthFallback: boolean;
  acpInstanceId: string | undefined;
}) {
  const { status, authMethods } = props;
  const hasAnyMethod = authMethods.length > 0;
  const isAuthenticated = status.authState === "authenticated";
  const isMissing =
    status.authState === "missing" || (status.authState === "unknown" && hasAnyMethod);
  const env = envLabel(status);
  const envSuffix = env ? ` ${env}` : "";
  const canLogout = isAuthenticated && props.canLogout;
  const canReLogin = isAuthenticated && !canLogout && hasAnyMethod;
  const canLogin = (isMissing || canReLogin) && hasAnyMethod;
  const loginLabel = canReLogin ? "Re-login" : "Login";
  const pendingLabel = canLogout ? "Logging out" : "Logging in";

  const hasMultipleMethods = authMethods.length > 1;
  const singleMethod = !hasMultipleMethods ? authMethods[0] : undefined;

  const metadataSummary = formatAgentMetadataSummary(status, {
    includeAuthFallback: props.includeAuthFallback,
  });

  const installedVer = status.version;
  const registryTargetVersion =
    props.latestNpmVersion !== undefined &&
    installedVer !== undefined &&
    isNewerVersion(props.latestNpmVersion, installedVer)
      ? props.latestNpmVersion
      : undefined;
  const peerTargetVersion =
    props.newestInstalledVersion !== undefined &&
    installedVer !== undefined &&
    isNewerVersion(props.newestInstalledVersion, installedVer)
      ? props.newestInstalledVersion
      : undefined;
  const targetVersion = registryTargetVersion ?? peerTargetVersion;
  const updateLabel = targetVersion ? `v${targetVersion}` : "";
  const showUpdateButton =
    !props.isRedetecting &&
    props.acpInstanceId === undefined &&
    status.installed &&
    targetVersion !== undefined;

  const previewScope = statusUpdateScope(status);
  const previewCommand = showUpdateButton
    ? resolveSharedUpdateCommand({
        update: status.update,
        executablePath: status.executablePath,
        envKind: previewScope.envKind,
      })
    : undefined;
  const previewCommandLine = previewCommand ? formatUpdateCommandLine(previewCommand) : undefined;

  const description = isMissing
    ? hasMultipleMethods
      ? `Choose how to sign in${env ? ` for ${env}` : ""}.`
      : singleMethod
        ? `Complete ${singleMethod.name} sign-in${env ? ` for ${env}` : ""}.`
        : `${env || "Agent"} needs authentication.`
    : "";

  return (
    <div className="flex flex-col py-1.5 px-2 -mx-2 hover:bg-surface-secondary/40 rounded-lg transition-colors group/env">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="shrink-0 text-foreground/90">{env || "Default"}</span>
          {props.isRedetecting ? (
            <PixelLoader size="xs" />
          ) : (
            <span className="shrink-0 tabular-nums text-muted/60 font-normal text-xs">
              {installedVer ? `v${installedVer}` : "—"}
            </span>
          )}
          {props.binaryUpdatePending && !props.isRedetecting ? (
            <div
              className="flex h-5 min-h-5 items-center"
              role="status"
              aria-label={`Updating ${props.agentLabel}${env ? ` (${env})` : ""}`}
            >
              <PixelLoader size="xs" />
            </div>
          ) : showUpdateButton ? (
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 min-h-5 gap-1 px-1.5 py-0 text-[10px] text-muted hover:text-foreground"
                  aria-label={`Update to ${updateLabel} for ${props.agentLabel}${env ? ` (${env})` : ""}`}
                  onPress={() => props.onUpdate(status)}
                >
                  <ArrowUpCircle className="size-3" />
                  Update to {updateLabel}
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content placement="right" className="max-w-[440px]">
                {previewCommandLine ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted">
                      Will run in {env || "this environment"}:
                    </span>
                    <code className="font-mono text-[11px]">{previewCommandLine}</code>
                  </div>
                ) : (
                  <span className="text-[11px]">
                    Update {props.agentLabel} to {updateLabel}
                  </span>
                )}
              </Tooltip.Content>
            </Tooltip>
          ) : null}
          {isMissing && (
            <span className="text-warning flex items-center gap-1.5 whitespace-nowrap text-[11px] font-normal">
              <AlertTriangle className="size-3" />
              Login required
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {props.authPending ? (
            <div
              className="flex h-6 w-6 items-center justify-center"
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
                      className="h-6 min-h-6 px-2 py-0 text-[10px] text-muted hover:text-foreground"
                      aria-label={`${loginLabel} ${method.name}${envSuffix}`}
                      onPress={() => props.onLogin(method)}
                    >
                      {method.name}
                    </Button>
                  ))
                : null}
              {canLogin && !hasMultipleMethods && singleMethod ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  className="h-6 min-h-6 px-2 py-0 text-[10px] text-muted hover:text-foreground"
                  aria-label={`${loginLabel}${envSuffix}`}
                  onPress={() => props.onLogin(singleMethod)}
                >
                  {loginLabel}
                </Button>
              ) : null}
              {canLogout ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  className="h-6 min-h-6 px-2 py-0 text-[10px] text-muted hover:text-foreground"
                  aria-label={`Logout${envSuffix}`}
                  onPress={props.onLogout}
                >
                  Logout
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col min-w-0 h-4 justify-center">
        {props.pendingMessage ? (
          <span className="min-w-0 truncate text-[11px] font-normal text-muted/60 italic">
            {props.pendingMessage}
          </span>
        ) : metadataSummary ? (
          <span className="min-w-0 truncate text-[11px] font-normal text-muted/60 group-hover/env:text-muted/80 transition-colors">
            {metadataSummary}
          </span>
        ) : description ? (
          <p className="text-[10px] text-muted/50 truncate">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function HookPluginEnvironmentRow(props: {
  agentKind: string;
  agentLabel: string;
  status: AgentHookPluginStatus;
  pending: boolean;
  onRefresh: (status: AgentHookPluginStatus) => void;
  onPending: (pending: boolean) => void;
}) {
  const { status } = props;
  const versionText = status.installed
    ? status.version
      ? `v${status.version}`
      : "Installed"
    : status.supported
      ? "Not installed"
      : "Unsupported";
  const isOutdated =
    status.installed && status.version !== undefined && status.version !== status.bundledVersion;
  // Install and update both go through installAgentHookPlugin. Only offer
  // uninstall when the provider actually supports it (status.canUninstall) —
  // otherwise the supervisor rejects the call and we'd surface a useless error.
  const mode: "install" | "update" | "uninstall" | "none" = !status.installed
    ? "install"
    : isOutdated
      ? "update"
      : status.canUninstall
        ? "uninstall"
        : "none";
  const actionLabel = mode === "install" ? "Install" : mode === "update" ? "Update" : "Uninstall";
  const runAction = () => {
    props.onPending(true);
    const action =
      mode === "uninstall"
        ? readBridge().uninstallAgentHookPlugin
        : readBridge().installAgentHookPlugin;
    action({ agentKind: props.agentKind, env: status.env })
      .then((result) => {
        props.onRefresh(result.status);
        toast.success(
          mode === "uninstall"
            ? `${props.agentLabel} hooks removed for ${hookEnvLabel(status.env)}.`
            : `${props.agentLabel} hooks installed for ${hookEnvLabel(status.env)}.`,
        );
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error ? error.message : `Unable to update ${props.agentLabel} hooks.`,
        ),
      )
      .finally(() => props.onPending(false));
  };

  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="shrink-0 font-medium text-foreground/90">{hookEnvLabel(status.env)}</span>
        <span className="shrink-0 tabular-nums text-xs text-muted/60">{versionText}</span>
        {isOutdated ? (
          <span className="shrink-0 text-[10px] text-warning">
            v{status.bundledVersion} available
          </span>
        ) : null}
      </div>
      {mode === "none" ? null : (
        <Button
          size="sm"
          variant={mode === "uninstall" ? "tertiary" : "secondary"}
          className="h-7 min-h-7 gap-1 px-2 text-[11px]"
          isDisabled={!status.supported || props.pending}
          isPending={props.pending}
          onPress={runAction}
        >
          {mode === "uninstall" ? (
            <Trash2 className="size-3 text-danger" />
          ) : (
            <Download className="size-3" />
          )}
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function HookPluginSettings(props: {
  agentKind: string;
  agentLabel: string;
  statuses: readonly AgentStatus[];
}) {
  const [pluginStatuses, setPluginStatuses] = useState<AgentHookPluginStatus[]>([]);
  const [pendingKey, setPendingKey] = useState<string | undefined>(undefined);

  // `props.statuses` is a fresh array on every parent render; depend on a
  // content-addressed key instead so the IPC only re-fires when the underlying
  // env set actually changes.
  const envsKey = [...new Set(props.statuses.map((s) => hookEnvKey(hookEnvForAgentStatus(s))))]
    .sort()
    .join("|");

  useEffect(() => {
    const envs = new Map<string, AgentHookPluginEnv>();
    for (const status of props.statuses) {
      const env = hookEnvForAgentStatus(status);
      envs.set(hookEnvKey(env), env);
    }
    const envList = [...envs.values()];
    if (envList.length === 0) {
      setPluginStatuses([]);
      return;
    }
    let cancelled = false;
    readBridge()
      .getAgentHookPluginStatuses({ agentKind: props.agentKind, envs: envList })
      .then((statuses) => {
        if (!cancelled) setPluginStatuses(statuses);
      })
      .catch(() => {
        if (!cancelled) setPluginStatuses([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.agentKind, envsKey]);

  if (pluginStatuses.length === 0 || pluginStatuses.every((status) => !status.supported)) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-border/10 pt-3">
      <div className="mb-2">
        <p className="text-sm font-medium text-foreground">CLI hooks</p>
        <p className="text-xs text-muted">
          Optional status hooks. Installed hooks update automatically; missing hooks are never
          installed automatically.
        </p>
      </div>
      <div className="space-y-0.5">
        {pluginStatuses.map((status) => {
          const key = hookEnvKey(status.env);
          return (
            <HookPluginEnvironmentRow
              key={key}
              agentKind={props.agentKind}
              agentLabel={props.agentLabel}
              status={status}
              pending={pendingKey === key}
              onPending={(pending) => setPendingKey(pending ? key : undefined)}
              onRefresh={(next) =>
                setPluginStatuses((current) =>
                  current.map((entry) => (hookEnvKey(entry.env) === key ? next : entry)),
                )
              }
            />
          );
        })}
      </div>
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
  const [installPendingEnvKey, setInstallPendingEnvKey] = useState<string | undefined>();
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
  const nativeRegistryEntry = NATIVE_AGENT_REGISTRY_ENTRIES.find(
    (entry) => entry.id === props.agentKind,
  );
  const installableHere = nativeRegistryEntry
    ? agentStatuses.filter(
        (a) =>
          a.kind === props.agentKind &&
          !a.installed &&
          a.envKind !== "wsl" &&
          !(a.envKind === "windows" && nativeRegistryEntry.supportsWindows === false),
      )
    : [];
  const installableWsl = nativeRegistryEntry
    ? wslAgentStatuses.filter((a) => a.kind === props.agentKind && !a.installed)
    : [];
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
      <SettingsPage title="Agent not found" bodyClassName="">
        <p className="text-sm text-muted">This agent is not installed.</p>
      </SettingsPage>
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
  const authMissing =
    missingAuthStatuses.length > 0 ||
    (hasAdvertisedAuthMethods &&
      !installedStatuses.some((status) => status.authState === "authenticated"));
  const missingAuthLabel = formatStatusList(missingAuthStatuses);
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
          setRedetectingEnvKey(envKey);
          try {
            await readBridge().refreshAgentStatuses(wslDistros, {
              agentKinds: [props.agentKind],
              envs: [scopeEnvForStatus(status)],
            });
          } finally {
            setRedetectingEnvKey(undefined);
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

  const installAgentInEnvironment = (status: AgentStatus) => {
    if (!nativeRegistryEntry) return;
    const envKey = statusEnvKey(status);
    const project = findProjectForAgentStatus(status, projects);
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
          name: "Login",
          type: "terminal" as const,
        })
      : undefined;
    const methods: Array<AgentOwnedAuthMethod | AgentTerminalAuthMethod> = usePerEnvAuthRows
      ? shouldPreferTerminalLogin(status) && terminalMethod
        ? [terminalMethod]
        : agentMethods.length > 0
          ? agentMethods
          : terminalMethod
            ? [terminalMethod]
            : []
      : [];
    return (
      <AgentEnvironmentRow
        key={`${status.kind}-${envKey}`}
        acpInstanceId={acpInstanceId}
        agentLabel={agent.label}
        authMethods={methods}
        authPending={authPendingEnvKey === envKey}
        binaryUpdatePending={binaryUpdatePendingEnvKey === envKey}
        canLogout={supportsAcpLogoutStatus(status, acpInstanceId)}
        includeAuthFallback={includeAuthFallbackMetadata}
        isRedetecting={redetectingEnvKey === envKey}
        latestNpmVersion={latestNpmVersion}
        newestInstalledVersion={newestInstalledVersion}
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

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <ProviderIcon
              kind={agent.kind}
              icon={agent.icon}
              fallbackLabel={agent.label}
              className="size-8"
            />
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold text-foreground leading-tight">{agent.label}</h1>
              <p className="text-[11px] text-muted">
                {isDisabled ? "Agent is currently disabled" : "Agent is active and ready"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {updateAvailable && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 min-h-7 gap-1 px-2 text-[11px]"
                isPending={updatePending}
                onPress={performUpdate}
              >
                <ArrowUpCircle className="size-3" />
                Update to v{latestRegistryVersion}
              </Button>
            )}
            <Switch
              isSelected={!isDisabled}
              isDisabled={binaryUpdatePendingEnvKey !== undefined}
              size="sm"
              aria-label="Enabled"
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

        <div className="space-y-0.5 border-t border-border/10 pt-3">
          {installedHere.map(renderInstalledEnvironmentRow)}
          {installableHere.map(renderInstallableEnvironmentRow)}
          {installedWsl.map(renderInstalledEnvironmentRow)}
          {installableWsl.map(renderInstallableEnvironmentRow)}
        </div>
      </div>

      <div className="space-y-4">
        {hasAuthSettings && (
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
                    aria-label="Save"
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
                      aria-label="Logout"
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
                      {authMissing ? "Login required" : "Authentication"}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {authPendingMessage ??
                        (authMissing
                          ? `${missingAuthLabel ? `${missingAuthLabel} needs authentication. ` : ""}${
                              envVarAuthMethod
                                ? agentAuth
                                  ? `Complete ${agentAuth.method.name} sign-in or save ${envVarAuthMethod.name} credentials.`
                                  : `Save ${envVarAuthMethod.name} credentials.`
                                : agentAuth
                                  ? `Complete ${agentAuth.method.name} sign-in.`
                                  : loginCommand
                                    ? `Run ${loginCommand} to sign in.`
                                    : "Sign in with the agent CLI."
                            }`
                          : "Credentials are configured.")}
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
                          {authMissing ? "Login" : "Re-login"}
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
                      {authMissing ? "Login" : "Re-login"}
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
                      Logout
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className={`transition-opacity ${isDisabled ? "pointer-events-none opacity-40" : ""}`}>
        {defs.length > 0 && (
          <div className="mt-6">
            {defs.map((def) => (
              <AgentSettingRow key={def.key} agentKind={agent.kind} def={def} />
            ))}
          </div>
        )}

        {hasSelectableModels && (
          <div className="mt-6">
            <ModelVisibilityDropdown agentKind={agent.kind} provider={menuProvider} />
          </div>
        )}
      </div>

      <HookPluginSettings
        agentKind={agent.kind}
        agentLabel={agent.label}
        statuses={installedStatuses}
      />
    </div>
  );
}

export function AgentSettingsEmpty() {
  return (
    <SettingsPage title="Agents" bodyClassName="">
      <p className="text-sm text-muted">No agents installed.</p>
    </SettingsPage>
  );
}
