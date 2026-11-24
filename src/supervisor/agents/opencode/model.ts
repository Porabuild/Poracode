export interface OpenCodeModelRef {
  providerID: string;
  id: string;
  variant?: string;
}

/**
 * Split Poracode's composite model id (`providerID/model-id`) into V2's
 * model ref, mapping `config.effort` onto the model's `variant` (V2's
 * reasoning-effort ladder, e.g. low/high/max).
 */
export function parseOpenCodeModelRef(
  modelSlug: string | undefined,
  effort: string | undefined,
): OpenCodeModelRef | undefined {
  if (!modelSlug) return undefined;
  const slash = modelSlug.indexOf("/");
  if (slash <= 0) return undefined;
  const variant = effort && effort.length > 0 ? effort : undefined;
  return {
    providerID: modelSlug.slice(0, slash),
    id: modelSlug.slice(slash + 1),
    ...(variant ? { variant } : {}),
  };
}

export function modelRefKey(model: OpenCodeModelRef): string {
  return model.variant
    ? `${model.providerID}/${model.id}@${model.variant}`
    : `${model.providerID}/${model.id}`;
}

/** Catalog identity of a model, independent of its reasoning-effort variant. */
export function modelCatalogKey(model: Pick<OpenCodeModelRef, "providerID" | "id">): string {
  return `${model.providerID}/${model.id}`;
}

/**
 * The catalog's `limit.context` as a usable token count. Absent, zero, and
 * non-finite windows are not a context window; every reader must agree on that.
 */
export function readOpenCodeContextLimit(
  model: { limit?: { context?: number } | undefined } | undefined,
): number | undefined {
  const context = model?.limit?.context;
  if (typeof context !== "number" || !Number.isFinite(context) || context <= 0) return undefined;
  return Math.trunc(context);
}
