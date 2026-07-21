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
};

export function findThoughtLevelConfigOption(
  configOptions: unknown,
): ThoughtLevelConfigOptionLike | undefined {
  if (!Array.isArray(configOptions)) {
    return undefined;
  }
  const selectable = configOptions.filter(
    (candidate): candidate is ThoughtLevelConfigOptionLike =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as ThoughtLevelConfigOptionLike).type === "select",
  );
  return (
    selectable.find((option) => option.category === "thought_level") ??
    selectable.find((option) =>
      (THOUGHT_LEVEL_CONFIG_OPTION_IDS as readonly string[]).includes(option.id ?? ""),
    )
  );
}
