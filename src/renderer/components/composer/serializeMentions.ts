import type { PromptSegment } from "../../../shared/contracts";

/**
 * Walk a contentEditable container and produce structured prompt segments.
 * Text content becomes `{ kind: "text" }` segments, file mention chips
 * become `{ kind: "file", path }` segments. Each adapter then formats
 * these segments its own way (Claude: @path, Codex: structured API, etc.).
 */
export function serializeToSegments(container: HTMLDivElement): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let textBuffer = "";

  function flushText() {
    if (textBuffer.length > 0) {
      segments.push({ kind: "text", content: textBuffer });
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

    if (el.dataset.mentionPath) {
      flushText();
      segments.push({ kind: "file", path: el.dataset.mentionPath });
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

    // contentEditable creates <div> for new lines
    if (el.tagName === "DIV" && el !== container) {
      textBuffer += "\n";
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
  const attachments = segments.filter((s) => s.kind === "attachment");
  const rest = segments.filter((s) => s.kind !== "attachment");
  const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
  const restStr = rest
    .map((s) => (s.kind === "file" ? `@${s.path}` : s.content))
    .join("")
    .trim();
  if (attachmentLines && restStr) return `${restStr}\n\n${attachmentLines}`;
  return (attachmentLines || restStr).trim();
}

/**
 * Convenience: serialize contentEditable → flat prompt string.
 * Used for backward-compat and display purposes.
 */
export function serializeComposerContent(container: HTMLDivElement): string {
  return flattenSegments(serializeToSegments(container));
}
