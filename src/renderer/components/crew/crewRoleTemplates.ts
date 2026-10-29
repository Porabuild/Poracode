import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

export interface CrewRoleTemplate {
  id: string;
  label: string;
  brief?: string;
  noEdits?: true;
  tone: "builder" | "reviewer" | "scout" | "custom";
}

export interface CrewRoleTemplateDescriptor {
  id: string;
  label: MessageDescriptor;
  brief?: MessageDescriptor;
  noEdits?: true;
  tone: CrewRoleTemplate["tone"];
}

// Briefs tell the lead when to use a role and the helper what its job is, so
// each one names the work and what the helper should report back.
export const CREW_ROLE_TEMPLATE_DESCRIPTORS: readonly CrewRoleTemplateDescriptor[] = [
  {
    id: "builder",
    label: msg`Builder`,
    brief: msg`Implements the lead's task end to end: edits files, runs the build and tests, and reports what changed.`,
    tone: "builder",
  },
  {
    id: "reviewer",
    label: msg`Reviewer`,
    brief: msg`Reviews the finished diff for bugs, regressions and missing tests, and reports findings by file and line.`,
    noEdits: true,
    tone: "reviewer",
  },
  {
    id: "scout",
    label: msg`Scout`,
    brief: msg`Finds the files, callers and tests a task touches, and reports their paths with a short summary.`,
    noEdits: true,
    tone: "scout",
  },
  {
    id: "tester",
    label: msg`Tester`,
    brief: msg`Writes and runs tests for the change, reproduces reported bugs, and reports failures with the exact command.`,
    tone: "reviewer",
  },
  {
    id: "investigator",
    label: msg`Investigator`,
    brief: msg`Reproduces the bug and traces it to the root cause, then reports the evidence and the failing code path.`,
    noEdits: true,
    tone: "scout",
  },
  {
    id: "fixer",
    label: msg`Fixer`,
    brief: msg`Implements the fix with a regression test and confirms the reproduction now passes.`,
    tone: "builder",
  },
  { id: "helper", label: msg`Helper`, tone: "custom" },
];
