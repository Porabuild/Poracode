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
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const line of entry.rawDiff.split(/\r?\n/)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    const marker = line[0];
    if (marker !== " " && marker !== "+" && marker !== "-") continue;
    if (marker === "-" || (marker === " " && split)) {
      lines.push({ selector: lineSelector("old", oldLine, split), text: line.slice(1) });
    }
    if (marker !== "-") {
      lines.push({ selector: lineSelector("new", newLine, split), text: line.slice(1) });
    }
    if (marker !== "+") oldLine++;
    if (marker !== "-") newLine++;
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
