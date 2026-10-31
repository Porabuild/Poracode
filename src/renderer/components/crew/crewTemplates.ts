import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { CrewMemberSelection, ThreadCrewBinding } from "@/shared/crew";
import { crewRoleFromTemplate, type CrewRoleTemplate } from "./crewRoleTemplates";

/** Roles for a template, with each role's model chosen by `selectionFor`. */
export function crewRolesFromTemplate(
  template: CrewTemplateDescriptor,
  roleTemplates: readonly CrewRoleTemplate[],
  selectionFor: (role: CrewRoleTemplate) => CrewMemberSelection,
): ThreadCrewBinding["roles"] {
  return template.roles.flatMap((entry) => {
    const role = roleTemplates.find((candidate) => candidate.id === entry.roleId);
    return role ? [crewRoleFromTemplate(role, selectionFor(role), entry.parallel)] : [];
  });
}

export interface CrewTemplateRole {
  /** A CREW_ROLE_TEMPLATE_DESCRIPTORS id; supplies the label, brief and read-only flag. */
  roleId: string;
  parallel?: number;
}

export interface CrewTemplateDescriptor {
  id: string;
  name: MessageDescriptor;
  description: MessageDescriptor;
  policy: ThreadCrewBinding["policy"];
  roles: readonly CrewTemplateRole[];
}

/**
 * Ready-made crews for common workflows. Roles, instructions and policy are
 * set; the user only assigns a model to each role.
 */
export const CREW_TEMPLATE_DESCRIPTORS: readonly CrewTemplateDescriptor[] = [
  {
    id: "pair",
    name: msg`Lead + Sidekick`,
    description: msg`The lead plans and reviews; a cheaper sidekick explores, builds and verifies.`,
    policy: "crew-only",
    roles: [{ roleId: "sidekick" }],
  },
  {
    id: "ship",
    name: msg`Ship crew`,
    description: msg`A scout maps the code, a builder implements and verifies, and a reviewer checks the diff; the lead plans and decides.`,
    policy: "crew-only",
    roles: [{ roleId: "scout" }, { roleId: "builder" }, { roleId: "reviewer" }],
  },
  {
    id: "test-fix",
    name: msg`Test and fix`,
    description: msg`A tester writes and runs failing tests, and a builder makes them pass; the lead sets the cases.`,
    policy: "crew-only",
    roles: [{ roleId: "tester" }, { roleId: "builder" }],
  },
  {
    id: "debug",
    name: msg`Debug crew`,
    description: msg`An investigator finds the root cause, and a fixer lands the fix with a regression test.`,
    policy: "crew-only",
    roles: [{ roleId: "investigator" }, { roleId: "fixer" }],
  },
  {
    id: "parallel",
    name: msg`Parallel builders`,
    description: msg`The lead splits the work; up to three builders implement and verify independent tasks at once.`,
    policy: "crew-only",
    roles: [{ roleId: "builder", parallel: 3 }],
  },
  {
    id: "review",
    name: msg`Review board`,
    description: msg`Two independent read-only reviews of a change, and a sidekick applies the fixes.`,
    policy: "crew-only",
    roles: [{ roleId: "reviewer", parallel: 2 }, { roleId: "sidekick" }],
  },
  {
    id: "explore",
    name: msg`Explore and plan`,
    description: msg`Scouts map an unfamiliar codebase so the lead can plan without reading it all.`,
    policy: "crew-only",
    roles: [{ roleId: "scout", parallel: 2 }],
  },
  {
    id: "blank",
    name: msg`Blank crew`,
    description: msg`One helper to build your own crew from.`,
    policy: "crew-first",
    roles: [{ roleId: "helper" }],
  },
];
