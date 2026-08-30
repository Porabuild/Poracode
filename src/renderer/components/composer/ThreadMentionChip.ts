import { threadMentionLabel } from "@/shared/promptContent";

/** Inline, non-editable badge representing a thread mentioned in the composer. */
export interface ThreadMentionChipInput {
  threadId: string;
  title: string;
}

const MESSAGES_SQUARE_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/></svg>';

export function createThreadMentionChipElement(input: ThreadMentionChipInput): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.threadMentionId = input.threadId;
  chip.dataset.threadMentionTitle = input.title;
  chip.className = "poracode-slash-chip poracode-thread-mention-chip";
  const label = threadMentionLabel(input);
  chip.title = label;

  const glyph = document.createElement("span");
  glyph.className = "poracode-slash-chip__slash";
  glyph.innerHTML = MESSAGES_SQUARE_ICON_SVG;
  chip.appendChild(glyph);

  const name = document.createElement("span");
  name.className = "poracode-slash-chip__name";
  name.textContent = label;
  chip.appendChild(name);

  return chip;
}
