import { getBasename } from "@/shared/pathUtils";
import { pathRefUrl } from "../../thread/ChatPane/parts/items/markdownPathRefs";

import { isEscaped, proseDirectives } from "./transcriptDirectiveRanges";

const CITATION_START = ":codex-file-citation{";
const CITATION_START_RE = /:codex-file-citation\{/g;

interface FileCitation {
  start: number;
  end: number;
  markdown: string;
}

/**
 * Codex artifact skills emit file directives in assistant text, including saved
 * transcripts. Normalize them at the provider rendering boundary, before generic
 * path autolinking can split Windows paths or guess an artifact is a folder.
 * See docs/codex-file-citations.md for provenance and supported syntax.
 * No persisted text is changed. Incomplete/malformed directives stay literal.
 */
export function formatFileCitationMarkdown(text: string): string {
  if (!text.includes(CITATION_START)) return text;
  const replacements = proseDirectives(text, findFileCitations(text));
  if (replacements.length === 0) return text;

  let cursor = 0;
  let result = "";
  for (const replacement of replacements) {
    result += text.slice(cursor, replacement.start) + replacement.markdown;
    cursor = replacement.end;
  }
  return result + text.slice(cursor);
}

function findFileCitations(text: string): FileCitation[] {
  const citations: FileCitation[] = [];
  CITATION_START_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITATION_START_RE.exec(text)) !== null) {
    const start = match.index;
    if (isEscaped(text, start)) continue;
    const citation = readCitation(text, CITATION_START_RE.lastIndex);
    if (!citation) continue;
    citations.push({ start, end: citation.end, markdown: citation.markdown });
    // A valid directive is opaque, so don't discover a directive-looking
    // string inside one of its quoted values as a second replacement.
    CITATION_START_RE.lastIndex = citation.end;
  }
  return citations;
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
