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

export const CREW_ROLE_TEMPLATE_DESCRIPTORS: readonly CrewRoleTemplateDescriptor[] = [
  {
    id: "builder",
    label: msg`Builder`,
    brief: msg`Implements changes and runs tests`,
    tone: "builder",
  },
  {
    id: "reviewer",
    label: msg`Reviewer`,
    brief: msg`Reviews diffs and finds bugs`,
    tone: "reviewer",
  },
  {
    id: "scout",
    label: msg`Scout`,
    brief: msg`Explores code and docs`,
    noEdits: true,
    tone: "scout",
  },
  { id: "helper", label: msg`Helper`, tone: "custom" },
];
