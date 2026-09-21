import { createModelVariant } from "@/shared/modelVariant";

// Grok exposes its Fast tier as a sibling model, not as a boolean config option.
export const {
  isVariantId: isGrokBuildFastModelId,
  standardId: grokStandardModelId,
  variantId: grokFastVariantId,
  canonicalId: canonicalGrokModelId,
  normalizeConfig: normalizeGrokModelConfig,
} = createModelVariant("-build-fast");
