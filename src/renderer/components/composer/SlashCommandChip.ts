import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";

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
  pluginId?: string;
  pluginName?: string;
}

export function createSlashCommandChipElement(
  input: string | SlashCommandChipInput,
): HTMLSpanElement {
  const command = typeof input === "string" ? { id: input } : input;
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.slashCommand = command.id;
  // `skillPath` is optional: provider-native skills carry no SKILL.md path.
  // Full metadata is required to serialize as a skill segment; `skillName`
  // alone is enough to show the skill glyph (ACP catalogs often omit the rest).
  const isSkillSegment = Boolean(
    command.skillName && command.skillInvocation && command.skillProvider && command.skillScope,
  );
  if (isSkillSegment) {
    chip.dataset.skillName = command.skillName;
    if (command.skillPath) chip.dataset.skillPath = command.skillPath;
    chip.dataset.skillInvocation = command.skillInvocation;
    chip.dataset.skillProvider = command.skillProvider;
    chip.dataset.skillScope = command.skillScope;
    if (command.pluginId) chip.dataset.pluginId = command.pluginId;
    if (command.pluginName) chip.dataset.pluginName = command.pluginName;
  } else if (command.skillName) {
    chip.dataset.skillName = command.skillName;
  }
  if (command.skillName) {
    const skill = command.pluginName ?? command.skillName;
    chip.setAttribute("aria-label", i18n._(msg`Skill: ${skill}`));
  }
  chip.className = "poracode-slash-chip";

  const slash = document.createElement("span");
  slash.className = "poracode-slash-chip__slash";
  if (command.skillName) {
    slash.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5a2 2 0 0 0 1.437 1.437l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>';
  } else {
    slash.textContent = "/";
  }
  chip.appendChild(slash);

  const name = document.createElement("span");
  name.className = "poracode-slash-chip__name";
  name.textContent = command.pluginName ?? command.skillName ?? command.id;
  chip.appendChild(name);

  return chip;
}
