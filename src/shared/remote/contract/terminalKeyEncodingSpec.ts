/**
 * THE terminal hardware-key encoding spec (deep-review consolidation of the
 * V5 5.1 raw-key passthrough). The PTY byte encoding for one normalized
 * hardware-keyboard press — the C0 fold band, the xterm modifier math, the
 * arrow CSI forms, and the CSI-u fallback — was hand-duplicated across the
 * Android and iOS apps and had drifted at the edges (documented below). This
 * module is the ONE declarative source: the normalized key set, the modifier
 * flags, the bare-key sequences, the arrow suffixes, the CSI-u code points,
 * the fold band, and the ordered first-match rule table. The native emitters
 * (`contract/native/emitTerminalKeyEncoding{Swift,Kotlin}.ts`) render it into
 * the same generated bundles as the wire contract, the pairing machine, and
 * the terminal-cursor machine, and `terminalKeyEncoding.ts` is the executable
 * TS reference the contract tests pin vectors against.
 *
 * Scope: the pure key → PTY-string mapping only. Event normalization stays a
 * hand-written per-platform coordinator exactly like the terminal-cursor JSON
 * decoders (Android `terminalHardwareKey(Key)` over Compose `Key`, iOS
 * `TerminalTranscriptView.terminalEvent` over `UIPress`); so do transports,
 * the on-screen accessory encoders, and UI. They consume the generated
 * encoder.
 *
 * Reconciled divergences (the two hand-written copies disagreed here; the
 * spec decides and every platform now ships the same behavior):
 *
 * 1. Ctrl-only (or Ctrl+Shift) on a character OUTSIDE the fold band (for
 *    example Ctrl+1, Ctrl+Space, Ctrl+Delete). Android emitted the xterm
 *    CSI-u form (`\u001b[49;5u`); iOS silently dropped the control modifier
 *    and passed the character through, contradicting its own doc comment
 *    ("every other modified key uses the xterm-compatible CSI forms"). The
 *    spec keeps Android's behavior: every key the encoder can map uses the
 *    CSI-u form, so a fold-band miss under Ctrl is never downgraded to an
 *    unmodified keystroke.
 * 2. A modified character with no single scalar code point (multi-scalar
 *    text, a lone surrogate). iOS fell back to the bare sequence; Android
 *    emitted CSI-u with the FIRST UTF-16 UNIT, which for a surrogate pair
 *    injects a lone surrogate into the PTY stream (a broken escape). The
 *    spec keeps iOS's behavior: a CSI-u code point must be exactly one
 *    valid Unicode scalar in 0x20...0x10FFFF, and an unmappable key falls
 *    back to its bare sequence rather than emitting a malformed escape.
 * 3. The C0 fold input width. Android required one UTF-16 code unit; iOS
 *    required one UTF-8 byte. The spec measures in Unicode scalars: the
 *    fold applies when the input is exactly one scalar whose uppercase form
 *    is exactly one scalar inside the 0x40...0x5F band. This also removes
 *    Android's latent crash on Ctrl+'ß' (whose uppercase is the two-scalar
 *    "SS"): a multi-scalar uppercase simply does not fold.
 *
 * The wire protocol is unchanged: nothing here touches routes, procedures,
 * or schemas — `buildRemoteV3IrDocument()` never reads this file.
 */

export const TERMINAL_KEY_ENCODING_ID = "terminalKeyEncoding" as const;
export const TERMINAL_KEY_ENCODING_SPEC_VERSION = 1 as const;

/** Normalized hardware keys the terminal passthrough understands. `character`
 * carries its text through the encoder argument so the mapping stays pure and
 * JVM/XCTest-testable without platform key events. */
export const TERMINAL_KEY_ENCODING_KEYS = [
  "character",
  "up",
  "down",
  "left",
  "right",
  "escape",
  "tab",
  "enter",
  "backspace",
  "home",
  "end",
  "pageUp",
  "pageDown",
] as const;
export type TerminalKeyEncodingKey = (typeof TERMINAL_KEY_ENCODING_KEYS)[number];

