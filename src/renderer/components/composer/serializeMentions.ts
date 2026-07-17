import type { PromptSegment } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";

const INLINE_FILE_TOKEN_REGEX = /(^|\s)@([^\s@]+)(?=\s|$)/g;
const PATH_PREFIX_REGEX = /^(\.{1,2}\/|\.|\/|~\/|[A-Za-z]:[\\/])/;

function pushTextSegment(segments: PromptSegment[], content: string): void {
  if (content.length === 0) {
    return;
  }
  const last = segments.at(-1);
  if (last?.kind === "text") {
    last.content += content;
    return;
  }
  segments.push({ kind: "text", content });
}

function pushTextBufferSegments(segments: PromptSegment[], content: string): void {
  if (content.length === 0) {
    return;
  }

  let cursor = 0;
  for (const match of content.matchAll(INLINE_FILE_TOKEN_REGEX)) {
    const prefix = match[1] ?? "";
    const path = match[2] ?? "";
    const matchIndex = match.index ?? 0;
    const mentionStart = matchIndex + prefix.length;
    const mentionEnd = mentionStart + 1 + path.length;

    if (mentionStart > cursor) {
      pushTextSegment(segments, content.slice(cursor, mentionStart));
    }
    if (isLikelyInlineFilePath(path)) {
      segments.push({ kind: "file", path });
    } else {
      pushTextSegment(segments, content.slice(mentionStart, mentionEnd));
    }
    cursor = mentionEnd;
  }

  if (cursor < content.length) {
    pushTextSegment(segments, content.slice(cursor));
  }
}

function isLikelyInlineFilePath(path: string): boolean {
  if (path.length === 0) return false;
  if (PATH_PREFIX_REGEX.test(path)) return true;
  const normalized = path.replace(/\\/g, "/");
  const lastSegment = normalized.split("/").at(-1) ?? normalized;
  return lastSegment.includes(".");
}

/**
 * Walk a contentEditable container and produce structured prompt segments.
 * Text content becomes `{ kind: "text" }` segments, file mention chips
 * and inline `@path` tokens become `{ kind: "file", path }` segments.
 * Each adapter then formats these segments its own way (Claude: @path,
 * Codex: structured API, etc.).
 */
export function serializeToSegments(container: HTMLDivElement): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let textBuffer = "";

  function flushText() {
    if (textBuffer.length > 0) {
      pushTextBufferSegments(segments, textBuffer);
      textBuffer = "";
    }
  }

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      textBuffer += node.textContent ?? "";
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    // contentEditable creates <div> or <p> for new lines
    const isBlock = (el.tagName === "DIV" || el.tagName === "P") && el !== container;
    if (isBlock && (textBuffer.length > 0 || segments.length > 0)) {
      textBuffer += "\n";
    }

    if (el.dataset.mentionPath) {
      flushText();
      segments.push({ kind: "file", path: el.dataset.mentionPath });
      return;
    }

    if (el.dataset.mcpId && el.dataset.mcpName) {
      flushText();
      segments.push({ kind: "mcp", id: el.dataset.mcpId, name: el.dataset.mcpName });
      return;
    }

    if (el.dataset.slashCommand) {
      if (
        el.dataset.skillName &&
        el.dataset.skillPath &&
        el.dataset.skillInvocation &&
        el.dataset.skillProvider &&
        (el.dataset.skillScope === "global" || el.dataset.skillScope === "project")
      ) {
        flushText();
        segments.push({
          kind: "skill",
          name: el.dataset.skillName,
          path: el.dataset.skillPath,
          invocation: el.dataset.skillInvocation,
          provider: el.dataset.skillProvider,
          scope: el.dataset.skillScope,
        });
        return;
      }
      textBuffer += `/${el.dataset.slashCommand}`;
      return;
    }

    if (el.tagName === "BR") {
      textBuffer += "\n";
      return;
    }

    // Recurse into child nodes (e.g. divs created by Enter key)
    for (const child of el.childNodes) {
      walk(child);
    }
  }

  for (const child of container.childNodes) {
    walk(child);
  }

  flushText();
  return segments;
}

/** Flatten segments into a display string (for submitDisabled checks, etc.). */
export function flattenSegments(segments: PromptSegment[]): string {
  const rest = segments.filter((s) => s.kind !== "attachment");
  return rest.map(inlinePromptSegmentText).join("").trim();
}

function isStructuredTokenBoundary(content: string, start: number, length: number): boolean {
  const before = content[start - 1];
  const after = content[start + length];
  const startsAtBoundary = before === undefined || /\s/u.test(before) || "([{'\"`".includes(before);
  const continuesToken =
    after !== undefined && (/\p{L}|\p{N}|[_.-]/u.test(after) || after === "/" || after === "\\");
  const endsAtBoundary = !continuesToken;
  return startsAtBoundary && endsAtBoundary;
}

/** Rebuild structured prompt content after editing its flattened display text. */
export function rebuildEditedPromptSegments(
  content: string,
  originalSegments: readonly PromptSegment[],
): PromptSegment[] {
  const attachments = originalSegments.filter((segment) => segment.kind === "attachment");
  const structured = originalSegments
    .filter((segment) => segment.kind === "file" || segment.kind === "skill")
    .map((segment) => ({ segment, token: inlinePromptSegmentText(segment) }))
    .sort((a, b) => b.token.length - a.token.length);
  const rebuilt: PromptSegment[] = [];
  let textStart = 0;
  let cursor = 0;

  while (cursor < content.length) {
    const match = structured.find(
      (entry) =>
        content.startsWith(entry.token, cursor) &&
        isStructuredTokenBoundary(content, cursor, entry.token.length),
    );
    if (!match) {
      cursor += 1;
      continue;
    }

    pushTextBufferSegments(rebuilt, content.slice(textStart, cursor));
    rebuilt.push(match.segment);
    cursor += match.token.length;
    textStart = cursor;
  }

  pushTextBufferSegments(rebuilt, content.slice(textStart));
  return [...attachments, ...rebuilt];
}

/**
 * Convenience: serialize contentEditable → flat prompt string.
 * Used for backward-compat and display purposes.
 */
export function serializeComposerContent(container: HTMLDivElement): string {
  return flattenSegments(serializeToSegments(container));
}
