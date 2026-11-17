import { startTransition, useEffect, useState, type ReactNode } from "react";
import { NumberField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button, ProviderModelMenu, Select, ToggleSwitch } from "@/renderer/components/common";
import { buildProviderModelMenuProviders } from "@/renderer/components/thread/buildModelPickerControls";
import { getProviderUtilityRank } from "@/renderer/components/providers/providerManifest";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { syncMemoryAcrossEnvironments } from "@/renderer/state/memorySync";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type {
  MemoryCaptureTiming,
  MemoryDeletePolicy,
  MemoryDreamCadence,
  MemoryEntry,
  MemoryStatus,
} from "@/shared/memory";
import { pickMemoryModel, type MemoryModelCandidate } from "@/shared/memoryModelChoice";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import { SettingRow, SettingsPage } from "./SettingsForm";

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
  providers: readonly ProviderModelMenuProvider[];
  isDisabled?: boolean;
  onChange: (agentKind: string, model: string) => void;
  onReset: () => void;
}) {
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
  return (
    <SettingRow
      anchorId={props.anchorId}
      title={props.title}
      description={props.description}
      className={props.isDisabled ? "opacity-55 transition-opacity" : "transition-opacity"}
    >
      <div className="flex items-center gap-2">
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
        <ProviderModelMenu
          triggerAppearance="field"
          menuLabel={props.title}
          providers={[...props.providers]}
          currentAgentKind={agentKind}
          currentModel={model}
          isDisabled={props.isDisabled ?? false}
          onChange={(next) => props.onChange(next.agentKind, next.model)}
        />
      </div>
    </SettingRow>
  );
}