/** Arrow keys use the `\u001b[1;<modifier><suffix>` CSI form. */
export const TERMINAL_KEY_ENCODING_ARROW_KEYS = ["up", "down", "left", "right"] as const;
export type TerminalKeyEncodingArrowKey = (typeof TERMINAL_KEY_ENCODING_ARROW_KEYS)[number];

/** Modifier flags. The values double as the xterm CSI-u modifier
 * contributions, so the wire parameter is `1 + sum(set flags)`. */
export const TERMINAL_KEY_ENCODING_MODIFIERS = ["shift", "alt", "ctrl", "meta"] as const;
export type TerminalKeyEncodingModifier = (typeof TERMINAL_KEY_ENCODING_MODIFIERS)[number];
export const TERMINAL_KEY_MODIFIER_FLAGS: Record<TerminalKeyEncodingModifier, number> = {
  shift: 1,
  alt: 2,
  ctrl: 4,
  meta: 8,
};

/** Bare-key sequences — what an unmodified press emits. The `character`
 * entry is table-completeness only: character keys pass their own text
 * through (`passthrough`/`verbatim` effects), never this empty string. */
export const TERMINAL_KEY_BARE_SEQUENCES: Record<TerminalKeyEncodingKey, string> = {
  character: "",
  escape: "\u001b",
  tab: "\t",
  enter: "\r",
  backspace: "\u007f",
  up: "\u001b[A",
  down: "\u001b[B",
  left: "\u001b[D",
  right: "\u001b[C",
  home: "\u001b[H",
  end: "\u001b[F",
  pageUp: "\u001b[5~",
  pageDown: "\u001b[6~",
};

/** Back-Tab (Shift+Tab); the one shifted named key with a dedicated form. */
export const TERMINAL_KEY_BACKTAB_SEQUENCE = "\u001b[Z";

/** xterm arrow suffixes, keyed by arrow key. */
export const TERMINAL_KEY_ARROW_SUFFIXES: Record<TerminalKeyEncodingArrowKey, string> = {
  up: "A",
  down: "B",
  left: "D",
  right: "C",
};

/** CSI-u (`\u001b[<code>;<modifier>u`) primary parameters for the named keys
 * that are not arrows. The values are the classic C0 codes of each key. */
export const TERMINAL_KEY_CSI_U_CODE_POINTS: Record<string, number> = {
  escape: 27,
  tab: 9,
  enter: 13,
  backspace: 127,
  home: 1,
  end: 4,
  pageUp: 5,
  pageDown: 6,
};

/** The C0 fold band: an uppercase scalar inside `low...high` folds to
 * `scalar - 0x40` (0x40 '@' → NUL through 0x5F '_' → US). */
export const TERMINAL_KEY_C0_FOLD_BAND = { low: 0x40, high: 0x5f } as const;

/** A CSI-u code point (named table or character scalar) must be exactly one
 * valid Unicode scalar inside this range; surrogate values never encode. */
export const TERMINAL_KEY_CSI_U_BOUNDS = {
  minimum: 0x20,
  maximum: 0x10ffff,
  surrogateLow: 0xd800,
  surrogateHigh: 0xdfff,
} as const;

/** Named guards evaluated in table order; each has one generated and one TS
 * implementation driven by the rule table below. Guards read the normalized
 * stroke: the key, its character text (character keys only), and the
 * pressed-modifier set. */
export const TERMINAL_KEY_ENCODING_GUARDS = [
  "characterOnlyShift",
  "characterBare",
  "characterPreFolded",
  "characterC0Fold",
  "namedBare",
  "tabShiftOnly",
  "arrowKey",
  "csiUMappable",
  "always",
] as const;
export type TerminalKeyEncodingGuard = (typeof TERMINAL_KEY_ENCODING_GUARDS)[number];

/** Consumer-facing encoding effects. */
export const TERMINAL_KEY_ENCODING_EFFECTS = [
  /** The character text, uppercased (Shift realizes case). */
  "uppercase",
  /** The character text verbatim (bare or already-C0 input). */
  "verbatim",
  /** Fold through the C0 band to one control character. */
  "c0Control",
  /** The key's bare sequence from `TERMINAL_KEY_BARE_SEQUENCES`. */
  "bareSequence",
  /** The dedicated Back-Tab sequence. */
  "backTab",
  /** `\u001b[1;<modifier><arrowSuffix>`. */
  "arrowCsi",
  /** `\u001b[<codePoint>;<modifier>u`. */
  "csiU",
  /** The character text for character keys, the bare sequence otherwise —
   * the never-drop fallback. */
  "passthrough",
] as const;
export type TerminalKeyEncodingEffect = (typeof TERMINAL_KEY_ENCODING_EFFECTS)[number];

