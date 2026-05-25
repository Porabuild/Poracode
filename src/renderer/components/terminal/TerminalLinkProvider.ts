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
    // Only extend if a URL regex match reaches the very end of the
    // accumulated text (i.e. the URL was cut off by a hard newline).
    while (length < 2048) {
      const joined = lines.join("");
      if (!this._endsWithPartialUrl(joined)) break;

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
