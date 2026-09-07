import type {
  AgentCapability,
  AgentRuntimeVariant,
  AgentStatus,
  AuthState,
  SessionRef,
  ThreadPresentationMode,
} from "./contracts";

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

export function authStateForPresentation(
  status: Pick<AgentStatus, "authState" | "presentationAuthStates">,
  presentationMode: ThreadPresentationMode,
): AuthState {
  return status.presentationAuthStates?.[presentationMode] ?? status.authState;
}

/**
 * Whether Settings should flag this provider as needing sign-in. Providers with
 * independently authenticated runtimes (Cursor CLI vs SDK) are ready when any
 * installed runtime is signed in — picking SDK on the main tile must not look
 * like a CLI logout.
 */
export function agentStatusNeedsAuthAttention(
  status: Pick<AgentStatus, "installed" | "authState" | "runtimeVariants">,
): boolean {
  if (!status.installed) return false;
  const variants = status.runtimeVariants;
  if (variants && Object.keys(variants).length > 0) {
    const installed = Object.values(variants).filter((variant) => variant.installed);
    if (installed.length === 0) return status.authState === "missing";
    return !installed.some((variant) => variant.authState === "authenticated");
  }
  return status.authState === "missing";
}

export function authStatusForPresentation(
  status: AgentStatus,
  presentationMode: ThreadPresentationMode,
): AgentStatus {
  const authState = authStateForPresentation(status, presentationMode);
  if (status.presentationAuthUsesProviderLogin?.[presentationMode] !== false) {
    return authState === status.authState ? status : { ...status, authState };
  }
  return stripProviderLogin({ ...status, authState });
}

function stripProviderLogin(status: AgentStatus): AgentStatus {
  const {
    loginCommand: _loginCommand,
    loginCommandDisplay: _loginCommandDisplay,
    authMethods: _authMethods,
    authLogoutSupported: _authLogoutSupported,
    preferTerminalLogin: _preferTerminalLogin,
    ...withoutProviderLogin
  } = status;
  return withoutProviderLogin;
}

