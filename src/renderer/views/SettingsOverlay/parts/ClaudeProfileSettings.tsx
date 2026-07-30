import { useRef, useState } from "react";
import { Button, Popover, toast } from "@heroui/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  claudeProfileKind,
  extractClaudeProfileInstanceId,
  parseClaudeProfileInstanceConfig,
  type AgentInstanceConfig,
  type ClaudeProfileInstanceConfig,
} from "@/shared/contracts";
import { CLAUDE_EFFORT_TIERS } from "@/shared/agents/claudeEfforts";
import { readBridge } from "@/renderer/bridge";
import { Input } from "@/renderer/components/common";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  applyPresetEnvRows,
  cleanModels,
  defaultConfigDir,
  effortsConfigFromSelection,
  environmentFromRows,
  modelsFromConfig,
  profileUsesExternalProvider,
  PROFILE_PRESETS,
  rowsFromEnvironment,
  SAVED_SECRET_MASK,
  selectedEffortsFromConfig,
  shouldTreatEnvKeyAsSensitive,
  uniqueProfileId,
  type EnvRow,
  type ModelRow,
  type ProfilePreset,
} from "./ClaudeProfileSettingsModel";
import { refreshProfileStatuses } from "./profileStatusRefresh";

const CLAUDE_PROFILE_BASE_MODEL_IDS = [
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "sonnet",
  "haiku",
];

function refreshClaudeProfile(kind?: string): void {
  refreshProfileStatuses(kind, msg`Unable to refresh Claude profiles.`);
}

// ── Effort multiselect dropdown ──────────────────────────────────────────────

