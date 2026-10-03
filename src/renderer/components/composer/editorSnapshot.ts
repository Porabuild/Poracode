/**
 * Undo snapshots of the composer's contentEditable. A snapshot keeps the
 * editor's HTML (chips and all) and the selection as character offsets, where
 * a chip or a line break counts as one character. Offsets survive replacing
 * the HTML, while DOM node references would not.
 */
export interface EditorSnapshot {
  html: string;
  selection: { start: number; end: number } | null;
}

/** The live voice transcript preview is not committed text, so snapshots leave it out. */
const VOICE_PREVIEW_SELECTOR = "[data-voice-transcript-preview]";

function isVoicePreview(node: Node): boolean {
  return node instanceof HTMLElement && node.matches(VOICE_PREVIEW_SELECTOR);
}

/** Chips and line breaks count as one character and the caret never goes inside them. */
function isAtomic(node: Node): boolean {
  return node instanceof HTMLElement && (node.tagName === "BR" || node.contentEditable === "false");
}

function lengthOf(node: Node): number {
  if (isVoicePreview(node)) return 0;
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).length;
  if (isAtomic(node)) return 1;
  let total = 0;
  for (const child of node.childNodes) total += lengthOf(child);
  return total;
}

function lengthBefore(root: Node, node: Node): number {
  let total = 0;
  for (let current = node; current !== root && current.parentNode; current = current.parentNode) {
    for (let sibling = current.previousSibling; sibling; sibling = sibling.previousSibling) {
      total += lengthOf(sibling);
    }
  }
  return total;
}

/** The outermost chip or voice preview that holds `node`, if any. */
function opaqueAncestor(root: Node, node: Node): Node | null {
  let found: Node | null = null;
  for (let current: Node | null = node; current && current !== root; current = current.parentNode) {
    if (isAtomic(current) || isVoicePreview(current)) found = current;
  }
  return found;
}

function offsetOf(root: Node, container: Node, offset: number): number {
  const opaque = opaqueAncestor(root, container);
  if (opaque) return lengthBefore(root, opaque);
  if (container.nodeType === Node.TEXT_NODE) return lengthBefore(root, container) + offset;
  const child = container.childNodes[offset];
  if (child) return lengthBefore(root, child);
  return lengthBefore(root, container) + lengthOf(container);
}

function pointAt(parent: Node, remaining: number): { node: Node; offset: number } | number {
  for (let index = 0; index < parent.childNodes.length; index++) {
    const child = parent.childNodes[index]!;
    if (isVoicePreview(child)) continue;
    if (child.nodeType === Node.TEXT_NODE) {
      const length = (child as Text).length;
      if (remaining <= length) return { node: child, offset: remaining };
      remaining -= length;
    } else if (isAtomic(child)) {
      if (remaining === 0) return { node: parent, offset: index };
      remaining -= 1;
    } else {
      const found = pointAt(child, remaining);
      if (typeof found !== "number") return found;
      remaining = found;
    }
  }
  if (remaining === 0) return { node: parent, offset: parent.childNodes.length };
  return remaining;
}

function pointFor(root: Node, offset: number): { node: Node; offset: number } {
  const found = pointAt(root, offset);
  return typeof found === "number" ? { node: root, offset: root.childNodes.length } : found;
}

export function captureEditorSnapshot(editor: HTMLElement): EditorSnapshot {
  const clone = editor.cloneNode(true) as HTMLElement;
  for (const preview of clone.querySelectorAll(VOICE_PREVIEW_SELECTOR)) preview.remove();

  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const inside =
    range && editor.contains(range.startContainer) && editor.contains(range.endContainer);
  return {
    html: clone.innerHTML,
    selection: inside
      ? {
          start: offsetOf(editor, range.startContainer, range.startOffset),
          end: offsetOf(editor, range.endContainer, range.endOffset),
        }
      : null,
  };
}

export function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
  return (
    a.html === b.html &&
    a.selection?.start === b.selection?.start &&
    a.selection?.end === b.selection?.end
  );
}

/** Put the editor back to `snapshot`. Without a saved selection the caret goes to the end. */
export function restoreEditorSnapshot(editor: HTMLElement, snapshot: EditorSnapshot): void {
  editor.innerHTML = snapshot.html;
  const end = lengthOf(editor);
  const start = pointFor(editor, snapshot.selection?.start ?? end);
  const finish = pointFor(editor, snapshot.selection?.end ?? end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(finish.node, finish.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
