/** Bound the full scan of each display snapshot; longer text stays on the existing renderer. */
export const MAX_ORDINARY_PLAIN_PROSE_LENGTH = 8_192;

// Streamdown 2.6.0 preserves lone UTF-16 surrogates as literal paragraph text.
// Admit Cs so split astral characters keep the same paragraph while streaming.
// Controls, format characters and non-ASCII whitespace still take the rich path.
const PRINTABLE_PROSE = /^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Cs} ]+$/u;
// GFM links even an unfinished `www.` with no hostname.
const MARKDOWN_OR_PATH_SYNTAX = /[`*_~\\<>#[\]{}|/@&$+^]|\.[^ ]|www\.|==/iu;
const BLOCK_LEADER = /^(?:[-=]|\d+[.)])/u;

/**
 * A sufficient (deliberately not necessary) test for one plain Markdown
 * paragraph after transcript formatting. Periods must end the text or be
 * followed by a space, excluding filenames, domains and their completions.
 * Single inline equals signs are literal on one line; leading/repeated equals
 * stay conservative. Setext headings need a newline, which is never eligible.
 * Trailing ASCII spaces are eligible but must be trimmed for display, as in
 * Markdown. Leading whitespace and line breaks stay on the rich path.
 * Never infer append-only updates: inspect the entire current bounded string.
 */
export function isOrdinaryPlainProse(text: string): boolean {
  return (
    text.length > 0 &&
    text.length <= MAX_ORDINARY_PLAIN_PROSE_LENGTH &&
    text[0] !== " " &&
    !BLOCK_LEADER.test(text) &&
    !MARKDOWN_OR_PATH_SYNTAX.test(text) &&
    PRINTABLE_PROSE.test(text)
  );
}
