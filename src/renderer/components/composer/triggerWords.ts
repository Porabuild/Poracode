/**
 * Trigger words are literal words the composer promotes into non-editable chips
 * (and the chat highlights inline) to hint at a special agent capability. Today
 * the only one is "workflow", which spins up orchestration on Claude Opus
 * 4.7/4.8, but the mechanism is generic: add a new highlightable word to
 * `ALL_TRIGGER_WORDS` here, then opt the relevant provider in via
 * `registerTriggerWords()` (see providers/ProviderIcon.tsx). Detection,
 * chip insertion, serialization, and chat highlighting all read this catalog,
 * so no per-word plumbing is needed elsewhere.
 *
 * Per-word icons are a natural future extension: add an `iconSvg` field to
 * `TriggerWordDef` and thread it through `createTriggerWordChipElement` and the
 * chat inline render. Until then every trigger word shares the git-branch glyph.
 */
export interface TriggerWordDef {
  /** Word matched case-insensitively as a whole word; also the chip label. */
  word: string;
}

/** Workflow orchestration affordance (Claude Opus 4.7 / 4.8). */
export const WORKFLOW_TRIGGER_WORD: TriggerWordDef = { word: "workflow" };

/**
 * Every trigger word the app knows about. Chat rendering highlights any of
 * these regardless of provider; the composer only promotes the subset a
 * provider opts into.
 */
export const ALL_TRIGGER_WORDS: readonly TriggerWordDef[] = [WORKFLOW_TRIGGER_WORD];

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
