import type { AgentCapability } from "@/shared/contracts";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import type { MuseProbedCatalog } from "./msp/probe";

/**
 * Display label derived from the id's own segments
 * (`muse-spark-1.4-contributor` → `Muse Spark 1.4 Contributor`) — no
 * provider-owned name table to go stale.
 */
export function humanizeMuseModelLabel(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) =>
      /^\d+(\.\d+)?$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

/**
 * Convert a non-empty live `model/list` catalog into picker capabilities.
 * The host documents this as the models it accepts in `session/setModel`, so
 * it is authoritative rather than an additive overlay on the static fallback.
 * Context limits, effort choices, and defaults come from the catalog. Older
 * hosts without effort metadata use the CLI help ladder. Empty catalogs
 * return null so unauthenticated detection can keep the static fallback.
 */
export function buildMuseCatalogCapabilities(
  baseModels: ReadonlyArray<{ id: string; label: string }>,
  catalog: MuseProbedCatalog,
  efforts: string[],
): Pick<
  AgentCapability,
  | "models"
  | "efforts"
  | "modelEfforts"
  | "modelDefaultEfforts"
  | "contextSizes"
  | "modelContextSizes"
> | null {
  const liveModels = catalog.models.filter((model) => model.id);
  if (liveModels.length === 0) return null;
  const baseLabels = new Map(baseModels.map((model) => [model.id, model.label]));
  const models = liveModels.map((model) => ({
    id: model.id,
    label:
      (model.label !== model.id ? model.label : "") ||
      baseLabels.get(model.id) ||
      humanizeMuseModelLabel(model.id),
  }));
  const limits = new Map<string, number>();
  const modelEfforts: Record<string, string[]> = {};
  const modelDefaultEfforts: Record<string, string> = {};
  for (const model of liveModels) {
    if (typeof model.contextLimit === "number" && model.contextLimit > 0) {
      limits.set(model.id, model.contextLimit);
    }
    const choices = model.efforts ?? efforts;
    modelEfforts[model.id] = [...choices];
    if (model.defaultEffort && choices.includes(model.defaultEffort)) {
      modelDefaultEfforts[model.id] = model.defaultEffort;
    }
  }
  return {
    models,
    efforts: [...new Set(Object.values(modelEfforts).flat())],
    modelEfforts,
    modelDefaultEfforts,
    ...buildContextSizeCapabilities(
      new Map(models.map((model) => [model.id, limits.get(model.id) ?? 1_000_000])),
    ),
  };
}
