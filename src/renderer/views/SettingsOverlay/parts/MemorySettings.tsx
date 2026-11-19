import { startTransition, useEffect, useState, type ReactNode } from "react";
import { NumberField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import {
  Button,
  EffortContextMenu,
  ProviderModelMenu,
  Select,
  ToggleSwitch,
} from "@/renderer/components/common";
import { formatEffortLabel } from "@/renderer/components/common/effortLabel";
import {
  buildProviderModelMenuProviders,
  resolveModelSelectionEdit,
} from "@/renderer/components/thread/buildModelPickerControls";
import { EffortIcon } from "@/renderer/components/providers/EffortIcon";
import { getProviderUtilityRank } from "@/renderer/components/providers/providerManifest";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { runMemoryCatalogCommand } from "@/renderer/state/memoryCatalog";
import { syncMemoryAcrossEnvironments } from "@/renderer/state/memorySync";
import { isProjectedRemoteEntityId, remoteOwner } from "@/renderer/state/remoteProjection";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSettingsHostServer, useSettingsHostStore } from "@/renderer/state/settingsHostStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { AgentStatus } from "@/shared/contracts";
import type {
  MemoryCaptureTiming,
  MemoryDeletePolicy,
  MemoryDreamCadence,
  MemoryStatus,
} from "@/shared/memory";
import { pickMemoryModel, type MemoryModelCandidate } from "@/shared/memoryModelChoice";
import {
  modelFamilyDisplayConfig,
  modelFamilyEfforts,
  modelFamilyForModel,
} from "@/shared/modelFamilySelection";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import { MemoryCatalogDialog } from "./MemoryCatalogDialog";
import { SettingRow, SettingsPage } from "./SettingsForm";

const DEFAULT_EFFORT = "__memory_default__";

function memoryModelCandidates(
  providers: readonly ProviderModelMenuProvider[],
): MemoryModelCandidate[] {
  return providers.flatMap((provider) =>
    provider.capabilities.models.map((model) => ({
      agentKind: provider.kind,
      model: model.id,
      label: model.label ?? model.id,
      rank: provider.capabilities.utilityRank ?? getProviderUtilityRank(provider.kind),
    })),
  );
}

function MemoryModelPicker(props: {
  anchorId: string;
  title: string;
  description: ReactNode;
  purpose: "capture" | "dream";
  provider: string;
  model: string;
  effort: string;
  fast: boolean;
  agents: readonly AgentStatus[];
  providers: readonly ProviderModelMenuProvider[];
  isDisabled?: boolean;
  onChange: (agentKind: string, model: string, effort: string, fast: boolean) => void;
  onReset: () => void;
}) {
  const { t } = useLingui();
  const candidates = memoryModelCandidates(props.providers);
  const scoped =
    props.provider === "auto"
      ? candidates
      : candidates.filter((candidate) => candidate.agentKind === props.provider);
  const fallback = pickMemoryModel(scoped.length > 0 ? scoped : candidates, props.purpose);
  const agentKind = props.model && props.provider !== "auto" ? props.provider : fallback?.agentKind;
  const model = props.model || fallback?.model;
  const customized = props.provider !== "auto" || props.model !== "";
  if (!agentKind || !model || props.providers.length === 0) return null;

  const capabilities = props.agents.find(
    (agent) =>
      agent.kind === agentKind && agent.capabilities.models.some((item) => item.id === model),
  )?.capabilities;
  const config = { model, effort: props.effort, fast: props.fast };
  const efforts = capabilities ? modelFamilyEfforts(capabilities, config) : [];
  const family = capabilities && modelFamilyForModel(capabilities, model);
  const effortBoundToModel = family?.bindings.effort === "model";
  const shownEffort =
    (capabilities && modelFamilyDisplayConfig(capabilities, config)?.effort) ?? props.effort;

  return (
    <SettingRow
      anchorId={props.anchorId}
      title={props.title}
      description={props.description}
      className={props.isDisabled ? "opacity-55 transition-opacity" : "transition-opacity"}
    >
      <div
        role="group"
        aria-label={props.title}
        className="flex min-w-0 max-w-[65%] shrink-0 items-center gap-2"
      >
        {customized ? (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={props.isDisabled ?? false}
            onPress={props.onReset}
          >
            <Trans>Reset</Trans>
          </Button>
        ) : null}
        <div className="min-w-0">
          <ProviderModelMenu
            triggerAppearance="field"
            menuLabel={props.title}
            providers={[...props.providers]}
            currentAgentKind={agentKind}
            currentModel={model}
            isDisabled={props.isDisabled ?? false}
            onChange={(next) => {
              const nextModel =
                next.selectionIntent === "family" &&
                next.agentKind === agentKind &&
                next.model === family?.model
                  ? model
                  : next.model;
              const sameModel = next.agentKind === agentKind && nextModel === model;
              props.onChange(
                next.agentKind,
                nextModel,
                sameModel ? props.effort : "",
                sameModel && props.fast,
              );
            }}
          />
        </div>
        {capabilities && efforts.length > 1 ? (
          <div className="min-w-0">
            <EffortContextMenu
              triggerAppearance="field"
              label={t`Reasoning`}
              efforts={[
                ...(effortBoundToModel ? [] : [{ id: DEFAULT_EFFORT, label: t`Default` }]),
                ...efforts.map((id) => ({ id, label: formatEffortLabel(id) })),
              ]}
              effortValue={shownEffort || (effortBoundToModel ? "" : DEFAULT_EFFORT)}
              icon={
                <EffortIcon className="size-4 shrink-0" effort={shownEffort} efforts={efforts} />
              }
              contextSizes={[]}
              isDisabled={props.isDisabled ?? false}
              onEffortChange={(value) => {
                const effort = value === DEFAULT_EFFORT ? "" : value;
                if (effort === shownEffort) return;
                const patch = resolveModelSelectionEdit(capabilities, config, {
                  kind: "effort",
                  value: effort,
                });
                if (!patch) return;
                // Keep the override attached to the model that advertised it, even in Auto.
                props.onChange(
                  agentKind,
                  patch.model ?? model,
                  patch.effort ?? props.effort,
                  patch.fast ?? props.fast,
                );
              }}
            />
          </div>
        ) : null}
      </div>
    </SettingRow>
  );
}

