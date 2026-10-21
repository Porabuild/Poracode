import type { ThreadConfig } from "@/shared/contracts";
import { grokFastVariantId, grokStandardModelId, isGrokBuildFastModelId } from "./modelId";
import { listSelectConfigOptionValues, resolveModelConfigValue } from "../acp/sessionConfig";

export { foldGrokFastModels } from "./modelId";

/**
 * Model id Grok's CLI and ACP model select should receive.
 * `fastModels` is the probed catalog; a fast toggle on any other model is ignored.
 */
export function resolveGrokCliModel(
  config: { model?: string | undefined; fast?: boolean | undefined },
  fastModels: readonly string[] | undefined,
): string | undefined {
  const model = config.model;
  if (!model) return model;
  const standard = grokStandardModelId(model);
  if (config.fast === false && fastModels?.includes(standard)) return standard;
  if (isGrokBuildFastModelId(model)) return model;
  if (config.fast === true && fastModels?.includes(model)) return grokFastVariantId(model);
  return model;
}

export function withGrokCliModel<
  T extends { model?: string | undefined; fast?: boolean | undefined },
>(config: T, fastModels: readonly string[] | undefined): T {
  const model = resolveGrokCliModel(config, fastModels);
  return !model || model === config.model ? config : { ...config, model };
}

/**
 * Map the Fast toggle onto Grok's `*-build-fast` model option. Grok has no
 * boolean fast config; the sibling model id is the wire value.
 */
export function resolveGrokAcpModel(
  config: ThreadConfig,
  configOptions: unknown,
): ReturnType<typeof resolveModelConfigValue> {
  const advertised = new Set(listSelectConfigOptionValues(configOptions, "model"));
  const standard = grokStandardModelId(config.model);
  const fastId = grokFastVariantId(standard);
  let wire = config.model;
  if (config.fast === true && advertised.has(fastId)) wire = fastId;
  else if (config.fast === false && advertised.has(standard)) wire = standard;

  const next =
    wire === config.model && config.fast !== true
      ? config
      : { ...config, model: wire, fast: undefined };
  return resolveModelConfigValue(next, configOptions);
}
