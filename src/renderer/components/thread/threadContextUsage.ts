import type {
  AgentCapability,
  AgentStatus,
  ContextUsageBreakdownEntry,
  Thread,
  ThreadContextUsage,
} from "@/shared/contracts";
import { capabilitiesForPresentation } from "./threadComposerOptions";

export interface ThreadContextUsageSummary {
  usedTokens?: number;
  maxTokens?: number;
  remainingTokens?: number;
  percent?: number;
  breakdown: ContextUsageBreakdownEntry[];
  usedLabel: string;
  maxLabel: string;
  remainingLabel: string;
  percentLabel: string;
  headline: string;
  detail: string;
}

export function hasReportedContextUsage(usage: ThreadContextUsage | undefined): boolean {
  if (!usage) return false;
  return usage.usedTokens !== undefined || (usage.breakdown?.length ?? 0) > 0;
}

export function resolveThreadContextUsageSummary(input: {
  thread: Thread;
  agentStatus: AgentStatus | undefined;
  reportedUsage: ThreadContextUsage | undefined;
}): ThreadContextUsageSummary {
  const { thread, agentStatus, reportedUsage } = input;
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  const capabilities = agentStatus
    ? capabilitiesForPresentation(agentStatus.capabilities, presentationMode)
    : undefined;
  const configuredMaxTokens = inferConfiguredContextLimit(thread, capabilities);
  const usedTokens = reportedUsage?.usedTokens;
  const maxTokens = reportedUsage?.maxTokens ?? configuredMaxTokens;
  const percent =
    usedTokens !== undefined && maxTokens !== undefined && maxTokens > 0
      ? Math.max(0, Math.min(100, Math.round((usedTokens / maxTokens) * 100)))
      : undefined;
  const remainingTokens =
    usedTokens !== undefined && maxTokens !== undefined
      ? Math.max(0, maxTokens - usedTokens)
      : undefined;
  const breakdown =
    reportedUsage?.breakdown && reportedUsage.breakdown.length > 0
      ? reportedUsage.breakdown
      : usedTokens !== undefined
        ? [{ id: "used", label: "Used", tokens: usedTokens }]
        : [];
  const usedLabel = usedTokens === undefined ? "Unknown" : formatTokenCount(usedTokens);
  const maxLabel = maxTokens === undefined ? "Unknown" : formatTokenCount(maxTokens);
  const remainingLabel =
    remainingTokens === undefined ? "Unknown" : formatTokenCount(remainingTokens);
  const percentLabel = percent === undefined ? "Context" : `${percent}%`;
  const headline =
    percent === undefined
      ? maxTokens === undefined
        ? "Context usage"
        : `${maxLabel} context`
      : `${percent}% full`;
  const detail =
    usedTokens === undefined && maxTokens === undefined
      ? "Provider has not reported token usage."
      : maxTokens === undefined
        ? `${usedLabel} tokens`
        : `${usedLabel} / ${maxLabel} tokens`;

  return {
    ...(usedTokens !== undefined ? { usedTokens } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(remainingTokens !== undefined ? { remainingTokens } : {}),
    ...(percent !== undefined ? { percent } : {}),
    breakdown,
    usedLabel,
    maxLabel,
    remainingLabel,
    percentLabel,
    headline,
    detail,
  };
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return formatTokenUnit(tokens / 1_000_000, "M");
  }
  if (tokens >= 1_000) {
    return formatTokenUnit(tokens / 1_000, "K");
  }
  return String(tokens);
}

function formatTokenUnit(value: number, unit: "K" | "M"): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${unit}`;
}

function inferConfiguredContextLimit(
  thread: Thread,
  capabilities: AgentCapability | undefined,
): number | undefined {
  const contextId =
    thread.config.contextSize ??
    parseContextSizeParam(thread.config.model) ??
    capabilities?.modelContextSizes?.[thread.config.model]?.[0] ??
    capabilities?.defaultContextSize;
  const option = contextId
    ? capabilities?.contextSizes?.find((candidate) => candidate.id === contextId)
    : undefined;

  return (
    parseContextTokenLimit(option?.label) ??
    parseContextTokenLimit(contextId) ??
    parseContextTokenLimit(thread.config.model)
  );
}

function parseContextSizeParam(modelId: string): string | undefined {
  const bracket = /\[([^\]]+)\]/.exec(modelId)?.[1];
  if (!bracket) return undefined;
  const contextParam = /(?:^|,)\s*context\s*=\s*([^,\]]+)/i.exec(bracket)?.[1]?.trim();
  if (contextParam) return contextParam;
  const plainSize = bracket.trim();
  return parseContextTokenLimit(plainSize) ? plainSize : undefined;
}

function parseContextTokenLimit(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /(\d+(?:\.\d+)?)\s*([kKmM])\b/.exec(value);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const multiplier = match[2]!.toLowerCase() === "m" ? 1_000_000 : 1_000;
  return Math.round(amount * multiplier);
}