type MemorySettingsProps = { projectId?: string; onOpenGlobalSettings?: () => void };

export function MemorySettings(props: MemorySettingsProps) {
  const project = useAppStore((state) =>
    state.projects.find((item) => item.id === props.projectId),
  );
  const owner = remoteOwner(project);
  const projectHost = useRemoteServersStore((state) =>
    state.servers.find((server) => remoteConnectionKey(server) === owner?.desktopId),
  );
  const settingsHost = useSettingsHostServer();
  const remoteSession = isRemoteSession();
  const remote =
    remoteSession ||
    Boolean(project?.remoteServerId) ||
    isProjectedRemoteEntityId(props.projectId ?? "", "project");
  const server = remote ? (props.projectId ? projectHost : settingsHost) : undefined;
  const connectionKey = server && remoteConnectionKey(server);
  const ownerProjectId = remote ? owner?.remoteId : props.projectId;
  const canManage =
    !remote || Boolean(server?.memoryCatalogAvailable && server.scopes.includes("session:operate"));
  const scopeKey = JSON.stringify([
    remote,
    props.projectId,
    connectionKey,
    server?.desktopId,
    server?.endpoint,
    server?.recentHistoryCacheId,
    ownerProjectId,
  ]);
  return (
    <MemorySettingsView
      key={scopeKey}
      {...props}
      remote={remote}
      remoteSession={remoteSession}
      canManage={canManage}
      connectionKey={connectionKey}
      ownerProjectId={ownerProjectId}
    />
  );
}