export function MemorySettings(props: { projectId?: string; onOpenGlobalSettings?: () => void }) {
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
  const remote = isRemoteSession();
  const childDisabled = !memory.enabled;
  const childRowClass = childDisabled ? "opacity-55 transition-opacity" : "transition-opacity";
  const [status, setStatus] = useState<MemoryStatus | undefined>();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [dreaming, setDreaming] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (remote) return;
    let active = true;
    void readBridge()
      .memoryCommand({
        action: "status",
        ...(props.projectId ? { projectId: props.projectId } : {}),
      })
      .then((next) => {
        if (active) setStatus(next as MemoryStatus);
      })
      .catch(() => {
        if (active) setError(true);
      });
    void readBridge()
      .memoryCommand({ action: "list", ...(props.projectId ? { projectId: props.projectId } : {}) })
      .then((next) => {
        if (active) setEntries(next as MemoryEntry[]);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [props.projectId, remote]);

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

  async function reload() {
    const [nextStatus, nextEntries] = await Promise.all([
      readBridge().memoryCommand({
        action: "status",
        ...(props.projectId ? { projectId: props.projectId } : {}),
      }),
      readBridge().memoryCommand({
        action: "list",
        ...(props.projectId ? { projectId: props.projectId } : {}),
      }),
    ]);
    setStatus(nextStatus as MemoryStatus);
    setEntries(nextEntries as MemoryEntry[]);
  }

  function syncAfterChange() {
    void syncMemoryAcrossEnvironments()
      .then((result) => (result.changed ? reload() : undefined))
      .catch(() => setError(true));
  }

  function addDraftMemory() {
    const summary = draft.trim();
    if (summary.length === 0 || adding) return;
    setAdding(true);
    setError(false);
    void readBridge()
      .memoryCommand({
        action: "save",
        entry: {
          scope: props.projectId ? "project" : "global",
          ...(props.projectId ? { projectId: props.projectId } : {}),
          category: "user",
          summary,
          body: summary,
          polarity: "positive",
          pinned: false,
        },
      })
      .then(() => {
        setDraft((current) => (current === draft ? "" : current));
        syncAfterChange();
        return reload();
      })
      .catch(() => setError(true))
      .finally(() => setAdding(false));
  }

  function togglePin(entry: MemoryEntry) {
    setError(false);
    void readBridge()
      .memoryCommand({
        action: "save",
        entry: {
          id: entry.id,
          scope: entry.scope,
          projectId: entry.projectId,
          category: entry.category,
          summary: entry.summary,
          body: entry.body,
          polarity: entry.polarity,
          pinned: !entry.pinned,
          quote: entry.quote,
        },
      })
      .then(() => {
        syncAfterChange();
        return reload();
      })
      .catch(() => setError(true));
  }

  function saveEdit(entry: MemoryEntry) {
    const summary = editDraft.trim();
    if (summary.length === 0) return;
    setError(false);
    void readBridge()
      .memoryCommand({
        action: "save",
        entry: {
          id: entry.id,
          scope: entry.scope,
          projectId: entry.projectId,
          category: entry.category,
          summary,
          body: entry.body === entry.summary ? summary : entry.body,
          polarity: entry.polarity,
          pinned: entry.pinned,
          quote: entry.quote,
        },
      })
      .then(() => {
        setEditingId(null);
        syncAfterChange();
        return reload();
      })
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
        <Button size="sm" variant="tertiary" onPress={props.onOpenGlobalSettings}>
          <Trans>Memory settings</Trans>
        </Button>
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
            providers={modelProviders}
            isDisabled={childDisabled}
            onChange={(agentKind, model) =>
              startTransition(() =>
                setMemorySettings({
                  captureProvider: agentKind,
                  captureModel: model,
                  captureEffort: "",
                  captureFast: false,
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
            providers={modelProviders}
            isDisabled={childDisabled}
            onChange={(agentKind, model) =>
              startTransition(() =>
                setMemorySettings({
                  dreamProvider: agentKind,
                  dreamModel: model,
                  dreamEffort: "",
                  dreamFast: false,
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
      {remote ? (
        <p className="text-xs text-muted">
          <Trans>The memory catalog is edited on the desktop that owns this host.</Trans>
        </p>
      ) : (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">
              <Trans>Memories</Trans>
            </p>
            {!props.projectId ? (
              <div className="flex items-center gap-2">
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
                          return reload();
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
                      .then(() => reload())
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
                        return reload();
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
          <div className="flex items-center gap-2">
            <input
              aria-label={t`Add a memory`}
              className="min-w-0 flex-1 rounded-lg border border-[var(--hairline)] bg-transparent px-3 py-2 text-sm"
              value={draft}
              placeholder={t`Always use bun`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addDraftMemory();
                }
              }}
            />
            <Button
              size="sm"
              variant="tertiary"
              isDisabled={adding || draft.trim().length === 0}
              onPress={addDraftMemory}
            >
              <Trans>Add</Trans>
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
            {entries.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">
                <Trans>No memories yet.</Trans>
              </p>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 border-b border-[var(--hairline)] px-3 py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    {editingId === entry.id ? (
                      <input
                        aria-label={t`Edit`}
                        className="w-full rounded-lg border border-[var(--hairline)] bg-transparent px-2 py-1 text-sm"
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveEdit(entry);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            setEditingId(null);
                          }
                        }}
                      />
                    ) : (
                      <p className="truncate text-sm text-foreground">{entry.summary}</p>
                    )}
                    <p className="truncate text-xs text-muted">
                      {entry.category} · {entry.scope}
                      {entry.pinned ? ` · ${t`Pinned`}` : ""}
                      {entry.lockedByUser ? ` · ${t`Edited by you`}` : ""}
                    </p>
                  </div>
                  {editingId === entry.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="tertiary"
                        isDisabled={editDraft.trim().length === 0}
                        onPress={() => saveEdit(entry)}
                      >
                        <Trans>Save</Trans>
                      </Button>
                      <Button size="sm" variant="ghost" onPress={() => setEditingId(null)}>
                        <Trans>Cancel</Trans>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onPress={() => togglePin(entry)}>
                        {entry.pinned ? <Trans>Unpin</Trans> : <Trans>Pin to top</Trans>}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          setEditingId(entry.id);
                          setEditDraft(entry.summary);
                        }}
                      >
                        <Trans>Edit</Trans>
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setError(false);
                      void readBridge()
                        .memoryCommand({ action: "delete", id: entry.id })
                        .then(() => {
                          syncAfterChange();
                          return reload();
                        })
                        .catch(() => setError(true));
                    }}
                  >
                    <Trans>Delete</Trans>
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </SettingsPage>
  );
}
