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
 * Text content becomes `{ kind: "text" }` segments, while file mentions,
 * skills, and diff-comment chips retain their structured metadata.
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

    if (
      el.dataset.diffCommentPath &&
      el.dataset.diffCommentLineNumber &&
      (el.dataset.diffCommentSide === "old" || el.dataset.diffCommentSide === "new") &&
      (el.dataset.diffCommentStaged === "true" || el.dataset.diffCommentStaged === "false") &&
      el.dataset.diffCommentBody
    ) {
      flushText();
      segments.push({
        kind: "diff_comment",
        path: el.dataset.diffCommentPath,
        lineNumber: Number(el.dataset.diffCommentLineNumber),
        side: el.dataset.diffCommentSide,
        staged: el.dataset.diffCommentStaged === "true",
        body: el.dataset.diffCommentBody,
      });
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

/**
 * Convenience: serialize contentEditable → flat prompt string.
 * Used for backward-compat and display purposes.
 */
export function serializeComposerContent(container: HTMLDivElement): string {
  return flattenSegments(serializeToSegments(container));
}
