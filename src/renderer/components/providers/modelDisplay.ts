import { msg } from "@lingui/core/macro";
import type { AgentStatus } from "@/shared/contracts";
import {
  canonicalProviderModelId,
  normalizeProviderModelConfig,
} from "@/renderer/components/providers/modelConfig";
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
  const modelId = canonicalProviderModelId(
    agent?.kind ?? "",
    model,
    agent?.capabilities.models ?? [],
  );
  return agent?.capabilities.models?.find((entry) => entry.id === modelId)?.label ?? modelId;
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
  const normalized = normalizeProviderModelConfig(
    agent?.kind ?? "",
    config,
    agent?.capabilities.models ?? [],
  );
  const parts = [
    resolveModelLabel(agent, config.model),
    config.effort ? formatEffortLabel(config.effort) : undefined,
    normalized.fast ? i18n._(msg`Fast`) : undefined,
  ].filter((value): value is string => !!value);
  return parts.join(" · ");
}
