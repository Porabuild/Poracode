import { useState } from "react";
import { Button, toast } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronRight, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  extractHomeProfileInstanceId,
  homeProfileKind,
  parseHomeProfileInstanceConfig,
  type AgentInstanceConfig,
  type HomeProfileDriver,
  type HomeProfileInstanceConfig,
} from "@/shared/contracts";
import { Input } from "@/renderer/components/common";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { defaultHomeProfileDir, uniqueProfileId } from "./ProfileSettingsModel";
import { refreshProfileStatuses } from "./profileStatusRefresh";

export interface HomeProfileProviderConfig {
  driver: HomeProfileDriver;
  providerName: MessageDescriptor;
}

function refreshHomeProfiles(kind?: string): void {
  refreshProfileStatuses(kind, msg`Unable to refresh profiles.`);
}

export function HomeProfileProviderSettings(props: {
  config: HomeProfileProviderConfig;
  instanceId: string;
}) {
  const instance = useSharedSettings((state) => state.agentInstances?.[props.instanceId]);
  if (!instance || instance.driver !== props.config.driver) return null;
  let instanceConfig: HomeProfileInstanceConfig;
  try {
    instanceConfig = parseHomeProfileInstanceConfig(instance.config);
  } catch {
    return null;
  }
  return (
    <HomeProfileEditor
      key={instance.id}
      providerConfig={props.config}
      instance={instance}
      instanceConfig={instanceConfig}
    />
  );
}