function restoreProviderLogin(
  source: Pick<
    AgentStatus,
    | "loginCommand"
    | "loginCommandDisplay"
    | "authMethods"
    | "authLogoutSupported"
    | "preferTerminalLogin"
  >,
  status: AgentStatus,
): AgentStatus {
  return {
    ...status,
    ...(source.loginCommand !== undefined ? { loginCommand: source.loginCommand } : {}),
    ...(source.loginCommandDisplay !== undefined
      ? { loginCommandDisplay: source.loginCommandDisplay }
      : {}),
    ...(source.authMethods !== undefined ? { authMethods: source.authMethods } : {}),
    ...(source.authLogoutSupported !== undefined
      ? { authLogoutSupported: source.authLogoutSupported }
      : {}),
    ...(source.preferTerminalLogin !== undefined
      ? { preferTerminalLogin: source.preferTerminalLogin }
      : {}),
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
    modelDefaultEfforts: _modelDefaultEfforts,
    defaultHiddenModels: _defaultHiddenModels,
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

/**
 * Resolve every presentation-scoped part of an agent status together.
 *
 * Consumers should derive this once for the active thread/draft and pass the
 * returned status through the rest of the flow. That keeps authentication,
 * models, slash commands, input behavior, and safety defaults on the same
 * runtime surface.
 */
export function agentStatusForPresentation(
  status: AgentStatus,
  presentationMode: ThreadPresentationMode,
  sessionRef?: SessionRef,
): AgentStatus {
  const presentationStatus = {
    ...authStatusForPresentation(status, presentationMode),
    capabilities: capabilitiesForPresentation(status.capabilities, presentationMode),
  };
  const runtimeVariant = runtimeVariantForSession(status, presentationMode, sessionRef);
  if (!runtimeVariant) {
    return presentationStatus;
  }

  const { providerMetadata: _providerMetadata, ...presentationWithoutMetadata } =
    presentationStatus;
  const runtimeStatus: AgentStatus = {
    ...presentationWithoutMetadata,
    installed: runtimeVariant.installed,
    authState: runtimeVariant.authState,
    presentationAuthStates: {
      ...presentationStatus.presentationAuthStates,
      [presentationMode]: runtimeVariant.authState,
    },
    presentationAuthUsesProviderLogin: {
      ...presentationStatus.presentationAuthUsesProviderLogin,
      [presentationMode]: runtimeVariant.authUsesProviderLogin,
    },
    capabilities: runtimeVariant.capabilities,
    ...(runtimeVariant.providerMetadata
      ? { providerMetadata: runtimeVariant.providerMetadata }
      : {}),
  };
  const hasRuntimeLogin =
    runtimeVariant.loginCommand !== undefined ||
    runtimeVariant.loginCommandDisplay !== undefined ||
    runtimeVariant.authMethods !== undefined ||
    runtimeVariant.authLogoutSupported !== undefined ||
    runtimeVariant.preferTerminalLogin !== undefined;
  return runtimeVariant.authUsesProviderLogin
    ? restoreProviderLogin(
        hasRuntimeLogin ? runtimeVariant : status,
        stripProviderLogin(runtimeStatus),
      )
    : stripProviderLogin(runtimeStatus);
}

function runtimeVariantForSession(
  status: AgentStatus,
  presentationMode: ThreadPresentationMode,
  sessionRef: SessionRef | undefined,
): AgentRuntimeVariant | undefined {
  const providerSessionId = sessionRef?.providerSessionId;
  const variants = status.runtimeVariants;
  const routing = status.sessionRuntimeRouting;
  if (!variants) {
    return undefined;
  }
  if (!providerSessionId || !routing) {
    const candidates = Object.values(variants).filter(
      (variant) => variant.presentationMode === presentationMode,
    );
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  let matchedRuntime: string | undefined;
  let matchedPrefixLength = -1;
  for (const [prefix, runtime] of Object.entries(routing.prefixes)) {
    const variant = variants[runtime];
    if (
      prefix.length > matchedPrefixLength &&
      providerSessionId.startsWith(prefix) &&
      variant?.presentationMode === presentationMode
    ) {
      matchedRuntime = runtime;
      matchedPrefixLength = prefix.length;
    }
  }

  const runtime = matchedRuntime ?? routing.fallbackRuntime;
  const variant = runtime ? variants[runtime] : undefined;
  return variant?.presentationMode === presentationMode ? variant : undefined;
}

/**
 * Resolve the hidden ids for one capability surface. Provider defaults apply
 * only until the user saves an explicit list; `[]` deliberately means show all.
 */
export function resolveHiddenModelIds(
  capabilities: AgentCapability,
  hiddenIds: readonly string[] | undefined,
): readonly string[] {
  return hiddenIds ?? capabilities.defaultHiddenModels ?? [];
}

/** Return capabilities with effective hidden models filtered out. */
export function filterHiddenModels(
  capabilities: AgentCapability,
  hiddenIds: readonly string[] | undefined,
): AgentCapability {
  const effectiveHiddenIds = resolveHiddenModelIds(capabilities, hiddenIds);
  if (effectiveHiddenIds.length === 0) return capabilities;
  const hidden = new Set(effectiveHiddenIds);
  return { ...capabilities, models: capabilities.models.filter((m) => !hidden.has(m.id)) };
}

/**
 * Re-admit one model into a hidden-filtered surface when that surface has to
 * represent a selection that already exists.
 *
 * Hiding a model is a menu preference, not a capability change: something
 * already configured with model X (a running thread, a restored draft) must
 * still show X's label and keep X's reasoning/context options. Without this the
 * picker cannot label X — it is absent from the list it labels from — and falls
 * back to rendering the bare model id.
 *
 * The entry is taken from `source` (the unfiltered surface) and reinserted in
 * `source` order, so the list stays ordered as the provider declared it. A
 * model the surface no longer advertises at all cannot be recovered here.
 */
export function withModelVisible(
  filtered: AgentCapability,
  source: AgentCapability,
  modelId: string | undefined,
): AgentCapability {
  if (!modelId) return filtered;
  if (filtered.models.some((m) => m.id === modelId)) return filtered;
  if (!source.models.some((m) => m.id === modelId)) return filtered;
  const visible = new Set(filtered.models.map((m) => m.id));
  return {
    ...filtered,
    models: source.models.filter((m) => visible.has(m.id) || m.id === modelId),
  };
}

export function modelSelectionFor(
  capabilities: AgentCapability,
  model: string,
): AgentModelSelection {
  const reasoningValues = capabilities.modelEfforts?.[model] ?? capabilities.efforts ?? [];
  const modelDefault = capabilities.modelDefaultEfforts?.[model];
  const defaultReasoning = reasoningValues.includes(modelDefault ?? "")
    ? modelDefault
    : reasoningValues.includes(capabilities.defaultEffort ?? "")
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

/**
 * True when a model offers more than one reasoning level — i.e. there is
 * something for the user to pick. A single advertised level (Kimi's untiered
 * `on`) is still sent to the agent, but no picker is drawn for it, so surfaces
 * that gate on "has an effort control" must use this rather than a non-empty
 * check.
 */
export function hasSelectableReasoning(
  capabilities: AgentCapability | undefined,
  model: string,
): boolean {
  if (!capabilities) return false;
  return modelSelectionFor(capabilities, model).reasoning.values.length > 1;
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
