/**
 * Locate ACP `model_config` selectors that map onto first-class ThreadConfig
 * fields (fast / context size). Agents advertise these under their own ids;
 * classification is by value shape so the shared session does not learn a
 * vendor name.
 */

import { canonicalizeEffortId } from "@/shared/effortOrder";

export type ModelConfigOptionLike = {
  id?: string;
  name?: string;
  category?: string | null;
  type?: string;
  currentValue?: string;
  options?: unknown;
};

type SelectEntry = {
  value?: string;
  name?: string;
  options?: unknown;
};

export function flattenSelectOptionValues(options: unknown): string[] {
  if (!Array.isArray(options)) {
    return [];
  }
  return options.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const record = entry as SelectEntry;
    if (typeof record.value === "string" && record.value.length > 0) {
      return [record.value];
    }
    return flattenSelectOptionValues(record.options);
  });
}

function listModelConfigSelects(configOptions: unknown): ModelConfigOptionLike[] {
  if (!Array.isArray(configOptions)) {
    return [];
  }
  return configOptions.filter((candidate): candidate is ModelConfigOptionLike => {
    if (typeof candidate !== "object" || candidate === null) {
      return false;
    }
    const option = candidate as ModelConfigOptionLike;
    return option.category === "model_config" && option.type === "select";
  });
}

const CONTEXT_SIZE_RE = /^\d+[km]$/i;

function looksLikeContextValues(values: readonly string[]): boolean {
  return values.length > 0 && values.every((value) => CONTEXT_SIZE_RE.test(value));
}

function looksLikeBooleanValues(values: readonly string[]): boolean {
  if (values.length !== 2) return false;
  const normalized = new Set(values.map((value) => value.toLowerCase()));
  return normalized.has("true") && normalized.has("false");
}

/** Fast / speed-quality trade-off advertised as a boolean model_config select. */
export function findFastConfigOption(configOptions: unknown): ModelConfigOptionLike | undefined {
  return listModelConfigSelects(configOptions).find((option) =>
    looksLikeBooleanValues(flattenSelectOptionValues(option.options)),
  );
}

/** Context-window selector advertised as size tokens (`272k`, `1m`, …). */
export function findContextConfigOption(configOptions: unknown): ModelConfigOptionLike | undefined {
  return listModelConfigSelects(configOptions).find((option) =>
    looksLikeContextValues(flattenSelectOptionValues(option.options)),
  );
}

/**
 * Map a Poracode config value onto an advertised select row, accepting
 * effort aliases (`xhigh` ↔ `extra-high`) and case-insensitive matches.
 */
export function resolveAdvertisedSelectValue(
  option: { options?: unknown } | undefined,
  desired: string | undefined,
): string | undefined {
  if (!option || !desired) return undefined;
  const values = flattenSelectOptionValues(option.options);
  if (values.includes(desired)) return desired;
  const want = canonicalizeEffortId(desired);
  return values.find(
    (value) =>
      value.toLowerCase() === desired.toLowerCase() || canonicalizeEffortId(value) === want,
  );
}