function HomeProfileEditor(props: {
  providerConfig: HomeProfileProviderConfig;
  instance: AgentInstanceConfig;
  instanceConfig: HomeProfileInstanceConfig;
}) {
  const { t, i18n: lingui } = useLingui();
  const setAgentInstance = useSharedSettings((state) => state.setAgentInstance);
  const [name, setName] = useState(props.instance.displayName ?? props.instance.id);
  const [homeDir, setHomeDir] = useState(props.instanceConfig.homeDir);
  const providerName = lingui._(props.providerConfig.providerName);
  const trimmedName = name.trim();
  const trimmedHomeDir = homeDir.trim();
  const canSave = trimmedName.length > 0 && trimmedHomeDir.length > 0;

  function save(): void {
    if (!canSave) return;
    setAgentInstance({
      ...props.instance,
      displayName: trimmedName,
      config: { homeDir: trimmedHomeDir },
    });
    refreshHomeProfiles(homeProfileKind(props.providerConfig.driver, props.instance.id));
    toast.success(t`${providerName} ${trimmedName} profile saved.`);
  }

  return (
    <div className="space-y-5 border-t border-border/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Profile</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>
              This profile keeps its {providerName} account, settings, and sessions in a separate
              home directory.
            </Trans>
          </p>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          aria-label={t`Save ${providerName} profile`}
          className="h-7 min-h-7 px-3 text-[11px]"
          isDisabled={!canSave}
          onPress={save}
        >
          <Trans>Save</Trans>
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Name</Trans>
          </span>
          <Input
            aria-label={t`${providerName} profile name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Home directory</Trans>
          </span>
          <Input
            aria-label={t`${providerName} profile home directory`}
            className="font-mono text-xs"
            value={homeDir}
            onChange={(event) => setHomeDir(event.target.value)}
          />
        </div>
      </section>
    </div>
  );
}

function HomeProfileRow(props: {
  providerName: string;
  instance: AgentInstanceConfig;
  instanceConfig: HomeProfileInstanceConfig;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const label = props.instance.displayName ?? props.instance.id;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/15 bg-surface-secondary/30 px-3 py-2">
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start text-left"
        onClick={props.onOpen}
      >
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        <span className="max-w-full truncate font-mono text-[11px] text-muted">
          {props.instanceConfig.homeDir}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          isIconOnly
          aria-label={t`Open ${label}`}
          size="sm"
          variant="ghost"
          className="h-7 w-7 min-w-7"
          onPress={props.onOpen}
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          isIconOnly
          aria-label={t`Remove ${props.providerName} profile`}
          size="sm"
          variant="ghost"
          className="h-7 w-7 min-w-7 text-danger"
          onPress={props.onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function HomeProfileSettings(props: {
  config: HomeProfileProviderConfig;
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  const { t, i18n: lingui } = useLingui();
  const agentInstances = useSharedSettings((state) => state.agentInstances ?? {});
  const setAgentInstance = useSharedSettings((state) => state.setAgentInstance);
  const removeAgentInstance = useSharedSettings((state) => state.removeAgentInstance);
  const removeAgentStatus = useAgentStatusesStore((state) => state.removeAgentStatus);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHomeDir, setNewHomeDir] = useState("");
  const providerName = lingui._(props.config.providerName);

  const profiles: Array<{
    instance: AgentInstanceConfig;
    instanceConfig: HomeProfileInstanceConfig;
  }> = [];
  for (const instance of Object.values(agentInstances)) {
    if (instance.driver !== props.config.driver) continue;
    try {
      profiles.push({
        instance,
        instanceConfig: parseHomeProfileInstanceConfig(instance.config),
      });
    } catch {
      // Ignore malformed records here; the supervisor skips them too.
    }
  }
  profiles.sort((left, right) =>
    (left.instance.displayName ?? left.instance.id).localeCompare(
      right.instance.displayName ?? right.instance.id,
    ),
  );

  const suggestedHomeDir = defaultHomeProfileDir(props.config.driver, newName);
  const canAdd = newName.trim().length > 0;

  function closeAddForm(): void {
    setIsAdding(false);
    setNewName("");
    setNewHomeDir("");
  }

  function addProfile(): void {
    const displayName = newName.trim();
    if (!displayName) return;
    const id = uniqueProfileId(displayName, agentInstances);
    const homeDir = newHomeDir.trim() || suggestedHomeDir;
    setAgentInstance({
      id,
      driver: props.config.driver,
      displayName,
      config: { homeDir },
    });
    const kind = homeProfileKind(props.config.driver, id);
    refreshHomeProfiles(kind);
    closeAddForm();
    toast.success(t`${providerName} ${displayName} profile added.`);
    props.onOpenProfile?.(kind);
  }

  return (
    <div className="border-t border-border/10 pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Profiles</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>
              Use separate {providerName} accounts and settings by assigning each profile its own
              home directory.
            </Trans>
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 min-h-7 gap-1 px-2 text-[11px]"
          onPress={() => refreshHomeProfiles()}
        >
          <RefreshCw className="size-3" />
          <Trans>Refresh</Trans>
        </Button>
      </div>

      {profiles.length === 0 && !isAdding ? (
        <p className="py-2 text-xs text-muted">
          <Trans>No additional {providerName} profiles.</Trans>
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {profiles.map(({ instance, instanceConfig }) => {
          const kind = homeProfileKind(props.config.driver, instance.id);
          return (
            <HomeProfileRow
              key={instance.id}
              providerName={providerName}
              instance={instance}
              instanceConfig={instanceConfig}
              onOpen={() => props.onOpenProfile?.(kind)}
              onRemove={() => {
                removeAgentInstance(instance.id);
                removeAgentStatus(kind);
                refreshHomeProfiles();
                toast.success(t`${providerName} profile removed.`);
              }}
            />
          );
        })}

        {isAdding ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2 rounded-xl border border-border/15 bg-surface-secondary/30 p-3">
            <Input
              ref={(node: HTMLInputElement | null) => node?.focus()}
              aria-label={t`New ${providerName} profile name`}
              className="min-w-0"
              placeholder={t`e.g. Work`}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Input
              aria-label={t`New ${providerName} profile home directory`}
              className="min-w-0 font-mono text-xs"
              placeholder={suggestedHomeDir}
              value={newHomeDir}
              onChange={(event) => setNewHomeDir(event.target.value)}
            />
            <div className="flex shrink-0 items-center gap-1 justify-self-end">
              <Button
                isIconOnly
                aria-label={t`Add ${providerName} profile`}
                size="sm"
                variant="ghost"
                className="h-7 w-7 min-w-7"
                isDisabled={!canAdd}
                onPress={addProfile}
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                isIconOnly
                aria-label={t`Cancel new ${providerName} profile`}
                size="sm"
                variant="ghost"
                className="h-7 w-7 min-w-7"
                onPress={closeAddForm}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {!isAdding ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-7 min-h-7 gap-1 px-2 text-[11px]"
          onPress={() => setIsAdding(true)}
        >
          <Plus className="size-3" />
          <Trans>Add profile</Trans>
        </Button>
      ) : null}
    </div>
  );
}

export function createHomeProfileSettingsPanel(config: HomeProfileProviderConfig) {
  return function HomeProfileAgentSettingsPanel(props: {
    agentKind: string;
    onOpenProfile?: ((profileKind: string) => void) | undefined;
  }) {
    const instanceId = extractHomeProfileInstanceId(props.agentKind);
    if (instanceId !== undefined) {
      return (
        <HomeProfileProviderSettings
          key={props.agentKind}
          config={config}
          instanceId={instanceId}
        />
      );
    }
    return <HomeProfileSettings config={config} onOpenProfile={props.onOpenProfile} />;
  };
}
