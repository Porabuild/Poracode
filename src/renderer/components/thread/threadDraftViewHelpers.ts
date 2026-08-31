import { msg } from "@lingui/core/macro";
import type {
  AgentCapability,
  AgentStatus,
  ProjectDraftConfig,
  ProviderDraftConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { baseAgentKind } from "@/shared/contracts";
import { migrateCursorBaseId, parseCursorModelId } from "@/shared/cursorModelId";
import {
  agentStatusForPresentation,
  modelSelectionFor,
  resolveModelSelection,
  resolveReasoningSelection,
} from "@/shared/agentSelection";
import { i18n } from "@/renderer/i18n/i18n";
import type { ProviderModelPreference } from "@/shared/settings";

export function resolveProviderModelPreference(
  agentKind: AgentStatus["kind"],
  model: string,
  providerConfigs: Record<string, ProviderDraftConfig>,
  providerModelPreferences: Record<string, Record<string, ProviderModelPreference>>,
): ProviderModelPreference | undefined {
  const saved = providerModelPreferences[agentKind]?.[model];
  if (saved) return saved;

  const legacy = providerConfigs[agentKind];
  if (legacy?.model !== model) return undefined;
  return {
    ...(legacy.effort ? { effort: legacy.effort } : {}),
    ...(legacy.fast !== undefined ? { fast: legacy.fast } : {}),
  };
}

export function resolvePreferredAgentKind(
  installedAgents: AgentStatus[],
  lastDraftConfig?: ProjectDraftConfig,
): AgentStatus["kind"] | undefined {
  if (lastDraftConfig) {
    const savedAgent = installedAgents.find((agent) => agent.kind === lastDraftConfig.agentKind);
    if (savedAgent) {
      return savedAgent.kind;
    }
  }

  return installedAgents[0]?.kind;
}

export function resolveSavedProviderDraftConfig(
  agentKind: AgentStatus["kind"],
  lastDraftConfig: ProjectDraftConfig | undefined,
  providerConfigs: Record<string, ProviderDraftConfig>,
  providerModelPreferences: Record<string, Record<string, ProviderModelPreference>> = {},
): Partial<ProviderDraftConfig> | undefined {
  const providerConfig = providerConfigs[agentKind];
  if (lastDraftConfig?.agentKind === agentKind && lastDraftConfig.model.trim()) {
    const projectConfig = { ...lastDraftConfig };
    delete projectConfig.effort;
    delete projectConfig.fast;
    const modelPreference = resolveProviderModelPreference(
      agentKind,
      lastDraftConfig.model,
      providerConfigs,
      providerModelPreferences,
    );
    // Older project drafts predate context-window persistence. Preserve their
    // other choices while filling only that missing field from the provider preset.
    // Effort and Fast are app-wide model preferences rather than project state.
    return {
      ...projectConfig,
      ...(!lastDraftConfig.contextSize && providerConfig?.contextSize
        ? { contextSize: providerConfig.contextSize }
        : {}),
      ...(modelPreference?.effort !== undefined ? { effort: modelPreference.effort } : {}),
      ...(modelPreference?.fast !== undefined ? { fast: modelPreference.fast } : {}),
    };
  }

  if (!providerConfig) return undefined;
  const modelPreference = resolveProviderModelPreference(
    agentKind,
    providerConfig.model,
    providerConfigs,
    providerModelPreferences,
  );
  return {
    ...providerConfig,
    ...(modelPreference?.effort !== undefined ? { effort: modelPreference.effort } : {}),
    ...(modelPreference?.fast !== undefined ? { fast: modelPreference.fast } : {}),
  };
}

export function resolveModelValue(agent: AgentStatus, preferred?: string): string {
  return resolveModelSelection(agent.capabilities, preferred);
}

export function resolveEffortValue(agent: AgentStatus, model: string, preferred?: string): string {
  return resolveReasoningSelection(agent.capabilities, model, preferred);
}

export function resolveContextSizeValue(
  agent: AgentStatus,
  model: string,
  preferred?: string,
): string | undefined {
  const allowed = agent.capabilities.modelContextSizes?.[model];
  if (!allowed?.length) return agent.capabilities.defaultContextSize;
  if (preferred && allowed.includes(preferred)) return preferred;
  return allowed[0];
}

export function resolveFastValue(agent: AgentStatus, model: string, preferred?: boolean): boolean {
  if (!supportsUsableFastMode(agent.capabilities, model)) return false;
  return preferred === true;
}

/**
 * The model supports fast mode AND the account can actually use it. Returns
 * false when fast mode is gated (e.g. org-disabled, `fastDisabledReason` set) so
 * the `/fast` command and provider hand-off don't enable an unusable mode. The
 * Fast *toggle* still renders (disabled) — that path keys off `fastModels` +
 * `fastDisabledReason` directly so it can show the explanatory tooltip.
 */
export function supportsUsableFastMode(capabilities: AgentCapability, model: string): boolean {
  return modelSelectionFor(capabilities, model).fast.available;
}

export function resolveThinkingValue(
  agent: AgentStatus,
  model: string,
  preferred?: boolean,
): boolean {
  if (!agent.capabilities.thinkingModels?.includes(model)) return false;
  return preferred === true;
}

export function resolveModeValue(agent: AgentStatus, preferred?: string): string {
  const modes = agent.capabilities.modes;
  return preferred && modes.includes(preferred as "agent" | "plan" | "autopilot")
    ? preferred
    : (modes[0] ?? "agent");
}

export function formatEffortLabel(id: string): string {
  if (id === "xhigh" || id === "xHigh") return i18n._(msg`Extra High`);
  if (id === "ultracode") return "Ultracode";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * A saved policy only wins while the surface still advertises it. Carrying an
 * unsupported id through as "" left the draft with no permission selected —
 * and dual-runtime providers hit that on every draft, because one id space
 * (Antigravity's `agy` says `yolo`) is not the other's (Chat says `never`).
 * Falling back to the provider's declared default keeps a valid posture
 * selected instead.
 */
export function resolveApprovalPolicyValue(agent: AgentStatus, preferred?: string): string {
  const policies = agent.capabilities.approvalPolicies;
  if (preferred !== undefined && policies.some((p) => p.id === preferred)) {
    return preferred;
  }
  const explicit = agent.capabilities.defaultApprovalPolicy;
  if (explicit && policies.some((p) => p.id === explicit)) {
    return explicit;
  }
  return policies[0]?.id ?? "";
}

export function resolveSandboxModeValue(agent: AgentStatus, preferred?: string): string {
  const modes = agent.capabilities.sandboxModes;
  if (preferred !== undefined) {
    return modes.some((m) => m.id === preferred) ? preferred : "";
  }
  const explicit = agent.capabilities.defaultSandboxMode;
  if (explicit && modes.some((m) => m.id === explicit)) {
    return explicit;
  }
  return modes[0]?.id ?? "";
}

export function resolveInitialPresentationMode(
  agent: AgentStatus | undefined,
  lastByAgent: Record<string, ThreadPresentationMode>,
): ThreadPresentationMode {
  if (!agent) return "gui";
  const supported = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
  const last = lastByAgent[agent.kind];
  if (last && supported.includes(last)) return last;
  if (supported.includes("gui")) return "gui";
  return supported[0] ?? agent.capabilities.presentationMode ?? "gui";
}

function normalizeCursorPreferredDraft(
  agent: AgentStatus,
  preferred?: Partial<ProviderDraftConfig>,
): Partial<ProviderDraftConfig> | undefined {
  if (baseAgentKind(agent.kind) !== "cursor" || !preferred?.model) {
    return preferred;
  }
  if (agent.capabilities.models.some((model) => model.id === preferred.model)) {
    return preferred;
  }

  const parsed = parseCursorModelId(preferred.model);
  const baseModel = migrateCursorBaseId(parsed.baseId);
  if (!agent.capabilities.models.some((model) => model.id === baseModel)) {
    return preferred;
  }

  return {
    ...preferred,
    model: baseModel,
    ...(parsed.effort && !preferred.effort ? { effort: parsed.effort } : {}),
    fast: preferred.fast ?? parsed.fast,
    thinking: preferred.thinking ?? parsed.thinking,
  };
}

export function resolveProviderDraftConfig(
  agent: AgentStatus,
  preferred?: Partial<ProviderDraftConfig>,
): ProviderDraftConfig {
  const normalizedPreferred = normalizeCursorPreferredDraft(agent, preferred);
  const nextModel = resolveModelValue(agent, normalizedPreferred?.model);
  const nextEffort = resolveEffortValue(agent, nextModel, normalizedPreferred?.effort);
  const nextContext = resolveContextSizeValue(agent, nextModel, normalizedPreferred?.contextSize);
  const supportsFast = supportsUsableFastMode(agent.capabilities, nextModel);
  // Fast mode is the composer's default for every model that can actually use
  // it; only an explicitly saved `false` keeps it off. AI helpers (title/commit
  // generation, schedules, PR automation) call `resolveFastValue` directly and
  // keep their opt-in default, so background work doesn't silently spend fast
  // requests.
  const nextFast = resolveFastValue(agent, nextModel, normalizedPreferred?.fast ?? true);
  // Thinking starts enabled for every model that offers the toggle. An
  // explicitly saved `false` remains authoritative.
  const nextThinking = resolveThinkingValue(
    agent,
    nextModel,
    normalizedPreferred?.thinking ?? true,
  );
  const supportsThinking = agent.capabilities.thinkingModels?.includes(nextModel) === true;
  const nextMode = resolveModeValue(agent, normalizedPreferred?.mode) as
    | "agent"
    | "plan"
    | "autopilot";
  const nextApproval = resolveApprovalPolicyValue(agent, normalizedPreferred?.approvalPolicy);
  const nextSandbox = resolveSandboxModeValue(agent, normalizedPreferred?.sandboxMode);
  const nextReviewer =
    normalizedPreferred?.approvalsReviewer ?? agent.capabilities.defaultApprovalsReviewer;

  return {
    model: nextModel,
    effort: nextEffort,
    ...(nextContext ? { contextSize: nextContext } : {}),
    ...(supportsFast ? { fast: nextFast } : {}),
    ...(supportsThinking ? { thinking: nextThinking } : {}),
    mode: nextMode,
    approvalPolicy: nextApproval,
    ...(nextReviewer !== undefined ? { approvalsReviewer: nextReviewer } : {}),
    sandboxMode: nextSandbox,
  };
}

export function agentWithCapabilities(
  agent: AgentStatus,
  presentationMode: ThreadPresentationMode,
): AgentStatus {
  return agentStatusForPresentation(agent, presentationMode);
}

export function formatAgentList(names: string[]): string {
  if (names.length === 0) return i18n._(msg`a supported coding agent`);
  if (names.length === 1) return names[0]!;
  const head = names.slice(0, -1).join(", ");
  const tail = names.at(-1)!;
  return i18n._(msg`${head}, or ${tail}`);
}
