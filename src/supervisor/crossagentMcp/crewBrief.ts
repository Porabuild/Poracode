import type { ThreadCrewBinding } from "@/shared/crew";

export const CREW_REMOVED_BRIEF_TEXT =
  "[crew] The user removed this thread's crew. Delegate to other agents only if the user asks.";

export function crewSetBriefText(binding: ThreadCrewBinding): string {
  const named = binding.name
    ? `a Poracode crew named ${JSON.stringify(collapseWhitespace(binding.name))} (${policyName(binding)}).`
    : `a Poracode crew (${policyName(binding)}).`;
  return `[crew] The user gave this thread ${named} That is their request to delegate: hand work that fits a role to it with the Crossagents spawn_agent tool and role=<id>, then review the results yourself.${policySentence(binding)}\n${roleSection(binding)}\nThe crew can change during this thread; Crossagents list_agents returns the current roles.`;
}

export function crewChangedBriefText(binding: ThreadCrewBinding): string {
  const currentName = binding.name
    ? `${JSON.stringify(collapseWhitespace(binding.name))} (${policyName(binding)})`
    : `an unsaved crew (${policyName(binding)})`;
  return `[crew] The user changed this thread's crew. It is now ${currentName}.${policySentence(binding)}\n${roleSection(binding)}`;
}

export function crewToolDescriptionNote(binding: ThreadCrewBinding): string {
  const ids = binding.roles.map((role) => role.id).join(", ");
  return binding.policy === "crew-only"
    ? `This thread has a crew (Crew only): pass role=<id> (${ids}); spawns without a role are refused.`
    : `This thread has a crew (Crew first): pass role=<id> (${ids}) when a role fits; you may also spawn without a role.`;
}

function policyName(binding: ThreadCrewBinding): string {
  return binding.policy === "crew-only" ? "Crew only" : "Crew first";
}

function policySentence(binding: ThreadCrewBinding): string {
  return binding.policy === "crew-only"
    ? " Crew only: spawns without a role are refused."
    : " Crew first: if no role fits or a role is unavailable, you may delegate to other agents without a role.";
}

function roleSection(binding: ThreadCrewBinding): string {
  const roleLines = binding.roles.map((role) => {
    const label = collapseWhitespace(role.label);
    const concurrency = (role.parallel ?? 1) > 1 ? `, up to ${role.parallel} at once` : "";
    const reasoning = role.selection.effort
      ? `, ${collapseWhitespace(role.selection.effort)} reasoning`
      : "";
    const fast = role.selection.fast ? ", fast" : "";
    const brief = role.brief ? ` ${ensureTerminalPeriod(collapseWhitespace(role.brief))}` : "";
    const noEdits = role.noEdits ? " Told not to edit files." : "";
    return `- ${role.id} (${label}${concurrency}): ${role.selection.agentKind}/${role.selection.model}${reasoning}${fast}.${brief}${noEdits}`;
  });
  return `Roles:\n${roleLines.join("\n")}`;
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function ensureTerminalPeriod(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}
