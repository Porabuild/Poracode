import type { ThreadCrewBinding } from "@/shared/crew";
import { classifyModelTier } from "./modelTier";

export const CREW_REMOVED_BRIEF_TEXT =
  "[crew] The user removed this thread's crew. Delegate to other agents only if the user asks.";

/**
 * How the lead spends its own tokens: delegate only to the crew, keep
 * judgment, hand roles the token-heavy hands-on loop, brief once with settled
 * decisions (more prescriptively for smaller helper models), wait without
 * polling, keep each role's helper session, and review evidence instead of
 * redoing the work.
 */
export function crewPlaybookText(binding: ThreadCrewBinding): string {
  return [
    "How to work with the crew:",
    "- Delegate only through spawn_agent, as the crew policy allows. Do not use your own built-in subagent or task tools.",
    "- Keep planning, design decisions, reviewing results and talking to the user yourself. Hand roles the hands-on work: implementing, editing files, running builds and tests, searching large codebases.",
    "- Settle decisions before you delegate. Give each task the goal, the files or interfaces to change, what done means and the exact checks to run, so the helper does not rediscover context or come back with questions.",
    ...briefingLines(binding),
    "- Point the helper at files instead of copying their content into the task; it can read them itself.",
    "- You do not need to load a skill to delegate; these rules cover it.",
    "- Wait with wait_for_agent instead of polling get_status.",
    "- Spawning the same role again continues its helper's previous session, so it keeps its context; pass fresh_session=true only for unrelated work. Use steer_agent to correct a helper that is still running.",
    "- Check the result with one command, such as the test run or git diff --stat, instead of printing whole files. Do not redo work the helper reported as done, and send all fixes in one follow-up.",
    "- Make tiny edits yourself when writing the task would take longer than the edit.",
  ].join("\n");
}

/** Brief detail follows the helper's model: prescriptive for smaller models, goal-level for frontier ones. */
function briefingLines(binding: ThreadCrewBinding): string[] {
  const frontier: string[] = [];
  const smaller: string[] = [];
  for (const role of binding.roles) {
    const tier = classifyModelTier(role.selection.model, "");
    (tier === "max-capability" ? frontier : smaller).push(role.id);
  }
  return [
    ...(smaller.length > 0
      ? [
          `- ${joinIds(smaller)} ${smaller.length === 1 ? "runs a smaller model" : "run smaller models"}: give prescriptive tasks (exact files, interfaces and test cases), and do the exploration that shapes your plan yourself.`,
        ]
      : []),
    ...(frontier.length > 0
      ? [
          `- ${joinIds(frontier)} ${frontier.length === 1 ? "runs a frontier model" : "run frontier models"}: give the goal and constraints, let it explore and fill in the details, and take its pushback seriously.`,
        ]
      : []),
  ];
}

function joinIds(ids: readonly string[]): string {
  return ids.length <= 1 ? (ids[0] ?? "") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;
}

export function crewSetBriefText(binding: ThreadCrewBinding): string {
  const named = binding.name
    ? `a Poracode crew named ${JSON.stringify(collapseWhitespace(binding.name))} (${policyName(binding)}).`
    : `a Poracode crew (${policyName(binding)}).`;
  return `[crew] The user gave this thread ${named} That is their request to delegate: hand work that fits a role to it with the Crossagents spawn_agent tool and role=<id>, then review the results yourself.${policySentence(binding)}\n${roleSection(binding)}\n${crewPlaybookText(binding)}\nThe crew can change during this thread; Crossagents list_agents returns the current roles.`;
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
