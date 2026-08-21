import { Zap } from "lucide-react";
import { msg } from "@lingui/core/macro";
import type {
  AgentCapability,
  AgentStatus,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { baseAgentKind } from "@/shared/contracts";
import { migrateCursorBaseId, parseCursorModelId } from "@/shared/cursorModelId";
import {
  statusToMenuProvider,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import {
  modelVisibilityKey,
  providerLabelForPresentation,
  providerMenuKey,
  providerVisibilityKey,
} from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { getComposerControls } from "@/renderer/components/providers/providerComposer";
import { EffortIcon } from "@/renderer/components/providers/EffortIcon";
import {
  capabilitiesForPresentation,
  filterHiddenModels,
  modelSelectionFor,
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
  isDisabled?: boolean;
  hideLabelOnWrap?: boolean;
  includeFastToggle?: boolean;
  onProviderModelChange: (next: {
    agentKind: string;
    model: string;
    presentationMode?: ThreadPresentationMode;
  }) => void;
  onConfigPatch: (patch: ModelPickerConfigPatch) => void;
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
 * Expand an agent into one menu provider per model-visibility surface. Only
 * providers that declare named runtime variants have more than one surface (for
 * example a CLI terminal surface plus independently detected structured
 * runtimes), each with its own hidden-model persistence key. Surfaces whose only
 * model is the synthetic "auto" entry are dropped — they have nothing to toggle.
 */
export function expandAgentToVisibilityProviders(agent: AgentStatus): ProviderModelMenuProvider[] {
  const runtimeVariants = agent.runtimeVariants;
  if (!runtimeVariants || Object.keys(runtimeVariants).length === 0) {
    return [statusToMenuProvider(agent)];
  }

  const supported = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
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
  return providers.filter((provider) =>
    provider.capabilities.models.some((model) => model.id !== "auto"),
  );
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
): ModelPickerConfigPatch {
  const nextReasoning = modelSelectionFor(capabilities, model).reasoning;
  const effortValid = current.effort ? nextReasoning.values.includes(current.effort) : true;
  const nextContextIds = capabilities.modelContextSizes?.[model];
  const nextContextDefault = nextContextIds?.[0] ?? capabilities.defaultContextSize;
  return {
    model,
    effort: effortValid && current.effort ? current.effort : (nextReasoning.default ?? ""),
    ...(nextContextDefault ? { contextSize: nextContextDefault } : {}),
    fast: supportsUsableFastMode(capabilities, model) ? (current.fast ?? true) : false,
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
    isDisabled,
    hideLabelOnWrap = true,
    includeFastToggle = true,
    onProviderModelChange,
    onConfigPatch,
  } = input;

  const modelSelection = modelSelectionFor(filteredCaps, model);
  const currentEfforts = modelSelection.reasoning.values.map((id) => ({
    id,
    label: formatEffortLabel(id),
  }));
  const selectableEfforts = currentEfforts.length > 1 ? currentEfforts : [];
  const currentContextIds = filteredCaps.modelContextSizes?.[model];
  const currentContextSizes = currentContextIds
    ? (filteredCaps.contextSizes?.filter((c) => currentContextIds.includes(c.id)) ?? [])
    : [];
  const selectableContextSizes = currentContextSizes.length > 1 ? currentContextSizes : [];
  const supportsFast = includeFastToggle && modelSelection.fast.supported;
  const supportsThinking = filteredCaps.thinkingModels?.includes(model) ?? false;

  const controls: ComposerControl[] = [
    {
      kind: "provider-model",
      providers,
      currentAgentKind: selectedAgentKind,
      currentModel: model,
      ...(lockedAgentKind ? { lockedAgentKind } : {}),
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
      ...(selectableEfforts.length > 0 && effort ? { effortValue: effort } : {}),
      onEffortChange: (value) => onConfigPatch({ effort: value }),
      contextSizes: selectableContextSizes,
      ...(selectableContextSizes.length > 0 && contextSize ? { contextValue: contextSize } : {}),
      onContextChange: (value) => onConfigPatch({ contextSize: value }),
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
            effort={effort ?? ""}
            efforts={selectableEfforts.map((entry) => entry.id)}
          />
        ) : undefined,
    });
  }

  if (supportsFast) {
    const fastDisabledReason = modelSelection.fast.disabledReason;
    controls.push({
      kind: "toggle",
      label: "Fast",
      displayLabel: msg`Fast`,
      icon: <Zap className="size-3.5" />,
      iconKind: "fast",
      iconOnly: true,
      fillIconOnSelect: true,
      tier: 3,
      isSelected: fast === true,
      ...(isDisabled !== undefined ? { isDisabled } : {}),
      ...(fastDisabledReason ? { disabledReason: fastDisabledReason } : {}),
      onChange: (selected) => onConfigPatch({ fast: selected }),
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
    onConfigChange: (patch: Partial<ThreadConfig>) => void;
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

  return [...controls, ...providerControls];
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
): ComposerControl[] {
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  if (presentationMode === "terminal") return [];
  if (!agentStatus) return [];

  const presentationCapabilities = capabilitiesForPresentation(
    agentStatus.capabilities,
    presentationMode,
  );
  const filteredCaps = filterHiddenModels(presentationCapabilities, hiddenModelIds);
  const effectiveConfig = normalizeCursorComposerConfig(
    thread.agentKind,
    thread.config,
    filteredCaps,
  );
  const isDisabled = !thread.canResumeWithConfig && thread.status !== "launching";
  const onPatch = (patch: Partial<ThreadConfig>) => {
    const config = { ...thread.config, ...effectiveConfig, ...patch };
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
      ...(effectiveConfig.effort ? { effort: effectiveConfig.effort } : {}),
      ...(effectiveConfig.contextSize ? { contextSize: effectiveConfig.contextSize } : {}),
      ...(effectiveConfig.fast ? { fast: effectiveConfig.fast } : {}),
      ...(effectiveConfig.thinking ? { thinking: effectiveConfig.thinking } : {}),
      capabilities: filteredCaps,
      lockedAgentKind: thread.agentKind,
      presentationMode,
      isDisabled,
      onProviderModelChange: ({ model }) => {
        const preference = modelPreferences?.[model];
        onPatch(
          patchConfigForModelChange(filteredCaps, model, {
            ...(preference?.effort !== undefined ? { effort: preference.effort } : {}),
            ...(effectiveConfig.contextSize ? { contextSize: effectiveConfig.contextSize } : {}),
            ...(preference?.fast !== undefined ? { fast: preference.fast } : {}),
            ...(effectiveConfig.thinking ? { thinking: effectiveConfig.thinking } : {}),
          }),
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