function MemorySettingsView(
  props: MemorySettingsProps & {
    remote: boolean;
    remoteSession: boolean;
    canManage: boolean;
    connectionKey: string | undefined;
    ownerProjectId: string | undefined;
  },
) {
  const { t } = useLingui();
  const memory = useSharedSettings((state) => state.memory);
  const disabledAgents = useSharedSettings((state) => state.disabledAgents);
  const hiddenModels = useSharedSettings((state) => state.hiddenModels);
  const setMemorySettings = useSharedSettings((state) => state.setMemorySettings);
  const agentStatuses = useAgentStatusesStore((state) => state.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const isEligible = (agent: (typeof agentStatuses)[number]) =>
    agent.installed &&
    agent.authState !== "missing" &&
    !disabledAgents.includes(agent.kind) &&
    agent.capabilities.supportsOneShot === true &&
    agent.capabilities.models.length > 0;
  const hostOneShot = agentStatuses.filter(isEligible);
  const oneShotAgents = hostOneShot.length > 0 ? hostOneShot : wslAgentStatuses.filter(isEligible);
  const modelProviders = buildProviderModelMenuProviders(oneShotAgents, {
    hiddenModelsByAgent: hiddenModels,
  }).map((provider) => {
    if (provider.capabilities.models.length > 0) return provider;
    const raw = oneShotAgents.find((agent) => agent.kind === provider.kind);
    return raw ? { ...provider, capabilities: raw.capabilities } : provider;
  });
  const { remote, canManage, connectionKey, ownerProjectId } = props;
  const childDisabled = !memory.enabled;
  const childRowClass = childDisabled ? "opacity-55 transition-opacity" : "transition-opacity";
  const [status, setStatus] = useState<MemoryStatus | undefined>();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dreaming, setDreaming] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    void runMemoryCatalogCommand(connectionKey, {
      action: "status",
      ...(ownerProjectId ? { projectId: ownerProjectId } : {}),
    })
      .then((next) => {
        if (active) setStatus(next as MemoryStatus);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [canManage, connectionKey, ownerProjectId]);

  const timingOptions = [
    { id: "settle-2m", label: t`After the turn settles (2 min)` },
    { id: "settle-90s", label: t`After the turn settles (90 sec)` },
    { id: "custom", label: t`Custom idle delay` },
    { id: "lifecycle", label: t`Only when a thread is done or archived` },
  ];
  const deleteOptions = [
    { id: "spool", label: t`Save learnings before deleting` },
    { id: "lifecycle", label: t`Only on archive or done` },
    { id: "never", label: t`Never capture deleted threads` },
  ];
  const dreamOptions = [
    { id: "daily", label: t`Once per day` },
    { id: "3d", label: t`Every 3 days` },
    { id: "weekly", label: t`Weekly` },
    { id: "manual", label: t`Manual only` },
  ];

  async function reloadStatus() {
    const nextStatus = await runMemoryCatalogCommand(connectionKey, {
      action: "status",
      ...(ownerProjectId ? { projectId: ownerProjectId } : {}),
    });
    setStatus(nextStatus as MemoryStatus);
  }

  function syncAfterChange() {
    void syncMemoryAcrossEnvironments()
      .then((result) => (result.changed ? reloadStatus() : undefined))
      .catch(() => setError(true));
  }

  return (
    <SettingsPage
      title={t`Memory`}
      description={
        <Trans>
          Poracode remembers preferences and corrections across providers. Capture runs after a turn
          finishes. A daily pass merges them. Skills learned from repeated work stay as suggestions
          until you approve them.
        </Trans>
      }
    >
      {props.onOpenGlobalSettings ? (
        !remote || (props.remoteSession && connectionKey) ? (
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => {
              if (connectionKey) useSettingsHostStore.getState().choose(connectionKey);
              props.onOpenGlobalSettings?.();
            }}
          >
            <Trans>Memory settings</Trans>
          </Button>
        ) : null
      ) : (
        <>
          <SettingRow
            anchorId="memory.enabled"
            title={t`Use memory`}
            description={<Trans>Include memory when a thread starts.</Trans>}
          >
            <ToggleSwitch
              aria-label={t`Use memory`}
              isSelected={memory.enabled}
              onChange={(selected) =>
                startTransition(() => setMemorySettings({ enabled: selected }))
              }
            />
          </SettingRow>
          <SettingRow
            anchorId="memory.learning"
            title={t`Learn from chats`}
            description={<Trans>Capture new notes after turns finish.</Trans>}
            className={childRowClass}
          >
            <ToggleSwitch
              aria-label={t`Learn from chats`}
              isSelected={memory.learning}
              isDisabled={childDisabled}
              onChange={(selected) =>
                startTransition(() => setMemorySettings({ learning: selected }))
              }
            />
          </SettingRow>
          <MemoryModelPicker
            anchorId="memory.captureModel"
            title={t`Capture model`}
            description={
              <Trans>
                The cheapest model from the highest-rated provider reads a finished turn. You can
                choose any model.
              </Trans>
            }
            purpose="capture"
            provider={memory.captureProvider}
            model={memory.captureModel}
            effort={memory.captureEffort}
            fast={memory.captureFast}
            agents={oneShotAgents}
            providers={modelProviders}
            isDisabled={childDisabled}
            onChange={(agentKind, model, effort, fast) =>
              startTransition(() =>
                setMemorySettings({
                  captureProvider: agentKind,
                  captureModel: model,
                  captureEffort: effort,
                  captureFast: fast,
                }),
              )
            }
            onReset={() =>
              startTransition(() =>
                setMemorySettings({
                  captureProvider: "auto",
                  captureModel: "",
                  captureEffort: "",
                  captureFast: false,
                }),
              )
            }
          />
          <MemoryModelPicker
            anchorId="memory.dreamModel"
            title={t`Dream model`}
            description={
              <Trans>
                The strongest model from the highest-rated provider merges notes. You can choose any
                model.
              </Trans>
            }
            purpose="dream"
            provider={memory.dreamProvider}
            model={memory.dreamModel}
            effort={memory.dreamEffort}
            fast={memory.dreamFast}
            agents={oneShotAgents}
            providers={modelProviders}
            isDisabled={childDisabled}
            onChange={(agentKind, model, effort, fast) =>
              startTransition(() =>
                setMemorySettings({
                  dreamProvider: agentKind,
                  dreamModel: model,
                  dreamEffort: effort,
                  dreamFast: fast,
                }),
              )
            }
            onReset={() =>
              startTransition(() =>
                setMemorySettings({
                  dreamProvider: "auto",
                  dreamModel: "",
                  dreamEffort: "",
                  dreamFast: false,
                }),
              )
            }
          />
          <SettingRow
            anchorId="memory.captureTiming"
            title={t`When to capture`}
            description={
              <Trans>
                Done, archive, unload, and delete still capture immediately when allowed.
              </Trans>
            }
            className={childRowClass}
          >
            <Select
              aria-label={t`When to capture`}
              className="w-[240px] shrink-0"
              options={timingOptions}
              value={memory.captureTiming}
              isDisabled={childDisabled}
              onChange={(value) =>
                startTransition(() =>
                  setMemorySettings({ captureTiming: value as MemoryCaptureTiming }),
                )
              }
            />
          </SettingRow>
          {memory.captureTiming === "custom" ? (
            <SettingRow
              anchorId="memory.captureCustomMinutes"
              title={t`Custom idle minutes`}
              description={<Trans>Wait this long after a turn finishes.</Trans>}
              className={childRowClass}
            >
              <NumberField
                aria-label={t`Custom idle minutes`}
                className="w-[160px] shrink-0"
                minValue={1}
                maxValue={240}
                value={memory.captureCustomMinutes}
                isDisabled={childDisabled}
                onChange={(value) => {
                  if (value === undefined || Number.isNaN(value)) return;
                  startTransition(() =>
                    setMemorySettings({ captureCustomMinutes: Math.max(1, Math.floor(value)) }),
                  );
                }}
              >
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input />
                  <NumberField.IncrementButton />
                </NumberField.Group>
              </NumberField>
            </SettingRow>
          ) : null}
          <SettingRow
            anchorId="memory.deletePolicy"
            title={t`When a thread is deleted`}
            description={
              <Trans>A delete never waits on a model. Text is saved first, then read later.</Trans>
            }
            className={childRowClass}
          >
            <Select
              aria-label={t`When a thread is deleted`}
              className="w-[240px] shrink-0"
              options={deleteOptions}
              value={memory.deletePolicy}
              isDisabled={childDisabled}
              onChange={(value) =>
                startTransition(() =>
                  setMemorySettings({ deletePolicy: value as MemoryDeletePolicy }),
                )
              }
            />
          </SettingRow>
          <SettingRow
            anchorId="memory.dreamCadence"
            title={t`Dream schedule`}
            description={
              <Trans>Merge and retire notes. Skipped when nothing new was captured.</Trans>
            }
            className={childRowClass}
          >
            <Select
              aria-label={t`Dream schedule`}
              className="w-[240px] shrink-0"
              options={dreamOptions}
              value={memory.dreamCadence}
              isDisabled={childDisabled}
              onChange={(value) =>
                startTransition(() =>
                  setMemorySettings({ dreamCadence: value as MemoryDreamCadence }),
                )
              }
            />
          </SettingRow>
          <SettingRow
            anchorId="memory.suggestSkills"
            title={t`Suggest skills`}
            description={
              <Trans>
                Repeated workflows appear in Settings → Skills for you to edit and approve.
              </Trans>
            }
            className={childRowClass}
          >
            <ToggleSwitch
              aria-label={t`Suggest skills`}
              isSelected={memory.suggestSkills}
              isDisabled={childDisabled}
              onChange={(selected) =>
                startTransition(() => setMemorySettings({ suggestSkills: selected }))
              }
            />
          </SettingRow>
          <SettingRow
            anchorId="memory.suppressNative"
            title={t`Prefer Poracode memory`}
            description={
              <Trans>
                Ask sessions not to write a separate provider memory on top of this one.
              </Trans>
            }
            className={childRowClass}
          >
            <ToggleSwitch
              aria-label={t`Prefer Poracode memory`}
              isSelected={memory.suppressNative}
              isDisabled={childDisabled}
              onChange={(selected) =>
                startTransition(() => setMemorySettings({ suppressNative: selected }))
              }
            />
          </SettingRow>
          <SettingRow
            anchorId="memory.syncEnabled"
            title={t`Sync across environments`}
            description={
              <Trans>
                Share global and linked-project notes with paired computers and WSL. Unlinked
                folders stay separate.
              </Trans>
            }
            className={childRowClass}
          >
            <ToggleSwitch
              aria-label={t`Sync across environments`}
              isSelected={memory.syncEnabled}
              isDisabled={childDisabled}
              onChange={(selected) =>
                startTransition(() => setMemorySettings({ syncEnabled: selected }))
              }
            />
          </SettingRow>
        </>
      )}
      {!canManage ? (
        <p className="text-xs text-muted">
          <Trans>Memory catalog management is unavailable on this connection.</Trans>
        </p>
      ) : (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button size="sm" variant="secondary" onPress={() => setCatalogOpen(true)}>
              <Trans>Manage memories</Trans>
            </Button>
            {!props.projectId && !remote ? (
              <div className="flex flex-wrap items-center gap-2">
                {status?.lastDreamRunId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={undoing || dreaming}
                    onPress={() => {
                      const runId = status.lastDreamRunId;
                      if (!runId) return;
                      setUndoing(true);
                      setError(false);
                      void readBridge()
                        .memoryCommand({ action: "undo", runId })
                        .then(() => {
                          syncAfterChange();
                          return reloadStatus();
                        })
                        .catch(() => setError(true))
                        .finally(() => setUndoing(false));
                    }}
                  >
                    <Trans>Undo</Trans>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={childDisabled || !memory.syncEnabled || syncing}
                  onPress={() => {
                    setSyncing(true);
                    setError(false);
                    void syncMemoryAcrossEnvironments({ force: true })
                      .then(() => reloadStatus())
                      .catch(() => setError(true))
                      .finally(() => setSyncing(false));
                  }}
                >
                  {syncing ? <Trans>Syncing…</Trans> : <Trans>Sync now</Trans>}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  isDisabled={childDisabled || dreaming || undoing}
                  onPress={() => {
                    setDreaming(true);
                    setError(false);
                    void readBridge()
                      .memoryCommand({ action: "dream" })
                      .then(() => {
                        syncAfterChange();
                        return reloadStatus();
                      })
                      .catch(() => setError(true))
                      .finally(() => setDreaming(false));
                  }}
                >
                  <Trans>Dream now</Trans>
                </Button>
              </div>
            ) : null}
          </div>
          {status ? (
            <p className="text-xs text-muted">
              {t`${status.entryCount} memories · ${status.pendingCandidates} waiting · ${status.suggestionCount} skill suggestions`}
              {status.lastDreamSummary ? ` · ${status.lastDreamSummary}` : ""}
            </p>
          ) : null}
          {error ? (
            <p className="text-xs text-danger">
              <Trans>Couldn't load memory.</Trans>
            </p>
          ) : null}

          {catalogOpen && (
            <MemoryCatalogDialog
              connectionKey={connectionKey}
              {...(ownerProjectId ? { projectId: ownerProjectId } : {})}
              onChanged={reloadStatus}
              onClose={() => setCatalogOpen(false)}
            />
          )}
        </section>
      )}
    </SettingsPage>
  );
}
