import { getEntryIconUrl } from "../common/fileIcons";

export interface FileMentionData {
  path: string;
  name: string;
  isDirectory: boolean;
}

/**
 * Create a non-editable chip DOM element for inline rendering inside contentEditable.
 */
export function createChipElement(mention: FileMentionData): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.mentionPath = mention.path;
  chip.className = "lightcode-mention-chip";

  // Icon (VS Code material-icon-theme, loaded as <img> on demand)
  const icon = document.createElement("img");
  icon.className = "lightcode-mention-chip__icon";
  icon.src = getEntryIconUrl(mention.name, mention.isDirectory);
  icon.alt = "";
  icon.draggable = false;
  chip.appendChild(icon);

  // Name
  const name = document.createElement("span");
  name.className = "lightcode-mention-chip__name";
  name.textContent = mention.name;
  chip.appendChild(name);

  // Delete button (overlay, visible on hover via CSS)
  const del = document.createElement("span");
  del.className = "lightcode-mention-chip__delete";
  del.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
  del.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    chip.remove();
  });
  chip.appendChild(del);

  return chip;
}
