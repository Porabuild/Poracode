/**
 * Inline, non-editable badge representing a slash command inside the composer's
 * contentEditable. Serialization restores it to plain `/<id>` text so the
 * provider pipeline receives the same string the user typed.
 */
export function createSlashCommandChipElement(id: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.slashCommand = id;
  chip.className = "lightcode-slash-chip";

  const slash = document.createElement("span");
  slash.className = "lightcode-slash-chip__slash";
  slash.textContent = "/";
  chip.appendChild(slash);

  const name = document.createElement("span");
  name.className = "lightcode-slash-chip__name";
  name.textContent = id;
  chip.appendChild(name);

  return chip;
}

const GIT_BRANCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`;

export function createTriggerWordChipElement(word: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.triggerWord = word;
  chip.className = "lightcode-mention-chip";

  const icon = document.createElement("span");
  icon.className = "lightcode-mention-chip__icon";
  icon.innerHTML = GIT_BRANCH_SVG;
  chip.appendChild(icon);

  const name = document.createElement("span");
  name.className = "lightcode-mention-chip__name";
  name.textContent = word;
  chip.appendChild(name);

  return chip;
}