export interface TerminalKeyEncodingRule {
  readonly id: string;
  readonly guard: TerminalKeyEncodingGuard;
  readonly effect: TerminalKeyEncodingEffect;
}

/**
 * Ordered first-match encoding rules. The first matching row wins; the
 * passthrough catch-all is last, so the table is total and a keystroke is
 * never dropped. Guard semantics (normative for every implementation):
 *
 * - `characterOnlyShift`: character key, modifiers exactly {shift}.
 * - `characterBare`: character key, no modifiers.
 * - `characterPreFolded`: character key, ctrl with neither alt nor meta,
 *   and the input is exactly one scalar below 0x20 — some input pipelines
 *   already fold the chord to its C0 byte; never double-fold those.
 * - `characterC0Fold`: character key, ctrl with neither alt nor meta, and
 *   the uppercase form of the input is exactly one scalar inside the fold
 *   band (reconciliation 3 measures scalars, not UTF-16 units or UTF-8
 *   bytes; a multi-scalar uppercase such as 'ß' → "SS" does not fold).
 * - `namedBare`: named key (non-character), no modifiers.
 * - `tabShiftOnly`: Tab with exactly {shift} — Back-Tab.
 * - `arrowKey`: the key is an arrow (every remaining arrow press is
 *   modified; bare arrows were consumed by `namedBare`).
 * - `csiUMappable`: the key has a CSI-u code point — the named table for
 *   named keys, or the character's uppercase single scalar inside
 *   0x20...0x10FFFF (reconciliations 1 and 2).
 * - `always`: true.
 */
export const TERMINAL_KEY_ENCODING_SPEC = {
  id: TERMINAL_KEY_ENCODING_ID,
  specVersion: TERMINAL_KEY_ENCODING_SPEC_VERSION,
  keys: TERMINAL_KEY_ENCODING_KEYS,
  modifiers: TERMINAL_KEY_ENCODING_MODIFIERS,
  modifierFlags: TERMINAL_KEY_MODIFIER_FLAGS,
  bareSequences: TERMINAL_KEY_BARE_SEQUENCES,
  backtabSequence: TERMINAL_KEY_BACKTAB_SEQUENCE,
  arrowKeys: TERMINAL_KEY_ENCODING_ARROW_KEYS,
  arrowSuffixes: TERMINAL_KEY_ARROW_SUFFIXES,
  csiUCodePoints: TERMINAL_KEY_CSI_U_CODE_POINTS,
  c0FoldBand: TERMINAL_KEY_C0_FOLD_BAND,
  csiUBounds: TERMINAL_KEY_CSI_U_BOUNDS,
  guards: TERMINAL_KEY_ENCODING_GUARDS,
  effects: TERMINAL_KEY_ENCODING_EFFECTS,
  rules: [
    {
      // Shift alone realizes case.
      id: "character-only-shift",
      guard: "characterOnlyShift",
      effect: "uppercase",
    },
    {
      id: "character-bare",
      guard: "characterBare",
      effect: "verbatim",
    },
    {
      // Already-folded input passes through untouched.
      id: "character-prefolded",
      guard: "characterPreFolded",
      effect: "verbatim",
    },
    {
      // The classic chords: Ctrl+C -> ETX, Ctrl+[ -> ESC, Ctrl+_ -> US.
      id: "character-c0-fold",
      guard: "characterC0Fold",
      effect: "c0Control",
    },
    {
      id: "named-bare",
      guard: "namedBare",
      effect: "bareSequence",
    },
    {
      id: "tab-backtab",
      guard: "tabShiftOnly",
      effect: "backTab",
    },
    {
      id: "arrow-modified",
      guard: "arrowKey",
      effect: "arrowCsi",
    },
    {
      // The xterm CSI-u fallback, including fold-band misses under
      // Ctrl-only (reconciliation 1).
      id: "csi-u",
      guard: "csiUMappable",
      effect: "csiU",
    },
    {
      // Unmappable keys fall back to the bare sequence rather than
      // emitting a malformed escape (reconciliation 2).
      id: "passthrough-fallback",
      guard: "always",
      effect: "passthrough",
    },
  ] satisfies readonly TerminalKeyEncodingRule[],
} as const;

