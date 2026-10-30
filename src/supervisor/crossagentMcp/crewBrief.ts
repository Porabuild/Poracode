import type { ThreadCrewBinding } from "@/shared/crew";
import { classifyModelTier } from "@/shared/modelTier";

export const CREW_REMOVED_BRIEF_TEXT =
  "[crew] The user removed this thread's crew. Delegate to other agents only if the user asks.";

/** Ids of the roles that may edit project files (no `noEdits`), in role order. */
export function crewEditingRoleIds(binding: ThreadCrewBinding): string[] {
  return binding.roles.filter((role) => !role.noEdits).map((role) => role.id);
}

/**
 * How the lead spends its own tokens: delegate the hands-on loop (implementing
 * and verifying, manual QA included) by default, keep judgment, settle
 * decisions before a handoff (more prescriptively for smaller helper models),
 * route work by the crew's shape, wait without polling, keep each role's
 * helper session with short follow-ups, and review the result instead of
 * redoing the work.
 */
export function crewPlaybookText(binding: ThreadCrewBinding): string {
  const crewCanEdit = crewEditingRoleIds(binding).length > 0;
  return [
    "How to work with the crew:",
    "- Delegate only through spawn_agent, as the crew policy allows. Do not use your own built-in subagent or task tools.",
    // A crew that may not edit cannot take implementation; telling the lead to
    // delegate it would contradict the composition line that follows. Manual
    // QA edits nothing, so no-edit roles still run it.
    crewCanEdit
      ? "- Delegate the hands-on work by default, including implementation and its verification (builds, linters, type checks, tests, app smoke runs and screenshots). Do a step yourself only when you can make the edit and confirm it in one or two of your own turns, or when it is correctness-critical work whose authoring and checking you must own."
      : "- Delegate the hands-on work the crew can do by default: searching, investigation, review and verification (builds, linters, type checks, tests, app smoke runs and screenshots).",
    "- Have helpers run manual QA and capture screenshots, and return their paths; view only the screenshots you need for your verdict.",
    crewCanEdit
      ? "- A helper turn costs a fraction of yours: handing off implementation and verification saves most of a change's cost, and quality holds because you design the change and review the result."
      : "- A helper turn costs a fraction of yours: handing off searching, review and verification saves much of a change's cost, and quality holds because you make the edits and check each helper's evidence.",
    "- Keep planning, design decisions, talking to the user, reviewing results, and commits and pull requests yourself.",
    "- Hand broad code searches (finding files, callers, tests) to a role that fits; the helper locates code, it does not review or audit it. Read only what you need to decide, and treat a helper's hypothesis as unconfirmed until you have checked its evidence.",
    "- Settle consequential choices before you hand off: the exact interfaces, the exact tests and what done means. Point at files instead of pasting their content.",
    ...briefingLines(binding),
    ...compositionLines(binding),
    "- In a brief, name the narrowest checks that cover the change, with at most one full gate at the end.",
    "- You do not need to load a skill to delegate; these rules cover it.",
    "- Wait with wait_for_agent instead of polling get_status.",
    "- Spawning the same role again continues its helper's previous session, so it keeps its context: a follow-up only needs what changed, not the earlier brief. Pass fresh_session=true only for unrelated work. Use steer_agent to correct a helper that is still running.",
    // A crew that may not edit leaves no diff to read and no change to send back.
    crewCanEdit
      ? "- When a helper reports, read the full diff and give a verdict before your next step, then send all rework in one follow-up. Do not redo work it reported as done, and do not re-edit files it changed: send the fix back instead, unless it is a trivial one-turn fix."
      : "- When a helper reports, check its evidence and give a verdict before your next step, then send all follow-ups in one message. Do not redo work it reported as done.",
  ].join("\n");
}

/**
 * Brief detail follows the helper's model: prescriptive for smaller models
 * (down to the code itself), goal-level for frontier ones.
 */
function briefingLines(binding: ThreadCrewBinding): string[] {
  const frontier: string[] = [];
  const smaller: string[] = [];
  for (const role of binding.roles) {
    const tier = classifyModelTier(role.selection.model, "");
    (tier === "max-capability" ? frontier : smaller).push(role.id);
  }
  const oneSmaller = smaller.length === 1;
  return [
    ...(smaller.length > 0
      ? [
          `- ${joinIds(smaller)} ${oneSmaller ? "runs a smaller model" : "run smaller models"}: give prescriptive tasks (exact files, interfaces and test cases), specify the code rather than describing it, and do not leave alternatives for ${oneSmaller ? "it" : "them"} to pick. Let ${oneSmaller ? "it" : "them"} gather the code your plan needs, then settle the plan yourself.`,
        ]
      : []),
    ...(frontier.length > 0
      ? [
          `- ${joinIds(frontier)} ${frontier.length === 1 ? "runs a frontier model" : "run frontier models"}: give the goal and constraints, let it explore and fill in the details, and take its pushback seriously.`,
        ]
      : []),
  ];
}

