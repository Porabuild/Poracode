import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import {
  canonicalGrokModelId,
  grokFastVariantId,
  grokStandardModelId,
  isGrokBuildFastModelId,
} from "./modelId";
import { listSelectConfigOptionValues, resolveModelConfigValue } from "../acp/sessionConfig";

type GrokFastFoldable = Partial<AgentCapability>;

/**
 * Drop `*-build-fast` siblings from the model picker and record the standard
 * id in `fastModels`. A sibling is folded only when its standard model is
 * also advertised, so an unknown fast-only id stays selectable.
 */
export function foldGrokFastModels<T extends GrokFastFoldable>(
  capabilities: T,
): T & GrokFastFoldable {
  const models = capabilities.models;
  if (!models?.length) return capabilities;

  const folded = new Map<string, string>();
  for (const model of models) {
    const standard = canonicalGrokModelId(model.id, models);
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

function remapRecord<V>(
  record: Record<string, V>,
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
