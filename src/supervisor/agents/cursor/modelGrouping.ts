import type { AgentCapability, LabeledOption } from "@/shared/contracts";
import { parseCursorModelId } from "@/shared/cursorModelId";

/**
 * Sub-provider grouping for CLI, ACP, and SDK picker projections. Cursor's
 * catalog has no usage-pool field: known third-party vendor prefixes are Other
 * models; remaining ids are the first-party Cursor Models pool.
 */

export const CURSOR_MODEL_GROUP_ID = "cursor";
export const OTHER_MODEL_GROUP_ID = "other";

const CURSOR_THIRD_PARTY_MODEL_RE = /^(?:gpt|claude|gemini|kimi|glm|opus|sonnet|haiku)(?:-|$)/iu;

export function cursorModelGroup(modelId: string): "cursor" | "other" {
  const baseId = parseCursorModelId(modelId).baseId;
  return CURSOR_THIRD_PARTY_MODEL_RE.test(baseId) ? OTHER_MODEL_GROUP_ID : CURSOR_MODEL_GROUP_ID;
}

export function cursorModelGrouping(
  models: readonly LabeledOption[],
): Pick<AgentCapability, "subProviders" | "modelSubProvider"> {
  return {
    subProviders: [
      { id: CURSOR_MODEL_GROUP_ID, label: "Cursor Models" },
      { id: OTHER_MODEL_GROUP_ID, label: "Other models" },
    ],
    modelSubProvider: Object.fromEntries(
      models.map((model) => [model.id, cursorModelGroup(model.id)]),
    ),
  };
}