export type TerminalKeyEncodingSpec = typeof TERMINAL_KEY_ENCODING_SPEC;

/** Validation accepts the literal spec or a structurally equal mutated copy
 * (the negative tests), so the rules list is widened to the declared
 * interface. */
export type TerminalKeyEncodingSpecInput = Omit<TerminalKeyEncodingSpec, "rules"> & {
  readonly rules: readonly TerminalKeyEncodingRule[];
};

/** Fails closed when the rule table or the lookup tables are not
 * ordered/sound, so a bad edit cannot reach generation. */
export function validateTerminalKeyEncodingSpec(spec: TerminalKeyEncodingSpecInput): string[] {
  const errors: string[] = [];
  const guards = new Set<string>(spec.guards);
  const effects = new Set<string>(spec.effects);
  const seen = new Set<string>();
  const usedGuards = new Set<string>();
  for (const rule of spec.rules as readonly TerminalKeyEncodingRule[]) {
    if (!guards.has(rule.guard)) errors.push(`rule ${rule.id} names unknown guard ${rule.guard}`);
    if (!effects.has(rule.effect))
      errors.push(`rule ${rule.id} names unknown effect ${rule.effect}`);
    if (seen.has(rule.id)) errors.push(`duplicate rule id ${rule.id}`);
    if (usedGuards.has(rule.guard)) errors.push(`duplicate guard ${rule.guard} in rule ${rule.id}`);
    if (
      rule.guard === "always" &&
      rule !== (spec.rules as readonly TerminalKeyEncodingRule[]).at(-1)
    ) {
      errors.push("the always guard must be the last rule");
    }
    seen.add(rule.id);
    usedGuards.add(rule.guard);
  }
  const last = spec.rules.at(-1);
  if (last?.guard !== "always" || last?.effect !== "passthrough") {
    errors.push("the rule table must end with the passthrough catch-all");
  }
  const keys = new Set<string>(spec.keys);
  if (keys.size !== Object.keys(spec.bareSequences).length) {
    errors.push("bareSequences must cover every key exactly once");
  }
  for (const [key, sequence] of Object.entries(spec.bareSequences)) {
    if (!keys.has(key)) errors.push(`bareSequences names unknown key ${key}`);
    if (typeof sequence !== "string") errors.push(`bareSequences[${key}] must be a string`);
  }
  const arrows = new Set<string>(spec.arrowKeys);
  if (arrows.size !== Object.keys(spec.arrowSuffixes).length) {
    errors.push("arrowSuffixes must cover every arrow key exactly once");
  }
  for (const [key, suffix] of Object.entries(spec.arrowSuffixes)) {
    if (!arrows.has(key)) errors.push(`arrowSuffixes names unknown arrow key ${key}`);
    if (typeof suffix !== "string" || suffix.length !== 1) {
      errors.push(`arrowSuffixes[${key}] must be a one-character suffix`);
    }
  }
  const csiUNamedKeys = new Set(Object.keys(spec.csiUCodePoints));
  for (const key of Object.keys(spec.csiUCodePoints)) {
    if (!keys.has(key)) errors.push(`csiUCodePoints names unknown key ${key}`);
    if (arrows.has(key)) errors.push(`csiUCodePoints must not name arrow key ${key}`);
  }
  for (const key of keys) {
    if (key === "character" || arrows.has(key)) continue;
    if (!csiUNamedKeys.has(key)) errors.push(`named key ${key} has no CSI-u code point`);
  }
  if (spec.c0FoldBand.high - spec.c0FoldBand.low !== 0x1f) {
    errors.push("the C0 fold band must cover exactly 0x40...0x5F");
  }
  if (spec.csiUBounds.minimum < 0x20 || spec.csiUBounds.surrogateLow !== 0xd800) {
    errors.push("CSI-u bounds must exclude control scalars and surrogates");
  }
  return errors;
}
