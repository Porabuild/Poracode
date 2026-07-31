/**
 * Inline, non-editable badge representing a slash command inside the composer's
 * contentEditable. Plain commands serialize to `/<id>`; skill commands retain
 * their provider-independent metadata for the supervisor adapters.
 */
export interface SlashCommandChipInput {
  id: string;
  skillName?: string;
  skillPath?: string;
  skillInvocation?: string;
  skillProvider?: string;
  skillScope?: "global" | "project";
}

export function createSlashCommandChipElement(
  input: string | SlashCommandChipInput,
): HTMLSpanElement {
  const command = typeof input === "string" ? { id: input } : input;
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.slashCommand = command.id;
  const isSkill = Boolean(
    command.skillName &&
    command.skillPath &&
    command.skillInvocation &&
    command.skillProvider &&
    command.skillScope,
  );
  if (isSkill) {
    chip.dataset.skillName = command.skillName;
    chip.dataset.skillPath = command.skillPath;
    chip.dataset.skillInvocation = command.skillInvocation;
    chip.dataset.skillProvider = command.skillProvider;
    chip.dataset.skillScope = command.skillScope;
  }
  chip.className = "poracode-slash-chip";

  const slash = document.createElement("span");
  slash.className = "poracode-slash-chip__slash";
  if (isSkill) {
    slash.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5a2 2 0 0 0 1.437 1.437l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>';
  } else {
    slash.textContent = "/";
  }
  chip.appendChild(slash);

  const name = document.createElement("span");
  name.className = "poracode-slash-chip__name";
  name.textContent = command.skillName ?? command.id;
  chip.appendChild(name);

  return chip;
}
