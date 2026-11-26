import type { AgentStatus } from "../contracts";

/** OpenCode and host inventory expose Ollama models as `ollama/<model>`. */
const OLLAMA_MODEL_PREFIX = "ollama/";

/** Ollama cloud aliases use a `:cloud` or `-cloud` suffix. */
export function isCloudOllamaModelTag(id: string): boolean {
  return /(?:^|[:-])cloud$/iu.test(id);
}

/**
 * Exact Ollama model ids the selected host/environment already exposes,
 * without the `ollama/` route prefix. This is provider-contributed inventory:
 * the renderer passes the same host-scoped status pool to each local profile
 * dialog, and no provider fetches or invents model ids of its own.
 */
export function ollamaModelInventory(statuses: readonly AgentStatus[]): string[] {
  const models = new Set<string>();
  for (const status of statuses) {
    if (!status.installed) continue;
    for (const model of status.capabilities.models) {
      if (!model.id.startsWith(OLLAMA_MODEL_PREFIX)) continue;
      const id = model.id.slice(OLLAMA_MODEL_PREFIX.length);
      if (!id || isCloudOllamaModelTag(id) || isCloudOllamaModelTag(model.id)) continue;
      models.add(id);
    }
  }
  return [...models].sort((left, right) => left.localeCompare(right));
}
