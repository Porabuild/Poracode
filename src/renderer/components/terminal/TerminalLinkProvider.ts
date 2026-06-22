/**
 * Custom terminal link provider that detects URLs spanning hard line breaks.
 *
 * xterm.js's built-in WebLinksAddon only joins soft-wrapped lines (where
 * `line.isWrapped === true`). CLI agents often hard-wrap output by emitting
 * real `\n` characters, so URLs that span lines get truncated.
 *
 * This provider extends the expansion logic: when the joined text ends mid-URL,
 * it continues reading subsequent lines even past hard breaks until a whitespace
 * or non-URL character is found.
 *
 * Regex and position-mapping logic adapted from @xterm/addon-web-links (MIT).
 */

import type { Terminal, ILinkProvider, ILink, IBufferLine } from "@xterm/xterm";
import { stripAnsi } from "@/shared/ansi";

// Copied from @xterm/addon-web-links v0.12.0 (MIT license).
// Matches http(s):// URLs, excluding unsafe/bracket characters as finals.
const strictUrlRegex =
  // eslint-disable-next-line no-control-regex -- intentional: exclude C0 control chars and DEL from URL matches
  /(https?|HTTPS?):[/]{2}[^\s"'!*(){}|\\^<>`\x00-\x1f\x7f]*[^\s"':,.!?{}|\\^~[\]`()<>\x00-\x1f\x7f]/;

/** Characters that are legal inside a URL path/query/fragment. */
const URL_LEGAL_TAIL = /[^\s"'!*(){}|\\^<>`]+$/;

function isUrl(text: string): boolean {
  try {
    const url = new URL(text);
    const parsedBase =
      url.password && url.username
        ? `${url.protocol}//${url.username}:${url.password}@${url.host}`
        : url.username
          ? `${url.protocol}//${url.username}@${url.host}`
          : `${url.protocol}//${url.host}`;
    return text.toLocaleLowerCase().startsWith(parsedBase.toLocaleLowerCase());
  } catch {
    return false;
  }
}

export class TerminalLinkProvider implements ILinkProvider {
  constructor(
    private readonly _terminal: Terminal,
    private readonly _handler: (event: MouseEvent, uri: string) => void,
  ) {}

  provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void): void {
    const links = this._computeLinks(bufferLineNumber);
    callback(links.length > 0 ? links : undefined);
  }

  private _computeLinks(y: number): ILink[] {
    const rex = new RegExp(strictUrlRegex.source, "g");
    const [lines, startLineIndex] = this._getWindowedLineStrings(y - 1);
    const line = lines.join("");

    let match;
    const result: ILink[] = [];

    while ((match = rex.exec(line))) {
      const text = stripAnsi(match[0]);
      if (!isUrl(text)) continue;

      const [startY, startX] = this._mapStrIdx(startLineIndex, 0, match.index);
      const [endY, endX] = this._mapStrIdx(startY, startX, text.length);

      if (startY === -1 || startX === -1 || endY === -1 || endX === -1) continue;

      result.push({
        range: {
          start: { x: startX + 1, y: startY + 1 },
          end: { x: endX, y: endY + 1 },
        },
        text,
        activate: this._handler,
      });
    }
    return result;
  }

  /**
   * Gather line strings around `lineIndex`, expanding through both soft-wrapped
   * lines AND hard line breaks when a URL appears truncated at the boundary.
   */
  private _getWindowedLineStrings(lineIndex: number): [string[], number] {
    const buf = this._terminal.buffer.active;
    let line: IBufferLine | undefined;
    let topIdx = lineIndex;
    let bottomIdx = lineIndex;
    let length = 0;
    let content = "";
    const lines: string[] = [];

    if (!(line = buf.getLine(lineIndex))) return [[], lineIndex];

    const currentContent = stripAnsi(line.translateToString(true));

    // ── Expand upward through soft-wrapped lines ─────────────────
    if (line.isWrapped && currentContent[0] !== " ") {
      length = 0;
      while ((line = buf.getLine(--topIdx)) && length < 2048) {
        content = stripAnsi(line.translateToString(true));
        length += content.length;
        lines.push(content);
        if (!line.isWrapped || content.indexOf(" ") !== -1) break;
      }
      lines.reverse();
    }

    // ── Current line ─────────────────────────────────────────────
    lines.push(currentContent);

    // ── Expand downward through soft-wrapped lines ───────────────
    length = 0;
    while ((line = buf.getLine(++bottomIdx)) && line.isWrapped && length < 2048) {
      content = stripAnsi(line.translateToString(true));
      length += content.length;
      lines.push(content);
      if (content.indexOf(" ") !== -1) break;
    }

    // ── Continue past hard breaks when the text ends mid-URL ─────
    // Only extend when a URL regex match reaches the very end of the
    // accumulated text (the URL was cut off mid-token) AND the line holding it
    // is a wrap edge (filled to the terminal's right edge). A URL only
    // "continues" across a newline when the break is really a soft-wrap whose
    // `isWrapped` flag was lost — Windows ConPTY repaints and sliced scrollback
    // replay both drop that flag. A URL that stops short of the edge ended on
    // purpose: the following line is unrelated output (e.g. a `concurrently`
    // "[1]" prefix, or Vite's next "Network:" URL) and must not be glued on.
    while (length < 2048) {
      const joined = lines.join("");
      if (!this._endsWithPartialUrl(joined)) break;

      const edgeLine = buf.getLine(bottomIdx - 1);
      if (!edgeLine || !this._isWrapEdge(edgeLine)) break;

      const nextLine = buf.getLine(bottomIdx);
      if (!nextLine) break;

      content = stripAnsi(nextLine.translateToString(true));
      if (!content || /^\s/.test(content)) break;
      if (/^\d+[.)]\s/u.test(content)) break;

      // Take only the URL-legal prefix of the continuation line.
      const continuationMatch = URL_LEGAL_TAIL.exec(content.split(/\s/)[0] ?? "");
      if (!continuationMatch || continuationMatch[0].length === 0) break;

      lines.push(continuationMatch[0]);
      length += continuationMatch[0].length;
      bottomIdx++;

      // If we consumed only part of the line, the URL has ended.
      if (continuationMatch[0].length < content.length) break;
    }

    return [lines, topIdx];
  }

  /**
   * Whether `line` was filled to the terminal's right edge — i.e. the newline
   * after it is a soft-wrap whose `isWrapped` flag was lost, not a deliberate
   * line ending. The visible content width (one past the rightmost non-blank
   * column) is measured in COLUMNS from the buffer cells, so a wide/CJK glyph
   * counts as its cell width rather than its UTF-16 length. The whole cell
   * array is scanned — including any cells past the live `cols`, which xterm
   * leaves un-trimmed after a shrink-resize (see `IBufferLine.length`) — so an
   * overrunning row measures wider than `cols` and is rejected (a real wrap
   * would have reflowed the overflow onto a wrapped line). Unknown width
   * (cols <= 0) fails safe to `false`.
   */
  private _isWrapEdge(line: IBufferLine): boolean {
    const cols = this._terminal.cols;
    if (cols <= 0) return false;
    const cell = this._terminal.buffer.active.getNullCell();
    let edge = 0;
    for (let i = 0; i < line.length; i++) {
      line.getCell(i, cell);
      const width = cell.getWidth();
      if (width === 0) continue; // spacer cell trailing a wide glyph
      const chars = cell.getChars();
      if (chars !== "" && chars !== " ") {
        edge = i + width; // content reaches through this cell to column i+width
      }
    }
    return edge === cols;
  }

  /** Returns true when the text ends with an in-progress URL (http(s)://...). */
  private _endsWithPartialUrl(text: string): boolean {
    // Quick check: does a URL regex match reach the very end of the string?
    const rex = new RegExp(strictUrlRegex.source, "g");
    let last: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = rex.exec(text))) last = m;
    if (!last) return false;
    return last.index + last[0].length === text.length;
  }

  /**
   * Map a string index back to buffer (lineIndex, columnIndex), both 0-based.
   * Returns [-1, -1] when the lookup hits a non-existing line.
   *
   * Adapted from @xterm/addon-web-links (MIT).
   */
  private _mapStrIdx(lineIndex: number, rowIndex: number, stringIndex: number): [number, number] {
    const buf = this._terminal.buffer.active;
    const cell = buf.getNullCell();
    let start = rowIndex;
    while (stringIndex) {
      const line = buf.getLine(lineIndex);
      if (!line) return [-1, -1];
      for (let i = start; i < line.length; ++i) {
        line.getCell(i, cell);
        const chars = cell.getChars();
        const width = cell.getWidth();
        if (width) {
          stringIndex -= chars.length || 1;

          // Correct for early-wrapped wide chars at the last cell.
          if (i === line.length - 1 && chars === "") {
            const next = buf.getLine(lineIndex + 1);
            if (next && next.isWrapped) {
              next.getCell(0, cell);
              if (cell.getWidth() === 2) {
                stringIndex += 1;
              }
            }
          }
        }
        if (stringIndex < 0) return [lineIndex, i];
      }
      lineIndex++;
      start = 0;
    }
    return [lineIndex, start];
  }
}
