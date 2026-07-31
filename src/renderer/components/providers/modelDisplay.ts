import { msg } from "@lingui/core/macro";
import type { AgentStatus } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";

export interface ModelConfigLabelInput {
  model?: string | undefined;
  effort?: string | undefined;
  fast?: boolean | undefined;
}

/**
 * Resolves a human-readable model label for an agent's config, falling back to
 * the raw model id when the agent or its capability metadata is unavailable.
 */
export function resolveModelLabel(
  agent: AgentStatus | undefined,
  model: string | undefined,
): string | undefined {
  if (!model) return undefined;
  return agent?.capabilities.models?.find((entry) => entry.id === model)?.label ?? model;
}

/**
 * Builds a friendly config detail line ("Opus 4.8 · Low · Fast") from a thread
 * config. Missing parts are omitted; the raw model id is used when no matching
 * capability label is found.
 */
export function formatModelConfigLabel(
  agent: AgentStatus | undefined,
  config: ModelConfigLabelInput,
): string {
  const parts = [
    resolveModelLabel(agent, config.model),
    config.effort ? formatEffortLabel(config.effort) : undefined,
    config.fast ? i18n._(msg`Fast`) : undefined,
  ].filter((value): value is string => !!value);
  return parts.join(" · ");
}
