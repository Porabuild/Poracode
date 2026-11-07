type VariantFoldable = {
  models?: readonly { id: string }[] | undefined;
  fastModels?: readonly string[] | undefined;
  modelEfforts?: Readonly<Record<string, unknown>> | undefined;
  modelDefaultEfforts?: Readonly<Record<string, unknown>> | undefined;
  modelContextSizes?: Readonly<Record<string, unknown>> | undefined;
  thinkingModels?: readonly string[] | undefined;
};

/** Helpers for a provider-declared model-id suffix representing a selectable variant. */
export function createModelVariant(suffix: string) {
  function isVariantId(modelId: string): boolean {
    return modelId.endsWith(suffix) && modelId.length > suffix.length;
  }

  function standardId(modelId: string): string {
    return isVariantId(modelId) ? modelId.slice(0, -suffix.length) : modelId;
  }

  function variantId(modelId: string): string {
    const standard = standardId(modelId);
    return `${standard}${suffix}`;
  }

  /** Use the standard id when this catalog still advertises it. */
  function canonicalId(modelId: string, models: readonly { id: string }[]): string {
    if (!isVariantId(modelId)) return modelId;
    const standard = standardId(modelId);
    return models.some((model) => model.id === standard) ? standard : modelId;
  }

  /**
   * A saved fast-variant id becomes the standard model with Fast on.
   * Other configs pass through, including an explicit `fast: false`.
   */
  function normalizeConfig<T extends { model?: string | undefined; fast?: boolean | undefined }>(
    config: T,
    models: readonly { id: string }[],
  ): T & { fast?: boolean | undefined } {
    const model = config.model;
    if (!model) return config;
    const standard = canonicalId(model, models);
    if (standard === model && !isVariantId(model)) return config;
    return { ...config, model: standard, fast: config.fast ?? true };
  }

  /**
   * Drop suffix siblings from the model list and record each standard id in
   * `fastModels`. A sibling is folded only when its standard model is also
   * advertised, so an unknown variant-only id stays selectable. A live session
   * catalog can list the sibling again after detection already folded it.
   */
  function foldCapabilities<T extends VariantFoldable>(capabilities: T): T & VariantFoldable {
    const models = capabilities.models;
    if (!models?.length) return capabilities;

    const folded = new Map<string, string>();
    for (const model of models) {
      const standard = canonicalId(model.id, models);
      if (standard !== model.id) folded.set(model.id, standard);
    }
    if (folded.size === 0) return capabilities;

    const fastModels = new Set((capabilities.fastModels ?? []).filter((id) => !folded.has(id)));
    for (const standard of folded.values()) fastModels.add(standard);

    return {
      ...capabilities,
      models: models.filter((model) => !folded.has(model.id)),
      fastModels: [...fastModels],
      ...(capabilities.modelEfforts
        ? { modelEfforts: remapRecord(capabilities.modelEfforts, folded) }
        : {}),
      ...(capabilities.modelDefaultEfforts
        ? { modelDefaultEfforts: remapRecord(capabilities.modelDefaultEfforts, folded) }
        : {}),
      ...(capabilities.modelContextSizes
        ? { modelContextSizes: remapRecord(capabilities.modelContextSizes, folded) }
        : {}),
      ...(capabilities.thinkingModels
        ? { thinkingModels: remapList(capabilities.thinkingModels, folded) }
        : {}),
    };
  }

  return { isVariantId, standardId, variantId, canonicalId, normalizeConfig, foldCapabilities };
}

function remapRecord<V>(
  record: Readonly<Record<string, V>>,
  folded: ReadonlyMap<string, string>,
): Record<string, V> {
  const next: Record<string, V> = {};
  for (const [id, value] of Object.entries(record)) {
    const standard = folded.get(id);
    if (!standard) {
      next[id] = value;
      continue;
    }
    if (next[standard] === undefined) next[standard] = value;
  }
  return next;
}

function remapList(ids: readonly string[], folded: ReadonlyMap<string, string>): string[] {
  const next: string[] = [];
  for (const id of ids) {
    const standard = folded.get(id) ?? id;
    if (!next.includes(standard)) next.push(standard);
  }
  return next;
}
