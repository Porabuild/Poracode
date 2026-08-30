import { useRef, useState } from "react";
import { Button, Popover, toast } from "@heroui/react";
import { Check, ChevronDown, Lock, LockOpen, Plus, Wand2, X } from "lucide-react";
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
import { i18n } from "@/renderer/i18n/i18n";
import { Input } from "@/renderer/components/common";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { currentWslDistros } from "@/renderer/utils/acpRegistryAuth";
import { AgentProfileList } from "./AgentProfileList";
import type { NativeAgentProfileSupport } from "./agentRegistryNative";
import {
  applyPresetEnvRows,
  cleanModels,
  defaultConfigDir,
  effortsConfigFromSelection,
  environmentFromRows,
  modelEffortsFromRows,
  modelsFromConfig,
  toggleEffortTier,
  profileUsesExternalProvider,
  PROFILE_PRESETS,
  rowsFromEnvironment,
  SAVED_SECRET_MASK,
  selectedEffortsFromConfig,
  shouldTreatEnvKeyAsSensitive,
  type EnvRow,
  type ModelRow,
  type ProfilePreset,
} from "./ClaudeProfileSettingsModel";

const CLAUDE_PROFILE_BASE_MODEL_IDS = [
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "sonnet",
  "haiku",
];
const EMPTY_EFFORT_SELECTION = new Set<string>();

function refreshClaudeProfile(kind?: string): void {
  window.setTimeout(() => {
    void readBridge()
      .refreshAgentStatuses(currentWslDistros(), kind ? { agentKinds: [kind] } : undefined)
      .catch((error) =>
        toast.danger(
          error instanceof Error ? error.message : i18n._(msg`Unable to refresh Claude profiles.`),
        ),
      );
  }, 50);
}

// ── Effort multiselect dropdown ──────────────────────────────────────────────

