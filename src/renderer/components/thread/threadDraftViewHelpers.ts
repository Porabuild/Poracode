import type {
  AgentStatus,
  ProjectDraftConfig,
  ProviderDraftConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { migrateCursorBaseId, parseCursorModelId } from "@/shared/cursorModelId";
import { capabilitiesForPresentation } from "./threadComposerOptions";

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
): Partial<ProviderDraftConfig> | undefined {
  if (lastDraftConfig?.agentKind === agentKind && lastDraftConfig.model.trim()) {
    return lastDraftConfig;
  }

  return providerConfigs[agentKind];
}

export function resolveModelValue(agent: AgentStatus, preferred?: string): string {
  const models = agent.capabilities.models;
  return preferred && models.some((m) => m.id === preferred) ? preferred : (models[0]?.id ?? "");
}

export function resolveEffortValue(agent: AgentStatus, model: string, preferred?: string): string {
  const efforts = agent.capabilities.modelEfforts?.[model] ?? agent.capabilities.efforts ?? [];
  if (preferred && efforts.includes(preferred)) {
    return preferred;
  }

  const fallback = agent.capabilities.defaultEffort;
  if (fallback && efforts.includes(fallback)) {
    return fallback;
  }

  return efforts[0] ?? "";
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
  if (!agent.capabilities.fastModels?.includes(model)) return false;
  return preferred === true;
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
  if (id === "xhigh") return "Extra High";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function resolveApprovalPolicyValue(agent: AgentStatus, preferred?: string): string {
  const policies = agent.capabilities.approvalPolicies;
  if (preferred !== undefined) {
    return policies.some((p) => p.id === preferred) ? preferred : "";
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
  if (agent.kind !== "cursor" || !preferred?.model) {
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
  const nextFast = resolveFastValue(agent, nextModel, normalizedPreferred?.fast);
  const nextThinking = resolveThinkingValue(agent, nextModel, normalizedPreferred?.thinking);
  const nextMode = resolveModeValue(agent, normalizedPreferred?.mode) as
    | "agent"
    | "plan"
    | "autopilot";
  const nextApproval = resolveApprovalPolicyValue(agent, normalizedPreferred?.approvalPolicy);
  const nextSandbox = resolveSandboxModeValue(agent, normalizedPreferred?.sandboxMode);

  return {
    model: nextModel,
    effort: nextEffort,
    ...(nextContext ? { contextSize: nextContext } : {}),
    ...(nextFast ? { fast: nextFast } : {}),
    ...(nextThinking ? { thinking: nextThinking } : {}),
    mode: nextMode,
    approvalPolicy: nextApproval,
    sandboxMode: nextSandbox,
  };
}

export function agentWithCapabilities(
  agent: AgentStatus,
  presentationMode: ThreadPresentationMode,
): AgentStatus {
  return {
    ...agent,
    capabilities: capabilitiesForPresentation(agent.capabilities, presentationMode),
  };
}

export function formatAgentList(names: string[]): string {
  if (names.length === 0) return "a supported coding agent";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}
