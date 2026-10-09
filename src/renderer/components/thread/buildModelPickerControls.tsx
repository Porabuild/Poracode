import { capabilitiesForSessionConfig } from "@/shared/sessionConfigCapabilities";
import { Zap } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type {
  AgentCapability,
  AgentStatus,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { baseAgentKind, isThreadConfigEqual } from "@/shared/contracts";
import { migrateCursorBaseId, parseCursorModelId } from "@/shared/cursorModelId";
import type { ModelFamilyConfig, ModelSelectionEdit } from "@/shared/modelFamilySelection";
import {
  applyModelSelectionEdit,
  modelFamilyDisplayConfig,
  modelFamilyEfforts,
  modelFamilyFastAvailable,
  modelFamilyForModel,
} from "@/shared/modelFamilySelection";
import { i18n } from "@/renderer/i18n/i18n";
import {
  defaultFastEnabled,
  normalizeProviderModelConfig,
} from "@/renderer/components/providers/modelConfig";
import type { SelectionBindingOwner } from "@/shared/selectionBinding.schemas";
import {
  applyComposerSelectionMutation,
  type ComposerSelectionOrigin,
} from "./composerSelectionMutation";
import {
  statusToMenuProvider,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import type { ProviderModelSelection } from "@/renderer/components/common/ProviderModelMenu/parts/types";
import {
  modelVisibilityKey,
  providerLabelForPresentation,
  providerMenuKey,
  providerVisibilityKey,
} from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import {
  getComposerConfigBehavior,
  getComposerControls,
} from "@/renderer/components/providers/providerComposer";
import { EffortIcon } from "@/renderer/components/providers/EffortIcon";
import {
  capabilitiesForPresentation,
  filterHiddenModels,
  modelSelectionFor,
  withModelVisible,
} from "@/shared/agentSelection";
import type { ComposerControl } from "./ThreadComposer";
import { formatEffortLabel, supportsUsableFastMode } from "./threadDraftViewHelpers";
import type { ProviderModelPreference } from "@/shared/settings";

export type ModelPickerConfigPatch = {
  model?: string;
  effort?: string;
  contextSize?: string;
  fast?: boolean;
  thinking?: boolean;
};

export type BuildModelPickerControlsInput = {
  providers: ProviderModelMenuProvider[];
  selectedAgentKind: string;
  model: string;
  effort?: string;
  contextSize?: string;
  fast?: boolean;
  thinking?: boolean;
  capabilities: AgentCapability;
  presentationMode?: ThreadPresentationMode;
  lockedAgentKind?: string;
  /** Machine whose provider-order preference applies to the picker. */
  machineKey?: string;
  isDisabled?: boolean;
  hideLabelOnWrap?: boolean;
  includeFastToggle?: boolean;
  /** Ask before applying a context-size change (see `ComposerConfigBehavior`). */
  confirmContextChange?: boolean;
  onProviderModelChange: (next: ProviderModelSelection) => void;
  /**
   * One resolved config edit. `origin` is the optional ephemeral
   * selection-event metadata (see `ComposerSelectionOrigin`): a patch the
   * shared relation helper resolved carries `family-resolved`, the ordinary
   * model-menu path carries `raw-pick`, and an absent origin lets the
   * composition point classify from the patch's touched keys alone.
   */
  onConfigPatch: (patch: ModelPickerConfigPatch, origin?: ComposerSelectionOrigin) => void;
};

/**
 * Build the menu provider for a single agent surface, applying the
 * presentation-specific identity (key, visibility key, label) and capabilities.
 */
function makeMenuProvider(
  agent: AgentStatus,
  presentationMode: ThreadPresentationMode,
  runtimeVariant?: string,
): ProviderModelMenuProvider {
  const presentationCapabilities = capabilitiesForPresentation(
    agent.capabilities,
    presentationMode,
  );
  // A surface is runtime-scoped when the adapter declares a runtime badge that
  // names one of its runtime variants for this presentation mode.
  const declaredRuntimeVariant = presentationCapabilities.runtimeLabel?.toLowerCase();
  const resolvedRuntimeVariant =
    runtimeVariant ??
    (declaredRuntimeVariant &&
    agent.runtimeVariants?.[declaredRuntimeVariant]?.presentationMode === presentationMode
      ? declaredRuntimeVariant
      : undefined);
  const runtime = resolvedRuntimeVariant
    ? agent.runtimeVariants?.[resolvedRuntimeVariant]
    : undefined;
  const provider: ProviderModelMenuProvider = {
    kind: agent.kind,
    label: agent.label,
    presentationMode,
    ...(resolvedRuntimeVariant ? { runtimeVariant: resolvedRuntimeVariant } : {}),
    ...(agent.icon ? { icon: agent.icon } : {}),
    modelPickerKey: providerMenuKey({
      kind: agent.kind,
      presentationMode,
      ...(resolvedRuntimeVariant ? { runtimeVariant: resolvedRuntimeVariant } : {}),
    }),
    hiddenModelsKey: modelVisibilityKey(agent.kind, presentationMode, resolvedRuntimeVariant),
    capabilities: runtime?.capabilities ?? presentationCapabilities,
  };
  return { ...provider, label: providerLabelForPresentation(provider) };
}

export function buildProviderModelMenuProviders(
  agents: readonly AgentStatus[],
  options?: {
    presentationMode?: ThreadPresentationMode;
    resolvePresentationMode?: (agent: AgentStatus) => ThreadPresentationMode;
    hiddenModelsByAgent?: Readonly<Record<string, readonly string[] | undefined>>;
    filterAgent?: (agent: AgentStatus) => boolean;
  },
): ProviderModelMenuProvider[] {
  const { presentationMode, resolvePresentationMode, hiddenModelsByAgent, filterAgent } =
    options ?? {};

  return agents
    .filter((agent) => (filterAgent ? filterAgent(agent) : true))
    .map((agent) => {
      const agentPresentationMode =
        resolvePresentationMode?.(agent) ?? presentationMode ?? agent.capabilities.presentationMode;
      const menuProvider = makeMenuProvider(agent, agentPresentationMode);
      return {
        ...menuProvider,
        capabilities: filterHiddenModels(
          menuProvider.capabilities,
          hiddenModelsByAgent?.[providerVisibilityKey(menuProvider)],
        ),
      };
    });
}

/**
 * Whether a presentation override publishes a model catalog different from the
 * root capability object — the condition for an unnamed surface to earn its
 * own visibility row. An override redeclares the full catalog for its surface,
 * so one that repeats the root models (or declares none) keeps the ordinary
 * single row: the surfaces are indistinguishable for model visibility.
 */
function hasDistinctPresentationCatalog(
  capabilities: AgentCapability,
  presentationMode: ThreadPresentationMode,
): boolean {
  const overrideModels = capabilities.presentationCapabilities?.[presentationMode]?.models;
  if (!overrideModels) return false;
  if (overrideModels.length !== capabilities.models.length) return true;
  const rootIds = new Set(capabilities.models.map((model) => model.id));
  return overrideModels.some((model) => !rootIds.has(model.id));
}

/**
 * A visibility surface earns a row only when it lists at least one real model —
 * an empty catalog, or one whose only entry is the synthetic "auto", leaves the
 * section with nothing to toggle.
 */
function hasRealModel(provider: ProviderModelMenuProvider): boolean {
  return provider.capabilities.models.some((model) => model.id !== "auto");
}

/**
 * Expand an agent into one menu provider per model-visibility surface. Surfaces
 * come from named runtime variants (a CLI terminal surface plus independently
 * detected structured runtimes, each with its own hidden-model persistence key)
 * or, when no runtime is named, from presentation overrides that publish a
 * different model catalog than the root capability object — one unnamed surface
 * per supported presentation mode. Every branch — the ordinary single row
 * included — drops surfaces without a real model, so a provider with no
 * selectable model earns no visibility section at all.
 */
export function expandAgentToVisibilityProviders(agent: AgentStatus): ProviderModelMenuProvider[] {
  const supported = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
  const runtimeVariants = agent.runtimeVariants;
  if (!runtimeVariants || Object.keys(runtimeVariants).length === 0) {
    if (!supported.some((mode) => hasDistinctPresentationCatalog(agent.capabilities, mode))) {
      const ordinary = statusToMenuProvider(agent);
      return hasRealModel(ordinary) ? [ordinary] : [];
    }
    // Unnamed surfaces keep the per-kind visibility-key defaults
    // (`modelVisibilityKey`), so one persisted hidden set serves every catalog
    // and a toggle retains the ids only the sibling catalog lists.
    return supported
      .map((presentationMode) => makeMenuProvider(agent, presentationMode))
      .filter(hasRealModel);
  }

  const providers = supported.flatMap((presentationMode) => {
    const runtimeProviders = Object.entries(runtimeVariants)
      .filter(
        ([, runtime]) =>
          runtime.installed &&
          runtime.authState === "authenticated" &&
          runtime.presentationMode === presentationMode,
      )
      .map(([runtimeVariant]) => makeMenuProvider(agent, presentationMode, runtimeVariant));
    return runtimeProviders.length > 0
      ? runtimeProviders
      : [makeMenuProvider(agent, presentationMode)];
  });
  return providers.filter(hasRealModel);
}

export function patchConfigForModelChange(
  capabilities: AgentCapability,
  model: string,
  current: {
    effort?: string;
    contextSize?: string;
    fast?: boolean;
    thinking?: boolean;
  },
  agentKind = "",
): ModelPickerConfigPatch {
  const nextReasoning = modelSelectionFor(capabilities, model).reasoning;
  const effortValid = current.effort ? nextReasoning.values.includes(current.effort) : true;
  const nextContextIds = capabilities.modelContextSizes?.[model];
  const inheritedContext =
    current.contextSize && nextContextIds?.includes(current.contextSize)
      ? current.contextSize
      : undefined;
  // Always write contextSize so a model with no window does not keep the
  // previous model's size through `{ ...thread.config, ...patch }`.
  const nextContextSize =
    inheritedContext ??
    nextContextIds?.[0] ??
    (nextContextIds ? "" : (capabilities.defaultContextSize ?? ""));
  return {
    model,
    effort: effortValid && current.effort ? current.effort : (nextReasoning.default ?? ""),
    contextSize: nextContextSize,
    fast: supportsUsableFastMode(capabilities, model)
      ? (current.fast ?? defaultFastEnabled(agentKind))
      : false,
    thinking: capabilities.thinkingModels?.includes(model) ?? false,
  };
}

export function applyDefaultControlTiers(control: ComposerControl): ComposerControl {
  if (control.tier !== undefined) return control;
  if (control.kind === "toggle" && (control.label === "Plan" || control.label === "Work")) {
    return { ...control, tier: 2 };
  }
  if (
    (control.kind === undefined || control.kind === "toggle" || control.kind === "menu") &&
    control.iconKind === "permission"
  ) {
    return { ...control, tier: 1 };
  }
  return control;
}

/**
 * Resolve one explicit model-selection edit at the event boundary and surface a
 * rejection when the complete tuple has no member (a raced edit, or a hole in
 * the relation). The common composer controls and the provider-registered
 * family selectors both dispatch through this so an unavailable edit never
 * silently saves nothing and never invents a substitute.
 */
export function resolveModelSelectionEdit(
  capabilities: AgentCapability,
  config: ModelFamilyConfig | undefined,
  edit: ModelSelectionEdit,
): ModelPickerConfigPatch | null {
  const patch = applyModelSelectionEdit(capabilities, config, edit);
  if (patch === null) {
    toast.danger(i18n._(msg`That combination isn’t available`));
    return null;
  }
  // The shared helper only ever produces concrete model/effort/fast fields —
  // never an explicit `undefined` — so its `Partial<ThreadConfig>` narrows to
  // the picker patch shape.
  return patch as ModelPickerConfigPatch;
}

export function buildModelPickerControls(input: BuildModelPickerControlsInput): ComposerControl[] {
  const {
    providers,
    selectedAgentKind,
    model,
    effort,
    contextSize,
    fast,
    thinking,
    capabilities: filteredCaps,
    presentationMode,
    lockedAgentKind,
    machineKey,
    isDisabled,
    hideLabelOnWrap = true,
    includeFastToggle = true,
    confirmContextChange,
    onProviderModelChange,
    onConfigPatch,
  } = input;

  const modelSelection = modelSelectionFor(filteredCaps, model);
  // Inside a family relation the Effort/Fast controls derive from the member
  // tuple for model-bound axes (display only — the saved config keeps its
  // carriers) and stay on the ordinary ladders for config-bound ones. A
  // meaningful stored override keeps the raw saved view and its rejection path.
  const hasFamilyRelation = (filteredCaps.modelFamilies?.length ?? 0) > 0;
  const familyConfig: ModelFamilyConfig | undefined = hasFamilyRelation
    ? {
        model,
        effort,
        ...(fast !== undefined ? { fast } : {}),
        ...(thinking ? { thinking: true } : {}),
        ...(contextSize ? { contextSize } : {}),
      }
    : undefined;
  const family = hasFamilyRelation ? modelFamilyForModel(filteredCaps, model) : undefined;
  const displayConfig = familyConfig
    ? modelFamilyDisplayConfig(filteredCaps, familyConfig)
    : undefined;
  const shownEffort = displayConfig?.effort ?? effort;
  const shownFast = displayConfig?.fast ?? fast;
  const fastBound = family?.bindings.fast === "model";
  const currentEfforts = (
    familyConfig ? modelFamilyEfforts(filteredCaps, familyConfig) : modelSelection.reasoning.values
  ).map((id) => ({
    id,
    label: formatEffortLabel(id),
  }));
  const selectableEfforts = currentEfforts.length > 1 ? currentEfforts : [];
  const currentContextIds = filteredCaps.modelContextSizes?.[model];
  const currentContextSizes = currentContextIds
    ? (filteredCaps.contextSizes?.filter((c) => currentContextIds.includes(c.id)) ?? [])
    : [];
  const selectableContextSizes = currentContextSizes.length > 1 ? currentContextSizes : [];
  const fastAvailable = familyConfig
    ? modelFamilyFastAvailable(filteredCaps, familyConfig)
    : modelSelection.fast.available;
  const supportsFast = includeFastToggle && (fastBound || modelSelection.fast.supported);
  const supportsThinking = filteredCaps.thinkingModels?.includes(model) ?? false;

  // Explicit Effort/Fast edits resolve through the shared relation helper; a
  // model-bound axis produces the atomic member patch, and `null` (a raced
  // edit or a hole) is rejected visibly instead of saved. Resolved patches
  // keep their family origin — and an empty retain-no-op still reaches the
  // composition point, where the event reduction alone decides whether a
  // stale record is dropped (a binding-only change) or nothing changes.
  const editConfigPatch = (
    edit: { kind: "effort"; value: string } | { kind: "fast"; value: boolean },
  ): void => {
    if (!familyConfig) {
      onConfigPatch(edit.kind === "effort" ? { effort: edit.value } : { fast: edit.value });
      return;
    }
    const patch = resolveModelSelectionEdit(filteredCaps, familyConfig, edit);
    if (!patch) return;
    onConfigPatch(patch, { kind: "family-resolved" });
  };

  const controls: ComposerControl[] = [
    {
      kind: "provider-model",
      providers,
      currentAgentKind: selectedAgentKind,
      currentModel: model,
      ...(lockedAgentKind ? { lockedAgentKind } : {}),
      ...(machineKey ? { machineKey } : {}),
      ...(presentationMode ? { presentationMode } : {}),
      ...(isDisabled !== undefined ? { isDisabled } : {}),
      hideLabelOnWrap,
      tier: 5,
      onChange: onProviderModelChange,
    },
  ];

  if (selectableEfforts.length > 0 || selectableContextSizes.length > 0 || supportsThinking) {
    controls.push({
      kind: "effort-context",
      efforts: selectableEfforts,
      ...(selectableEfforts.length > 0 && shownEffort ? { effortValue: shownEffort } : {}),
      onEffortChange: (value) => editConfigPatch({ kind: "effort", value }),
      contextSizes: selectableContextSizes,
      ...(selectableContextSizes.length > 0 && contextSize ? { contextValue: contextSize } : {}),
      onContextChange: (value) => onConfigPatch({ contextSize: value }),
      ...(confirmContextChange ? { confirmContextChange } : {}),
      thinkingSupported: supportsThinking,
      thinkingValue: thinking === true,
      onThinkingChange: (value) => onConfigPatch({ thinking: value }),
      ...(isDisabled !== undefined ? { isDisabled } : {}),
      hideLabelOnWrap,
      tier: 4,
      icon:
        selectableEfforts.length > 0 ? (
          <EffortIcon
            className="poracode-composer-effort-icon size-4 text-foreground"
            effort={shownEffort ?? ""}
            efforts={selectableEfforts.map((entry) => entry.id)}
          />
        ) : undefined,
    });
  }

  if (supportsFast) {
    const fastDisabledReason = fastBound
      ? fastAvailable
        ? undefined
        : i18n._(msg`Fast is unavailable for this pairing`)
      : modelSelection.fast.disabledReason;
    controls.push({
      kind: "toggle",
      label: "Fast",
      displayLabel: msg`Fast`,
      icon: <Zap className="size-3.5" />,
      iconKind: "fast",
      iconOnly: true,
      fillIconOnSelect: true,
      tier: 3,
      isSelected: shownFast === true,
      ...(isDisabled !== undefined ? { isDisabled } : {}),
      ...(fastDisabledReason ? { disabledReason: fastDisabledReason } : {}),
      onChange: (selected) => editConfigPatch({ kind: "fast", value: selected }),
    });
  }

  return controls;
}

export function appendProviderComposerControls(
  controls: ComposerControl[],
  options: {
    agentKind: string;
    capabilities: AgentCapability;
    config: ThreadConfig;
    presentationMode?: ThreadPresentationMode;
    isDisabled?: boolean;
    onConfigChange: (patch: Partial<ThreadConfig>, origin?: ComposerSelectionOrigin) => void;
  },
): ComposerControl[] {
  const factory = getComposerControls(options.agentKind);
  if (!factory) return controls;

  const providerControls = factory({
    capabilities: options.capabilities,
    config: options.config,
    isDisabled: options.isDisabled ?? false,
    onConfigChange: options.onConfigChange,
    ...(options.presentationMode ? { presentationMode: options.presentationMode } : {}),
  }).map(applyDefaultControlTiers);

  // A provider-owned paired control takes the ordinary effort carrier into its
  // one menu. Fast stays a separate composer control — its family-aware
  // resolver, availability, and shortcut are the ordinary toggle's own, so
  // pairing never duplicates it inside the panel. Context/thinking and their
  // confirmation callbacks remain intact; providers without a paired control
  // keep their existing toolbar.
  const paired = providerControls.find(
    (control) => control.kind === "effort-context" && control.familySelection,
  );
  if (paired?.kind !== "effort-context" || !paired.familySelection)
    return [...controls, ...providerControls];
  const commonEffort = controls.find((control) => control.kind === "effort-context");
  const combined: ComposerControl = {
    ...commonEffort,
    ...paired,
    ...(commonEffort?.kind === "effort-context"
      ? {
          contextSizes: commonEffort.contextSizes,
          ...(commonEffort.contextValue !== undefined
            ? { contextValue: commonEffort.contextValue }
            : {}),
          ...(commonEffort.onContextChange
            ? { onContextChange: commonEffort.onContextChange }
            : {}),
          ...(commonEffort.confirmContextChange ? { confirmContextChange: true } : {}),
          ...(commonEffort.thinkingSupported
            ? { thinkingSupported: true, thinkingValue: commonEffort.thinkingValue ?? false }
            : {}),
          ...(commonEffort.onThinkingChange
            ? { onThinkingChange: commonEffort.onThinkingChange }
            : {}),
        }
      : {}),
  };
  return [
    ...controls.filter((control) => control !== commonEffort),
    ...providerControls.map((control) => (control === paired ? combined : control)),
  ];
}

function normalizeCursorComposerConfig(
  agentKind: string,
  config: ThreadConfig | undefined,
  capabilities: AgentStatus["capabilities"],
): ThreadConfig {
  if (!config) return { model: capabilities.models[0]?.id ?? "auto" };
  if (
    baseAgentKind(agentKind) !== "cursor" ||
    capabilities.models.some((model) => model.id === config.model)
  ) {
    return config;
  }

  const parsed = parseCursorModelId(config.model);
  const baseModel = migrateCursorBaseId(parsed.baseId);
  if (!capabilities.models.some((model) => model.id === baseModel)) {
    const fallback = capabilities.models[0]?.id;
    return fallback
      ? {
          ...config,
          model: fallback,
          effort: undefined,
          contextSize: undefined,
          fast: false,
          thinking: false,
        }
      : config;
  }

  return {
    ...config,
    model: baseModel,
    ...(parsed.effort && !config.effort ? { effort: parsed.effort } : {}),
    ...(parsed.contextSize && !config.contextSize ? { contextSize: parsed.contextSize } : {}),
    fast: config.fast ?? parsed.fast,
    thinking: config.thinking ?? parsed.thinking,
  };
}

export function buildControls(
  thread: Thread,
  agentStatus: AgentStatus | undefined,
  hiddenModelIds: readonly string[] | undefined,
  onConfigChange: (config: ThreadConfig) => void,
  modelPreferences?: Record<string, ProviderModelPreference>,
  onModelPreferenceChange?: (model: string, preference: ProviderModelPreference) => void,
  machineKey?: string,
): ComposerControl[] {
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  if (presentationMode === "terminal") return [];
  if (!agentStatus) return [];

  // Resolve the surface before the live overlay: retained detection overrides
  // must not replace the current session's negotiated ladder.
  const presentationCapabilities = capabilitiesForSessionConfig(
    capabilitiesForPresentation(agentStatus.capabilities, presentationMode),
    thread.sessionConfigOptions,
  );
  const normalizedConfig = normalizeProviderModelConfig(
    thread.agentKind,
    normalizeCursorComposerConfig(thread.agentKind, thread.config, presentationCapabilities),
    presentationCapabilities.models,
  );
  // The model a thread already runs with stays selectable in its own composer
  // even if it is hidden for this surface — otherwise the picker has no entry
  // to label it from and shows the raw model id.
  const filteredCaps = withModelVisible(
    filterHiddenModels(presentationCapabilities, hiddenModelIds),
    presentationCapabilities,
    normalizedConfig.model,
  );
  const effectiveConfig = normalizedConfig;
  const isDisabled = !thread.canResumeWithConfig && thread.status !== "launching";
  // The actual owner of this thread's selection evidence: the full adapter
  // kind, the concrete active presentation, and the actual instance id only
  // when the thread has one — never derived from a stored binding.
  const owner: SelectionBindingOwner = {
    agentKind: thread.agentKind,
    presentationMode,
    ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
  };
  // The complete-config replacement seam: every resolved composer edit is
  // reduced to its neutral selection event over the stored config, and the
  // result is persisted only when it truly differs — a harmless no-op (a
  // retained family-row click, a same-value touch with nothing to revoke)
  // never becomes a native setter acknowledgement or a preference write.
  const onPatch = (patch: Partial<ThreadConfig>, origin?: ComposerSelectionOrigin) => {
    const config = applyComposerSelectionMutation({
      previous: thread.config,
      effective: effectiveConfig,
      patch,
      origin,
      capabilities: filteredCaps,
      owner,
    });
    if (isThreadConfigEqual(config, thread.config)) return;
    onConfigChange(config);
    onModelPreferenceChange?.(config.model, {
      ...(config.effort ? { effort: config.effort } : {}),
      ...(config.fast !== undefined ? { fast: config.fast } : {}),
    });
  };
  const provider: ProviderModelMenuProvider = {
    kind: thread.agentKind,
    label: agentStatus.label,
    ...(agentStatus.icon ? { icon: agentStatus.icon } : {}),
    capabilities: filteredCaps,
  };

  return appendProviderComposerControls(
    buildModelPickerControls({
      providers: [provider],
      selectedAgentKind: thread.agentKind,
      model: effectiveConfig.model,
      // Own-present carriers are never normalized to absence: an empty
      // effort/context or a false Fast/thinking is an actual stored value the
      // controls must see, not a license to display the model's defaults.
      ...(effectiveConfig.effort !== undefined ? { effort: effectiveConfig.effort } : {}),
      ...(effectiveConfig.contextSize !== undefined
        ? { contextSize: effectiveConfig.contextSize }
        : {}),
      ...(effectiveConfig.fast !== undefined ? { fast: effectiveConfig.fast } : {}),
      ...(effectiveConfig.thinking !== undefined ? { thinking: effectiveConfig.thinking } : {}),
      capabilities: filteredCaps,
      lockedAgentKind: thread.agentKind,
      ...(machineKey ? { machineKey } : {}),
      presentationMode,
      isDisabled,
      // A started session is reloaded to apply a new size; drafts apply it at launch.
      ...(thread.sessionRef &&
      getComposerConfigBehavior(thread.agentKind)?.contextSizeChangeReloadsSession
        ? { confirmContextChange: true }
        : {}),
      onProviderModelChange: ({ model: selectedModel, selectionIntent }) => {
        const current = normalizeProviderModelConfig(
          thread.agentKind,
          thread.config,
          presentationCapabilities.models,
        );
        const picked = normalizeProviderModelConfig(
          thread.agentKind,
          { model: selectedModel },
          filteredCaps.models,
        );
        const model = picked.model ?? selectedModel;
        // A pick into or out of a family relation resolves through the shared
        // edit helper at the event boundary: a projected family row keeps the
        // family's `family` intent ({} retains the current member), every
        // exact row — a favorite or recent of the representative included —
        // selects its exact member, and `null` is a visible rejection. The
        // origin rides the row's intent, never the resolved patch: only a
        // family row may mint, while an exact pick — a member, a same-UID
        // re-pick, or a member patch the helper collateral-computed — keeps
        // the raw posture and always drops the record; ordinary picks keep
        // the preference/defaulting flow below.
        if (
          (filteredCaps.modelFamilies?.length ?? 0) > 0 &&
          (modelFamilyForModel(filteredCaps, model) ||
            modelFamilyForModel(filteredCaps, current.model))
        ) {
          const patch = resolveModelSelectionEdit(
            filteredCaps,
            thread.config,
            selectionIntent === "family" ? { kind: "family", model } : { kind: "model", model },
          );
          if (!patch) return;
          onPatch(
            patch,
            selectionIntent === "family" ? { kind: "family-resolved" } : { kind: "raw-pick" },
          );
          return;
        }
        if (
          current.model &&
          current.model !== model &&
          current.fast === true &&
          thread.config.fast !== true
        ) {
          onModelPreferenceChange?.(current.model, {
            ...(thread.config.effort ? { effort: thread.config.effort } : {}),
            fast: true,
          });
        }
        const preference = modelPreferences?.[model];
        const fast =
          preference?.fast ??
          (picked.model !== selectedModel
            ? picked.fast
            : current.model === model
              ? current.fast
              : undefined);
        onPatch(
          patchConfigForModelChange(
            filteredCaps,
            model,
            {
              ...(preference?.effort !== undefined ? { effort: preference.effort } : {}),
              ...(effectiveConfig.contextSize ? { contextSize: effectiveConfig.contextSize } : {}),
              ...(fast !== undefined ? { fast } : {}),
              ...(effectiveConfig.thinking ? { thinking: effectiveConfig.thinking } : {}),
            },
            thread.agentKind,
          ),
          // The ordinary model-menu path is an explicit raw pick: the record
          // drops even for a same-UID same-value re-pick.
          { kind: "raw-pick" },
        );
      },
      onConfigPatch: onPatch,
    }),
    {
      agentKind: thread.agentKind,
      capabilities: filteredCaps,
      config: thread.config,
      presentationMode,
      isDisabled,
      onConfigChange: onPatch,
    },
  );
}