/**
 * What the crew's shape means for routing work, derived only from role ids,
 * `noEdits` and `parallel`: where no-edit findings go, how many copies of a
 * role may run (a spawn past a role's `parallel` is refused, not queued), and
 * how to chain read-only and editing roles.
 */
function compositionLines(binding: ThreadCrewBinding): string[] {
  const readOnly = binding.roles.filter((role) => role.noEdits).map((role) => role.id);
  const editing = crewEditingRoleIds(binding);
  const concurrent = binding.roles.filter((role) => (role.parallel ?? 1) > 1);
  const serial = binding.roles.filter((role) => (role.parallel ?? 1) <= 1).map((role) => role.id);
  const lines: string[] = [];
  if (readOnly.length > 0 && editing.length > 0) {
    const one = readOnly.length === 1;
    lines.push(
      `- ${joinIds(readOnly)} ${one ? "is" : "are"} told not to edit: send ${one ? "its" : "their"} findings to ${joinIds(editing, "or")} as one rework task instead of fixing them yourself.`,
    );
  } else if (editing.length === 0) {
    lines.push(
      "- Every role is told not to edit: use the crew for searching, investigation and review, and make the edits yourself.",
    );
  }
  if (concurrent.length > 0) {
    const limits = concurrent.map(
      (role, index) => `${role.id} ${index === 0 ? "can run " : ""}up to ${role.parallel}`,
    );
    lines.push(
      `- ${joinIds(limits)} at once: split independent work into separate tasks, spawn them with background=true, then wait for each.`,
    );
  }
  if (serial.length > 0) {
    const one = serial.length === 1;
    lines.push(
      `- ${joinIds(serial)} ${one ? "runs" : "run"} one task at a time: combine or queue work for ${one ? "it" : "them"} instead of spawning another copy; a second spawn while one runs is refused.`,
    );
  }
  if (binding.roles.length > 1) {
    lines.push(
      readOnly.length > 0 && editing.length > 0
        ? "- Use each role for the work its description names, and chain them: let read-only roles search or review, and editing roles implement and fix."
        : "- Use each role for the work its description names.",
    );
  }
  return lines;
}

/**
 * One-turn reminder after the lead edited files itself. Names the roles that
 * may edit; undefined when every role is told not to, since there is no one
 * to hand the edit to.
 */
export function crewLeadEditNudgeText(binding: ThreadCrewBinding): string | undefined {
  return leadEditNudgeText(binding, "Last turn you edited files yourself");
}

/**
 * The same reminder delivered into the running turn right after the lead's
 * first direct edit; undefined under the same condition.
 */
export function crewLeadMidTurnNudgeText(binding: ThreadCrewBinding): string | undefined {
  return leadEditNudgeText(binding, "You just edited files yourself");
}

function leadEditNudgeText(binding: ThreadCrewBinding, edited: string): string | undefined {
  const role = editingRoleArgument(binding);
  return role
    ? `[crew] ${edited} instead of handing the work to your crew. Hand implementation and its verification to spawn_agent ${role}; edit directly only for one- or two-turn fixes.`
    : undefined;
}

/** `role=<id>` naming the roles that may edit; undefined when none may. */
function editingRoleArgument(binding: ThreadCrewBinding): string | undefined {
  const ids = crewEditingRoleIds(binding);
  if (ids.length === 0) return undefined;
  return ids.length === 1 ? `role=${ids[0]}` : `role=<id> (${ids.join(", ")})`;
}

function joinIds(ids: readonly string[], conjunction: "and" | "or" = "and"): string {
  return ids.length <= 1
    ? (ids[0] ?? "")
    : `${ids.slice(0, -1).join(", ")} ${conjunction} ${ids.at(-1)}`;
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
  // The playbook is sent once; repeat only the facts a roster change can alter.
  return `[crew] The user changed this thread's crew. It is now ${currentName}.${policySentence(binding)}\n${roleSection(binding)}\nWorking with this crew:\n${compositionLines(binding).join("\n")}`;
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
    const context = role.selection.contextSize
      ? `, ${collapseWhitespace(role.selection.contextSize)} context`
      : "";
    const brief = role.brief ? ` ${ensureTerminalPeriod(collapseWhitespace(role.brief))}` : "";
    const noEdits = role.noEdits ? " Told not to edit files." : "";
    return `- ${role.id} (${label}${concurrency}): ${role.selection.agentKind}/${role.selection.model}${reasoning}${fast}${context}.${brief}${noEdits}`;
  });
  return `Roles:\n${roleLines.join("\n")}`;
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function ensureTerminalPeriod(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}
