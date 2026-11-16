import { QWEN_DEFAULT_MODEL_ID, QWEN_RETIRED_PREVIEW_MODEL_ID } from "./qwenModels";

type RetiredModelTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * Retired model ids per agent kind, mapped to their replacements. Persisted
 * settings selections are migrated when settings load, so a provider retiring
 * a model registers it here instead of branching in shared settings code.
 */
export const RETIRED_MODEL_REPLACEMENTS: RetiredModelTable = {
  qwen: { [QWEN_RETIRED_PREVIEW_MODEL_ID]: QWEN_DEFAULT_MODEL_ID },
};

/** The replacement for a retired selection, or `undefined` when it is current. */
export function retiredModelReplacement(
  agentKind: string,
  modelId: string,
  table: RetiredModelTable = RETIRED_MODEL_REPLACEMENTS,
): string | undefined {
  const models = Object.hasOwn(table, agentKind) ? table[agentKind] : undefined;
  return models && Object.hasOwn(models, modelId) ? models[modelId] : undefined;
}
