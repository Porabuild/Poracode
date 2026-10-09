export interface CaretLineEdges {
  /** No line above the caret, so ArrowUp has nowhere to go. */
  first: boolean;
  /** No line below the caret, so ArrowDown has nowhere to go. */
  last: boolean;
}

/**
 * Where a collapsed caret sits among the editor's visual (wrapped) lines. The
 * caret is on the first line when the start of its line is the start of the
 * editor, and on the last line when the end of its line is the end of the
 * editor. A selection that spans text is on neither edge, so arrows keep
 * collapsing it as usual.
 *
 * Only the browser knows which side of a soft wrap the caret is on (a DOM
 * offset at a wrap is both the end of one line and the start of the next), so
 * this moves the live selection to each line boundary and puts it back.
 */
export function caretLineEdges(editor: HTMLElement): CaretLineEdges {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return { first: false, last: false };
  const caret = selection.getRangeAt(0).cloneRange();
  if (!editor.contains(caret.startContainer)) return { first: false, last: false };

  const editorStart = document.createRange();
  editorStart.selectNodeContents(editor);
  editorStart.collapse(true);
  const editorEnd = document.createRange();
  editorEnd.selectNodeContents(editor);
  editorEnd.collapse(false);

  // Without layout (tests) there are no soft wraps, so only hard breaks count.
  if (typeof selection.modify !== "function") {
    return { first: !hasLineBreak(editorStart, caret), last: !hasLineBreak(caret, editorEnd) };
  }
  const lineStart = moveToLineBoundary(selection, caret, "backward");
  const lineEnd = moveToLineBoundary(selection, caret, "forward");
  return {
    first: isEmptyBetween(editorStart, lineStart),
    last: isEmptyBetween(lineEnd, editorEnd),
  };
}

function moveToLineBoundary(
  selection: Selection,
  caret: Range,
  direction: "backward" | "forward",
): Range {
  selection.modify("move", direction, "lineboundary");
  const boundary = selection.getRangeAt(0).cloneRange();
  selection.removeAllRanges();
  selection.addRange(caret);
  return boundary;
}

function between(from: Range, to: Range): DocumentFragment {
  const range = document.createRange();
  range.setStart(from.startContainer, from.startOffset);
  range.setEnd(to.startContainer, to.startOffset);
  return range.cloneContents();
}

function isEmptyBetween(from: Range, to: Range): boolean {
  const fragment = between(from, to);
  return fragment.textContent === "" && fragment.querySelector("*") === null;
}

function hasLineBreak(from: Range, to: Range): boolean {
  const fragment = between(from, to);
  return fragment.querySelector("br, div, p") !== null || /\n/.test(fragment.textContent ?? "");
}
