interface OpenCode2ModelRef {
  providerID: string;
  id: string;
  variant?: string;
}

/**
 * Split Poracode's composite model id (`providerID/model-id`) into V2's
 * model ref, mapping `config.effort` onto the model's `variant` (V2's
 * reasoning-effort ladder, e.g. low/high/max).
 */
export function parseOpenCode2ModelRef(
  modelSlug: string | undefined,
  effort: string | undefined,
): OpenCode2ModelRef | undefined {
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

export function modelRefKey(model: OpenCode2ModelRef): string {
  return model.variant
    ? `${model.providerID}/${model.id}@${model.variant}`
    : `${model.providerID}/${model.id}`;
}