function EffortMultiSelect(props: { selected: Set<string>; onToggle: (tier: string) => void }) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const selectedTiers = CLAUDE_EFFORT_TIERS.filter((tier) => props.selected.has(tier));
  const summary =
    selectedTiers.length === CLAUDE_EFFORT_TIERS.length
      ? t`All efforts`
      : selectedTiers.length === 0
        ? t`None`
        : selectedTiers.map(formatEffortLabel).join(", ");

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Button
          variant="secondary"
          size="sm"
          aria-label={t`Effort levels`}
          className="h-7 min-h-7 w-full justify-between gap-2 px-2 text-[11px] font-normal"
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted" />
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom start" className="w-56 p-0">
        <Popover.Dialog className="!p-0">
          <div
            role="listbox"
            aria-label={t`Effort levels`}
            aria-multiselectable="true"
            className="poracode-menu py-1"
          >
            {CLAUDE_EFFORT_TIERS.map((tier) => {
              const active = props.selected.has(tier);
              const tierLabel = formatEffortLabel(tier);
              return (
                <button
                  key={tier}
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-label={
                    active ? t`Disable ${tierLabel} effort` : t`Enable ${tierLabel} effort`
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-surface-secondary/50"
                  onClick={() => props.onToggle(tier)}
                >
                  <span>{tierLabel}</span>
                  {active ? <Check className="size-3.5" /> : null}
                </button>
              );
            })}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

// ── Preset selector ──────────────────────────────────────────────────────────

/**
 * Dropdown of external-provider presets (z.ai, …). Picking one seeds the editor;
 * extend the list by adding to `PROFILE_PRESETS`.
 */
function PresetMenu(props: { onApply: (preset: ProfilePreset) => void }) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t`Apply provider preset`}
          className="h-6 min-h-6 gap-1 px-1.5 text-[11px]"
        >
          <Wand2 className="size-3" />
          <Trans>Presets</Trans>
          <ChevronDown className="size-3 shrink-0 text-muted" />
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-40 p-0">
        <Popover.Dialog className="!p-0">
          <div role="menu" aria-label={t`Provider presets`} className="poracode-menu py-1">
            {PROFILE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="menuitem"
                className="flex w-full items-center px-3 py-1.5 text-sm text-foreground hover:bg-surface-secondary/50"
                onClick={() => {
                  props.onApply(preset);
                  setIsOpen(false);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

// ── Per-profile editor (rendered on the profile's own settings page) ──────────

/**
 * The external-provider editor for one Claude profile. Owns the whole instance
 * (name, config dir, env vars, models, effort) so there is a single source of
 * truth and a single Save. Reads the instance from the store by id; renders
 * nothing for an unknown / non-Claude id.
 */
export function ClaudeProfileProviderSettings(props: { instanceId: string }) {
  const instance = useSharedSettings((s) => s.agentInstances?.[props.instanceId]);
  if (!instance || instance.driver !== "claude") return null;
  let config: ClaudeProfileInstanceConfig;
  try {
    config = parseClaudeProfileInstanceConfig(instance.config);
  } catch {
    return null;
  }
  return <ClaudeProfileEditor key={instance.id} instance={instance} config={config} />;
}

function ClaudeProfileEditor(props: {
  instance: AgentInstanceConfig;
  config: ClaudeProfileInstanceConfig;
}) {
  const { t } = useLingui();
  const setAgentInstance = useSharedSettings((s) => s.setAgentInstance);
  const setHiddenModels = useSharedSettings((s) => s.setHiddenModels);
  const profileKind = claudeProfileKind(props.instance.id);
  const profileStatus = useAgentStatusesStore(
    (s) =>
      s.agentStatuses.find((status) => status.kind === profileKind) ??
      s.wslAgentStatuses.find((status) => status.kind === profileKind),
  );
  const rowIdCounter = useRef(0);
  const nextRowId = () => `r${(rowIdCounter.current += 1)}`;

  // Local editor state is seeded once from props; the editor is keyed by
  // instance id so it re-seeds when a different profile takes its place. The
  // save handler re-seeds from the sealed instance it gets back (re-masking
  // secrets) — it does not resync to unrelated external store updates, which
  // would clobber the user's in-progress edits.
  const [name, setName] = useState(props.instance.displayName ?? props.instance.id);
  const [configDir, setConfigDir] = useState(props.config.configDir);
  const [envRows, setEnvRows] = useState<EnvRow[]>(() =>
    rowsFromEnvironment(props.instance.environment, nextRowId),
  );
  const [modelRows, setModelRows] = useState<ModelRow[]>(() =>
    modelsFromConfig(props.config.models, nextRowId),
  );
  const [selectedEfforts, setSelectedEfforts] = useState<Set<string>>(() =>
    selectedEffortsFromConfig(props.config.efforts),
  );
  const [saving, setSaving] = useState(false);

  const displayLabel = props.instance.displayName ?? props.instance.id;
  const trimmedName = name.trim();
  const trimmedConfigDir = configDir.trim();
  const canSave = trimmedName.length > 0 && trimmedConfigDir.length > 0 && !saving;

  const updateEnvRow = (rowId: string, patch: Partial<EnvRow>) =>
    setEnvRows((rows) => rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));

  const addEnvRow = () =>
    setEnvRows((rows) => [
      ...rows,
      { rowId: nextRowId(), key: "", value: "", sensitive: false, replacing: false },
    ]);

  // Applying a preset seeds the editor and persists picker models so the shared
  // "Visible models" section can refresh immediately.
  const applyPreset = (preset: ProfilePreset) => {
    const nextModelRows = (() => {
      const existing = new Set(modelRows.map((row) => row.id.trim()));
      const additions = preset.models
        .filter((model) => !existing.has(model.id))
        .map((model) => ({ rowId: nextRowId(), id: model.id, label: model.label }));
      return additions.length > 0 ? [...modelRows, ...additions] : modelRows;
    })();
    const nextEfforts = new Set(preset.efforts);
    const models = cleanModels(nextModelRows);
    const efforts = effortsConfigFromSelection(nextEfforts);
    const config: ClaudeProfileInstanceConfig = { ...props.config };
    const presetModelIds = new Set(preset.models.map((model) => model.id));
    const currentModelIds =
      profileStatus?.capabilities.models.map((model) => model.id) ?? CLAUDE_PROFILE_BASE_MODEL_IDS;
    if (models) config.models = models;
    else delete config.models;
    if (efforts) config.efforts = efforts;
    else delete config.efforts;

    setEnvRows((rows) => applyPresetEnvRows(preset.envRows, rows, nextRowId));
    setSelectedEfforts(nextEfforts);
    setModelRows(nextModelRows);
    setAgentInstance({ ...props.instance, config });
    setHiddenModels(
      profileKind,
      currentModelIds.filter((id) => id !== "auto" && !presetModelIds.has(id)),
    );
    refreshClaudeProfile(profileKind);
  };

  const updateModelRow = (rowId: string, patch: Partial<ModelRow>) =>
    setModelRows((rows) => rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));

  const toggleEffort = (tier: string) =>
    setSelectedEfforts((current) => {
      const next = new Set(current);
      // Keep at least one tier enabled so the picker always has a choice.
      if (next.has(tier)) {
        if (next.size > 1) next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });

  const save = () => {
    if (!canSave) return;
    setSaving(true);
    const environment = environmentFromRows(envRows);
    const models = cleanModels(modelRows);
    const efforts = effortsConfigFromSelection(selectedEfforts);
    const config: ClaudeProfileInstanceConfig = {
      configDir: trimmedConfigDir,
      ...(models ? { models } : {}),
      ...(efforts ? { efforts } : {}),
    };
    // Seal sensitive env in main first (returns the instance with sealed env),
    // then persist the non-secret config through the store.
    void readBridge()
      .setClaudeProfileEnvironment({ instanceId: props.instance.id, environment })
      .then((updated) => {
        setAgentInstance({ ...updated, displayName: trimmedName, config });
        setEnvRows(rowsFromEnvironment(updated.environment, nextRowId));
        refreshClaudeProfile(claudeProfileKind(props.instance.id));
        toast.success(t`Claude ${trimmedName || displayLabel} profile saved.`);
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error
            ? error.message
            : t`Unable to save Claude ${displayLabel} profile.`,
        ),
      )
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-5 border-t border-border/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>External provider</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>
              Point this profile at a non-Anthropic provider (z.ai, …) with custom env vars, model
              names, and effort levels.
            </Trans>
          </p>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          aria-label={t`Save Claude profile`}
          className="h-7 min-h-7 px-3 text-[11px]"
          isDisabled={!canSave}
          isPending={saving}
          onPress={save}
        >
          <Trans>Save</Trans>
        </Button>
      </div>

      {/* Profile basics */}
      <section className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Name</Trans>
          </span>
          <Input
            aria-label={t`Claude profile name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Config directory</Trans>
          </span>
          <Input
            aria-label={t`Claude profile config directory`}
            className="font-mono text-xs"
            value={configDir}
            onChange={(event) => setConfigDir(event.target.value)}
          />
        </div>
      </section>

      {/* Environment variables */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground">
            <Trans>Environment variables</Trans>
          </p>
          <div className="flex items-center gap-1">
            <PresetMenu onApply={applyPreset} />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-h-6 gap-1 px-1.5 text-[11px]"
              onPress={addEnvRow}
            >
              <Plus className="size-3" />
              <Trans>Add</Trans>
            </Button>
          </div>
        </div>
        {envRows.length === 0 ? (
          <p className="text-[11px] text-muted">
            <Trans>
              Override Claude defaults — e.g. ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN.
            </Trans>
          </p>
        ) : null}
        {envRows.map((row) => {
          const masked = row.sensitive && Boolean(row.sealed) && !row.replacing;
          return (
            <div key={row.rowId} className="flex items-center gap-2">
              <Input
                aria-label={t`Environment variable name`}
                className="min-w-0 flex-1 font-mono text-xs"
                placeholder="NAME"
                value={row.key}
                onChange={(event) => {
                  const key = event.target.value;
                  updateEnvRow(row.rowId, {
                    key,
                    // Auto-flag obvious secrets the first time the key is set.
                    ...(row.value.length === 0 && !row.sealed
                      ? { sensitive: shouldTreatEnvKeyAsSensitive(key) }
                      : {}),
                  });
                }}
              />
              <Input
                aria-label={t`Environment variable value`}
                className="min-w-0 flex-1 font-mono text-xs"
                placeholder={masked ? "" : t`value`}
                type={row.sensitive ? "password" : "text"}
                value={masked ? SAVED_SECRET_MASK : row.value}
                onFocus={() => {
                  if (masked) updateEnvRow(row.rowId, { replacing: true, value: "" });
                }}
                onBlur={() => {
                  if (row.sealed && row.value.length === 0) {
                    updateEnvRow(row.rowId, { replacing: false });
                  }
                }}
                onChange={(event) => updateEnvRow(row.rowId, { value: event.target.value })}
              />
              <Button
                isIconOnly
                aria-label={
                  row.sensitive ? t`Store as plain text` : t`Store as secret (encrypted at rest)`
                }
                size="sm"
                variant="ghost"
                className="h-7 w-7 min-w-7 text-foreground/70"
                onPress={() =>
                  updateEnvRow(row.rowId, {
                    sensitive: !row.sensitive,
                    // Leaving secret mode reveals the field for re-entry.
                    ...(row.sensitive ? { replacing: true, sealed: undefined } : {}),
                  })
                }
              >
                {row.sensitive ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
              </Button>
              <Button
                isIconOnly
                aria-label={t`Remove environment variable`}
                size="sm"
                variant="ghost"
                className="h-7 w-7 min-w-7 text-foreground/70"
                onPress={() =>
                  setEnvRows((rows) => rows.filter((entry) => entry.rowId !== row.rowId))
                }
              >
                <X className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </section>

      {/* Model names */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground">
            <Trans>Models</Trans>
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 min-h-6 gap-1 px-1.5 text-[11px]"
            onPress={() =>
              setModelRows((rows) => [...rows, { rowId: nextRowId(), id: "", label: "" }])
            }
          >
            <Plus className="size-3" />
            <Trans>Add model</Trans>
          </Button>
        </div>
        {modelRows.length === 0 ? (
          <p className="text-[11px] text-muted">
            <Trans>Using the built-in Claude model list.</Trans>
          </p>
        ) : null}
        {modelRows.map((row) => (
          <div key={row.rowId} className="flex items-center gap-2">
            <Input
              aria-label={t`Model id`}
              className="min-w-0 flex-1 font-mono text-xs"
              placeholder="glm-5.2[1m]"
              value={row.id}
              onChange={(event) => updateModelRow(row.rowId, { id: event.target.value })}
            />
            <Input
              aria-label={t`Model label`}
              className="min-w-0 flex-1 text-xs"
              placeholder={t`GLM 5.2 (optional label)`}
              value={row.label}
              onChange={(event) => updateModelRow(row.rowId, { label: event.target.value })}
            />
            <Button
              isIconOnly
              aria-label={t`Remove model`}
              size="sm"
              variant="ghost"
              className="h-7 w-7 min-w-7 text-foreground/70"
              onPress={() =>
                setModelRows((rows) => rows.filter((entry) => entry.rowId !== row.rowId))
              }
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
      </section>

      {/* Effort levels */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium text-foreground">
          <Trans>Effort levels</Trans>
        </p>
        <p className="text-[11px] text-muted">
          <Trans>Disable tiers an external provider collapses (e.g. keep only High and Max).</Trans>
        </p>
        <div className="max-w-xs">
          <EffortMultiSelect selected={selectedEfforts} onToggle={toggleEffort} />
        </div>
      </section>
    </div>
  );
}

// ── Simple profile list (rendered on the base "Claude Code" page) ────────────

function ClaudeProfileRow(props: {
  instance: AgentInstanceConfig;
  config: ClaudeProfileInstanceConfig;
  onOpen: () => void;
  onRemove: (id: string) => void;
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
        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
          {label}
          {profileUsesExternalProvider(props.instance, props.config) ? (
            <span className="rounded bg-primary/15 px-1 py-px text-[10px] font-medium text-primary">
              <Trans>External</Trans>
            </span>
          ) : null}
        </span>
        <span className="max-w-full truncate font-mono text-[11px] text-muted">
          {props.config.configDir}
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
          aria-label={t`Remove Claude profile`}
          size="sm"
          variant="ghost"
          className="h-7 w-7 min-w-7 text-danger"
          onPress={() => props.onRemove(props.instance.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ClaudeProfileSettings(props: {
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  const { t } = useLingui();
  const agentInstances = useSharedSettings((s) => s.agentInstances ?? {});
  const setAgentInstance = useSharedSettings((s) => s.setAgentInstance);
  const removeAgentInstance = useSharedSettings((s) => s.removeAgentInstance);
  const removeAgentStatus = useAgentStatusesStore((s) => s.removeAgentStatus);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newConfigDir, setNewConfigDir] = useState("");

  const profiles: Array<{ instance: AgentInstanceConfig; config: ClaudeProfileInstanceConfig }> =
    [];
  for (const instance of Object.values(agentInstances)) {
    if (instance.driver !== "claude") continue;
    try {
      const config = parseClaudeProfileInstanceConfig(instance.config);
      profiles.push({ instance, config });
    } catch {
      // Ignore malformed records here; the supervisor skips them too.
    }
  }
  profiles.sort((a, b) =>
    (a.instance.displayName ?? a.instance.id).localeCompare(
      b.instance.displayName ?? b.instance.id,
    ),
  );

  const canAdd = newName.trim().length > 0;
  // Live default shown as the dir placeholder; used verbatim when left empty.
  const suggestedConfigDir = defaultConfigDir(newName);

  function closeAddForm(): void {
    setIsAdding(false);
    setNewName("");
    setNewConfigDir("");
  }

  function addProfile(): void {
    const displayName = newName.trim();
    const configDir = newConfigDir.trim() || suggestedConfigDir;
    if (!displayName) return;
    const id = uniqueProfileId(displayName, agentInstances);
    const instance: AgentInstanceConfig = {
      id,
      driver: "claude",
      displayName,
      config: { configDir },
    };
    setAgentInstance(instance);
    refreshClaudeProfile(claudeProfileKind(id));
    closeAddForm();
    toast.success(t`Claude ${displayName} profile added.`);
    // Open the new profile's page so it can be pointed at an external provider.
    props.onOpenProfile?.(claudeProfileKind(id));
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
              Separate Claude Code accounts by config directory, or point a profile at an external
              provider (z.ai, …). Open a profile to configure its env vars, models, and effort.
            </Trans>
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 min-h-7 gap-1 px-2 text-[11px]"
          onPress={() => refreshClaudeProfile()}
        >
          <RefreshCw className="size-3" />
          <Trans>Refresh</Trans>
        </Button>
      </div>

      {profiles.length === 0 && !isAdding ? (
        <p className="py-2 text-xs text-muted">
          <Trans>No additional Claude profiles.</Trans>
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {profiles.map(({ instance, config }) => (
          <ClaudeProfileRow
            key={instance.id}
            instance={instance}
            config={config}
            onOpen={() => props.onOpenProfile?.(claudeProfileKind(instance.id))}
            onRemove={(id) => {
              const kind = claudeProfileKind(id);
              removeAgentInstance(id);
              removeAgentStatus(kind);
              refreshClaudeProfile();
              toast.success(t`Claude profile removed.`);
            }}
          />
        ))}

        {isAdding ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2 rounded-xl border border-border/15 bg-surface-secondary/30 p-3">
            <Input
              // Focus the name field when the form is revealed by the explicit
              // "Add profile" press (the accepted exception to no-autofocus).
              ref={(node: HTMLInputElement | null) => node?.focus()}
              aria-label={t`New Claude profile name`}
              className="min-w-0"
              placeholder={t`e.g. Work`}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Input
              aria-label={t`New Claude profile config directory`}
              className="min-w-0"
              placeholder={suggestedConfigDir}
              value={newConfigDir}
              onChange={(event) => setNewConfigDir(event.target.value)}
            />
            {/* Icon-only actions matching the saved rows' action pair, so the
                action column keeps the same width when the draft opens. */}
            <div className="flex shrink-0 items-center gap-1 justify-self-end">
              <Button
                isIconOnly
                aria-label={t`Add Claude profile`}
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
                aria-label={t`Cancel new Claude profile`}
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

/**
 * Registry-driven settings panel for the Claude family: the base agent page
 * manages the profile list; a profile page shows that profile's own settings.
 * Wired via `NATIVE_AGENT_REGISTRY_ENTRIES[claude].settingsPanel`.
 */
export function ClaudeAgentSettingsPanel(props: {
  agentKind: string;
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  const instanceId = extractClaudeProfileInstanceId(props.agentKind);
  if (instanceId !== undefined) {
    return <ClaudeProfileProviderSettings key={props.agentKind} instanceId={instanceId} />;
  }
  return <ClaudeProfileSettings onOpenProfile={props.onOpenProfile} />;
}
