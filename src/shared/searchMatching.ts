export interface SearchQuery {
  text: string;
  terms: readonly string[];
}

export interface SearchField {
  text: string;
  /** Title/name fields carry more weight than paths, keywords, and descriptions. */
  weight?: number;
  /** Allow ordered abbreviations on concise fields, never on long descriptions. */
  fuzzy?: boolean;
}

export function normalizeSearchText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function createSearchQuery(text: string): SearchQuery {
  const normalized = normalizeSearchText(text.trim());
  return { text: normalized, terms: normalized.split(/\s+/u).filter(Boolean) };
}

interface TextMatch {
  score: number;
  positions: readonly number[];
}

const EMPTY_POSITIONS: readonly number[] = [];

function matchText(
  text: string,
  term: string,
  fuzzy: boolean,
  collectPositions = false,
): TextMatch | null {
  const start = text.indexOf(term);
  if (start >= 0) {
    const boundary = start === 0 || /[^\p{L}\p{N}]/u.test(text[start - 1]!);
    const score = text === term ? 240 : start === 0 ? 200 : boundary ? 160 : 140;
    return {
      score: score - Math.min(start, 30),
      positions: collectPositions
        ? Array.from({ length: term.length }, (_, index) => start + index)
        : EMPTY_POSITIONS,
    };
  }
  if (!fuzzy || term.length < 2) return null;

  const positions = collectPositions ? ([] as number[]) : undefined;
  let first = -1;
  let cursor = 0;
  for (const character of term) {
    const position = text.indexOf(character, cursor);
    if (position < 0) return null;
    if (first < 0) first = position;
    positions?.push(position);
    cursor = position + character.length;
  }
  const gap = cursor - first - term.length;
  if (gap > 32) return null;
  return {
    score: 60 + (first === 0 ? 10 : 0) - Math.min(first + gap, 40),
    positions: positions ?? EMPTY_POSITIONS,
  };
}

/** Every query term must match; literal title matches outrank metadata and abbreviations. */
export function scoreSearchFields(
  fields: readonly SearchField[],
  query: SearchQuery,
): number | null {
  if (query.terms.length === 0) return 0;
  const normalized = fields.map((field) => ({ ...field, text: normalizeSearchText(field.text) }));
  let score = 0;
  for (const term of query.terms) {
    let best = 0;
    for (const field of normalized) {
      const match = matchText(field.text, term, field.fuzzy ?? false);
      if (match) best = Math.max(best, match.score * (field.weight ?? 1));
    }
    if (best === 0) return null;
    score += best;
  }
  // Prefer a whole phrase over the same words scattered across different fields.
  score += Math.max(
    0,
    ...normalized.map((field) =>
      (field.weight ?? 1) >= 1
        ? field.text === query.text
          ? 200
          : field.text.startsWith(query.text)
            ? 60
            : 0
        : 0,
    ),
  );
  return score;
}

export interface SearchMatchRange {
  start: number;
  end: number;
}

/** Map folded matches back to UTF-16 offsets, preserving accents and emoji in the display. */
export function getSearchMatchRanges(
  text: string,
  query: SearchQuery,
  fuzzy = true,
): SearchMatchRange[] {
  if (query.terms.length === 0) return [];
  const offsets: SearchMatchRange[] = [];
  let normalized = "";
  let offset = 0;
  for (const character of text) {
    const folded = normalizeSearchText(character);
    for (let index = 0; index < folded.length; index++) {
      offsets.push({ start: offset, end: offset + character.length });
    }
    normalized += folded;
    offset += character.length;
  }
  const positions = query.terms.flatMap(
    (term) => matchText(normalized, term, fuzzy, true)?.positions ?? EMPTY_POSITIONS,
  );
  const ranges: SearchMatchRange[] = [];
  for (const position of [...new Set(positions)].sort((a, b) => a - b)) {
    const range = offsets[position];
    if (!range) continue;
    const last = ranges.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else ranges.push({ ...range });
  }
  return ranges;
}

/** One file-name/path policy for host ranking and palette group relevance. */
export function scoreFileSearchEntry(
  entry: { name: string; path: string },
  query: SearchQuery,
): number | null {
  return scoreSearchFields(
    [
      { text: entry.name, fuzzy: true },
      { text: entry.path, weight: 0.4, fuzzy: true },
    ],
    query,
  );
}

export interface RankedSearchMatch<T> {
  item: T;
  score: number;
}
