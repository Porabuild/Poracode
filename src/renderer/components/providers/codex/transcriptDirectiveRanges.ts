import { unified } from "unified";
import remarkParse from "remark-parse";

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

const markdownParser = unified().use(remarkParse).freeze();
const STRUCTURAL_MARKDOWN_TYPES = new Set([
  "definition",
  "html",
  "image",
  "imageReference",
  "link",
  "linkReference",
]);

/** Return only directives whose entire source range occupies Markdown prose. */
export function proseDirectives<T extends SourceRange>(
  text: string,
  directives: readonly T[],
): T[] {
  if (directives.length === 0) return [];
  const textRanges = findMarkdownTextRanges(text, directives);
  return directives.filter((directive) =>
    textRanges.some((range) => directive.start >= range.start && directive.end <= range.end),
  );
}

function findMarkdownTextRanges(text: string, directives: readonly SourceRange[]): SourceRange[] {
  // The parser must not interpret Markdown punctuation in quoted directive
  // values. Masking keeps every offset stable and leaves line structure intact
  // while allowing remark to classify all surrounding Markdown containers.
  const maskedText = maskDirectiveRanges(text, directives);
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

function maskDirectiveRanges(text: string, directives: readonly SourceRange[]): string {
  let cursor = 0;
  let masked = "";
  for (const directive of directives) {
    masked += text.slice(cursor, directive.start);
    masked += maskDirective(text.slice(directive.start, directive.end));
    cursor = directive.end;
  }
  return masked + text.slice(cursor);
}

function maskDirective(text: string): string {
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

export function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  while (text[--index] === "\\") slashes++;
  return slashes % 2 === 1;
}
