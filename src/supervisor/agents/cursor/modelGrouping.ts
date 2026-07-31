import type { AgentCapability, LabeledOption } from "@/shared/contracts";
import { parseCursorModelId } from "@/shared/cursorModelId";

/**
 * Sub-provider grouping shared by every Cursor model picker projection (CLI
 * terminal models, ACP models, and the SDK catalog). Kept in its own module so
 * the SDK projection doesn't have to import the detection module's process
 * probes just to classify a model id.
 */

export const CURSOR_MODEL_GROUP_ID = "cursor";
export const OTHER_MODEL_GROUP_ID = "other";

const CURSOR_FIRST_PARTY_MODEL_RE = /^(?:default$|auto(?:-smart)?|composer(?:-|$))/iu;

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
