import type { ThreadConfig } from "@/shared/contracts";
import { findSelectConfigOption, findThoughtLevelConfig } from "../acp/sessionConfig";
import { findFastConfigOption, resolveAdvertisedSelectValue } from "../acp/modelConfigOptions";
import { DEVIN_ACP_FAST_CONFIG_BINDING } from "./acp/fastConfigBinding";

/** CLI pairs accept inactive defaults, but cannot carry separate controls. */
export function hasExplicitCompositeControls(config: ThreadConfig): boolean {
  return hasMeaningfulEffort(config) || hasExplicitCompositeControlsBeyondEffort(config);
}

export function hasExplicitCompositeControlsBeyondEffort(config: ThreadConfig): boolean {
  return config.fast === true || hasUnsupportedCompositeControls(config);
}

/** No qualified separate ACP carrier for these pair modifiers. */
export function hasUnsupportedCompositeControls(config: ThreadConfig): boolean {
  return (
    config.thinking === true || Boolean(config.contextSize && config.contextSize !== "default")
  );
}

function hasMeaningfulEffort(config: ThreadConfig): boolean {
  return Boolean(config.effort && config.effort !== "default");
}

/**
 * ACP pairs can carry effort through a separate native selector. Validate the
 * current pair on every submit, including unchanged saved settings. During a
 * model switch, the target ladder is not known yet: strict config sync validates
 * it after the model setter refreshes the advertised options.
 */
export function compositeEffortCarriable(config: ThreadConfig, options: unknown): boolean {
  if (!hasMeaningfulEffort(config) || hasExplicitCompositeControlsBeyondEffort(config))
    return false;
  const thought = findThoughtLevelConfig(options);
  if (!thought) return false;
  const currentModel = findSelectConfigOption(options, "model")?.currentValue;
  return (
    currentModel !== config.model ||
    resolveAdvertisedSelectValue(thought, config.effort) !== undefined
  );
}

/** Current pairs require genuine carriers; a switch validates refreshed target options. */
export function compositeControlsCarriable(config: ThreadConfig, options: unknown): boolean {
  if (hasUnsupportedCompositeControls(config)) return false;
  const currentModel = findSelectConfigOption(options, "model")?.currentValue;
  if (hasMeaningfulEffort(config) && !compositeEffortCarriable({ ...config, fast: false }, options))
    return false;
  return (
    config.fast !== true ||
    currentModel !== config.model ||
    Boolean(findFastConfigOption(options, DEVIN_ACP_FAST_CONFIG_BINDING))
  );
}