function EffortMultiSelect(props: {
  selected: ReadonlySet<string>;
  onToggle: (tier: string) => void;
  tiers?: readonly string[];
  inherited?: boolean;
  onInherit?: () => void;
  ariaLabel?: string;
}) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const tiers = props.tiers ?? CLAUDE_EFFORT_TIERS;
  const selectedTiers = tiers.filter((tier) => props.selected.has(tier));
  const summary = props.inherited
    ? t`Inherit global`
    : selectedTiers.length === tiers.length
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
          aria-label={props.ariaLabel ?? t`Effort levels`}
          className="h-7 min-h-7 w-full justify-between gap-2 px-2 text-[11px] font-normal"
        >
          <span className="truncate text-foreground">{summary}</span>
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
            {props.onInherit ? (
              <button
                type="button"
                role="option"
                aria-selected={props.inherited === true}
                className="flex w-full items-center justify-between gap-2 border-b border-border/10 px-3 py-1.5 text-sm text-foreground hover:bg-surface-secondary/50"
                onClick={props.onInherit}
              >
                <Trans>Inherit global</Trans>
                {props.inherited ? <Check className="size-3.5" /> : null}
              </button>
            ) : null}
            {tiers.map((tier) => {
              const active = props.selected.has(tier);
              const tierLabel = formatEffortLabel(tier);
              return (
                <button
                  key={tier}
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-label={
                    props.onInherit
                      ? tierLabel
                      : active
                        ? t`Disable ${tierLabel} effort`
                        : t`Enable ${tierLabel} effort`
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
                {t(preset.label)}
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
    modelsFromConfig(props.config.models, props.config.modelEfforts, nextRowId),
  );
  const [selectedEfforts, setSelectedEfforts] = useState<Set<string>>(() =>
    selectedEffortsFromConfig(props.config.efforts),
  );
  const [saving, setSaving] = useState(false);

  const displayLabel = props.instance.displayName ?? props.instance.id;
  const trimmedName = name.trim();
  const trimmedConfigDir = configDir.trim();
  const canSave = trimmedName.length > 0 && trimmedConfigDir.length > 0 && !saving;
  // Per-model effort pickers only offer tiers enabled at the profile level. This
  // is invariant across rows, so compute it once instead of inside the row map.
  const allowedTiers = CLAUDE_EFFORT_TIERS.filter((tier) => selectedEfforts.has(tier));

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
    const nextModelRows = modelsFromConfig(preset.models, preset.modelEfforts, nextRowId);
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
    config.defaultEffort = preset.defaultEffort;
    const modelEfforts = modelEffortsFromRows(nextModelRows, nextEfforts);
    if (modelEfforts) config.modelEfforts = modelEfforts;
    else delete config.modelEfforts;

    setEnvRows((rows) =>
      applyPresetEnvRows(
        preset.envRows,
        rows,
        nextRowId,
        preset.removeEnvKeys,
        preset.credentialAliases,
      ),
    );
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

  const updateModelEfforts = (rowId: string, efforts?: Set<string>) =>
    setModelRows((rows) =>
      rows.map((row) => {
        if (row.rowId !== rowId) return row;
        if (efforts) return { ...row, efforts };
        const { efforts: _efforts, ...inheritedRow } = row;
        return inheritedRow;
      }),
    );

  const toggleEffort = (tier: string) =>
    setSelectedEfforts((current) => toggleEffortTier(current, tier));

  const save = () => {
    if (!canSave) return;
    setSaving(true);
    const environment = environmentFromRows(envRows);
    const models = cleanModels(modelRows);
    const efforts = effortsConfigFromSelection(selectedEfforts);
    const modelEfforts = modelEffortsFromRows(modelRows, selectedEfforts);
    const config: ClaudeProfileInstanceConfig = {
      configDir: trimmedConfigDir,
      ...(models ? { models } : {}),
      ...(efforts ? { efforts } : {}),
      ...(props.config.defaultEffort ? { defaultEffort: props.config.defaultEffort } : {}),
      ...(modelEfforts ? { modelEfforts } : {}),
    };
    // Seal sensitive env in main first (returns the instance with sealed env),
    // then persist the non-secret config through the store.
    void readBridge()
      .setProfileEnvironment({ instanceId: props.instance.id, environment })
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
        {modelRows.map((row) => {
          const modelName = row.label.trim() || row.id.trim() || t`new model`;
          const inherited = row.efforts === undefined;
          const modelEfforts = row.efforts ?? EMPTY_EFFORT_SELECTION;
          return (
            <div key={row.rowId} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={t`Model id`}
                className="min-w-48 flex-[1_1_12rem] font-mono text-xs"
                placeholder="glm-5.3[1m]"
                value={row.id}
                onChange={(event) => updateModelRow(row.rowId, { id: event.target.value })}
              />
              <Input
                aria-label={t`Model label`}
                className="min-w-48 flex-[1_1_12rem] text-xs"
                placeholder={t`GLM 5.3 (optional label)`}
                value={row.label}
                onChange={(event) => updateModelRow(row.rowId, { label: event.target.value })}
              />
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <div className="w-36">
                  <EffortMultiSelect
                    selected={modelEfforts}
                    tiers={allowedTiers}
                    inherited={inherited}
                    ariaLabel={t`Effort levels for ${modelName}`}
                    onInherit={() => updateModelEfforts(row.rowId)}
                    onToggle={(tier) =>
                      updateModelEfforts(row.rowId, toggleEffortTier(modelEfforts, tier))
                    }
                  />
                </div>
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
            </div>
          );
        })}
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

// ── Profile list descriptor (rendered on the base "Claude Code" page) ────────

/**
 * Claude profiles are distinguished by their config directory, and optionally
 * point at an external provider through their env vars.
 */
function ClaudeProfileConfigDir(props: { instance: AgentInstanceConfig }) {
  let config: ClaudeProfileInstanceConfig | undefined;
  try {
    config = parseClaudeProfileInstanceConfig(props.instance.config);
  } catch {
    // Malformed records are skipped by the supervisor too; show the id only.
    config = undefined;
  }
  return (
    <span className="flex items-center gap-1.5">
      {config && profileUsesExternalProvider(props.instance, config) ? (
        <span className="rounded bg-primary/15 px-1 py-px text-[10px] font-medium text-primary">
          <Trans>External</Trans>
        </span>
      ) : null}
      <span className="truncate font-mono">{config?.configDir ?? props.instance.id}</span>
    </span>
  );
}

export const claudeProfileSupport: NativeAgentProfileSupport = {
  driver: "claude",
  description: (
    <Trans>
      Separate Claude Code accounts by config directory, or point a profile at an external provider
      (z.ai, …). Open a profile to configure its env vars, models, and effort.
    </Trans>
  ),
  field: {
    ariaLabel: msg`New Claude profile config directory`,
    // Live default shown as the placeholder and used verbatim when left empty.
    placeholderFor: (name) => defaultConfigDir(name),
  },
  RowSubtitle: ClaudeProfileConfigDir,
  removalBody: (profileName) => (
    <Trans>
      Removing {profileName} drops its Poracode settings — env vars, models, and effort. Its config
      directory and the Claude credentials inside it stay on disk.
    </Trans>
  ),
  createPayload: ({ id, displayName, field }) => ({
    driver: "claude",
    id,
    displayName,
    config: { configDir: field },
  }),
};

export function ClaudeProfileSettings(props: {
  onOpenProfile?: ((profileKind: string) => void) | undefined;
}) {
  return <AgentProfileList profiles={claudeProfileSupport} onOpenProfile={props.onOpenProfile} />;
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
