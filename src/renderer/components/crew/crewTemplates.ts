import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { CrewMemberSelection, ThreadCrewBinding } from "@/shared/crew";
import type { CrewRoleTemplate } from "./crewRoleTemplates";

/** Roles for a template, with each role's model chosen by `selectionFor`. */
export function crewRolesFromTemplate(
  template: CrewTemplateDescriptor,
  roleTemplates: readonly CrewRoleTemplate[],
  selectionFor: (role: CrewRoleTemplate) => CrewMemberSelection,
): ThreadCrewBinding["roles"] {
  return template.roles.flatMap((entry) => {
    const role = roleTemplates.find((candidate) => candidate.id === entry.roleId);
    if (!role) return [];
    return [
      {
        id: role.id,
        label: role.label,
        ...(role.brief ? { brief: role.brief } : {}),
        ...(role.noEdits ? { noEdits: true as const } : {}),
        selection: selectionFor(role),
        ...(entry.parallel && entry.parallel > 1 ? { parallel: entry.parallel } : {}),
      },
    ];
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
    name: msg`Lead + Builder`,
    description: msg`The lead plans and reviews; a cheaper builder does the hands-on work.`,
    policy: "crew-only",
    roles: [{ roleId: "builder" }],
  },
  {
    id: "ship",
    name: msg`Ship crew`,
    description: msg`Explore, build and review a feature.`,
    policy: "crew-only",
    roles: [{ roleId: "scout" }, { roleId: "builder" }, { roleId: "reviewer" }],
  },
  {
    id: "test-fix",
    name: msg`Test and fix`,
    description: msg`A tester writes failing tests; a builder makes them pass.`,
    policy: "crew-only",
    roles: [{ roleId: "tester" }, { roleId: "builder" }],
  },
  {
    id: "debug",
    name: msg`Debug crew`,
    description: msg`Find the root cause first, then fix it with a regression test.`,
    policy: "crew-only",
    roles: [{ roleId: "investigator" }, { roleId: "fixer" }],
  },
  {
    id: "parallel",
    name: msg`Parallel builders`,
    description: msg`Up to three builders work on independent tasks at once.`,
    policy: "crew-only",
    roles: [{ roleId: "builder", parallel: 3 }],
  },
  {
    id: "review",
    name: msg`Review board`,
    description: msg`Two independent read-only reviews of a change.`,
    policy: "crew-only",
    roles: [{ roleId: "reviewer", parallel: 2 }],
  },
  {
    id: "explore",
    name: msg`Explore and plan`,
    description: msg`Scouts map an unfamiliar codebase before anything changes.`,
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
