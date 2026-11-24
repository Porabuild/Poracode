import type { AgentCapability, LabeledOption } from "@/shared/contracts";
import { parseCursorModelId } from "@/shared/cursorModelId";

/**
 * Sub-provider grouping for CLI, ACP, and SDK picker projections. Cursor's
 * catalog has no usage-pool field, so the first-party Cursor Models pool is
 * the known Cursor families (Auto, Composer, Grok). Every other id is a
 * third-party model billed outside the plan pool and groups under Other
 * models, so a vendor Cursor adds later never defaults into the pool.
 */

export const CURSOR_MODEL_GROUP_ID = "cursor";
export const OTHER_MODEL_GROUP_ID = "other";

const CURSOR_FIRST_PARTY_MODEL_RE = /^(?:default(?:-|$)|auto(?:-|$)|composer(?:-|$)|grok(?:-|$))/iu;

export function cursorModelGroup(modelId: string): "cursor" | "other" {
  const baseId = parseCursorModelId(modelId).baseId;
  return CURSOR_FIRST_PARTY_MODEL_RE.test(baseId) ? CURSOR_MODEL_GROUP_ID : OTHER_MODEL_GROUP_ID;
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
