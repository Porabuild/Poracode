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

  return { isVariantId, standardId, variantId, canonicalId, normalizeConfig };
}
