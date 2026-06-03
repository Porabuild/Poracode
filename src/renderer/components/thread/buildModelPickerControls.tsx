import { Zap } from "lucide-react";
import type {
  AgentCapability,
  AgentStatus,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import type { ProviderModelMenuProvider } from "@/renderer/components/common";
import { getComposerControls } from "@/renderer/components/providers";
import { EffortIcon } from "@/renderer/components/providers/EffortIcon";
import type { ComposerControl } from "./ThreadComposer";
import { formatEffortLabel, supportsUsableFastMode } from "./threadDraftViewHelpers";
import { capabilitiesForPresentation, filterHiddenModels } from "./threadComposerOptions";

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
      const capabilities = filterHiddenModels(
        capabilitiesForPresentation(agent.capabilities, agentPresentationMode),
        hiddenModelsByAgent?.[agent.kind],
      );
      return {
        kind: agent.kind,
        label: agent.label,
        ...(agent.icon ? { icon: agent.icon } : {}),
        ...(resolvePresentationMode ? { presentationMode: agentPresentationMode } : {}),
        capabilities,
      };
    });
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
  const nextEfforts = capabilities.modelEfforts?.[model] ?? capabilities.efforts ?? [];
  const effortValid = current.effort ? nextEfforts.includes(current.effort) : true;
  const nextContextIds = capabilities.modelContextSizes?.[model];
  const nextContextDefault = nextContextIds?.[0] ?? capabilities.defaultContextSize;
  return {
    model,
    ...(!effortValid && nextEfforts.length > 0 ? { effort: nextEfforts[0] } : {}),
    ...(nextContextDefault ? { contextSize: nextContextDefault } : {}),
    ...(supportsUsableFastMode(capabilities, model) ? {} : { fast: false }),
    ...(capabilities.thinkingModels?.includes(model) ? {} : { thinking: false }),
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

  const currentEfforts = (filteredCaps.modelEfforts?.[model] ?? filteredCaps.efforts ?? []).map(
    (id) => ({
      id,
      label: formatEffortLabel(id),
    }),
  );
  const selectableEfforts = currentEfforts.length > 1 ? currentEfforts : [];
  const currentContextIds = filteredCaps.modelContextSizes?.[model];
  const currentContextSizes = currentContextIds
    ? (filteredCaps.contextSizes?.filter((c) => currentContextIds.includes(c.id)) ?? [])
    : [];
  const selectableContextSizes = currentContextSizes.length > 1 ? currentContextSizes : [];
  const supportsFast = includeFastToggle && (filteredCaps.fastModels?.includes(model) ?? false);
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
            className="size-4 text-foreground"
            effort={effort ?? ""}
            efforts={selectableEfforts.map((entry) => entry.id)}
          />
        ) : undefined,
    });
  }

  if (supportsFast) {
    const fastDisabledReason = filteredCaps.fastDisabledReason;
    controls.push({
      kind: "toggle",
      label: "Fast",
      icon: <Zap className="size-3.5" />,
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
