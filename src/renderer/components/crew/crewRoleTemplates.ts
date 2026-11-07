import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { CrewMemberSelection, CrewRole } from "@/shared/crew";

export interface CrewRoleTemplate {
  id: string;
  label: string;
  brief?: string;
  noEdits?: true;
  tone: "builder" | "reviewer" | "scout" | "custom";
}

/** A crew role from a ready role template, on `selection`, running up to `parallel` at once. */
export function crewRoleFromTemplate(
  template: Pick<CrewRoleTemplate, "id" | "label" | "brief" | "noEdits">,
  selection: CrewMemberSelection,
  parallel?: number,
): CrewRole {
  return {
    id: template.id,
    label: template.label,
    ...(template.brief ? { brief: template.brief } : {}),
    ...(template.noEdits ? { noEdits: true as const } : {}),
    selection: { ...selection },
    ...(parallel && parallel > 1 ? { parallel } : {}),
  };
}

export interface CrewRoleTemplateDescriptor {
  id: string;
  label: MessageDescriptor;
  brief?: MessageDescriptor;
  noEdits?: true;
  tone: CrewRoleTemplate["tone"];
}

/** The role a "New crew" starts with. */
export const DEFAULT_CREW_ROLE_ID = "sidekick";

// Briefs tell the lead when to use a role and the helper what its job is, so
// each one names the work and what the helper should report back.
export const CREW_ROLE_TEMPLATE_DESCRIPTORS: readonly CrewRoleTemplateDescriptor[] = [
  {
    id: "builder",
    label: msg`Builder`,
    brief: msg`Implements the lead's task end to end and verifies it with the narrowest build and tests; reports changed files, check results and deviations.`,
    tone: "builder",
  },
  {
    id: "reviewer",
    label: msg`Reviewer`,
    brief: msg`Reads the full diff and the code it touches, runs targeted checks, and reports bugs, regressions and missing tests by file and line.`,
    noEdits: true,
    tone: "reviewer",
  },
  {
    id: "scout",
    label: msg`Scout`,
    brief: msg`Does the broad searching: finds the files, callers, tests and conventions a task touches, and reports paths and facts, not a review.`,
    noEdits: true,
    tone: "scout",
  },
  {
    id: "tester",
    label: msg`Tester`,
    brief: msg`Writes and runs the tests for the change, reproduces reported bugs, and reports each failure with the exact command and failing assertion.`,
    tone: "reviewer",
  },
  {
    id: "investigator",
    label: msg`Investigator`,
    brief: msg`Reproduces the bug and traces it to the root cause, then reports the evidence, the failing code path and a suggested fix.`,
    noEdits: true,
    tone: "scout",
  },
  {
    id: "fixer",
    label: msg`Fixer`,
    brief: msg`Implements the fix the lead settles, adds a regression test, and confirms the reproduction now passes with the narrowest check.`,
    tone: "builder",
  },
  {
    id: "sidekick",
    label: msg`Sidekick`,
    brief: msg`Explores the codebase, implements the lead's task end to end, runs the narrowest checks, and reports what changed with evidence.`,
    tone: "builder",
  },
  {
    id: "helper",
    label: msg`Helper`,
    brief: msg`Takes any hands-on task the lead hands off: exploring, editing and running checks, then reports back with evidence.`,
    tone: "custom",
  },
];
