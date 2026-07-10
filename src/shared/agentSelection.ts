import type { AgentCapability, ThreadPresentationMode } from "./contracts";

export interface AgentModelSelection {
  reasoning: {
    values: string[];
    default?: string;
  };
  fast: {
    supported: boolean;
    available: boolean;
    disabledReason?: string;
  };
}

export function capabilitiesForPresentation(
  capabilities: AgentCapability,
  presentationMode: ThreadPresentationMode,
): AgentCapability {
  const override = capabilities.presentationCapabilities?.[presentationMode];
  if (!override) return capabilities;

  const {
    defaultEffort: _defaultEffort,
    contextSizes: _contextSizes,
    modelContextSizes: _modelContextSizes,
    defaultContextSize: _defaultContextSize,
    fastModels: _fastModels,
    thinkingModels: _thinkingModels,
    subProviders: _subProviders,
    modelSubProvider: _modelSubProvider,
    ...rest
  } = capabilities;

  return {
    ...rest,
    ...override,
    models: override.models ?? [],
    efforts: override.efforts ?? [],
    modelEfforts: override.modelEfforts ?? {},
    modes: override.modes ?? capabilities.modes,
    approvalPolicies: override.approvalPolicies ?? capabilities.approvalPolicies,
    sandboxModes: override.sandboxModes ?? capabilities.sandboxModes,
    supportsResume: override.supportsResume ?? capabilities.supportsResume,
    supportsDirectInput: override.supportsDirectInput ?? capabilities.supportsDirectInput,
    liveInputMode: override.liveInputMode ?? capabilities.liveInputMode,
    presentationMode: override.presentationMode ?? capabilities.presentationMode,
    settingDefs: override.settingDefs ?? capabilities.settingDefs,
    presentationCapabilities: capabilities.presentationCapabilities,
  };
}

/** Return capabilities with hidden models filtered out. */
export function filterHiddenModels(
  capabilities: AgentCapability,
  hiddenIds: readonly string[] | undefined,
): AgentCapability {
  if (!hiddenIds || hiddenIds.length === 0) return capabilities;
  const hidden = new Set(hiddenIds);
  return { ...capabilities, models: capabilities.models.filter((m) => !hidden.has(m.id)) };
}

export function modelSelectionFor(
  capabilities: AgentCapability,
  model: string,
): AgentModelSelection {
  const reasoningValues = capabilities.modelEfforts?.[model] ?? capabilities.efforts ?? [];
  const defaultReasoning = reasoningValues.includes(capabilities.defaultEffort ?? "")
    ? capabilities.defaultEffort
    : reasoningValues[0];
  const fastSupported = capabilities.fastModels?.includes(model) === true;
  return {
    reasoning: {
      values: reasoningValues,
      ...(defaultReasoning ? { default: defaultReasoning } : {}),
    },
    fast: {
      supported: fastSupported,
      available: fastSupported && capabilities.fastDisabledReason === undefined,
      ...(fastSupported && capabilities.fastDisabledReason
        ? { disabledReason: capabilities.fastDisabledReason }
        : {}),
    },
  };
}

export function resolveModelSelection(capabilities: AgentCapability, preferred?: string): string {
  return preferred && capabilities.models.some((model) => model.id === preferred)
    ? preferred
    : (capabilities.models[0]?.id ?? "");
}

export function resolveReasoningSelection(
  capabilities: AgentCapability,
  model: string,
  preferred?: string,
): string {
  const reasoning = modelSelectionFor(capabilities, model).reasoning;
  if (preferred && reasoning.values.includes(preferred)) return preferred;
  return reasoning.default ?? "";
}

export function validateAgentModelSelection(
  capabilities: AgentCapability,
  input: { model: string; reasoning?: string; fast?: boolean },
): string | undefined {
  if (!capabilities.models.some((model) => model.id === input.model)) {
    return `Unknown model: ${input.model}`;
  }
  const selection = modelSelectionFor(capabilities, input.model);
  if (input.reasoning && !selection.reasoning.values.includes(input.reasoning)) {
    return `Unsupported reasoning for ${input.model}: ${input.reasoning}`;
  }
  if (input.fast === true && !selection.fast.supported) {
    return `Fast is not supported by ${input.model}`;
  }
  if (input.fast === true && !selection.fast.available) {
    return selection.fast.disabledReason ?? `Fast is unavailable for ${input.model}`;
  }
  return undefined;
}
