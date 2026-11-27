export interface GitDiffSearchEntry {
  filePath: string;
  staged: boolean;
  rawDiff: string;
  tooLarge: boolean;
  oldName: string;
  deletions: number;
}

export interface GitDiffSearchLine {
  selector: string;
  text: string;
}

export interface OversizedDiffMatch {
  readonly side: "old" | "new";
  readonly line: number;
  readonly hunk: string;
  readonly text: string;
}

/** One bounded oversized scan stops here; the result may be incomplete. */
export const OVERSIZED_DIFF_MATCH_LIMIT = 250;

export interface OversizedDiffSearchResult {
  readonly matches: readonly OversizedDiffMatch[];
  /** True when the scan reached the cap, so more matches may exist. */
  readonly capped: boolean;
}

interface PatchLine {
  text: string;
  hunk: string;
  oldLine?: number;
  newLine?: number;
}

function* patchLines(diff: string): Generator<PatchLine> {
  let oldLine = 0;
  let newLine = 0;
  let heading = "";
  let offset = 0;
  while (offset < diff.length) {
    const next = diff.indexOf("\n", offset);
    const end = next < 0 ? diff.length : next;
    const line = diff.slice(offset, diff[end - 1] === "\r" ? end - 1 : end);
    offset = end + 1;
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      heading = line;
      continue;
    }
    const marker = line[0];
    if (!heading || (marker !== " " && marker !== "+" && marker !== "-")) continue;
    yield {
      text: line.slice(1),
      hunk: heading,
      ...(marker !== "+" ? { oldLine: oldLine++ } : {}),
      ...(marker !== "-" ? { newLine: newLine++ } : {}),
    };
  }
}

/** Search the patch without building a render model or retaining every line. */
export async function findOversizedDiffMatches(
  diff: string,
  query: string,
  caseSensitive: boolean,
  signal: AbortSignal,
): Promise<OversizedDiffSearchResult> {
  if (!query) return { matches: [], capped: false };
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: OversizedDiffMatch[] = [];
  let visited = 0;
  let capped = false;
  for (const row of patchLines(diff)) {
    if (visited++ % 256 === 0) {
      signal.throwIfAborted();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const text = caseSensitive ? row.text : row.text.toLowerCase();
    const match = text.indexOf(needle);
    const line = row.newLine ?? row.oldLine;
    if (match < 0 || line === undefined || line < 1) continue;
    const start = Math.max(0, match - 100);
    const end = Math.min(row.text.length, match + query.length + 100);
    matches.push({
      side: row.newLine !== undefined ? "new" : "old",
      line,
      hunk: row.hunk.slice(0, 200),
      text: `${start ? "…" : ""}${row.text.slice(start, end)}${end < row.text.length ? "…" : ""}`,
    });
    if (matches.length >= OVERSIZED_DIFF_MATCH_LIMIT) {
      capped = true;
      break;
    }
  }
  signal.throwIfAborted();
  return { matches, capped };
}

const sectionSnapshots = new WeakMap<Element, { revision: string; lines: GitDiffSearchLine[] }>();

function lineSelector(side: "old" | "new", line: number, split: boolean): string {
  const cell = split
    ? `.diff-line-${side}-num:has([data-line-num="${line}"]) + .diff-line-${side}-content`
    : `tr:has([data-line-${side}-num="${line}"]) .diff-line-content`;
  return `${cell} :is(.diff-line-syntax-raw, .diff-line-content-raw)`;
}

/** Index patch text without constructing highlighted models for unseen files. */
export function gitDiffSearchLines(entry: GitDiffSearchEntry, mode: number): GitDiffSearchLine[] {
  const lines = [{ selector: "[data-diff-file-name]", text: entry.filePath }];
  if (entry.tooLarge) return lines;
  const split =
    mode !== 4 && !(entry.deletions === 0 && (!entry.oldName || entry.oldName === "/dev/null"));
  for (const row of patchLines(entry.rawDiff)) {
    if (row.oldLine !== undefined && (row.newLine === undefined || split)) {
      lines.push({ selector: lineSelector("old", row.oldLine, split), text: row.text });
    }
    if (row.newLine !== undefined) {
      lines.push({ selector: lineSelector("new", row.newLine, split), text: row.text });
    }
  }
  return lines;
}

/** Include user-expanded context in the index before a body leaves the viewport. */
export function readGitDiffSearchLines(
  section: Element,
  revision?: string,
): GitDiffSearchLine[] | null {
  const cells = section.querySelectorAll(
    "td.diff-line-old-content, td.diff-line-new-content, td.diff-line-content",
  );
  if (!cells.length) {
    const cached = sectionSnapshots.get(section);
    return revision !== undefined && cached?.revision === revision ? cached.lines : null;
  }
  const lines: GitDiffSearchLine[] = [
    {
      selector: "[data-diff-file-name]",
      text: section.querySelector("[data-diff-file-name]")?.textContent ?? "",
    },
  ];
  for (const cell of cells) {
    const row = cell.closest("tr")!;
    const split = !cell.classList.contains("diff-line-content");
    const side = split
      ? cell.classList.contains("diff-line-old-content")
        ? "old"
        : "new"
      : row.querySelector("[data-line-new-num]")
        ? "new"
        : "old";
    const number = split
      ? cell.previousElementSibling?.querySelector("[data-line-num]")
      : row.querySelector(`[data-line-${side}-num]`);
    const line = Number(number?.getAttribute(split ? "data-line-num" : `data-line-${side}-num`));
    if (line > 0)
      lines.push({
        selector: lineSelector(side, line, split),
        text:
          cell.querySelector(".diff-line-syntax-raw, .diff-line-content-raw")?.textContent ?? "",
      });
  }
  if (revision !== undefined) sectionSnapshots.set(section, { revision, lines });
  return lines;
}
