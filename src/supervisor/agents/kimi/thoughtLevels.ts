/**
 * Kimi's `thought_level` selector (config id `thinking`) advertises `on` for
 * every model, but it is not an effort tier — it means "thinking enabled, tier
 * unspecified". Verified against kimi 0.33.0 (`session/new` followed by
 * `session/set_config_option` per model):
 *
 *   kimi-code/kimi-for-coding            -> ["on"]
 *   kimi-code/kimi-for-coding-highspeed  -> ["on"]
 *   kimi-code/k3                         -> ["low", "high", "max", "on"]
 *   kimi-code/k3-256k                    -> ["low", "high", "max", "on"]
 *
 * `currentValue` is `on` for all four, including the tiered K3 models. Kimi's
 * own picker never offers `on` next to the tiers (it shows `Low High Max` for
 * K3 and `On` / `Off (Unsupported)` for K2.7), so passing the raw list through
 * draws a fourth pseudo-tier and reports `On` as the selected reasoning level
 * for a K3 thread.
 *
 * ACP has no per-option "unsupported"/"disabled" marker (`SessionConfigSelectOption`
 * carries only `value`/`name`/`description`/`_meta`), so the untiered value can
 * only be recognized by its id.
 */
export const KIMI_UNTIERED_THOUGHT_LEVEL = "on";

/**
 * Default tier for a model whose probed default is the untiered `on`. Kimi
 * reports `on` for K3 too, so its probed default names no tier; falling back to
 * the list order would start K3 threads at `low`, the weakest thinking budget,
 * where Kimi's untiered `on` is not a floor at all.
 */
export const KIMI_PREFERRED_THOUGHT_TIER = "high";

/**
 * Resolve the default tier for a model: the probed default when it is a real
 * tier of that model, else {@link KIMI_PREFERRED_THOUGHT_TIER}. Returns
 * `undefined` when neither is available, leaving the choice to the caller.
 */
export function preferredKimiThoughtTier(
  tiers: readonly string[],
  probedDefault: string | undefined,
): string | undefined {
  if (probedDefault && tiers.includes(probedDefault)) return probedDefault;
  return tiers.includes(KIMI_PREFERRED_THOUGHT_TIER) ? KIMI_PREFERRED_THOUGHT_TIER : undefined;
}

/**
 * Reduce a probed thought-level list to the levels Poracode should offer.
 *
 * Two or more real tiers → the tier ladder, with `on` dropped. Kimi itself
 * removes `on` from the list as soon as a tier is selected (`thinking=max` on
 * K3 leaves `["low","high","max"]`), confirming it is the "no tier chosen yet"
 * placeholder rather than a level.
 *
 * Otherwise → just `on`. Keeping the single level, instead of reporting no
 * levels at all, is what lets Poracode put an untiered model back into its only
 * state: Kimi carries the previous model's tier across a model switch, so after
 * K3 `max` → K2.7 the session stays on `max` (and even lists it as a K2.7
 * option) until `thinking=on` is sent explicitly.
 */
export function kimiThoughtLevelChoices(levels: readonly string[]): string[] {
  const tiers = levels.filter((level) => level !== KIMI_UNTIERED_THOUGHT_LEVEL);
  if (tiers.length > 1) return tiers;
  return levels.includes(KIMI_UNTIERED_THOUGHT_LEVEL) ? [KIMI_UNTIERED_THOUGHT_LEVEL] : tiers;
}

type KimiThoughtLevelOption = { value?: unknown };

/**
 * Apply {@link kimiThoughtLevelChoices} to a live ACP thought-level select, and
 * clear a `currentValue` that is not one of the surviving choices. Returns the
 * option unchanged when every advertised value survives.
 *
 * The session's config sync adopts `currentValue` verbatim as the thread's
 * effort, and Kimi reports values that are not choices of the selected model:
 * `on` for the tiered K3 models, and the previous model's tier for a whole turn
 * after switching to an untiered one.
 */
export function normalizeKimiThoughtLevelOption<
  T extends { currentValue?: string; options?: unknown },
>(option: T): T {
  if (!Array.isArray(option.options)) return option;
  const values = option.options.flatMap((entry: unknown) => {
    const value = (entry as KimiThoughtLevelOption | null)?.value;
    return typeof value === "string" ? [value] : [];
  });
  const tiers = new Set(kimiThoughtLevelChoices(values));
  if (tiers.size === values.length) return option;
  const options = option.options.filter((entry: unknown) => {
    const value = (entry as KimiThoughtLevelOption | null)?.value;
    return typeof value !== "string" || tiers.has(value);
  });
  const dropCurrentValue = option.currentValue !== undefined && !tiers.has(option.currentValue);
  const normalized = { ...option, options };
  if (dropCurrentValue) delete normalized.currentValue;
  return normalized;
}
