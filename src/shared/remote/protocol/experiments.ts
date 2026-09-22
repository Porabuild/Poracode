import { REMOTE_EXPERIMENTS_VERSION } from "./core";

export { REMOTE_EXPERIMENTS_VERSION };

/**
 * True only when a host advertised `capabilities.experiments` version 1. An
 * absent capability means the host does not compose the experiment authority
 * (a headless/helper host or an old build): the routes are absent or answer
 * 501, so a client refuses the feature truthfully before any local mutation
 * and never falls back to a whole-map local writer.
 */
export function hostSupportsExperiments(
  capability: { readonly versions: readonly number[] } | undefined,
): boolean {
  return capability?.versions.includes(REMOTE_EXPERIMENTS_VERSION) === true;
}
