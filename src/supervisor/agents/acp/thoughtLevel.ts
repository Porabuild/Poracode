/**
 * Locates the ACP "reasoning effort" select config option.
 *
 * Agents advertise effort under different shapes:
 *   Gemini: { category: "thought_level", id: "thought_level" }
 *   Qoder:  { category: "model",        id: "reasoning_effort" }
 *
 * Match the spec-shaped category first, then known option ids, so a
 * `category: "model"` effort selector is never confused with the model
 * selector (which carries `id: "model"`).
 */
export const THOUGHT_LEVEL_CONFIG_OPTION_IDS = ["thought_level", "reasoning_effort"] as const;

export type ThoughtLevelConfigOptionLike = {
  id?: string;
  category?: string | null;
  type?: string;
  currentValue?: string;
  options?: unknown;
  _meta?: unknown;
};

function listSelectableConfigOptions(configOptions: unknown): ThoughtLevelConfigOptionLike[] {
  if (!Array.isArray(configOptions)) {
    return [];
  }
  return configOptions.filter(
    (candidate): candidate is ThoughtLevelConfigOptionLike =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as ThoughtLevelConfigOptionLike).type === "select",
  );
}

function isThoughtLevelCandidate(option: ThoughtLevelConfigOptionLike): boolean {
  return (
    option.category === "thought_level" ||
    (THOUGHT_LEVEL_CONFIG_OPTION_IDS as readonly string[]).includes(option.id ?? "")
  );
}

export function listThoughtLevelConfigOptions(
  configOptions: unknown,
): ThoughtLevelConfigOptionLike[] {
  return listSelectableConfigOptions(configOptions).filter(isThoughtLevelCandidate);
}

/**
 * Locate the graded reasoning-effort selector.
 *
 * A session can advertise more than one `thought_level` option — a boolean
 * thinking toggle plus a multi-value effort ladder. Prefer the ladder so the
 * effort picker is not collapsed to `true`/`false`.
 */
export function findThoughtLevelConfigOption(
  configOptions: unknown,
): ThoughtLevelConfigOptionLike | undefined {
  const candidates = listThoughtLevelConfigOptions(configOptions);
  return (
    candidates.find(
      (option) => option.category === "thought_level" && !isThinkingToggleConfig(option),
    ) ??
    candidates.find((option) => !isThinkingToggleConfig(option)) ??
    candidates.find((option) => option.category === "thought_level") ??
    candidates[0]
  );
}

/** Locate a thinking on/off selector when it is distinct from the effort ladder. */
export function findThinkingToggleConfigOption(
  configOptions: unknown,
): ThoughtLevelConfigOptionLike | undefined {
  const effort = findThoughtLevelConfigOption(configOptions);
  return listThoughtLevelConfigOptions(configOptions).find(
    (option) => isThinkingToggleConfig(option) && option.id !== effort?.id,
  );
}

function containsToggleOnlyMarker(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsToggleOnlyMarker);
  }
  const record = value as Record<string, unknown>;
  if (record.toggleOnly === true) {
    return true;
  }
  return Object.values(record).some(containsToggleOnlyMarker);
}

/** True when ACP metadata says this selector is a thinking on/off toggle. */
export function isToggleOnlyThoughtLevelConfig(
  option: ThoughtLevelConfigOptionLike | undefined,
): boolean {
  return containsToggleOnlyMarker(option?._meta);
}

function isBooleanSelectPair(option: ThoughtLevelConfigOptionLike | undefined): boolean {
  if (!option) return false;
  const values = new Set(
    flattenToggleChoices(option.options).map((choice) => choice.value.toLowerCase()),
  );
  return values.size === 2 && values.has("true") && values.has("false");
}

/**
 * True when this selector is a thinking on/off control — either the agent
 * marked it `toggleOnly`, or it is a plain `true`/`false` pair sitting beside
 * a graded effort ladder.
 */
export function isThinkingToggleConfig(option: ThoughtLevelConfigOptionLike | undefined): boolean {
  return isToggleOnlyThoughtLevelConfig(option) || isBooleanSelectPair(option);
}

type ThoughtLevelToggleChoice = {
  value: string;
  name?: string;
};

const TOGGLE_DISABLED_WORDS = new Set(["none", "off", "false", "disabled", "disable", "no"]);
const TOGGLE_ENABLED_WORDS = new Set(["default", "on", "true", "enabled", "enable", "yes"]);

function flattenToggleChoices(options: unknown): ThoughtLevelToggleChoice[] {
  if (!Array.isArray(options)) {
    return [];
  }
  return options.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return [];
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record.value === "string" && record.value.length > 0) {
      return [
        {
          value: record.value,
          ...(typeof record.name === "string" ? { name: record.name } : {}),
        },
      ];
    }
    return "options" in record ? flattenToggleChoices(record.options) : [];
  });
}

function hasToggleWord(choice: ThoughtLevelToggleChoice, words: ReadonlySet<string>): boolean {
  return [choice.value, choice.name]
    .filter((value): value is string => value !== undefined)
    .some((value) =>
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/u)
        .some((word) => words.has(word)),
    );
}

/** Resolve the provider-defined wire values for a toggle-only selector. */
export function resolveThoughtLevelToggleValues(
  option: ThoughtLevelConfigOptionLike | undefined,
): { disabled: string; enabled: string } | undefined {
  if (!isThinkingToggleConfig(option)) {
    return undefined;
  }
  const choices = flattenToggleChoices(option?.options);
  if (choices.length !== 2 || new Set(choices.map((choice) => choice.value)).size !== 2) {
    return undefined;
  }
  const disabledChoices = choices.filter((choice) => hasToggleWord(choice, TOGGLE_DISABLED_WORDS));
  const enabledChoices = choices.filter((choice) => hasToggleWord(choice, TOGGLE_ENABLED_WORDS));
  if (
    disabledChoices.length !== 1 ||
    enabledChoices.length !== 1 ||
    disabledChoices[0]!.value === enabledChoices[0]!.value
  ) {
    return undefined;
  }
  return { disabled: disabledChoices[0]!.value, enabled: enabledChoices[0]!.value };
}
