import { getBasename } from "@/shared/pathUtils";
import { pathRefUrl } from "../../thread/ChatPane/parts/items/markdownPathRefs";

const CITATION_START = ":codex-file-citation{";

/**
 * Codex artifact skills emit file directives in assistant text, including saved
 * transcripts. Normalize them at the provider rendering boundary, before generic
 * path autolinking can split Windows paths or guess an artifact is a folder.
 * See .agents/docs/codex-file-citations.md for provenance and supported syntax.
 * No persisted text is changed. Incomplete/malformed directives stay literal.
 */
export function formatFileCitationMarkdown(text: string): string {
  if (!text.includes(CITATION_START)) return text;
  const tokens = /^ {0,3}(?:> ?)*(`{3,}|~{3,})[^\r\n]*|`+|:codex-file-citation\{/gm;
  let fence: string | undefined;
  let inlineTicks = 0;
  let cursor = 0;
  let result = "";
  for (let match = tokens.exec(text); match; match = tokens.exec(text)) {
    const token = match[0];
    if (match[1]) {
      const marker = match[1];
      if (fence) {
        if (
          marker[0] === fence[0] &&
          marker.length >= fence.length &&
          token.slice(token.indexOf(marker) + marker.length).trim() === ""
        ) {
          fence = undefined;
        }
      } else if (!inlineTicks) {
        fence = marker;
      }
      continue;
    }
    if (fence) continue;
    if (token[0] === "`") {
      if (inlineTicks === token.length) inlineTicks = 0;
      else if (!inlineTicks && !isEscaped(text, match.index)) inlineTicks = token.length;
      continue;
    }
    if (inlineTicks || isEscaped(text, match.index)) continue;
    const lineStart = text.lastIndexOf("\n", match.index - 1) + 1;
    if (/^(?: {4}|\t)/.test(text.slice(lineStart, match.index))) continue;
    const citation = readCitation(text, tokens.lastIndex);
    if (!citation) continue;
    result += text.slice(cursor, match.index) + citation.markdown;
    cursor = citation.end;
    tokens.lastIndex = cursor;
  }
  return cursor ? result + text.slice(cursor) : text;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  while (text[--index] === "\\") slashes++;
  return slashes % 2 === 1;
}

function readCitation(text: string, start: number): { markdown: string; end: number } | null {
  // Quoted attribute values may contain spaces, braces, or Markdown punctuation.
  // This is a directive, not JSON: preserve native Windows backslashes.
  const attribute =
    /\s*([a-zA-Z_][\w-]*)\s*=\s*(?:"((?:\\.|[^"\\\r\n])*)"|'((?:\\.|[^'\\\r\n])*)')/y;
  const fields = new Map<string, string>();
  let cursor = start;
  while (cursor < text.length) {
    const end = /^\s*\}/.exec(text.slice(cursor));
    if (end) {
      const path = fields.get("path");
      // The artifact skills specify absolute filesystem paths. Never turn an
      // arbitrary URL/scheme into a local-file action.
      if (
        !path ||
        !/^(?:[a-zA-Z]:[\\/]|\/|\\\\)/.test(path) ||
        // eslint-disable-next-line no-control-regex -- Control characters are invalid in file references.
        /[\u0000-\u001f\u007f]/.test(path)
      ) {
        return null;
      }
      const label = getBasename(path).replace(/[\\`*_[\]<>|!]/g, "\\$&");
      try {
        return {
          markdown: `[${label}](${pathRefUrl({ kind: "file", path })})`,
          end: cursor + end[0].length,
        };
      } catch {
        // Malformed Unicode in provider text must not take down the chat row.
        return null;
      }
    }
    attribute.lastIndex = cursor;
    const match = attribute.exec(text);
    if (!match || fields.has(match[1]!)) return null;
    const quote = match[2] === undefined ? "'" : '"';
    const value = (match[2] ?? match[3]!).replace(/\\(["'])/g, (raw, escaped: string) =>
      escaped === quote ? escaped : raw,
    );
    fields.set(match[1]!, value);
    cursor = attribute.lastIndex;
  }
  return null;
}
