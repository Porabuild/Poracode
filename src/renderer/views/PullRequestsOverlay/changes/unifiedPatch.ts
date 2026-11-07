/** Reading one file's unified patch: hunks, line numbers, kind and context snippets. */

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export type PatchLineKind = " " | "-" | "+";

export interface PatchLine {
  kind: PatchLineKind;
  text: string;
  /** Followed by `\ No newline at end of file`. */
  noEol: boolean;
}

export interface Hunk {
  oldStart: number;
  newStart: number;
  section: string;
  lines: PatchLine[];
}

export interface ParsedPatch {
  /** Everything before the first hunk header. */
  header: string[];
  hunks: Hunk[];
  /** Anything after the last hunk (normally just the final empty piece). */
  tail: string[];
}

export function parsePatch(patch: string): ParsedPatch {
  const pieces = patch.split("\n");
  const header: string[] = [];
  let index = 0;
  while (index < pieces.length && !HUNK_HEADER.test(pieces[index]!)) {
    header.push(pieces[index]!);
    index += 1;
  }
  const hunks: Hunk[] = [];
  while (index < pieces.length) {
    const match = HUNK_HEADER.exec(pieces[index]!);
    if (!match) break;
    index += 1;
    let oldLeft = match[2] === undefined ? 1 : Number(match[2]);
    let newLeft = match[4] === undefined ? 1 : Number(match[4]);
    const lines: PatchLine[] = [];
    while (index < pieces.length && (oldLeft > 0 || newLeft > 0)) {
      const piece = pieces[index]!;
      const marker = piece.charAt(0);
      if (marker === "\\") {
        const previous = lines.at(-1);
        if (previous) previous.noEol = true;
        index += 1;
        continue;
      }
      const kind: PatchLineKind = marker === "-" ? "-" : marker === "+" ? "+" : " ";
      // An empty piece inside a hunk is a context line whose space was stripped.
      const text = marker === "-" || marker === "+" || marker === " " ? piece.slice(1) : piece;
      lines.push({ kind, text, noEol: false });
      if (kind !== "+") oldLeft -= 1;
      if (kind !== "-") newLeft -= 1;
      index += 1;
    }
    while (index < pieces.length && pieces[index]!.startsWith("\\")) {
      const previous = lines.at(-1);
      if (previous) previous.noEol = true;
      index += 1;
    }
    hunks.push({
      oldStart: Number(match[1]),
      newStart: Number(match[3]),
      section: match[5] ?? "",
      lines,
    });
  }
  return { header, hunks, tail: pieces.slice(index) };
}

export interface PatchRow {
  kind: PatchLineKind;
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

/** Every hunk line with its old and new line number. */
export function patchRows(patch: string): PatchRow[] {
  const rows: PatchRow[] = [];
  for (const hunk of parsePatch(patch).hunks) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const line of hunk.lines) {
      rows.push({
        kind: line.kind,
        oldLine: line.kind === "+" ? null : oldLine,
        newLine: line.kind === "-" ? null : newLine,
        text: line.text,
      });
      if (line.kind !== "+") oldLine += 1;
      if (line.kind !== "-") newLine += 1;
    }
  }
  return rows;
}

export interface VisibleLines {
  old: ReadonlySet<number>;
  new: ReadonlySet<number>;
}

/** Line numbers that appear in a hunk, so an inline comment has somewhere to sit. */
export function visibleLines(rows: readonly PatchRow[]): VisibleLines {
  const oldLines = new Set<number>();
  const newLines = new Set<number>();
  for (const row of rows) {
    if (row.oldLine !== null) oldLines.add(row.oldLine);
    if (row.newLine !== null) newLines.add(row.newLine);
  }
  return { old: oldLines, new: newLines };
}

export type PatchKind = "added" | "deleted" | "renamed" | "binary" | "modified";

export function patchKind(patch: string): PatchKind {
  const { header } = parsePatch(patch);
  if (header.some((line) => line.startsWith("Binary files ") || line === "GIT binary patch")) {
    return "binary";
  }
  if (header.some((line) => line.startsWith("new file mode"))) return "added";
  if (header.some((line) => line.startsWith("deleted file mode"))) return "deleted";
  if (header.some((line) => line.startsWith("rename from "))) return "renamed";
  return "modified";
}

export function patchStats(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of parsePatch(patch).hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "+") additions += 1;
      else if (line.kind === "-") deletions += 1;
    }
  }
  return { additions, deletions };
}

/**
 * The diff lines around one line, as plain unified-diff text (`+`, `-` or a
 * leading space), for quoting to the agent. `radius` is the number of lines
 * kept on each side of the target.
 */
export function snippetAround(
  patch: string,
  side: "LEFT" | "RIGHT",
  line: number,
  radius = 6,
): string {
  const rows = patchRows(patch);
  const at = rows.findIndex((row) => (side === "LEFT" ? row.oldLine : row.newLine) === line);
  if (at < 0) return "";
  return rows
    .slice(Math.max(0, at - radius), at + radius + 1)
    .map((row) => `${row.kind}${row.text}`)
    .join("\n");
}
