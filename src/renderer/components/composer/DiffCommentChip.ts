import type { PromptSegment } from "@/shared/contracts";
import { diffCommentTarget } from "@/shared/promptContent";

type DiffCommentSegment = Extract<PromptSegment, { kind: "diff_comment" }>;

export function createDiffCommentChipElement(comment: DiffCommentSegment): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.diffCommentPath = comment.path;
  chip.dataset.diffCommentLineNumber = String(comment.lineNumber);
  chip.dataset.diffCommentSide = comment.side;
  chip.dataset.diffCommentStaged = String(comment.staged);
  chip.dataset.diffCommentBody = comment.body;
  chip.className = "poracode-slash-chip poracode-diff-comment-chip";
  chip.title = `${diffCommentTarget(comment)}\n${comment.body}`;

  const icon = document.createElement("span");
  icon.className = "poracode-slash-chip__slash";
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>';
  chip.appendChild(icon);

  const name = document.createElement("span");
  name.className = "poracode-slash-chip__name";
  name.textContent = diffCommentTarget(comment, true);
  chip.appendChild(name);

  const remove = document.createElement("span");
  remove.className = "poracode-diff-comment-chip__delete";
  remove.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  remove.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const parent = chip.parentElement;
    chip.remove();
    parent?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  chip.appendChild(remove);

  return chip;
}
