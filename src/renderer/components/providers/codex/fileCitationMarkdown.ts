import { unified } from "unified";
import remarkParse from "remark-parse";
import { getBasename } from "@/shared/pathUtils";
import { pathRefUrl } from "../../thread/ChatPane/parts/items/markdownPathRefs";

const CITATION_START = ":codex-file-citation{";
const CITATION_START_RE = /:codex-file-citation\{/g;

interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  position?: MarkdownPosition;
}

interface MarkdownPosition {
  start?: { offset?: number };
  end?: { offset?: number };
}

interface SourceRange {
  start: number;
  end: number;
}

interface FileCitation {
  start: number;
  end: number;
  markdown: string;
}

const markdownParser = unified().use(remarkParse).freeze();
const STRUCTURAL_MARKDOWN_TYPES = new Set([
  "definition",
  "html",
  "image",
  "imageReference",
  "link",
  "linkReference",
]);

/**
 * Codex artifact skills emit file directives in assistant text, including saved
 * transcripts. Normalize them at the provider rendering boundary, before generic
 * path autolinking can split Windows paths or guess an artifact is a folder.
 * See .agents/docs/codex-file-citations.md for provenance and supported syntax.
 * No persisted text is changed. Incomplete/malformed directives stay literal.
 */
export function formatFileCitationMarkdown(text: string): string {
  if (!text.includes(CITATION_START)) return text;
  const citations = findFileCitations(text);
  if (citations.length === 0) return text;

  const textRanges = findMarkdownTextRanges(text, citations);
  const replacements = citations.filter((citation) =>
    textRanges.some((range) => citation.start >= range.start && citation.end <= range.end),
  );
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

function findMarkdownTextRanges(text: string, citations: readonly FileCitation[]): SourceRange[] {
  // The parser must not interpret Markdown punctuation in quoted directive
  // values. Masking keeps every offset stable and leaves line structure intact
  // while allowing remark to classify all surrounding Markdown containers.
  const maskedText = maskCitationRanges(text, citations);
  let tree: MarkdownNode;
  try {
    tree = markdownParser.parse(maskedText) as MarkdownNode;
  } catch {
    // Display text is untrusted and may contain malformed Unicode. A parser
    // failure must never make a valid transcript disappear or throw in render.
    return [];
  }

  const ranges: SourceRange[] = [];
  collectMarkdownTextRanges(tree, ranges);
  return ranges;
}

function maskCitationRanges(text: string, citations: readonly FileCitation[]): string {
  let cursor = 0;
  let masked = "";
  for (const citation of citations) {
    masked += text.slice(cursor, citation.start);
    masked += maskCitation(text.slice(citation.start, citation.end));
    cursor = citation.end;
  }
  return masked + text.slice(cursor);
}

function maskCitation(text: string): string {
  let atLineStart = true;
  let masked = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\r" || char === "\n") {
      masked += char;
      atLineStart = true;
    } else if (atLineStart && (char === " " || char === "\t")) {
      // Preserve indentation so a multiline directive keeps the same list,
      // blockquote, or indented-code classification in the temporary parse.
      masked += char;
    } else {
      // This intentionally operates on UTF-16 code units (no `u` flag), so
      // source offsets remain stable for astral Unicode in quoted attributes.
      masked += "x";
      atLineStart = false;
    }
  }
  return masked;
}

function collectMarkdownTextRanges(root: MarkdownNode, ranges: SourceRange[]): void {
  // Transcripts may nest containers thousands of levels deep. Traverse without
  // recursion so a valid Markdown tree cannot exhaust the renderer call stack.
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (
      node.type === "code" ||
      node.type === "inlineCode" ||
      STRUCTURAL_MARKDOWN_TYPES.has(node.type)
    ) {
      continue;
    }
    if (node.type === "text") {
      const range = getSourceRange(node.position);
      if (range) ranges.push(range);
      continue;
    }
    const children = node.children;
    if (!children) continue;
    for (let index = children.length - 1; index >= 0; index--) {
      pending.push(children[index]!);
    }
  }
}

function getSourceRange(position: MarkdownPosition | undefined): SourceRange | null {
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  return typeof start === "number" && typeof end === "number" && start <= end
    ? { start, end }
    : null;
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
