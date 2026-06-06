/**
 * Trigger words are literal words the composer promotes into non-editable chips
 * to hint at a special agent capability. Providers opt into the words that
 * apply to a given model via `registerTriggerWords()` (see
 * providers/ProviderIcon.tsx). Detection, chip insertion, and serialization all
 * read this catalog, so no per-word plumbing is needed elsewhere.
 */
export interface TriggerWordDef {
  /** Word matched case-insensitively as a whole word; also the chip label. */
  word: string;
}

function escapeForRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex-alternation source (escaped) for the given words, e.g. `workflow|deploy`. */
export function triggerWordAlternation(defs: readonly TriggerWordDef[]): string {
  return defs.map((d) => escapeForRegex(d.word)).join("|");
}

/** Look up a definition by its (case-insensitive) word. */
export function findTriggerWord(
  defs: readonly TriggerWordDef[],
  word: string,
): TriggerWordDef | undefined {
  const lower = word.toLowerCase();
  return defs.find((d) => d.word.toLowerCase() === lower);
}
